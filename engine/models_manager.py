"""
OpenFlow Model & Preset Manager
================================
Manages local AI models and quality presets for Speech-to-Text and Voice Cloning.
Supports one-click tier selection: Fast, Balanced, and Pro Studio.
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Any, List

OPENFLOW_HOME = Path.home() / ".openflow"
CONFIG_FILE = OPENFLOW_HOME / "config.json"

PRESETS = {
    "fast": {
        "id": "fast",
        "name": "Fast (Low Latency)",
        "badge": "⚡ Instant",
        "stt_model": "whisper-tiny-en.q5_1",
        "tts_model": "piper-en-lessac-medium",
        "description": "Ultra-low latency (<150ms). Perfect for older laptops and rapid dictation.",
        "vram_required": "None (CPU Friendly)",
        "ram_required": "~500 MB",
        "accuracy_score": "8.8 / 10",
        "speed_score": "10 / 10"
    },
    "balanced": {
        "id": "balanced",
        "name": "Balanced (Recommended)",
        "badge": "⚖️ Optimal",
        "stt_model": "whisper-small-q5_k",
        "tts_model": "kokoro-82m-v1.0",
        "description": "State-of-the-art accuracy with Kokoro's natural human voice synthesis.",
        "vram_required": "1 GB or Apple Silicon",
        "ram_required": "~1.5 GB",
        "accuracy_score": "9.6 / 10",
        "speed_score": "8.5 / 10"
    },
    "pro": {
        "id": "pro",
        "name": "Pro Studio",
        "badge": "💎 Maximum Quality",
        "stt_model": "whisper-large-v3-turbo-q8_0",
        "tts_model": "f5-tts-zero-shot",
        "description": "Full zero-shot voice cloning with studio-grade transcription accuracy.",
        "vram_required": "4 GB+ or 16GB Mac",
        "ram_required": "~4 GB",
        "accuracy_score": "9.9 / 10",
        "speed_score": "7 / 10"
    }
}

DEFAULT_CONFIG = {
    "active_preset": "balanced",
    "hotkey": "Ctrl+Space",
    "hold_to_talk": True,
    "strip_filler_words": True,
    "spoken_punctuation": True,
    "save_raw_audio": True,
    "active_voice_profile": None,
    "audio_input_device": "default",
    "audio_output_device": "default",
}


class ModelPresetManager:
    """Manages active preset and configuration."""

    def __init__(self):
        OPENFLOW_HOME.mkdir(parents=True, exist_ok=True)
        if not CONFIG_FILE.exists():
            self.save_config(DEFAULT_CONFIG)

    def get_config(self) -> Dict[str, Any]:
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                return {**DEFAULT_CONFIG, **data}
        except Exception:
            return DEFAULT_CONFIG

    def save_config(self, config: Dict[str, Any]):
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)

    def set_preset(self, preset_id: str) -> Dict[str, Any]:
        if preset_id not in PRESETS:
            raise ValueError(f"Unknown preset: {preset_id}")
        config = self.get_config()
        config["active_preset"] = preset_id
        self.save_config(config)
        return config

    def list_presets(self) -> List[Dict[str, Any]]:
        current_id = self.get_config().get("active_preset", "balanced")
        result = []
        for p_id, data in PRESETS.items():
            result.append({
                **data,
                "is_active": (p_id == current_id)
            })
        return result
