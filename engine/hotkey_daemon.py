"""
OpenFlow Global Hotkey & Push-to-Talk Daemon
============================================
Listens globally for dictation triggers (e.g. Ctrl+Space) across the entire OS.
Orchestrates: Press -> Record Audio -> Transcribe -> Clean -> Auto-Paste into active window.
"""

from __future__ import annotations
import time
import logging
import threading
from typing import Optional, Callable
from pynput import keyboard

from engine.audio_recorder import AudioRecorder
from engine.whisper_engine import WhisperEngine
from engine.system_injector import SystemInjector
from engine.history_manager import HistoryManager
from engine.models_manager import ModelPresetManager

logger = logging.getLogger("OpenFlow.Hotkey")


class HotkeyDaemon:
    """Listens globally for shortcuts and manages Push-to-Talk dictation."""

    def __init__(
        self,
        on_state_change: Optional[Callable[[str, Optional[str], float], None]] = None
    ):
        self.audio_recorder = AudioRecorder(on_level_change=self._on_audio_level)
        self.whisper_engine = WhisperEngine()
        self.history_manager = HistoryManager()
        self.preset_manager = ModelPresetManager()
        self.system_injector = SystemInjector()

        self.on_state_change = on_state_change  # (status, text_preview, audio_level)
        self.is_active = False
        self._listener: Optional[keyboard.Listener] = None

        # Key state tracking
        self._ctrl_pressed = False
        self._is_recording = False
        self._lock = threading.Lock()

    def _on_audio_level(self, level: float):
        if self._is_recording and self.on_state_change:
            self.on_state_change("listening", None, level)

    def _start_dictation(self):
        with self._lock:
            if self._is_recording:
                return
            self._is_recording = True

        logger.info("Push-to-Talk triggered: Recording started")
        if self.on_state_change:
            self.on_state_change("listening", "Listening to microphone...", 0.0)

        try:
            self.audio_recorder.start()
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            self._is_recording = False

    def _stop_and_paste(self):
        with self._lock:
            if not self._is_recording:
                return
            self._is_recording = False

        logger.info("Push-to-Talk released: Processing audio")
        if self.on_state_change:
            self.on_state_change("processing", "Transcribing & formatting text...", 0.0)

        # 1. Stop audio capture and save raw WAV
        wav_path, duration = self.audio_recorder.stop()
        if not wav_path or duration < 0.2:
            logger.info("Audio too short, discarded.")
            if self.on_state_change:
                self.on_state_change("ready", "", 0.0)
            return

        # 2. Transcribe and clean
        config = self.preset_manager.get_config()
        raw_text, clean_text = self.whisper_engine.transcribe(
            wav_path,
            spoken_punctuation=config.get("spoken_punctuation", True),
            strip_fillers=config.get("strip_filler_words", True)
        )

        # 3. Log to persistent history
        if clean_text:
            self.history_manager.log_entry(
                raw_text=raw_text,
                cleaned_text=clean_text,
                audio_path=wav_path,
                duration=duration,
                preset_used=config.get("active_preset", "balanced")
            )

            # 4. Auto-paste directly into active app
            logger.info(f"Pasting text: '{clean_text}'")
            self.system_injector.paste_into_active_window(clean_text)

            if self.on_state_change:
                self.on_state_change("pasted", clean_text, 0.0)
        else:
            if self.on_state_change:
                self.on_state_change("ready", "", 0.0)

        # Reset state after 1.8 seconds
        def _reset():
            time.sleep(1.8)
            if self.on_state_change and not self._is_recording:
                self.on_state_change("ready", "", 0.0)

        threading.Thread(target=_reset, daemon=True).start()

    def _on_press(self, key):
        # Check for Ctrl (or Command on macOS) + Space
        if key in (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r):
            self._ctrl_pressed = True

        if key == keyboard.Key.space and self._ctrl_pressed:
            self._start_dictation()

    def _on_release(self, key):
        if key in (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r):
            self._ctrl_pressed = False
            if self._is_recording:
                self._stop_and_paste()

        if key == keyboard.Key.space and self._is_recording:
            # In hold-space mode, releasing space triggers stop
            self._stop_and_paste()

    def start(self):
        """Starts background hotkey listening thread."""
        if self.is_active:
            return
        self.is_active = True
        self._listener = keyboard.Listener(
            on_press=self._on_press,
            on_release=self._on_release
        )
        self._listener.start()
        logger.info("Global Push-to-Talk daemon active (Hold Ctrl+Space to speak).")

    def stop(self):
        self.is_active = False
        if self._listener is not None:
            self._listener.stop()
            self._listener = None
