"""
OpenFlow History & Recording Storage Manager
============================================
Dual recording preservation: every dictation keeps the raw WAV snippet, the raw
Whisper transcript and the cleaned transcript, so nothing the user said is ever
thrown away.

Writes are atomic (temp file + replace) and guarded by a lock because the HTTP
daemon and the hotkey thread can log simultaneously.
"""

from __future__ import annotations

import datetime as _dt
import json
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from engine.paths import HISTORY_FILE, RECORDINGS_DIR, ensure_dirs

MAX_ENTRIES = 500


class HistoryManager:
    """Persistent, searchable dictation log."""

    def __init__(self, path: Optional[Path] = None) -> None:
        ensure_dirs()
        self.path = Path(path) if path else HISTORY_FILE
        self._lock = threading.RLock()
        if not self.path.exists():
            self._write([])

    # -- io -----------------------------------------------------------------
    def _read(self) -> List[Dict[str, Any]]:
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _write(self, entries: List[Dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(entries, handle, indent=2, ensure_ascii=False)
        tmp.replace(self.path)

    # -- api ----------------------------------------------------------------
    def log_entry(
        self,
        raw_text: str,
        cleaned_text: str,
        audio_path: Optional[str] = None,
        duration: float = 0.0,
        preset_used: str = "balanced",
        meta: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        entry_id = f"entry_{int(time.time() * 1000)}_{len(self._read()) % 1000}"
        entry: Dict[str, Any] = {
            "id": entry_id,
            "timestamp": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "created_at": _dt.datetime.now().isoformat(timespec="seconds"),
            "raw_text": raw_text,
            "cleaned_text": cleaned_text,
            "audio_path": audio_path,
            "audio_file": Path(audio_path).name if audio_path else None,
            "duration": round(float(duration or 0.0), 2),
            "preset": preset_used,
            "starred": False,
            "meta": meta or {},
        }
        with self._lock:
            entries = self._read()
            entries.insert(0, entry)
            self._write(entries[:MAX_ENTRIES])
        return entry

    def get_history(self, query: str = "", limit: Optional[int] = None) -> List[Dict[str, Any]]:
        with self._lock:
            entries = self._read()
        if query:
            needle = query.lower().strip()
            entries = [
                e for e in entries
                if needle in (e.get("cleaned_text") or "").lower()
                or needle in (e.get("raw_text") or "").lower()
            ]
        return entries[:limit] if limit else entries

    def get_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        return next((e for e in self.get_history() if e.get("id") == entry_id), None)

    def toggle_star(self, entry_id: str) -> bool:
        with self._lock:
            entries = self._read()
            starred = False
            for entry in entries:
                if entry.get("id") == entry_id:
                    entry["starred"] = not entry.get("starred", False)
                    starred = entry["starred"]
                    break
            self._write(entries)
        return starred

    def delete_entry(self, entry_id: str, delete_audio: bool = True) -> bool:
        with self._lock:
            entries = self._read()
            target = next((e for e in entries if e.get("id") == entry_id), None)
            if target is None:
                return False
            remaining = [e for e in entries if e.get("id") != entry_id]
            self._write(remaining)

        if delete_audio:
            for key in ("audio_path", "tts_path"):
                candidate = target.get(key)
                if candidate and Path(candidate).exists():
                    try:
                        Path(candidate).unlink()
                    except OSError:
                        pass
        return True

    def clear_history(self, delete_audio: bool = False) -> int:
        with self._lock:
            entries = self._read()
            self._write([])
        if delete_audio:
            for entry in entries:
                audio = entry.get("audio_path")
                if audio and Path(audio).exists():
                    try:
                        Path(audio).unlink()
                    except OSError:
                        pass
        return len(entries)

    def stats(self) -> Dict[str, Any]:
        entries = self.get_history()
        words = sum(len((e.get("cleaned_text") or "").split()) for e in entries)
        duration = sum(float(e.get("duration") or 0) for e in entries)
        return {
            "entries": len(entries),
            "starred": sum(1 for e in entries if e.get("starred")),
            "words": words,
            "speech_seconds": round(duration, 1),
            "recordings_dir": str(RECORDINGS_DIR),
            "history_file": str(self.path),
        }

    def export_markdown(self) -> str:
        lines = ["# OpenFlow dictation export", ""]
        for entry in self.get_history():
            lines.append(f"### {entry.get('timestamp')} · {entry.get('preset')} · {entry.get('duration')}s")
            lines.append("")
            lines.append(entry.get("cleaned_text") or "")
            if entry.get("raw_text") and entry["raw_text"] != entry.get("cleaned_text"):
                lines.append("")
                lines.append(f"> Raw: {entry['raw_text']}")
            lines.append("")
        return "\n".join(lines)
