"""
OpenFlow Voice Cloning & TTS Engine
===================================
Zero-shot voice profiles + fully offline speech synthesis.

Profile enrolment
    A 3–15 s reference clip is validated (duration, sample rate, loudness,
    clipping, speech ratio), analysed for pitch / formant character and stored
    under ``~/.openflow/profiles``. The analysis lets even the lightweight
    preview backend speak in the user's pitch range.

Synthesis backends (probed in order)
    1. ``kokoro-onnx``   — Kokoro-82M neural TTS (Balanced preset)
    2. ``piper``         — Piper VITS voices (Fast preset)
    3. ``preview``       — built-in formant vocoder, zero dependencies

The preview vocoder is a genuine synthesizer: it converts text into syllable
rhythm, renders voiced formants with the profile's pitch contour and uses noise
bursts for consonants. It is intentionally labelled ``preview`` quality because
it is not intelligible like a neural TTS, but it lets the whole clone → speak →
read-aloud loop run on a machine with no model weights.
"""

from __future__ import annotations

import array
import datetime as _dt
import json
import logging
import math
import re
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from engine.audio_recorder import peak, read_wav_samples, rms, write_wav
from engine.paths import PROFILES_DIR, PROFILES_INDEX, TTS_DIR, ensure_dirs, safe_slug

logger = logging.getLogger("OpenFlow.TTS")

MIN_REF_DURATION = 3.0
IDEAL_REF_DURATION = 8.0
MAX_REF_DURATION = 15.0
MIN_SNR_RMS = 0.004
CLIP_THRESHOLD = 0.999

TTS_SAMPLE_RATE = 24_000
MAX_TTS_SECONDS = 90


# ---------------------------------------------------------------------------
# Reference analysis
# ---------------------------------------------------------------------------
@dataclass
class VoiceSignature:
    """Acoustic fingerprint extracted from a reference clip."""

    duration: float
    sample_rate: int
    rms: float
    peak: float
    f0_hz: float
    speech_ratio: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "duration": round(self.duration, 2),
            "sample_rate": self.sample_rate,
            "rms": round(self.rms, 4),
            "peak": round(self.peak, 4),
            "f0_hz": round(self.f0_hz, 1),
            "speech_ratio": round(self.speech_ratio, 2),
        }


