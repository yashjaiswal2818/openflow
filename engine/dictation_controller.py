"""
OpenFlow Dictation Controller
=============================
The state machine behind the floating pill. It owns the dictation lifecycle:

    ready -> listening -> processing -> pasted / copied -> ready

It also decides when OpenFlow is in *demo mode*: no microphone, no Whisper
runtime, or the user forced it. Demo mode is always surfaced through
``capabilities()`` and every result carries ``demo: true`` so the UI can label
it instead of pretending a model ran.

Transcription runs on a worker thread so ``/api/state`` stays responsive while
Whisper works — this is what keeps the HUD animating during "Formatting text…".
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Any, Dict, Optional

from engine.audio_recorder import AudioRecorder, RecorderUnavailable, synthesise_capture
from engine.dictation_cleaner import DictationCleaner
from engine.history_manager import HistoryManager
from engine.models_manager import ModelPresetManager
from engine.paths import RECORDINGS_DIR, ensure_dirs
from engine.system_injector import SystemInjector
from engine.voice_cloner import VoiceCloningManager
from engine.whisper_engine import WhisperEngine

logger = logging.getLogger("OpenFlow.Dictation")

IDLE_RESET_SECONDS = 2.4


class DictationController:
    """Coordinates capture, transcription, cleanup, storage and paste."""

    def __init__(
        self,
        presets: Optional[ModelPresetManager] = None,
        recorder: Optional[AudioRecorder] = None,
        whisper: Optional[WhisperEngine] = None,
        history: Optional[HistoryManager] = None,
        injector: Optional[SystemInjector] = None,
        voices: Optional[VoiceCloningManager] = None,
    ) -> None:
        ensure_dirs()
        self.presets = presets or ModelPresetManager()
        self.history = history or HistoryManager()
        self.injector = injector or SystemInjector()
        self.voices = voices or VoiceCloningManager()

        config = self.presets.get_config()
        self.recorder = recorder or AudioRecorder(on_level_change=self._on_level)
        self.recorder.on_level_change = self._on_level
        self.whisper = whisper or WhisperEngine(
            model_size=self.presets.active_preset().get("stt_model_key", "small.en")
        )

        self._lock = threading.RLock()
        self._demo_thread: Optional[threading.Thread] = None
        self._stop_demo = threading.Event()
        self._demo_started = 0.0
        self._demo_index = 0
        self._capture_demo = False
        self._demo_capture_path = ""
        self._demo_duration = 0.0
        self._worker: Optional[threading.Thread] = None
        self._reset_timer: Optional[threading.Timer] = None
        self._caps_cache: Optional[Dict[str, Any]] = None
        self._caps_cached_at = 0.0

        self.state: Dict[str, Any] = {
            "status": "ready",
            "is_recording": False,
            "audio_level": 0.0,
            "preview_text": "",
            "message": "Press the shortcut and start talking.",
            "demo": False,
            "started_at": None,
            "last_result": None,
            "paste": None,
            "latency_ms": None,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }

    # -- capabilities -------------------------------------------------------
    @property
    def demo_requested(self) -> bool:
        mode = str(self.presets.get_config().get("demo_mode", "auto")).lower()
        if mode == "on":
            return True
        if mode == "off":
            return False
        recorder_ready = self.recorder.backend_status()["available"]
        stt_ready = self.whisper.runtime_available()
        return not (recorder_ready and stt_ready)

    def capabilities(self, force: bool = False) -> Dict[str, Any]:
        if not force and self._caps_cache and time.time() - self._caps_cached_at < 5.0:
            return self._caps_cache
        recorder = self.recorder.backend_status()
        stt = self.whisper.capabilities()
        tts = self.voices.backend_capabilities()
        injector = self.injector.capabilities()
        demo = self.demo_requested
        caps = {
            "demo_mode": demo,
            "microphone": recorder,
            "stt": stt,
            "tts": tts,
            "injector": injector,
            "platform": injector.get("platform"),
            "data_dir": str(RECORDINGS_DIR.parent),
            "preset": self.presets.active_preset()["id"],
            "notes": self._capability_notes(demo, recorder, stt, injector),
        }
        self._caps_cache = caps
        self._caps_cached_at = time.time()
        return caps

    @staticmethod
    def _capability_notes(demo: bool, recorder: dict, stt: dict, injector: dict) -> list:
        notes = []
        if demo:
            notes.append(
                "Demo mode: no microphone or Whisper runtime detected, so captures and transcripts are simulated."
            )
        elif not stt["available"]:
            notes.append(stt["reason"] or "Whisper runtime missing.")
        if not injector.get("clipboard"):
            notes.append("No clipboard tool found — cleaned text will stay inside OpenFlow.")
        return notes

    # -- state helpers ------------------------------------------------------
    def _on_level(self, level: float) -> None:
        with self._lock:
            if self.state["is_recording"]:
                self.state["audio_level"] = round(float(level), 3)

    def _set_state(self, **patch: Any) -> None:
        with self._lock:
            self.state.update(patch)
            self.state["updated_at"] = datetime.now().isoformat(timespec="milliseconds")

    def get_state(self, light: bool = False) -> Dict[str, Any]:
        """Serialises the live state.

        ``light=True`` skips capabilities/config/stats so the HUD can poll at
        120 ms without re-reading the history archive from disk each frame.
        """
        with self._lock:
            snapshot = dict(self.state)
        if light:
            return snapshot
        snapshot["capabilities"] = self.capabilities()
        snapshot["config"] = self.presets.get_config()
        snapshot["stats"] = self.history.stats()
        return snapshot

    # -- lifecycle ----------------------------------------------------------
    def start_dictation(self, source: str = "ui") -> Dict[str, Any]:
        with self._lock:
            if self.state["status"] == "listening":
                return {"ok": True, "already_running": True}
            if self.state["status"] == "processing":
                return {"ok": False, "error": "Still formatting the previous capture."}
            if self._reset_timer:
                self._reset_timer.cancel()
                self._reset_timer = None

        demo = self.demo_requested
        if demo:
            self._begin_demo_capture()
        else:
            try:
                self.recorder.start()
            except RecorderUnavailable as exc:
                logger.warning("Recorder unavailable, falling back to demo capture: %s", exc)
                demo = True
                self._begin_demo_capture()
        self._capture_demo = demo

        self._set_state(
            status="listening",
            is_recording=True,
            audio_level=0.0,
            preview_text="",
            message="Listening — release the hotkey to insert text.",
            demo=demo,
            started_at=time.time(),
            paste=None,
            latency_ms=None,
        )
        return {"ok": True, "demo": demo, "source": source}

    def _begin_demo_capture(self) -> None:
        """Streams synthetic levels so the pill's visualizer is alive."""
        self._stop_demo.clear()
        self._demo_started = time.time()

        def run() -> None:
            import math

            tick = 0
            while not self._stop_demo.is_set():
                tick += 1
                level = 0.35 + 0.3 * abs(math.sin(tick * 0.45)) + 0.12 * abs(math.sin(tick * 1.7))
                self._on_level(min(1.0, level))
                time.sleep(0.08)

        self._demo_thread = threading.Thread(target=run, name="openflow-demo-levels", daemon=True)
        self._demo_thread.start()

    def stop_dictation(self, wait: bool = False) -> Dict[str, Any]:
        with self._lock:
            was_listening = self.state["status"] == "listening"
        if not was_listening:
            return {"ok": False, "error": "OpenFlow is not recording."}

        demo = self._capture_demo
        if demo:
            self._stop_demo_capture()
        self._set_state(
            status="processing",
            is_recording=False,
            audio_level=0.0,
            preview_text="",
            message="Formatting text…",
            demo=demo,
        )

        result: Dict[str, Any] = {}

        def work() -> None:
            try:
                result.update(self._process(demo))
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Dictation pipeline failed")
                self._fail(f"Dictation failed: {exc}")
                result.update({"ok": False, "error": str(exc)})
            finally:
                done.set()

        done = threading.Event()
        self._worker = threading.Thread(target=work, name="openflow-transcribe", daemon=True)
        self._worker.start()
        if wait:
            done.wait(timeout=120)
            return result
        return {"ok": True, "status": "processing", "demo": demo}

    def _stop_demo_capture(self) -> None:
        """Stops demo level streaming and renders a synthetic capture WAV."""
        if self._demo_thread is not None:
            self._stop_demo.set()
            self._demo_thread.join(timeout=1.0)
            self._demo_thread = None

        self._demo_duration = max(1.4, min(6.0, time.time() - self._demo_started))
        path = RECORDINGS_DIR / f"demo_{int(time.time() * 1000)}.wav"
        try:
            synthesise_capture(path, self._demo_duration)
            self._demo_capture_path = str(path)
        except Exception as exc:  # pragma: no cover - disk issues
            logger.error("Could not write demo capture: %s", exc)
            self._demo_capture_path = ""

    # -- the pipeline -------------------------------------------------------
    def _process(self, demo: bool) -> Dict[str, Any]:
        started = time.time()
        config = self.presets.get_config()
        preset_id = config.get("active_preset", "balanced")

        if demo:
            wav_path = self._demo_capture_path
            duration = self._demo_duration
        else:
            try:
                wav_path, duration = self.recorder.stop()
            except Exception as exc:
                logger.exception("Recorder stop failed")
                self._fail(f"Could not stop recording: {exc}")
                return {"ok": False, "error": str(exc)}

        if not wav_path:
            self._fail("No audio captured — check your microphone.")
            return {"ok": False, "error": "No audio captured."}
        if not demo and duration < 0.2:
            self._fail("That capture was too short to transcribe.")
            return {"ok": False, "error": "Capture too short."}

        raw, cleaned, report, meta = self.whisper.transcribe(
            wav_path,
            demo_index=self._demo_index,
            allow_demo=demo,
            **self.presets.cleaner_options(),
        )
        self._demo_index += 1

        if not cleaned.strip():
            reason = meta.get("reason") or "No speech detected in that capture."
            self._fail(reason)
            return {"ok": False, "error": reason, "demo": demo}

        paste_ok, paste_reason = False, "Auto-paste is disabled in settings."
        if config.get("auto_paste", True):
            paste_ok, paste_reason = self.injector.paste_into_active_window(cleaned)
            if not paste_ok and demo:
                paste_reason = paste_reason or "Text kept on the clipboard (demo mode)."

        entry = None
        if cleaned.strip():
            entry = self.history.log_entry(
                raw_text=raw,
                cleaned_text=cleaned,
                audio_path=wav_path if config.get("save_raw_audio", True) else None,
                duration=duration,
                preset_used=preset_id,
                meta={
                    "demo": meta.get("demo", demo),
                    "stt_backend": meta.get("backend"),
                    "model": meta.get("model"),
                    "stt_latency_ms": meta.get("latency_ms"),
                    "report": report.to_dict(),
                },
            )

        latency_ms = int((time.time() - started) * 1000)
        clipboard_ok = bool(self.injector.capabilities().get("clipboard"))
        if paste_ok:
            status = "pasted"
        elif clipboard_ok:
            status = "copied"
        else:
            status = "saved"
        result = {
            "ok": True,
            "raw_text": raw,
            "cleaned_text": cleaned,
            "report": report.to_dict(),
            "audio_file": entry["audio_file"] if entry else None,
            "duration": round(duration, 2),
            "latency_ms": latency_ms,
            "demo": bool(meta.get("demo", demo)),
            "paste": {"ok": paste_ok, "reason": paste_reason},
            "entry": entry,
        }
        self._set_state(
            status=status,
            preview_text=cleaned,
            message=(
                "Pasted into the active app."
                if paste_ok
                else (
                    "Copied to the clipboard — press paste."
                    if clipboard_ok
                    else "Archived in history — no clipboard tool available to paste it."
                )
            ),
            demo=bool(meta.get("demo", demo)),
            last_result=result,
            paste=result["paste"],
            latency_ms=latency_ms,
        )
        self._schedule_reset()
        return result

    def _fail(self, message: str) -> None:
        self._set_state(
            status="error",
            is_recording=False,
            audio_level=0.0,
            message=message,
            preview_text="",
        )
        self._schedule_reset()

    def _schedule_reset(self) -> None:
        if self._reset_timer:
            self._reset_timer.cancel()

        def reset() -> None:
            with self._lock:
                if self.state["status"] in {"pasted", "copied", "saved", "error"}:
                    self.state.update({
                        "status": "ready",
                        "message": "Press the shortcut and start talking.",
                        "preview_text": "",
                        "audio_level": 0.0,
                    })
                    self.state["updated_at"] = datetime.now().isoformat(timespec="milliseconds")

        self._reset_timer = threading.Timer(IDLE_RESET_SECONDS, reset)
        self._reset_timer.daemon = True
        self._reset_timer.start()

    # -- manual cleaning / read aloud --------------------------------------
    def clean_text(self, raw_text: str, save: bool = False, duration: float = 0.0) -> Dict[str, Any]:
        cleaner = DictationCleaner(**self.presets.cleaner_options())
        report = cleaner.clean_with_report(raw_text)
        entry = None
        if save and report.cleaned.strip():
            entry = self.history.log_entry(
                raw_text=raw_text,
                cleaned_text=report.cleaned,
                audio_path=None,
                duration=duration,
                preset_used=self.presets.get_config()["active_preset"],
                meta={"source": "test-bench", "report": report.to_dict()},
            )
        return {
            "raw_text": report.raw,
            "cleaned_text": report.cleaned,
            "report": report.to_dict(),
            "entry": entry,
        }

    def read_aloud(self, text: str, profile_id: Optional[str] = None) -> Dict[str, Any]:
        return self.voices.read_aloud(text, profile_id)

    def apply_preset(self, preset_id: str) -> Dict[str, Any]:
        config = self.presets.set_preset(preset_id)
        self.whisper.set_preset(preset_id)
        return {"ok": True, "config": config, "preset": self.presets.active_preset()}
