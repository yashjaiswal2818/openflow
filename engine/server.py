"""
OpenFlow Local Engine Server
============================
A dependency-free HTTP/JSON daemon (standard library only) that the desktop
shell, the Studio UI and the floating HUD all talk to.

    default bind:  127.0.0.1:18488
    override:      OPENFLOW_HOST / OPENFLOW_PORT env vars, or --host/--port

Design notes
    * ``ThreadingHTTPServer`` so a slow Whisper inference never blocks the HUD's
      state polling.
    * Every response is JSON except ``/api/audio/*``, which streams WAV with
      HTTP range support so the browser can seek recordings.
    * Errors always carry a machine-readable ``error`` string and a proper status
      code; the UI shows the message instead of failing silently.
    * Binding to 127.0.0.1 by default keeps the API local-only, matching the
      "100% offline" promise.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import logging
import mimetypes
import os
import re
import sys
import tempfile
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine import __version__
from engine.audio_recorder import AudioRecorder
from engine.dictation_controller import DictationController
from engine.history_manager import HistoryManager
from engine.models_manager import PRESETS, ModelPresetManager
from engine.paths import HOME, PROFILES_DIR, RECORDINGS_DIR, TTS_DIR, ensure_dirs, is_within
from engine.system_injector import SystemInjector
from engine.voice_cloner import VoiceCloningManager
from engine.whisper_engine import WhisperEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("OpenFlow.Server")

DEFAULT_HOST = os.environ.get("OPENFLOW_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("OPENFLOW_PORT", "18488"))

MAX_JSON_BODY = 8 * 1024 * 1024        # 8 MB JSON payload (base64 audio)
MAX_AUDIO_UPLOAD = 40 * 1024 * 1024    # 40 MB decoded WAV
AUDIO_ROOTS = (RECORDINGS_DIR, TTS_DIR, PROFILES_DIR)


class ApiError(Exception):
    """Raised by handlers to produce a structured error response."""

    def __init__(self, message: str, status: int = HTTPStatus.BAD_REQUEST) -> None:
        super().__init__(message)
        self.message = message
        self.status = int(status)


class OpenFlowHandler(BaseHTTPRequestHandler):
    """JSON API for the OpenFlow engine."""

    server_version = f"OpenFlow/{__version__}"
    protocol_version = "HTTP/1.1"

    # injected by the server factory
    controller: DictationController
    presets: ModelPresetManager
    history: HistoryManager
    voices: VoiceCloningManager

    # -- plumbing -----------------------------------------------------------
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        logger.debug("%s - %s", self.address_string(), fmt % args)

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        self.send_header("Access-Control-Allow-Origin", origin or "*")
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "600")

    def _send_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_text(self, text: str, status: int = HTTPStatus.OK, content_type: str = "text/plain; charset=utf-8") -> None:
        body = text.encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        if length > MAX_JSON_BODY:
            raise ApiError("Request body too large.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ApiError(f"Invalid JSON body: {exc}") from exc
        if not isinstance(data, dict):
            raise ApiError("JSON body must be an object.")
        return data

    # -- verbs --------------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(int(HTTPStatus.NO_CONTENT))
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)
        try:
            if path.startswith("/api/audio/"):
                self._serve_audio(unquote(path[len("/api/audio/"):]))
                return
            route = ROUTES.get((method, path))
            if route is None:
                # parameterised routes
                for pattern, pattern_method, handler in DYNAMIC_ROUTES:
                    if pattern_method != method:
                        continue
                    match = pattern.match(path)
                    if match:
                        handler(self, *match.groups())
                        return
                raise ApiError(f"Unknown endpoint: {method} {path}", HTTPStatus.NOT_FOUND)
            route(self, query)
        except ApiError as exc:
            self._safe_json_error(exc.message, exc.status)
        except ValueError as exc:
            self._safe_json_error(str(exc), HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Unhandled error for %s %s", method, self.path)
            self._safe_json_error(f"Internal engine error: {exc}", HTTPStatus.INTERNAL_SERVER_ERROR)

    def _safe_json_error(self, message: str, status: int) -> None:
        try:
            self._send_json({"ok": False, "error": message}, status)
        except Exception:  # pragma: no cover - client disconnected
            pass

    # -- audio streaming ----------------------------------------------------
    def _resolve_audio(self, relative: str) -> Path:
        candidate = (HOME / relative).resolve()
        if not any(is_within(candidate, root) for root in AUDIO_ROOTS):
            raise ApiError("Audio path is outside the OpenFlow data directory.", HTTPStatus.FORBIDDEN)
        if not candidate.exists() or not candidate.is_file():
            raise ApiError("Audio file not found.", HTTPStatus.NOT_FOUND)
        return candidate

    def _serve_audio(self, relative: str) -> None:
        file_path = self._resolve_audio(relative)
        total = file_path.stat().st_size
        content_type = mimetypes.guess_type(str(file_path))[0] or "audio/wav"
        range_header = self.headers.get("Range")
        start, end = 0, total - 1
        status = HTTPStatus.OK

        if range_header:
            match = re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())
            if match:
                if match.group(1):
                    start = int(match.group(1))
                    end = int(match.group(2)) if match.group(2) else total - 1
                elif match.group(2):
                    start = max(0, total - int(match.group(2)))
                end = min(end, total - 1)
                if start > end:
                    self.send_response(int(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE))
                    self.send_header("Content-Range", f"bytes */{total}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = HTTPStatus.PARTIAL_CONTENT

        length = end - start + 1
        self.send_response(int(status))
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        if status == HTTPStatus.PARTIAL_CONTENT:
            self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
        self._cors()
        self.end_headers()
        if self.command == "HEAD":
            return
        with open(file_path, "rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------
def h_health(handler: OpenFlowHandler, _query) -> None:
    handler._send_json({
        "ok": True,
        "engine": "OpenFlow",
        "version": __version__,
        "status": "running",
        "data_dir": str(HOME),
    })


def h_state(handler: OpenFlowHandler, query) -> None:
    light = (query.get("light") or ["0"])[0] in {"1", "true", "yes"}
    handler._send_json(handler.controller.get_state(light=light))


def h_capabilities(handler: OpenFlowHandler, _query) -> None:
    handler._send_json(handler.controller.capabilities())


def h_presets(handler: OpenFlowHandler, _query) -> None:
    handler._send_json({
        "presets": handler.presets.list_presets(),
        "config": handler.presets.get_config(),
    })


def h_config(handler: OpenFlowHandler, _query) -> None:
    handler._send_json({"config": handler.presets.get_config()})


def h_config_update(handler: OpenFlowHandler, _query) -> None:
    patch = handler._read_json()
    config = handler.presets.update_config(patch)
    if "active_preset" in patch:
        handler.controller.whisper.set_preset(patch["active_preset"])
    handler._send_json({"ok": True, "config": config})


def h_preset_select(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    preset_id = data.get("preset_id") or data.get("id")
    if not preset_id:
        raise ApiError("Field 'preset_id' is required.")
    if preset_id not in PRESETS:
        raise ApiError(f"Unknown preset '{preset_id}'.")
    result = handler.controller.apply_preset(preset_id)
    handler._send_json(result)


def h_history(handler: OpenFlowHandler, query) -> None:
    q = (query.get("q") or [""])[0]
    limit = query.get("limit")
    limit_int = int(limit[0]) if limit and limit[0].isdigit() else None
    handler._send_json({
        "history": handler.history.get_history(query=q, limit=limit_int),
        "stats": handler.history.stats(),
    })


def h_history_stats(handler: OpenFlowHandler, _query) -> None:
    handler._send_json(handler.history.stats())


def h_history_export(handler: OpenFlowHandler, _query) -> None:
    handler._send_text(handler.history.export_markdown(), content_type="text/markdown; charset=utf-8")


def h_history_star(handler: OpenFlowHandler, _query) -> None:
    entry_id = handler._read_json().get("entry_id")
    if not entry_id:
        raise ApiError("Field 'entry_id' is required.")
    handler._send_json({"ok": True, "starred": handler.history.toggle_star(entry_id)})


def h_history_clear(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json() if handler.command == "POST" else {}
    removed = handler.history.clear_history(delete_audio=bool(data.get("delete_audio")))
    handler._send_json({"ok": True, "removed": removed})


def _delete_history(handler: OpenFlowHandler, entry_id: str) -> None:
    if not handler.history.delete_entry(entry_id):
        raise ApiError("History entry not found.", HTTPStatus.NOT_FOUND)
    handler._send_json({"ok": True, "deleted": entry_id})


def h_dictation_start(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    handler._send_json(handler.controller.start_dictation(source=str(data.get("source", "api"))))


def h_dictation_stop(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    handler._send_json(handler.controller.stop_dictation(wait=bool(data.get("wait"))))


def h_dictation_clean(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    raw_text = str(data.get("raw_text", ""))
    if not raw_text.strip():
        raise ApiError("Field 'raw_text' is required.")
    handler._send_json(handler.controller.clean_text(
        raw_text,
        save=bool(data.get("save_history", False)),
        duration=float(data.get("duration") or 0),
    ))


def h_devices(handler: OpenFlowHandler, _query) -> None:
    handler._send_json({"devices": AudioRecorder.list_input_devices(), "backend": AudioRecorder.backend_status()})


def h_profiles(handler: OpenFlowHandler, _query) -> None:
    handler._send_json({"profiles": handler.voices.list_profiles()})


def _decode_audio_upload(data: Dict[str, Any]) -> Path:
    audio_b64 = data.get("audio_base64")
    if not audio_b64:
        raise ApiError("Provide 'audio_base64' (16-bit PCM WAV) or use /api/profiles/demo.")
    if isinstance(audio_b64, str) and audio_b64.startswith("data:"):
        audio_b64 = audio_b64.split(",", 1)[-1]
    try:
        blob = base64.b64decode(audio_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(f"audio_base64 is not valid base64: {exc}") from exc
    if len(blob) > MAX_AUDIO_UPLOAD:
        raise ApiError("Audio upload exceeds 40 MB.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
    if blob[:4] != b"RIFF" or blob[8:12] != b"WAVE":
        raise ApiError("Audio upload must be a WAV file (RIFF/WAVE).")

    handle, path = tempfile.mkstemp(prefix="openflow_ref_", suffix=".wav")
    with os.fdopen(handle, "wb") as fh:
        fh.write(blob)
    return Path(path)


def h_profile_create(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    name = str(data.get("name") or "My Voice").strip()
    description = str(data.get("description") or "")
    temp_path = _decode_audio_upload(data)
    try:
        profile = handler.voices.create_profile(name, temp_path, description)
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass
    config = handler.presets.get_config()
    if not config.get("active_voice_profile"):
        handler.presets.update_config({"active_voice_profile": profile.profile_id})
    handler._send_json({"ok": True, "profile": profile.to_dict()})


def h_profile_demo(handler: OpenFlowHandler, _query) -> None:
    """Creates a profile from a synthesized reference so cloning is demoable."""
    data = handler._read_json()
    name = str(data.get("name") or "Demo Voice").strip()
    duration = float(data.get("duration") or 7.0)
    duration = max(3.0, min(12.0, duration))
    target = RECORDINGS_DIR / f"demo_ref_{int(threading.get_ident())}_{int(duration * 100)}.wav"
    from engine.audio_recorder import synthesise_capture

    synthesise_capture(target, duration)
    profile = handler.voices.create_profile(name, target, "Synthetic demo reference (no microphone detected)")
    handler._send_json({"ok": True, "profile": profile.to_dict(), "demo": True})


def _delete_profile(handler: OpenFlowHandler, profile_id: str) -> None:
    if not handler.voices.delete_profile(profile_id):
        raise ApiError("Voice profile not found.", HTTPStatus.NOT_FOUND)
    config = handler.presets.get_config()
    if config.get("active_voice_profile") == profile_id:
        handler.presets.update_config({"active_voice_profile": None})
    handler._send_json({"ok": True, "deleted": profile_id})


def h_tts_synthesize(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    text = str(data.get("text") or "").strip()
    if not text:
        raise ApiError("Field 'text' is required.")
    profile_id = data.get("profile_id") or handler.presets.get_config().get("active_voice_profile")
    result = handler.voices.synthesize(text, profile_id)
    handler._send_json({"ok": True, **result})


def h_read_aloud(handler: OpenFlowHandler, _query) -> None:
    data = handler._read_json()
    text = str(data.get("text") or "").strip()
    if not text:
        raise ApiError("Field 'text' is required.")
    profile_id = data.get("profile_id") or handler.presets.get_config().get("active_voice_profile")
    handler._send_json({"ok": True, **handler.controller.read_aloud(text, profile_id)})


def h_hotkeys(handler: OpenFlowHandler, _query) -> None:
    daemon = getattr(handler.server, "hotkey_daemon", None)
    handler._send_json(daemon.capabilities() if daemon else {"available": False})


ROUTES = {
    ("GET", "/api/health"): h_health,
    ("GET", "/api/state"): h_state,
    ("GET", "/api/capabilities"): h_capabilities,
    ("GET", "/api/presets"): h_presets,
    ("POST", "/api/presets/select"): h_preset_select,
    ("GET", "/api/config"): h_config,
    ("PATCH", "/api/config/update"): h_config_update,
    ("POST", "/api/config/update"): h_config_update,
    ("GET", "/api/history"): h_history,
    ("GET", "/api/history/export"): h_history_export,
    ("GET", "/api/history/stats"): h_history_stats,
    ("POST", "/api/history/star"): h_history_star,
    ("DELETE", "/api/history"): h_history_clear,
    ("GET", "/api/profiles"): h_profiles,
    ("POST", "/api/profiles/create"): h_profile_create,
    ("POST", "/api/profiles/demo"): h_profile_demo,
    ("POST", "/api/dictation/start"): h_dictation_start,
    ("POST", "/api/dictation/stop"): h_dictation_stop,
    ("POST", "/api/dictation/clean"): h_dictation_clean,
    ("POST", "/api/tts/synthesize"): h_tts_synthesize,
    ("POST", "/api/read-aloud"): h_read_aloud,
    ("GET", "/api/devices"): h_devices,
    ("GET", "/api/hotkeys"): h_hotkeys,
}

DYNAMIC_ROUTES = [
    (re.compile(r"^/api/history/(?P<id>[\w.-]+)$"), "DELETE", _delete_history),
    (re.compile(r"^/api/profiles/(?P<id>[\w.-]+)$"), "DELETE", _delete_profile),
]


# ---------------------------------------------------------------------------
# Server factory
# ---------------------------------------------------------------------------
def build_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, start_hotkeys: bool = True) -> ThreadingHTTPServer:
    """Builds a ready-to-serve engine with all subsystems wired up."""
    ensure_dirs()

    presets = ModelPresetManager()
    history = HistoryManager()
    voices = VoiceCloningManager()
    whisper = WhisperEngine(model_size=presets.active_preset().get("stt_model_key", "small.en"))
    injector = SystemInjector()
    recorder = AudioRecorder()
    controller = DictationController(
        presets=presets,
        recorder=recorder,
        whisper=whisper,
        history=history,
        injector=injector,
        voices=voices,
    )

    handler_cls = type("BoundOpenFlowHandler", (OpenFlowHandler,), {
        "controller": controller,
        "presets": presets,
        "history": history,
        "voices": voices,
    })

    server = ThreadingHTTPServer((host, port), handler_cls)
    server.daemon_threads = True

    # Global hotkeys (optional)
    daemon = None
    if start_hotkeys:
        from engine.hotkey_daemon import HotkeyDaemon

        try:
            config = presets.get_config()
            daemon = HotkeyDaemon(
                on_start=lambda: controller.start_dictation(source="hotkey"),
                on_stop=lambda: controller.stop_dictation(),
                hotkey=config["hotkey"],
                hold_to_talk=bool(config["hold_to_talk"]),
            )
            daemon.start()
        except Exception as exc:  # pragma: no cover - platform specific
            logger.warning("Global hotkey daemon unavailable: %s", exc)
    server.hotkey_daemon = daemon  # type: ignore[attr-defined]

    caps = controller.capabilities()
    logger.info("OpenFlow engine %s listening on http://%s:%s", __version__, host, port)
    logger.info("  data dir     : %s", caps["data_dir"])
    logger.info("  microphone   : %s", "ready" if caps["microphone"]["available"] else caps["microphone"]["reason"])
    logger.info("  whisper      : %s", caps["stt"]["backend"] or caps["stt"]["reason"])
    logger.info("  tts          : %s (%s)", caps["tts"]["engine"], caps["tts"]["quality"])
    logger.info("  clipboard    : %s", caps["injector"]["clipboard_tool"] or "unavailable")
    if caps["demo_mode"]:
        logger.warning("  DEMO MODE    : no microphone/Whisper yet — captures and transcripts are simulated.")
    return server


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, start_hotkeys: bool = True) -> None:
    server = build_server(host, port, start_hotkeys)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down OpenFlow engine…")
    finally:
        daemon = getattr(server, "hotkey_daemon", None)
        if daemon:
            daemon.stop()
        server.server_close()


def main(argv: Optional[list] = None) -> None:
    parser = argparse.ArgumentParser(description="OpenFlow local engine daemon")
    parser.add_argument("--host", default=DEFAULT_HOST, help="bind address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="port (default 18488)")
    parser.add_argument("--no-hotkeys", action="store_true", help="do not bind global hotkeys")
    args = parser.parse_args(argv)
    serve(args.host, args.port, start_hotkeys=not args.no_hotkeys)


if __name__ == "__main__":
    main()
