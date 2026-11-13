"""
OpenFlow Engine
===============
100% offline speech engine for OpenFlow: dictation (Voice-IN) and
zero-shot voice cloning / TTS (Voice-OUT).

Every module in this package is import-safe on a machine without any of the
heavy optional ML dependencies (numpy, sounddevice, faster-whisper, pynput,
onnxruntime). Missing dependencies degrade a capability instead of crashing
the daemon, which keeps the Studio usable for configuration, history review
and the deterministic dictation cleaner.
"""

__version__ = "1.0.0"
