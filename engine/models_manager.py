"""
OpenFlow Model & Preset Manager
===============================
Single source of truth for the three hardware tiers and for user preferences,
persisted to ``~/.openflow/config.json``.

Presets describe *what* runs (STT model size, TTS backend, VAD) so the rest of
the engine never hard-codes a model name.
"""

from __future__ import annotations

import copy
import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from engine.paths import CONFIG_FILE, ensure_dirs

PRESETS: Dict[str, Dict[str, Any]] = {
    "fast": {
        "id": "fast",
        "name": "Fast",
        "tagline": "Instant, any laptop",
        "stt_model": "whisper tiny.en · q5_1",
        "stt_model_key": "tiny.en",
        "tts_model": "Piper VITS",
        "tts_backend": "piper",
        "vad": "energy",
        "latency_target_ms": 150,
        "ram_required": "<500 MB",
        "vram_required": "none",
        "accuracy_score": 8.8,
        "speed_score": 10.0,
        "description": "Sub-150 ms dictation on CPU alone. Lower accuracy on accents and jargon.",
    },
    "balanced": {
        "id": "balanced",
        "name": "Balanced",
        "tagline": "Recommended default",
        "stt_model": "Whisper small.en · q5_k",
        "stt_model_key": "small.en",
        "tts_model": "Kokoro-82M",
        "tts_backend": "kokoro",
        "vad": "silero-or-energy",
        "latency_target_ms": 350,
        "ram_required": "~1.5 GB",
        "vram_required": "1 GB or Apple Silicon",
        "accuracy_score": 9.6,
        "speed_score": 8.5,
        "description": "Best balance: near-cloud accuracy with Kokoro's natural voices.",
    },
    "pro": {
        "id": "pro",
        "name": "Pro Studio",
        "tagline": "Maximum fidelity",
        "stt_model": "Whisper large-v3-turbo",
        "stt_model_key": "large-v3-turbo",
        "tts_model": "F5-TTS zero-shot",
        "tts_backend": "f5",
        "vad": "silero",
        "latency_target_ms": 900,
        "ram_required": "~4 GB",
        "vram_required": "4 GB+ GPU / 16 GB Mac",
        "accuracy_score": 9.9,
        "speed_score": 7.0,
        "description": "Studio-grade transcription plus reference-conditioned cloning.",
    },
}

DEFAULT_CONFIG: Dict[str, Any] = {
    "active_preset": "balanced",
    "hotkey": "Ctrl+Space",
    "hold_to_talk": True,
    "strip_filler_words": True,
    "spoken_punctuation": True,
    "fix_casing": True,
    "collapse_stutters": True,
    "save_raw_audio": True,
    "auto_paste": True,
    "read_aloud_hotkey": "Ctrl+Shift+Space",
    "active_voice_profile": None,
    "audio_input_device": "default",
    "audio_output_device": "default",
    "demo_mode": "auto",  # auto | on | off
    "appearance": "dark",
}


class ModelPresetManager:
    """Loads / persists configuration and preset metadata."""

    def __init__(self, path: Optional[Path] = None) -> None:
        ensure_dirs()
        self.path = Path(path) if path else CONFIG_FILE
        self._lock = threading.RLock()
        if not self.path.exists():
            self.save_config(copy.deepcopy(DEFAULT_CONFIG))

    def get_config(self) -> Dict[str, Any]:
        with self._lock:
            try:
                with open(self.path, "r", encoding="utf-8") as handle:
                    stored = json.load(handle)
            except Exception:
                stored = {}
        merged = copy.deepcopy(DEFAULT_CONFIG)
        merged.update({k: v for k, v in (stored or {}).items() if k in DEFAULT_CONFIG})
        return merged

    def save_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        clean = {k: v for k, v in config.items() if k in DEFAULT_CONFIG}
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".json.tmp")
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(clean, handle, indent=2)
            tmp.replace(self.path)
        return clean

    def update_config(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        config = self.get_config()
        unknown = [k for k in patch if k not in DEFAULT_CONFIG]
        if unknown:
            raise ValueError(f"Unknown configuration keys: {', '.join(sorted(unknown))}")
        config.update({k: v for k, v in patch.items()})
        self.save_config(config)
        return config

    def set_preset(self, preset_id: str) -> Dict[str, Any]:
        if preset_id not in PRESETS:
            raise ValueError(f"Unknown preset '{preset_id}'. Choose one of: {', '.join(PRESETS)}.")
        config = self.get_config()
        config["active_preset"] = preset_id
        return self.save_config(config)

    def active_preset(self) -> Dict[str, Any]:
        return PRESETS[self.get_config().get("active_preset", "balanced")]

    def list_presets(self) -> List[Dict[str, Any]]:
        active = self.get_config().get("active_preset", "balanced")
        return [{**copy.deepcopy(preset), "is_active": preset_id == active} for preset_id, preset in PRESETS.items()]

    def cleaner_options(self) -> Dict[str, bool]:
        config = self.get_config()
        return {
            "spoken_punctuation": bool(config["spoken_punctuation"]),
            "strip_fillers": bool(config["strip_filler_words"]),
            "fix_casing": bool(config["fix_casing"]),
            "collapse_stutters": bool(config["collapse_stutters"]),
        }
