"""
Filesystem layout for OpenFlow's local data store.

Everything the app persists lives under a single root so users can audit or
delete it in one move:

    ~/.openflow/
        config.json          # user preferences (preset, hotkey, toggles)
        history.json         # dictation log (raw text, clean text, wav ref)
        recordings/          # raw microphone captures (16 kHz mono WAV)
        recordings/tts_out/  # synthesized speech
        profiles/            # voice clone reference WAVs + profiles.json
        models/              # downloaded model weights

The root can be redirected with the OPENFLOW_HOME environment variable, which
is what the test-suite and portable installs use.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_ENV_VAR = "OPENFLOW_HOME"


def openflow_home() -> Path:
    """Returns the OpenFlow data root, honouring ``$OPENFLOW_HOME``."""
    override = os.environ.get(_ENV_VAR)
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".openflow").resolve()


HOME: Path = openflow_home()
RECORDINGS_DIR: Path = HOME / "recordings"
TTS_DIR: Path = RECORDINGS_DIR / "tts_out"
PROFILES_DIR: Path = HOME / "profiles"
MODELS_DIR: Path = HOME / "models"
CONFIG_FILE: Path = HOME / "config.json"
HISTORY_FILE: Path = HOME / "history.json"
PROFILES_INDEX: Path = PROFILES_DIR / "profiles.json"


def ensure_dirs() -> None:
    """Creates the full data tree. Safe to call repeatedly."""
    for directory in (HOME, RECORDINGS_DIR, TTS_DIR, PROFILES_DIR, MODELS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


_UNSAFE = re.compile(r"[^a-zA-Z0-9._-]+")


def safe_slug(value: str, fallback: str = "item", max_length: int = 60) -> str:
    """Turns arbitrary user input into a filesystem-safe slug."""
    slug = _UNSAFE.sub("_", (value or "").strip().lower()).strip("._-")
    slug = slug[:max_length].strip("._-")
    return slug or fallback


def is_within(child: Path, parent: Path) -> bool:
    """True when ``child`` resolves inside ``parent`` (path-traversal guard)."""
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except (ValueError, OSError):
        return False
