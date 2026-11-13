"""
OpenFlow Native Audio Recorder
==============================
Low-latency 16 kHz mono capture via PortAudio (CoreAudio / WASAPI / ALSA) with
real-time RMS metering for the floating HUD.

``numpy`` and ``sounddevice`` are optional. When they are missing (CI, headless
servers, a fresh checkout) the recorder reports itself unavailable instead of
crashing the daemon, and ``synthesise_capture()`` can still produce a valid WAV
so the rest of the pipeline stays testable.
"""

from __future__ import annotations

import array
import logging
import math
import struct
import threading
import time
import wave
from pathlib import Path
from typing import Callable, List, Optional, Tuple

from engine.paths import RECORDINGS_DIR, ensure_dirs

logger = logging.getLogger("OpenFlow.Audio")

SAMPLE_RATE = 16_000  # Whisper's native rate
CHANNELS = 1
BLOCK_SIZE = 512  # ~32 ms of audio at 16 kHz
BYTES_PER_SAMPLE = 2

try:  # pragma: no cover - exercised only where numpy exists
    import numpy as _np
except Exception:  # pragma: no cover
    _np = None

try:  # pragma: no cover - exercised only where PortAudio exists
    import sounddevice as _sd
except Exception:  # pragma: no cover
    _sd = None


class RecorderUnavailable(RuntimeError):
    """Raised when no microphone backend is usable on this machine."""