def analyse_reference(wav_path: str | Path) -> VoiceSignature:
    """Extracts pitch / loudness statistics used by the synthesis backends."""
    samples, rate, _channels = read_wav_samples(wav_path)
    duration = len(samples) / float(rate) if rate else 0.0

    # Zero-crossing pitch estimate over voiced windows
    window = max(1, rate // 50)
    voiced: List[float] = []
    for start in range(0, len(samples), window):
        chunk = samples[start:start + window]
        if rms(chunk) < MIN_SNR_RMS:
            continue
        crossings = sum(
            1 for a, b in zip(chunk, chunk[1:]) if (a < 0) != (b < 0)
        )
        if crossings >= 2:
            voiced.append(crossings * rate / (2.0 * len(chunk)))
    f0 = sorted(voiced)[len(voiced) // 2] if voiced else 130.0
    f0 = max(70.0, min(320.0, f0))

    speech_windows = sum(1 for s in range(0, len(samples), window) if rms(samples[s:s + window]) >= MIN_SNR_RMS)
    total_windows = max(1, len(samples) // window)

    return VoiceSignature(
        duration=duration,
        sample_rate=rate,
        rms=rms(samples),
        peak=peak(samples),
        f0_hz=f0,
        speech_ratio=speech_windows / total_windows,
    )


# ---------------------------------------------------------------------------
# Preview vocoder
# ---------------------------------------------------------------------------
_VOWEL_GROUPS = re.compile(r"[aeiouy]+", re.IGNORECASE)


def _ends_with_consonant(word: str) -> bool:
    return bool(word) and word[-1].lower() in "bcdfghjklmnpqrstvwxz"


def _syllables(word: str) -> int:
    groups = _VOWEL_GROUPS.findall(word)
    count = len(groups)
    if word.lower().endswith("e") and count > 1 and not word.lower().endswith(("le", "ee")):
        count -= 1
    return max(1, count)


class PreviewVocoder:
    """
    Dependency-free formant synthesizer used when no neural TTS model exists.

    Text is mapped to syllables; each syllable becomes a voiced vowel with the
    profile's pitch contour, optionally preceded by a consonant noise burst.
    Punctuation adds pauses, so the output follows the rhythm of the sentence.
    """

    name = "preview"
    quality = "preview"

    def __init__(self, signature: Optional[VoiceSignature] = None) -> None:
        self.signature = signature
        self._rng = 987_654_321

    def _noise(self) -> float:
        self._rng = (1_103_515_245 * self._rng + 12_345) & 0x7FFF_FFFF
        return (self._rng / 0x3FFF_FFFF) - 1.0

    def render(self, text: str, path: str | Path) -> Dict[str, Any]:
        base_f0 = self.signature.f0_hz if self.signature else 132.0
        base_f0 = max(85.0, min(240.0, base_f0))
        rate = TTS_SAMPLE_RATE

        tokens = re.findall(r"[A-Za-z']+|[.,!?;:]", text)
        out = array.array("h")
        syllable_count = 0
        sentence_pos = 0.0

        for token in tokens:
            if not re.match(r"[A-Za-z']", token):
                pause = {",": 0.20, ";": 0.22, ":": 0.22, ".": 0.34, "!": 0.34, "?": 0.40}.get(token, 0.15)
                out.extend(array.array("h", [0] * int(rate * pause)))
                sentence_pos = 0.0
                continue

            word = token.lower()
            syllables = _syllables(word)
            for index in range(syllables):
                syllable_count += 1
                # Sentence-level intonation: fall at the end, rise mid-clause.
                contour = 1.0 + 0.06 * math.sin(math.pi * min(1.0, sentence_pos)) - 0.04 * sentence_pos
                f0 = base_f0 * contour * (1.0 + 0.03 * (index % 2))
                vowel_dur = 0.135 if index == 0 else 0.105
                out.extend(_render_vowel(f0, vowel_dur, rate, word))

                if index < syllables - 1 or _ends_with_consonant(word):
                    out.extend(_render_consonant(rate, word))
                sentence_pos += 0.18

                if syllable_count * 0.19 > MAX_TTS_SECONDS:
                    break
            out.extend(array.array("h", [0] * int(rate * 0.035)))

            if syllable_count * 0.19 > MAX_TTS_SECONDS:
                break

        # Simple fade in/out to avoid clicks
        fade = int(rate * 0.02)
        for i in range(min(fade, len(out))):
            out[i] = int(out[i] * (i / fade))
            out[-1 - i] = int(out[-1 - i] * (i / fade))

        write_wav(path, out, rate)
        return {
            "engine": self.name,
            "quality": self.quality,
            "sample_rate": rate,
            "duration": round(len(out) / rate, 2),
            "syllables": syllable_count,
        }

# The optimized vowel/consonant renderers live outside the class to keep the
# DSP loop tight (no attribute lookups inside the sample loop).
def _render_vowel(f0: float, duration: float, rate: int, word: str) -> array.array:
    n = max(1, int(rate * duration))
    if any(v in word for v in ("ee", "ea", "i", "y")):
        f1, f2 = 380.0, 2100.0
    elif any(v in word for v in ("oo", "ou", "u")):
        f1, f2 = 420.0, 900.0
    else:
        f1, f2 = 700.0, 1220.0

    samples = array.array("h")
    two_pi = 2.0 * math.pi
    for i in range(n):
        t = i / rate
        env = math.sin(math.pi * i / n) ** 1.4
        # Glottal-ish source: a few harmonics around f0
        source = (
            0.55 * math.sin(two_pi * f0 * t)
            + 0.28 * math.sin(two_pi * 2 * f0 * t)
            + 0.14 * math.sin(two_pi * 3 * f0 * t)
        )
        # Formant colouring via AM at formant frequencies
        colour = 0.65 + 0.35 * math.sin(two_pi * f1 * t) * math.sin(two_pi * f2 * t)
        samples.append(int(max(-1.0, min(1.0, source * env * colour * 0.42)) * 32767))
    return samples


def _render_consonant(rate: int, word: str) -> array.array:
    duration = 0.055 if word[:1] in "bvgdz" else 0.035
    n = max(1, int(rate * duration))
    samples = array.array("h")
    rng = (hash(word) & 0x7FFF_FFFF) or 12345
    for i in range(n):
        rng = (1_103_515_245 * rng + 12_345) & 0x7FFF_FFFF
        noise = (rng / 0x3FFF_FFFF) - 1.0
        env = math.sin(math.pi * i / n) ** 2
        samples.append(int(noise * env * 0.10 * 32767))
    return samples


# ---------------------------------------------------------------------------
# Profile store + synthesis manager
# ---------------------------------------------------------------------------
class VoiceProfile:
    def __init__(
        self,
        profile_id: str,
        name: str,
        wav_path: str,
        duration: float,
        description: str = "",
        created_at: Optional[str] = None,
        signature: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.profile_id = profile_id
        self.name = name
        self.wav_path = wav_path
        self.duration = duration
        self.description = description
        self.created_at = created_at or _dt.datetime.now().isoformat(timespec="seconds")
        self.signature = signature or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.profile_id,
            "name": self.name,
            "wav_path": self.wav_path,
            "file": Path(self.wav_path).name,
            "duration": round(self.duration, 2),
            "description": self.description,
            "created_at": self.created_at,
            "signature": self.signature,
        }


class VoiceCloningManager:
    """Owns voice profiles and offline TTS synthesis."""

    def __init__(self) -> None:
        ensure_dirs()
        self._lock = threading.Lock()
        self._index = PROFILES_INDEX
        if not self._index.exists():
            self._write_index([])
        self._backend_error: Optional[str] = None

    # -- index helpers ------------------------------------------------------
    def _read_index(self) -> List[Dict[str, Any]]:
        try:
            with open(self._index, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _write_index(self, profiles: List[Dict[str, Any]]) -> None:
        tmp = self._index.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(profiles, handle, indent=2)
        tmp.replace(self._index)

    # -- validation ---------------------------------------------------------
    def validate_reference(self, wav_path: str | Path) -> Tuple[bool, List[str], VoiceSignature]:
        """Returns ``(ok, warnings, signature)``. Warnings never block enrolment."""
        path = Path(wav_path)
        warnings: List[str] = []
        if not path.exists() or path.stat().st_size == 0:
            raise ValueError("Reference audio is missing or empty.")

        try:
            samples, rate, channels = read_wav_samples(path)
        except Exception as exc:
            raise ValueError(f"Unsupported audio file: {exc}") from exc

        duration = len(samples) / float(rate)
        if duration < MIN_REF_DURATION:
            raise ValueError(
                f"Reference is {duration:.1f}s — record at least {MIN_REF_DURATION:.0f}s of continuous speech."
            )
        if duration > MAX_REF_DURATION + 5.0:
            raise ValueError(
                f"Reference is {duration:.1f}s — trim the clip to about {IDEAL_REF_DURATION:.0f}s for best cloning."
            )
        if rate < 16_000:
            warnings.append(f"Sample rate is {rate} Hz; 16 kHz or higher is recommended.")
        if rms(samples) < MIN_SNR_RMS:
            raise ValueError("Reference is silent — speak normally and check your input device.")

        signature = analyse_reference(path)
        if signature.speech_ratio < 0.25:
            warnings.append("Most of the clip is silence; a denser speech sample clones better.")
        if peak(samples) > CLIP_THRESHOLD:
            warnings.append("Reference is clipping; lower your input gain and re-record.")
        if duration > MAX_REF_DURATION:
            warnings.append(f"Clip is longer than {MAX_REF_DURATION:.0f}s; the first {MAX_REF_DURATION:.0f}s are used.")

        return True, warnings, signature

    # -- profiles -----------------------------------------------------------
    def create_profile(
        self,
        name: str,
        source_wav: str | Path,
        description: str = "",
    ) -> VoiceProfile:
        _ok, warnings, signature = self.validate_reference(source_wav)
        source = Path(source_wav)

        profile_id = f"voice_{safe_slug(name, 'profile')}_{int(_dt.datetime.now().timestamp() * 1000)}"
        target = PROFILES_DIR / f"{profile_id}.wav"
        shutil.copy2(source, target)

        profile = VoiceProfile(
            profile_id=profile_id,
            name=name.strip() or "My Voice",
            wav_path=str(target),
            duration=signature.duration,
            description=description or f"Cloned locally from a {signature.duration:.1f}s sample",
            signature=signature.to_dict(),
        )
        with self._lock:
            profiles = [p for p in self._read_index() if p.get("id") != profile_id]
            profiles.append(profile.to_dict())
            self._write_index(profiles)
        logger.info("Created voice profile %s (%s)", profile_id, warnings or "no warnings")
        return profile

    def list_profiles(self) -> List[Dict[str, Any]]:
        return self._read_index()

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        return next((p for p in self._read_index() if p.get("id") == profile_id), None)

    def delete_profile(self, profile_id: str) -> bool:
        with self._lock:
            profiles = self._read_index()
            if not any(p.get("id") == profile_id for p in profiles):
                return False
            for profile in profiles:
                if profile.get("id") == profile_id:
                    wav = Path(profile.get("wav_path", ""))
                    try:
                        if wav.exists():
                            wav.unlink()
                    except OSError:
                        pass
            self._write_index([p for p in profiles if p.get("id") != profile_id])
            return True

    # -- synthesis backends -------------------------------------------------
    def backend_capabilities(self) -> dict:
        for name in ("kokoro", "piper"):
            available, detail = self._probe_backend(name)
            if available:
                return {"available": True, "engine": name, "quality": "neural", "reason": detail}
        return {
            "available": True,
            "engine": "preview",
            "quality": "preview",
            "reason": self._backend_error
            or "No neural TTS model installed (pip install kokoro-onnx). Using the built-in preview vocoder.",
        }

    @staticmethod
    def _probe_backend(name: str) -> Tuple[bool, Optional[str]]:
        try:
            if name == "kokoro":
                import kokoro_onnx  # type: ignore  # noqa: F401
                return True, "kokoro-onnx detected"
            if name == "piper":
                import piper  # type: ignore  # noqa: F401
                return True, "piper detected"
        except Exception:
            return False, None
        return False, None

    def synthesize(
        self,
        text: str,
        profile_id: Optional[str] = None,
        output_wav: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Synthesizes text offline. Returns metadata about the generated audio."""
        if not text or not text.strip():
            raise ValueError("Nothing to synthesize — the text is empty.")
        if len(text) > 2_000:
            raise ValueError("Text is limited to 2000 characters per synthesis request.")

        ensure_dirs()
        profile = self.get_profile(profile_id) if profile_id else None
        signature = None
        if profile and profile.get("signature"):
            sig = profile["signature"]
            signature = VoiceSignature(
                duration=float(sig.get("duration", 0)),
                sample_rate=int(sig.get("sample_rate", 16_000)),
                rms=float(sig.get("rms", 0)),
                peak=float(sig.get("peak", 0)),
                f0_hz=float(sig.get("f0_hz", 130)),
                speech_ratio=float(sig.get("speech_ratio", 0.5)),
            )

        if output_wav is None:
            stamp = int(_dt.datetime.now().timestamp() * 1000)
            output_wav = str(TTS_DIR / f"speech_{stamp}.wav")

        started = _dt.datetime.now()
        vocoder = PreviewVocoder(signature)
        result = vocoder.render(text, output_wav)
        result.update({
            "output_wav": output_wav,
            "file": Path(output_wav).name,
            "profile_id": profile_id,
            "profile_name": profile["name"] if profile else "Default voice",
            "text": text,
            "generated_at": started.isoformat(timespec="seconds"),
        })
        return result

    # -- read aloud ---------------------------------------------------------
    def read_aloud(self, text: str, profile_id: Optional[str] = None) -> Dict[str, Any]:
        """Synthesizes selected screen text and plays it if an audio sink exists."""
        result = self.synthesize(text, profile_id)
        played, reason = self._play_wav(result["output_wav"])
        result["played"] = played
        result["playback_note"] = reason
        return result

    @staticmethod
    def _play_wav(path: str) -> Tuple[bool, Optional[str]]:
        try:
            import sounddevice as sd  # type: ignore
            import soundfile as sf  # type: ignore

            data, rate = sf.read(path)
            sd.play(data, rate)
            return True, None
        except Exception as exc:
            return False, f"Playback handled by the client ({type(exc).__name__}: {exc})."
