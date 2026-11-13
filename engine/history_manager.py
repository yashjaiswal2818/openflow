"""
OpenFlow History & Recording Storage Manager
============================================
Persists dictation history:
- Pairs raw recorded WAV audio with both raw and intelligent transcriptions
- Allows searching, exporting, and playing back voice recordings
"""

from __future__ import annotations
import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

OPENFLOW_HOME = Path.home() / ".openflow"
HISTORY_FILE = OPENFLOW_HOME / "history.json"
RECORDINGS_DIR = OPENFLOW_HOME / "recordings"


class HistoryManager:
    """Manages persistent dictation log and audio archives."""

    def __init__(self):
        OPENFLOW_HOME.mkdir(parents=True, exist_ok=True)
        RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        if not HISTORY_FILE.exists():
            with open(HISTORY_FILE, "w") as f:
                json.dump([], f)

    def log_entry(
        self,
        raw_text: str,
        cleaned_text: str,
        audio_path: Optional[str] = None,
        duration: float = 0.0,
        preset_used: str = "balanced"
    ) -> Dict[str, Any]:
        """Saves a new transcription entry with audio reference."""
        import datetime
        entry_id = f"entry_{int(time.time()*1000)}"
        entry = {
            "id": entry_id,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "raw_text": raw_text,
            "cleaned_text": cleaned_text,
            "audio_path": audio_path,
            "duration": round(duration, 2),
            "preset": preset_used,
            "starred": False
        }

        history = self.get_history()
        history.insert(0, entry) # newest first
        # Keep last 500 entries
        history = history[:500]

        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)

        return entry

    def get_history(self) -> List[Dict[str, Any]]:
        """Returns all history items."""
        if not HISTORY_FILE.exists():
            return []
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []

    def toggle_star(self, entry_id: str) -> bool:
        """Toggles starred status on an item."""
        history = self.get_history()
        status = False
        for item in history:
            if item["id"] == entry_id:
                item["starred"] = not item.get("starred", False)
                status = item["starred"]
                break
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
        return status

    def delete_entry(self, entry_id: str) -> bool:
        """Deletes an entry and its audio file if present."""
        history = self.get_history()
        remaining = []
        found = False
        for item in history:
            if item["id"] == entry_id:
                found = True
                audio_p = item.get("audio_path")
                if audio_p and Path(audio_p).exists():
                    try:
                        Path(audio_p).unlink()
                    except Exception:
                        pass
            else:
                remaining.append(item)

        with open(HISTORY_FILE, "w") as f:
            json.dump(remaining, f, indent=2)
        return found

    def clear_history(self):
        """Clears all history entries."""
        with open(HISTORY_FILE, "w") as f:
            json.dump([], f)