def write_wav(
    path: str | Path,
    samples: "array.array[int] | List[int]",
    sample_rate: int = SAMPLE_RATE,
    channels: int = CHANNELS,
) -> str:
    """Writes 16-bit PCM samples to a mono/stereo WAV file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(BYTES_PER_SAMPLE)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes() if isinstance(samples, array.array) else struct.pack(f"<{len(samples)}h", *samples))
    return str(path)


def read_wav_samples(path: str | Path) -> Tuple[List[int], int, int]:
    """Reads a 16-bit PCM WAV into ``(samples, sample_rate, channels)``."""
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        rate = wf.getframerate()
        width = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())
    if width != 2:
        raise ValueError(f"Unsupported sample width {width * 8}-bit; OpenFlow expects 16-bit PCM.")
    samples = list(struct.unpack(f"<{len(frames) // 2}h", frames)) if frames else []
    if channels > 1:  # downmix
        samples = [sum(samples[i:i + channels]) // channels for i in range(0, len(samples), channels)]
        channels = 1
    return samples, rate, channels


def rms(samples: List[int]) -> float:
    """Normalised root-mean-square of int16 samples (0.0 – 1.0)."""
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples)) / 32768.0


def peak(samples: List[int]) -> float:
    if not samples:
        return 0.0
    return max(abs(min(samples)), abs(max(samples))) / 32768.0


def trim_silence(
    samples: List[int],
    sample_rate: int = SAMPLE_RATE,
    threshold: float = 0.012,
    pad_ms: int = 120,
) -> List[int]:
    """
    Energy-based VAD. Trims leading/trailing silence and keeps a small pad so
    consonants are never clipped. This is the dependency-free stand-in for
    Silero VAD; Silero takes over automatically when it is installed.
    """
    if not samples:
        return []
    window = max(1, sample_rate // 50)  # 20 ms
    pad = int(sample_rate * pad_ms / 1000)

    first, last = None, None
    for start in range(0, len(samples), window):
        chunk = samples[start:start + window]
        if rms(chunk) >= threshold:
            if first is None:
                first = start
            last = start + len(chunk)

    if first is None or last is None:
        return []
    return samples[max(0, first - pad):min(len(samples), last + pad)]


class AudioRecorder:
    """Records the microphone into a 16 kHz mono WAV with live level metering."""

    def __init__(self, on_level_change: Optional[Callable[[float], None]] = None) -> None:
        ensure_dirs()
        self.on_level_change = on_level_change
        self.is_recording = False
        self.current_level = 0.0
        self.start_time = 0.0
        self._stream = None
        self._chunks: List[List[int]] = []
        self._lock = threading.Lock()

    # -- capability ---------------------------------------------------------
    @staticmethod
    def backend_status() -> dict:
        if _sd is None:
            return {
                "available": False,
                "backend": "none",
                "reason": "sounddevice/PortAudio is not installed (pip install sounddevice numpy).",
            }
        try:
            device = _sd.query_devices(kind="input")
            if device is None or device.get("max_input_channels", 0) < 1:
                raise RuntimeError("no input channels")
            return {
                "available": True,
                "backend": "portaudio",
                "device": device.get("name", "default"),
                "reason": None,
            }
        except Exception as exc:  # pragma: no cover - depends on host audio
            return {"available": False, "backend": "none", "reason": f"No microphone detected ({exc})."}

    # -- capture ------------------------------------------------------------
    def _callback(self, indata, frames, time_info, status):  # noqa: ANN001 - PortAudio signature
        if not self.is_recording:
            return
        if _np is not None:
            mono = indata[:, 0]
            self.current_level = min(1.0, math.sqrt(max(0.0, float((mono ** 2).mean())) * 15.0))
            pcm = (mono * 32767).astype("int16").tolist()
        else:  # pragma: no cover
            pcm = [int(v * 32767) for v in indata[:, 0]]
            self.current_level = min(1.0, math.sqrt(rms(pcm) * 15.0))
        with self._lock:
            self._chunks.append(pcm)
        if self.on_level_change:
            try:
                self.on_level_change(self.current_level)
            except Exception:
                pass

    def start(self, device: Optional[int | str] = None) -> bool:
        if self.is_recording:
            return True
        status = self.backend_status()
        if not status["available"]:
            raise RecorderUnavailable(status["reason"] or "No audio input available.")

        with self._lock:
            self._chunks = []
        self.current_level = 0.0
        self.is_recording = True
        self.start_time = time.time()
        try:
            self._stream = _sd.InputStream(  # type: ignore[union-attr]
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                blocksize=BLOCK_SIZE,
                device=device,
                callback=self._callback,
            )
            self._stream.start()
            return True
        except Exception as exc:  # pragma: no cover - depends on host audio
            self.is_recording = False
            self._stream = None
            raise RecorderUnavailable(f"Could not open microphone stream: {exc}") from exc

    def stop(self) -> Tuple[str, float]:
        """Stops capture and returns ``(wav_path, duration_seconds)``."""
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
        self.current_level = 0.0

        with self._lock:
            chunks, self._chunks = self._chunks, []
        samples = [s for chunk in chunks for s in chunk]
        if not samples:
            return "", 0.0

        trimmed = trim_silence(samples) or samples[-int(SAMPLE_RATE * 0.5):]
        path = RECORDINGS_DIR / f"rec_{int(time.time() * 1000)}.wav"
        write_wav(path, array.array("h", trimmed))
        return str(path), round(duration, 2)

    # -- device discovery ---------------------------------------------------
    @staticmethod
    def list_input_devices() -> List[dict]:
        if _sd is None:
            return []
        try:
            default_in = _sd.default.device[0]
        except Exception:
            default_in = -1
        devices = []
        for index, dev in enumerate(_sd.query_devices()):
            if dev.get("max_input_channels", 0) > 0:
                devices.append({
                    "id": index,
                    "name": dev.get("name"),
                    "channels": dev.get("max_input_channels"),
                    "samplerate": dev.get("default_samplerate"),
                    "default": index == default_in,
                })
        return devices


# ---------------------------------------------------------------------------
# Demo / headless capture
# ---------------------------------------------------------------------------
def synthesise_capture(path: str | Path, duration: float = 2.4, sample_rate: int = SAMPLE_RATE) -> str:
    """
    Renders a speech-like WAV (voiced formants + syllable envelope + breath
    noise) used by demo mode when no microphone exists. It is deliberately
    wordless: demo transcripts come from ``engine.demo`` so the UI can exercise
    the full record -> transcribe -> clean -> paste pipeline anywhere.
    """
    total = max(int(sample_rate * duration), sample_rate // 4)
    samples = array.array("h")
    rng = 12345

    def noise() -> float:
        nonlocal rng
        rng = (1103515245 * rng + 12345) & 0x7FFFFFFF
        return (rng / 0x3FFFFFFF) - 1.0

    syllables = max(2, int(duration / 0.28))
    for i in range(total):
        t = i / sample_rate
        word_pos = (t % 0.9) / 0.9
        env = math.sin(math.pi * min(1.0, word_pos * 1.6)) ** 2
        pitch = 118 + 12 * math.sin(2 * math.pi * 0.7 * t) + 6 * math.sin(2 * math.pi * 2.3 * t)
        voiced = (
            0.6 * math.sin(2 * math.pi * pitch * t)
            + 0.28 * math.sin(2 * math.pi * pitch * 2 * t)
            + 0.12 * math.sin(2 * math.pi * 730 * t)
        )
        breath = 0.06 * noise() * env
        value = (voiced * env * 0.5 + breath) * 0.6
        samples.append(int(max(-1.0, min(1.0, value)) * 32767))
    return write_wav(path, samples, sample_rate)
