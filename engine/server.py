"""
OpenFlow Local Engine Server
============================
Lightweight local HTTP API server running on localhost:18488.
Bridges the UI, floating pill HUD, background hotkeys, audio capture,
Whisper transcription, and zero-shot voice cloning.
"""

from __future__ import annotations
import sys
import json
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path

# Add engine directory to path
engine_dir = Path(__file__).resolve().parent
if str(engine_dir.parent) not in sys.path:
    sys.path.insert(0, str(engine_dir.parent))

from engine.dictation_cleaner import clean_dictation
from engine.voice_cloner import VoiceCloningManager
from engine.models_manager import ModelPresetManager
from engine.history_manager import HistoryManager
from engine.audio_recorder import AudioRecorder
from engine.whisper_engine import WhisperEngine
from engine.system_injector import SystemInjector
from engine.hotkey_daemon import HotkeyDaemon

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("OpenFlow.Server")

PORT = 18488

# Shared Global State
live_state = {
    "is_recording": False,
    "status": "ready",
    "preview_text": "",
    "audio_level": 0.0,
    "last_cleaned_text": ""
}
state_lock = threading.Lock()

voice_manager = VoiceCloningManager()
preset_manager = ModelPresetManager()
history_manager = HistoryManager()
audio_recorder = AudioRecorder()
whisper_engine = WhisperEngine()
system_injector = SystemInjector()


def on_hotkey_state_change(status: str, preview_text: str | None, audio_level: float):
    with state_lock:
        live_state["status"] = status
        live_state["is_recording"] = (status == "listening")
        if preview_text is not None:
            live_state["preview_text"] = preview_text
        live_state["audio_level"] = audio_level
        if status == "pasted" and preview_text:
            live_state["last_cleaned_text"] = preview_text


# Initialize Hotkey Daemon
hotkey_daemon = HotkeyDaemon(on_state_change=on_hotkey_state_change)


