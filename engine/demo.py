"""
Demo-mode content for OpenFlow.

When OpenFlow runs on a machine without a microphone, Whisper weights or a TTS
model (CI, a sandboxed preview, a fresh clone before models are downloaded), the
engine can still demonstrate the complete pipeline. Demo output is clearly
labelled in the API surface (``capabilities.demo_mode``) and in the UI badge, so
it is never mistaken for real transcription.
"""

from __future__ import annotations

import random

# Deliberately messy raw transcripts: fillers, stutters, spoken punctuation and
# lowercase tech vocabulary. They round-trip through the real cleaner.
DEMO_TRANSCRIPTS = [
    "uh so basically i think that the the openflow engine is super fast comma new line "
    "ready for production period",
    "um quick update on the the api comma we shipped the json endpoint and the ui yesterday period "
    "question mark no sorry exclamation point it went out this morning period",
    "i i want to to test the the voice cloning pipeline comma please read this back in my own voice period",
    "hey team comma the the build is green again period next line i will review the sdk pull request "
    "this afternoon period",
    "th-the dictation latency is down to one hundred fifty milliseconds exclamation point "
    "that is uh roughly three times faster than last week period",
]


def next_transcript(index: int = 0, seed: int | None = None) -> str:
    """Returns a deterministic demo transcript (rotating, or seeded random)."""
    if seed is not None:
        return random.Random(seed).choice(DEMO_TRANSCRIPTS)
    return DEMO_TRANSCRIPTS[index % len(DEMO_TRANSCRIPTS)]


DEMO_TTS_TEXT = "Welcome to OpenFlow. This speech was generated one hundred percent offline."
