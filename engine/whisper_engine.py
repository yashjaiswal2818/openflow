"""
OpenFlow Local Speech-to-Text Engine
====================================
Runs Whisper inference fully offline. Backends are probed in order of
preference:

    1. faster-whisper (CTranslate2, 4x faster on CPU, int8 quantised)
    2. openai-whisper (PyTorch reference implementation)
    3. demo transcripts (no model installed -> labelled demo mode)

The engine loads models lazily and caches them per model size, so switching
between the Fast / Balanced / Pro presets releases the previous model instead of
piling them up in RAM.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

from engine.demo import next_transcript
from engine.dictation_cleaner import DictationCleaner, CleanReport

logger = logging.getLogger("OpenFlow.STT")

# Preset id -> (faster-whisper / openai-whisper model name, approximate size)
MODEL_BY_PRESET: Dict[str, Tuple[str, str]] = {
    "fast": ("tiny.en", "~75 MB · q5_1"),
    "balanced": ("small.en", "~470 MB · q5_k"),
    "pro": ("large-v3-turbo", "~1.6 GB · turbo"),
}


def _module_present(name: str) -> bool:
    import importlib.util

    return importlib.util.find_spec(name) is not None


class WhisperEngine:
    """Local Whisper runner with graceful capability degradation."""

    _runtime_cache: Optional[bool] = None

    @classmethod
    def runtime_available(cls) -> bool:
        """True when a Whisper runtime is importable (weights load lazily)."""
        if cls._runtime_cache is None:
            available = False
            for module in ("faster_whisper", "whisper"):
                try:
                    __import__(module)
                    available = True
                    break
                except Exception:
                    continue
            cls._runtime_cache = available
        return bool(cls._runtime_cache)

    def __init__(self, model_size: str = "small.en") -> None:
        self.model_size = model_size
        self._model = None
        self._backend: Optional[str] = None
        self._load_error: Optional[str] = None
        self._loaded_size: Optional[str] = None

    # -- capability ---------------------------------------------------------
    @property
    def backend(self) -> Optional[str]:
        return self._backend

    def capabilities(self) -> dict:
        runtime = self.runtime_available()
        if self._model is not None:
            return {
                "available": True,
                "model_loaded": True,
                "backend": self._backend,
                "model": self._loaded_size,
                "reason": None,
            }
        if runtime:
            return {
                "available": True,
                "model_loaded": False,
                "backend": "faster-whisper" if _module_present("faster_whisper") else "openai-whisper",
                "model": self.model_size,
                "reason": f"Runtime detected — {self.model_size} loads on first transcription.",
            }
        return {
            "available": False,
            "model_loaded": False,
            "backend": None,
            "model": self.model_size,
            "reason": self._load_error
            or "No Whisper runtime installed. Run `pip install faster-whisper` (recommended) "
            "then OpenFlow will transcribe on-device.",
        }

    # -- model lifecycle ----------------------------------------------------
    def load_model(self, model_size: Optional[str] = None) -> bool:
        size = model_size or self.model_size
        if self._model is not None and self._loaded_size == size:
            return True
        self.release_model()
        self.model_size = size

        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception as exc:
            self._load_error = f"faster-whisper not installed ({type(exc).__name__})."
            WhisperModel = None  # type: ignore

        if WhisperModel is not None:
            try:
                logger.info("Loading faster-whisper %s (int8 CPU)", size)
                self._model = WhisperModel(size, device="cpu", compute_type="int8")
                self._backend = "faster-whisper"
                self._loaded_size = size
                self._load_error = None
                return True
            except Exception as exc:
                self._load_error = f"faster-whisper failed to load {size}: {exc}"
                logger.warning(self._load_error)

        try:
            import whisper  # type: ignore
        except Exception as exc:
            if not self._load_error:
                self._load_error = f"openai-whisper not installed ({type(exc).__name__})."
            return False

        try:
            logger.info("Loading openai-whisper %s", size)
            self._model = whisper.load_model(size)
            self._backend = "openai-whisper"
            self._loaded_size = size
            self._load_error = None
            return True
        except Exception as exc:
            self._load_error = f"openai-whisper failed to load {size}: {exc}"
            logger.warning(self._load_error)
            return False

    def release_model(self) -> None:
        self._model = None
        self._backend = None
        self._loaded_size = None

    def set_preset(self, preset_id: str) -> None:
        size = MODEL_BY_PRESET.get(preset_id, MODEL_BY_PRESET["balanced"])[0]
        if size != self.model_size:
            self.model_size = size
            if self._model is not None:
                self.load_model(size)

    # -- inference ----------------------------------------------------------
    def transcribe_raw(self, wav_path: str | Path) -> Tuple[str, Optional[str]]:
        """Returns ``(raw_text, error)``. Empty text + error means failure."""
        path = Path(wav_path)
        if not path.exists() or path.stat().st_size == 0:
            return "", "Audio file is missing or empty."

        if self._model is None:
            self.load_model()

        if self._model is None:
            return "", self._load_error or "No Whisper model available."

        try:
            started = time.time()
            if self._backend == "faster-whisper":
                segments, _info = self._model.transcribe(
                    str(path), beam_size=5, vad_filter=True, condition_on_previous_text=False
                )
                raw = " ".join(seg.text for seg in segments).strip()
            else:
                result = self._model.transcribe(str(path), fp16=False)
                raw = (result.get("text") or "").strip()
            logger.info("Transcribed %s in %.2fs", path.name, time.time() - started)
            return raw, None
        except Exception as exc:
            logger.exception("Whisper inference failed")
            return "", f"Inference error: {exc}"

    def transcribe(
        self,
        wav_path: str | Path,
        spoken_punctuation: bool = True,
        strip_fillers: bool = True,
        fix_casing: bool = True,
        collapse_stutters: bool = True,
        demo_index: int = 0,
        allow_demo: bool = True,
    ) -> Tuple[str, str, CleanReport, dict]:
        """
        Full pipeline: audio -> raw text -> cleaned text.

        Returns ``(raw, clean, report, meta)`` where ``meta`` states whether the
        transcript was real or demo content.
        """
        started = time.time()
        raw, error = self.transcribe_raw(wav_path)
        demo = False
        if not raw and allow_demo:
            raw = next_transcript(demo_index)
            demo = True
            logger.info("Using demo transcript (reason: %s)", error)

        cleaner = DictationCleaner(
            spoken_punctuation=spoken_punctuation,
            strip_fillers=strip_fillers,
            fix_casing=fix_casing,
            collapse_stutters=collapse_stutters,
        )
        report = cleaner.clean_with_report(raw)
        meta = {
            "demo": demo,
            "backend": None if demo else self._backend,
            "model": None if demo else self._loaded_size,
            "reason": error if demo else None,
            "latency_ms": int((time.time() - started) * 1000),
        }
        return raw, report.cleaned, report, meta