class OpenFlowHandler(BaseHTTPRequestHandler):
    """Handles IPC requests from OpenFlow frontend and desktop daemon."""

    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def _read_json(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length)
        return json.loads(body.decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/health", "/api/health"):
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "running", "engine": "OpenFlow", "version": "1.0.0"}).encode())

        elif path == "/api/state":
            with state_lock:
                state_copy = dict(live_state)
            self._set_headers(200)
            self.wfile.write(json.dumps(state_copy).encode())

        elif path == "/api/presets":
            presets = preset_manager.list_presets()
            config = preset_manager.get_config()
            self._set_headers(200)
            self.wfile.write(json.dumps({"presets": presets, "config": config}).encode())

        elif path == "/api/profiles":
            profiles = voice_manager.list_profiles()
            self._set_headers(200)
            self.wfile.write(json.dumps({"profiles": profiles}).encode())

        elif path == "/api/history":
            history = history_manager.get_history()
            self._set_headers(200)
            self.wfile.write(json.dumps({"history": history}).encode())

        elif path == "/api/audio/devices":
            devices = AudioRecorder.get_input_devices()
            self._set_headers(200)
            self.wfile.write(json.dumps({"devices": devices}).encode())

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": f"Path not found: {path}"}).encode())

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            data = self._read_json()

            if path == "/api/dictation/start":
                # Manual start from UI button
                with state_lock:
                    live_state["is_recording"] = True
                    live_state["status"] = "listening"
                    live_state["preview_text"] = "Listening to microphone..."
                audio_recorder.start()
                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "recording"}).encode())

            elif path == "/api/dictation/stop":
                # Manual stop from UI button
                wav_path, duration = audio_recorder.stop()
                with state_lock:
                    live_state["is_recording"] = False
                    live_state["status"] = "processing"
                    live_state["preview_text"] = "Transcribing..."

                config = preset_manager.get_config()
                raw_text, clean_text = whisper_engine.transcribe(
                    wav_path,
                    spoken_punctuation=config.get("spoken_punctuation", True),
                    strip_fillers=config.get("strip_filler_words", True)
                )

                entry = None
                if clean_text:
                    entry = history_manager.log_entry(
                        raw_text=raw_text,
                        cleaned_text=clean_text,
                        audio_path=wav_path,
                        duration=duration,
                        preset_used=config.get("active_preset", "balanced")
                    )
                    system_injector.paste_into_active_window(clean_text)

                with state_lock:
                    live_state["status"] = "pasted" if clean_text else "ready"
                    live_state["preview_text"] = clean_text or ""
                    live_state["last_cleaned_text"] = clean_text or ""

                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "raw_text": raw_text,
                    "cleaned_text": clean_text,
                    "audio_path": wav_path,
                    "history_entry": entry
                }).encode())

            elif path == "/api/dictation/clean":
                raw_text = data.get("raw_text", "")
                save_history = data.get("save_history", True)
                audio_path = data.get("audio_path")
                duration = data.get("duration", 0.0)

                config = preset_manager.get_config()
                cleaned = clean_dictation(
                    raw_text,
                    spoken_punctuation=config.get("spoken_punctuation", True),
                    strip_fillers=config.get("strip_filler_words", True)
                )

                entry = None
                if save_history and raw_text.strip():
                    entry = history_manager.log_entry(
                        raw_text=raw_text,
                        cleaned_text=cleaned,
                        audio_path=audio_path,
                        duration=duration,
                        preset_used=config.get("active_preset", "balanced")
                    )

                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "raw_text": raw_text,
                    "cleaned_text": cleaned,
                    "history_entry": entry
                }).encode())

            elif path == "/api/presets/select":
                preset_id = data.get("preset_id", "balanced")
                new_cfg = preset_manager.set_preset(preset_id)
                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "ok", "config": new_cfg}).encode())

            elif path == "/api/config/update":
                cfg = preset_manager.get_config()
                for k, v in data.items():
                    if k in cfg:
                        cfg[k] = v
                preset_manager.save_config(cfg)
                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "ok", "config": cfg}).encode())

            elif path == "/api/profiles/create":
                name = data.get("name", "My Voice")
                sample_wav = data.get("sample_wav")
                desc = data.get("description", "")
                if not sample_wav or not Path(sample_wav).exists():
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "Reference sample WAV not found on disk."}).encode())
                    return

                profile = voice_manager.create_profile(name, sample_wav, desc)
                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "ok", "profile": profile.to_dict()}).encode())

            elif path == "/api/tts/synthesize":
                text = data.get("text", "")
                profile_id = data.get("profile_id")
                out_wav = voice_manager.synthesize(text, profile_id)
                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "ok", "output_wav": out_wav}).encode())

            elif path == "/api/history/star":
                entry_id = data.get("entry_id")
                status = history_manager.toggle_star(entry_id)
                self._set_headers(200)
                self.wfile.write(json.dumps({"status": "ok", "starred": status}).encode())

            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": f"Unknown endpoint: {path}"}).encode())

        except Exception as e:
            logger.exception("Error processing request")
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/profiles/"):
            profile_id = path.replace("/api/profiles/", "").strip()
            ok = voice_manager.delete_profile(profile_id)
            self._set_headers(200 if ok else 404)
            self.wfile.write(json.dumps({"deleted": ok}).encode())

        elif path.startswith("/api/history/"):
            entry_id = path.replace("/api/history/", "").strip()
            ok = history_manager.delete_entry(entry_id)
            self._set_headers(200 if ok else 404)
            self.wfile.write(json.dumps({"deleted": ok}).encode())

        elif path == "/api/history":
            history_manager.clear_history()
            self._set_headers(200)
            self.wfile.write(json.dumps({"status": "cleared"}).encode())

        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode())

    def log_message(self, format, *args):
        # Keep logs clean
        logger.debug("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), format % args))


def start_server(port=PORT):
    # Start background hotkey daemon
    try:
        hotkey_daemon.start()
    except Exception as e:
        logger.warning(f"Could not start global hotkey listener (may require accessibility permissions): {e}")

    server = HTTPServer(("127.0.0.1", port), OpenFlowHandler)
    logger.info(f"OpenFlow Local Engine Server active on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopping OpenFlow Engine Server...")
        hotkey_daemon.stop()
        server.server_close()


if __name__ == "__main__":
    start_server()
