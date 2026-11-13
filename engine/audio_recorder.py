"""
OpenFlow Native Audio Recorder
==============================
High-performance, low-latency audio capture using CoreAudio / ALSA / WASAPI.
Records 16kHz 16-bit mono WAV files optimized for Whisper and speech AI models.
Computes real-time RMS audio levels to drive visualizer waveforms.
"""

from __future__ import annotations
import os
import time
import wave
import struct
import math
import threading
from pathlib import Path
from typing import Optional, Callable, List
import numpy as np
import sounddevice as sd

OPENFLOW_DIR = Path.home() / ".openflow"
RECORDINGS_DIR = OPENFLOW_DIR / "recordings"

SAMPLE_RATE = 16000  # 16kHz standard for Whisper
CHANNELS = 1         # Mono


class AudioRecorder:
    """Manages microphone audio capture and real-time level metering."""

    def __init__(self, on_level_change: Optional[Callable[[float], None]] = None):
        RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        self.sample_rate = SAMPLE_RATE
        self.channels = CHANNELS
        self.is_recording = False
        self._stream: Optional[sd.InputStream] = None
        self._frames: List[np.ndarray] = []
        self._lock = threading.Lock()
        self.current_level = 0.0
        self.on_level_change = on_level_change
        self.start_time = 0.0

    def _audio_callback(self, indata, frames, time_info, status):
        """Called by PortAudio for each block of incoming audio."""
        if not self.is_recording:
            return

        # Store incoming audio frame
        with self._lock:
            self._frames.append(indata.copy())

        # Calculate Root-Mean-Square (RMS) for visualizer (normalized 0.0 - 1.0)
        rms = np.sqrt(np.mean(indata**2))
        # Scale to 0.0 - 1.0 range with non-linear boost for speech responsiveness
        scaled_level = min(1.0, math.sqrt(rms * 15.0))
        self.current_level = scaled_level

        if self.on_level_change:
            try:
                self.on_level_change(scaled_level)
            except Exception:
                pass

    def start(self, device: Optional[int | str] = None) -> bool:
        """Starts recording from the microphone."""
        if self.is_recording:
            return True

        with self._lock:
            self._frames = []

        self.is_recording = True
        self.start_time = time.time()

        try:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="float32",
                callback=self._audio_callback,
                device=device,
                blocksize=512  # low latency block size (~32ms)
            )
            self._stream.start()
            return True
        except Exception as e:
            self.is_recording = False
            raise RuntimeError(f"Failed to open microphone stream: {e}")

    def stop(self) -> Tuple[str, float]:
        """
        Stops recording and saves the raw audio to a timestamped WAV file.
        Returns: (saved_wav_path, duration_seconds)
        """
        if not self.is_recording:
            return "", 0.0

        self.is_recording = False
        duration = time.time() - self.start_time

        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

        with self._lock:
            frames_to_save = list(self._frames)
            self._frames = []

        if not frames_to_save:
            return "", 0.0

        # Concatenate numpy arrays
        audio_data = np.concatenate(frames_to_save, axis=0)

        # Convert float32 (-1.0 to 1.0) to int16 (-32768 to 32767)
        audio_int16 = np.clip(audio_data * 32767, -32768, 32767).astype(np.int16)

        # Generate unique timestamped file path
        filename = f"rec_{int(time.time() * 1000)}.wav"
        output_path = str(RECORDINGS_DIR / filename)

        with wave.open(output_path, "wb") as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(self.sample_rate)
            wf.writeframes(audio_int16.tobytes())

        return output_path, duration

    @staticmethod
    def get_input_devices() -> List[dict]:
        """Lists available audio input devices."""
        devices = sd.query_devices()
        input_devs = []
        for i, dev in enumerate(devices):
            if dev.get("max_input_channels", 0) > 0:
                input_devs.append({
                    "id": i,
                    "name": dev.get("name"),
                    "hostapi": dev.get("hostapi"),
                    "channels": dev.get("max_input_channels"),
                    "default": (i == sd.default.device[0])
                })
        return input_devs
