"""Tests for history storage, audio capture helpers and the voice cloner."""

import os
import tempfile
import unittest
from pathlib import Path

from engine.audio_recorder import (
    peak,
    read_wav_samples,
    rms,
    synthesise_capture,
    trim_silence,
    write_wav,
)
from engine.history_manager import HistoryManager
from engine.voice_cloner import VoiceCloningManager, analyse_reference


class AudioHelpersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="of-audio-"))

    def test_wav_roundtrip(self):
        path = self.tmp / "tone.wav"
        samples = [0, 1000, -1000, 32767, -32768]
        write_wav(path, samples, 16_000)
        loaded, rate, channels = read_wav_samples(path)
        self.assertEqual(loaded, samples)
        self.assertEqual(rate, 16_000)
        self.assertEqual(channels, 1)

    def test_rms_and_peak(self):
        self.assertAlmostEqual(rms([0, 0, 0]), 0.0)
        self.assertAlmostEqual(peak([-32768, 5]), 1.0)
        self.assertGreater(rms([16384] * 100), 0.4)

    def test_trim_silence_keeps_speech(self):
        silence = [0] * 8_000
        speech = [8_000] * 8_000
        trimmed = trim_silence(silence + speech + silence, 16_000)
        self.assertLess(len(trimmed), 24_000)
        self.assertGreater(len(trimmed), 7_000)

    def test_trim_silence_empty(self):
        self.assertEqual(trim_silence([0] * 100), [])

    def test_synthesise_capture_is_valid_wav(self):
        path = self.tmp / "demo.wav"
        synthesise_capture(path, 1.5)
        samples, rate, _ = read_wav_samples(path)
        self.assertGreater(len(samples), 0)
        self.assertEqual(rate, 16_000)
        self.assertGreater(rms(samples), 0.01)


class HistoryManagerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="of-history-"))
        self.history = HistoryManager(path=self.tmp / "history.json")

    def test_log_and_order(self):
        first = self.history.log_entry("raw one", "Clean one.", duration=1.2)
        second = self.history.log_entry("raw two", "Clean two.", duration=2.4)
        entries = self.history.get_history()
        self.assertEqual([e["id"] for e in entries], [second["id"], first["id"]])
        self.assertEqual(entries[0]["duration"], 2.4)
        self.assertEqual(entries[0]["preset"], "balanced")

    def test_search(self):
        self.history.log_entry("uh the api", "The API is ready.")
        self.history.log_entry("um the ui", "The UI is ready.")
        self.assertEqual(len(self.history.get_history(query="api")), 1)
        self.assertEqual(len(self.history.get_history(query="ready")), 2)
        self.assertEqual(len(self.history.get_history(query="nomatch")), 0)

    def test_star_and_stats(self):
        entry = self.history.log_entry("raw", "Some clean words here.", duration=3.0)
        self.assertTrue(self.history.toggle_star(entry["id"]))
        stats = self.history.stats()
        self.assertEqual(stats["entries"], 1)
        self.assertEqual(stats["starred"], 1)
        self.assertEqual(stats["words"], 4)

    def test_delete_removes_audio(self):
        audio = self.tmp / "clip.wav"
        write_wav(audio, [0] * 100)
        entry = self.history.log_entry("raw", "clean", audio_path=str(audio))
        self.assertTrue(self.history.delete_entry(entry["id"]))
        self.assertFalse(audio.exists())
        self.assertEqual(self.history.get_history(), [])
        self.assertFalse(self.history.delete_entry("missing"))

    def test_clear_history(self):
        for i in range(3):
            self.history.log_entry(f"raw {i}", f"clean {i}")
        self.assertEqual(self.history.clear_history(), 3)
        self.assertEqual(self.history.get_history(), [])

    def test_export_markdown(self):
        self.history.log_entry("raw text", "Clean text.", duration=1.0)
        markdown = self.history.export_markdown()
        self.assertIn("# OpenFlow dictation export", markdown)
        self.assertIn("Clean text.", markdown)
        self.assertIn("> Raw: raw text", markdown)

    def test_corrupt_file_is_tolerated(self):
        (self.tmp / "broken.json").write_text("{not json")
        manager = HistoryManager(path=self.tmp / "broken.json")
        self.assertEqual(manager.get_history(), [])


class VoiceClonerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="of-voice-"))
        self.manager = VoiceCloningManager()
        self.reference = self.tmp / "ref.wav"
        synthesise_capture(self.reference, 6.0)

    def tearDown(self):
        for profile in self.manager.list_profiles():
            self.manager.delete_profile(profile["id"])

    def test_reference_analysis(self):
        signature = analyse_reference(self.reference)
        self.assertAlmostEqual(signature.duration, 6.0, delta=0.1)
        self.assertGreater(signature.f0_hz, 60)
        self.assertLess(signature.f0_hz, 400)
        self.assertGreater(signature.speech_ratio, 0.2)

    def test_rejects_too_short(self):
        short = self.tmp / "short.wav"
        synthesise_capture(short, 1.0)
        with self.assertRaises(ValueError):
            self.manager.validate_reference(short)

    def test_rejects_silence(self):
        silent = self.tmp / "silent.wav"
        write_wav(silent, [0] * 16_000 * 5)
        with self.assertRaises(ValueError):
            self.manager.validate_reference(silent)

    def test_rejects_missing(self):
        with self.assertRaises(ValueError):
            self.manager.validate_reference(self.tmp / "nope.wav")

    def test_profile_lifecycle(self):
        profile = self.manager.create_profile("Studio Voice", self.reference)
        self.assertTrue(Path(profile.wav_path).exists())
        self.assertEqual(len(self.manager.list_profiles()), 1)
        self.assertEqual(self.manager.get_profile(profile.profile_id)["name"], "Studio Voice")
        self.assertTrue(self.manager.delete_profile(profile.profile_id))
        self.assertEqual(self.manager.list_profiles(), [])

    def test_synthesize_produces_audio(self):
        profile = self.manager.create_profile("Voiced", self.reference)
        result = self.manager.synthesize("Hello world, this is OpenFlow.", profile.profile_id)
        self.assertTrue(Path(result["output_wav"]).exists())
        self.assertEqual(result["engine"], "preview")
        self.assertGreater(result["duration"], 0.5)
        samples, rate, _ = read_wav_samples(result["output_wav"])
        self.assertEqual(rate, 24_000)
        self.assertGreater(rms(samples), 0.005)
        os.unlink(result["output_wav"])

    def test_synthesize_rejects_empty_and_long(self):
        with self.assertRaises(ValueError):
            self.manager.synthesize("   ")
        with self.assertRaises(ValueError):
            self.manager.synthesize("word " * 1000)

    def test_backend_capabilities(self):
        caps = self.manager.backend_capabilities()
        self.assertTrue(caps["available"])
        self.assertIn(caps["engine"], {"kokoro", "piper", "preview"})
        self.assertIn(caps["quality"], {"neural", "preview"})


if __name__ == "__main__":
    unittest.main()
