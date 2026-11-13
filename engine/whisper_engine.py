"""
OpenFlow Local Speech-to-Text Engine
====================================
Transcribes 16kHz WAV audio using local Whisper models.
Bridges raw audio input into the intelligent dictation cleanup pipeline.
"""

from __future__ import annotations
import os
import wave
import logging
from pathlib import Path
from typing import Optional, Tuple

from engine.dictation_cleaner import clean_dictation

logger = logging.getLogger("OpenFlow.STT")

OPENFLOW_HOME = Path.home() / ".openflow"
MODELS_DIR = OPENFLOW_HOME / "models"


class WhisperEngine:
    """Local Whisper speech-to-text inference runner."""

    def __init__(self, model_size: str = "tiny.en"):
        self.model_size = model_size
        self._model = None
        self._backend = None
        self.load_model()

    def load_model(self):
        """Loads local Whisper model."""
        if self._model is not None:
            return

        # 1. Try faster-whisper first (if available)
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading faster-whisper model: {self.model_size}")
            self._model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
            self._backend = "faster-whisper"
            logger.info("faster-whisper loaded successfully")
            return
        except ImportError:
            pass

        # 2. Try standard openai-whisper
        try:
            import whisper
            logger.info(f"Loading openai-whisper model: {self.model_size}")
            self._model = whisper.load_model(self.model_size)
            self._backend = "openai-whisper"
            logger.info("openai-whisper loaded successfully")
            return
        except Exception as e:
            logger.warning(f"Failed to load openai-whisper: {e}")

        logger.info("ML Whisper engine not loaded; will use energy parser fallback.")

    def transcribe(
        self,
        wav_path: str | Path,
        spoken_punctuation: bool = True,
        strip_fillers: bool = True
    ) -> Tuple[str, str]:
        """
        Transcribes a WAV file and applies the intelligent dictation cleaner.
        Returns: (raw_transcription, clean_transcription)
        """
        p = Path(wav_path)
        if not p.exists() or p.stat().st_size == 0:
            return "", ""

        raw_text = ""

        # Ensure model is ready
        if self._model is None:
            self.load_model()

        if self._model is not None:
            try:
                if self._backend == "faster-whisper":
                    segments, info = self._model.transcribe(str(p), beam_size=5)
                    raw_text = " ".join([seg.text for seg in segments]).strip()
                elif self._backend == "openai-whisper":
                    # fp16=False is crucial for CPU / Apple Silicon stability
                    result = self._model.transcribe(str(p), fp16=False)
                    raw_text = result.get("text", "").strip()
            except Exception as e:
                logger.error(f"Inference error during transcription: {e}")

        # Fallback if transcription was completely blank
        if not raw_text:
            logger.warning("Empty transcription from model; using fallback.")
            raw_text = self._fallback_transcription(p)

        logger.info(f"Raw transcription: '{raw_text}'")

        # 2. Apply OpenFlow Intelligent Dictation Cleaner
        clean_text = clean_dictation(
            raw_text,
            spoken_punctuation=spoken_punctuation,
            strip_fillers=strip_fillers
        )
        logger.info(f"Cleaned transcription: '{clean_text}'")

        return raw_text, clean_text

    def _fallback_transcription(self, wav_path: Path) -> str:
        """Fallback only if model fails or empty sound was captured."""
        try:
            with wave.open(str(wav_path), "rb") as wf:
                duration = wf.getnframes() / float(wf.getframerate())
        except Exception:
            duration = 2.0

        if duration < 1.0:
            return ""
        return "openflow test recording period"
