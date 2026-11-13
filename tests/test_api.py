"""End-to-end HTTP API tests against a real engine instance on an ephemeral port."""

import base64
import json
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from engine.audio_recorder import synthesise_capture
from engine.server import build_server


class EngineApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = build_server(host="127.0.0.1", port=0, start_hotkeys=False)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.port}"
        for _ in range(50):
            try:
                cls.request("GET", "/api/health")
                break
            except Exception:
                time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    @classmethod
    def request(cls, method, path, payload=None, headers=None, expect=200, raw=False):
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            cls.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read()
                status = response.status
                response_headers = dict(response.headers)
        except urllib.error.HTTPError as exc:
            body = exc.read()
            status = exc.code
            response_headers = dict(exc.headers)

        if expect is not None:
            assert status == expect, f"{method} {path} -> {status}: {body[:400]!r}"
        if raw:
            return status, body, response_headers
        return json.loads(body or b"{}")

    # -- read endpoints -----------------------------------------------------
    def test_health(self):
        payload = self.request("GET", "/api/health")
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["engine"], "OpenFlow")

    def test_state_shape(self):
        state = self.request("GET", "/api/state")
        for key in ("status", "is_recording", "audio_level", "capabilities", "config", "stats"):
            self.assertIn(key, state)
        self.assertIn(state["status"], {"ready", "listening", "processing", "pasted", "copied", "saved", "error"})

    def test_light_state_omits_heavy_payloads(self):
        light = self.request("GET", "/api/state?light=1")
        self.assertIn("status", light)
        self.assertNotIn("capabilities", light)
        self.assertNotIn("stats", light)

    def test_capabilities(self):
        caps = self.request("GET", "/api/capabilities")
        for key in ("demo_mode", "microphone", "stt", "tts", "injector", "notes"):
            self.assertIn(key, caps)
        self.assertIsInstance(caps["notes"], list)

    def test_presets(self):
        payload = self.request("GET", "/api/presets")
        ids = [p["id"] for p in payload["presets"]]
        self.assertEqual(ids, ["fast", "balanced", "pro"])
        self.assertEqual(sum(1 for p in payload["presets"] if p["is_active"]), 1)
        self.assertIn("active_preset", payload["config"])

    # -- dictation ----------------------------------------------------------
    def test_clean_endpoint(self):
        result = self.request("POST", "/api/dictation/clean", {
            "raw_text": "uh the the api is ready period new line ship it question mark",
        })
        self.assertEqual(result["cleaned_text"], "The API is ready.\nShip it?")
        self.assertGreater(result["report"]["total_fixes"], 2)

    def test_clean_requires_text(self):
        error = self.request("POST", "/api/dictation/clean", {"raw_text": "  "}, expect=400)
        self.assertFalse(error["ok"])
        self.assertIn("raw_text", error["error"])

    def test_demo_dictation_cycle(self):
        started = self.request("POST", "/api/dictation/start", {"source": "test"})
        self.assertTrue(started["ok"])
        time.sleep(0.4)

        state = self.request("GET", "/api/state")
        self.assertEqual(state["status"], "listening")

        result = self.request("POST", "/api/dictation/stop", {"wait": True}, expect=200)
        self.assertTrue(result["ok"])
        self.assertTrue(result["cleaned_text"])
        self.assertNotEqual(result["raw_text"], result["cleaned_text"])
        self.assertIn("report", result)
        self.assertGreaterEqual(result["latency_ms"], 0)
        # No clipboard tool in CI: the engine must report "saved", not pretend it pasted.
        expected = "pasted" if self.request("GET", "/api/capabilities")["injector"]["clipboard"] else "saved"
        self.assertEqual(self.request("GET", "/api/state")["status"], expected)

        entry = result["entry"]
        self.assertIsNotNone(entry)
        self.assertTrue(entry["audio_file"])

        # the raw WAV is downloadable and supports range requests
        status, body, headers = self.request(
            "GET", f"/api/audio/recordings/{entry['audio_file']}", raw=True, expect=206,
            headers={"Range": "bytes=0-99"},
        )
        self.assertEqual(len(body), 100)
        self.assertIn("Content-Range", headers)
        self.assertTrue(body.startswith(b"RIFF"))

        history = self.request("GET", "/api/history")
        self.assertTrue(any(item["id"] == entry["id"] for item in history["history"]))

        self.request("DELETE", f"/api/history/{entry['id']}")

    def test_stop_without_start(self):
        self.request("POST", "/api/dictation/start", {})
        self.request("POST", "/api/dictation/stop", {"wait": True})
        error = self.request("POST", "/api/dictation/stop", {"wait": True}, expect=200)
        self.assertFalse(error["ok"])

    # -- config / presets ---------------------------------------------------
    def test_preset_selection(self):
        self.request("POST", "/api/presets/select", {"preset_id": "fast"})
        presets = self.request("GET", "/api/presets")
        self.assertEqual(presets["config"]["active_preset"], "fast")
        self.request("POST", "/api/presets/select", {"preset_id": "balanced"})
        self.request("POST", "/api/presets/select", {"preset_id": "nope"}, expect=400)

    def test_config_update_validation(self):
        updated = self.request("PATCH", "/api/config/update", {"strip_filler_words": False})
        self.assertFalse(updated["config"]["strip_filler_words"])
        self.request("PATCH", "/api/config/update", {"strip_filler_words": True})
        self.request("PATCH", "/api/config/update", {"bogus_key": 1}, expect=400)

    def test_cleaner_respects_config(self):
        self.request("PATCH", "/api/config/update", {"spoken_punctuation": False})
        result = self.request("POST", "/api/dictation/clean", {"raw_text": "hello comma world"})
        self.assertIn("comma", result["cleaned_text"])
        self.request("PATCH", "/api/config/update", {"spoken_punctuation": True})

    # -- voice cloning / TTS ------------------------------------------------
    def test_profile_demo_and_tts(self):
        created = self.request("POST", "/api/profiles/demo", {"name": "CI Voice", "duration": 5})
        profile = created["profile"]
        self.assertTrue(created["demo"])
        self.assertIn("f0_hz", profile["signature"])

        profile_audio = self.request("GET", f"/api/audio/profiles/{Path(profile['wav_path']).name}", raw=True)
        self.assertTrue(profile_audio[1].startswith(b"RIFF"))

        tts = self.request("POST", "/api/tts/synthesize", {
            "text": "OpenFlow speaks this line entirely offline.",
            "profile_id": profile["id"],
        })
        self.assertEqual(tts["engine"], "preview")
        self.assertGreater(tts["duration"], 0.5)
        audio_status, audio_body, _ = self.request("GET", f"/api/audio/recordings/tts_out/{tts['file']}", raw=True)
        self.assertEqual(audio_status, 200)
        self.assertTrue(audio_body.startswith(b"RIFF"))

        self.request("DELETE", f"/api/profiles/{profile['id']}")

    def test_profile_create_from_wav_upload(self):
        import tempfile

        tmp = Path(tempfile.mkdtemp(prefix="of-upload-")) / "ref.wav"
        synthesise_capture(tmp, 6.0)
        encoded = base64.b64encode(tmp.read_bytes()).decode()
        created = self.request("POST", "/api/profiles/create", {"name": "Uploaded", "audio_base64": encoded})
        self.assertEqual(created["profile"]["duration"], 6.0)
        self.request("DELETE", f"/api/profiles/{created['profile']['id']}")

    def test_profile_rejects_short_clip(self):
        import tempfile

        tmp = Path(tempfile.mkdtemp(prefix="of-short-")) / "ref.wav"
        synthesise_capture(tmp, 1.0)
        encoded = base64.b64encode(tmp.read_bytes()).decode()
        self.request("POST", "/api/profiles/create", {"name": "Too short", "audio_base64": encoded}, expect=400)

    def test_profile_rejects_non_wav(self):
        payload = base64.b64encode(b"definitely not audio").decode()
        self.request("POST", "/api/profiles/create", {"name": "Bad", "audio_base64": payload}, expect=400)

    # -- security / resilience ---------------------------------------------
    def test_audio_path_traversal_blocked(self):
        self.request("GET", "/api/audio/%2e%2e/config.json", raw=True, expect=403)

    def test_missing_audio_404(self):
        self.request("GET", "/api/audio/recordings/does-not-exist.wav", raw=True, expect=404)

    def test_unknown_endpoint_404(self):
        payload = self.request("GET", "/api/nope", expect=404)
        self.assertFalse(payload["ok"])

    def test_bad_json_body(self):
        req = urllib.request.Request(
            self.base + "/api/dictation/clean",
            data=b"{broken",
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=10)
        self.assertEqual(ctx.exception.code, 400)

    def test_cors_preflight(self):
        status, body, headers = self.request("OPTIONS", "/api/state", raw=True, expect=204)
        self.assertIn("Access-Control-Allow-Methods", headers)

    def test_history_export(self):
        self.request("POST", "/api/dictation/clean", {"raw_text": "hello comma world period", "save_history": True})
        status, body, _ = self.request("GET", "/api/history/export", raw=True)
        self.assertEqual(status, 200)
        self.assertIn(b"OpenFlow dictation export", body)


if __name__ == "__main__":
    unittest.main()
