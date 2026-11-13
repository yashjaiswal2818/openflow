"""
OpenFlow Global Hotkey Daemon
=============================
Listens for the dictation shortcut anywhere in the OS and drives the recording
lifecycle through injected callbacks, so the daemon stays independent of the
HTTP layer.

Two interaction modes (config ``hold_to_talk``):
    * push-to-talk — hold the chord while speaking, release to transcribe
    * toggle       — tap once to start, tap again to stop

``pynput`` is optional. Without it the daemon reports ``available: False`` and
the Studio's on-screen buttons remain fully functional.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable, Optional, Set, Tuple

logger = logging.getLogger("OpenFlow.Hotkey")

try:  # pragma: no cover - optional dependency
    from pynput import keyboard  # type: ignore
    _HAVE_PYNPUT = True
except Exception:  # pragma: no cover
    keyboard = None  # type: ignore
    _HAVE_PYNPUT = False

MODIFIER_ALIASES = {
    "ctrl": "ctrl", "control": "ctrl", "cmd": "cmd", "command": "cmd",
    "super": "cmd", "win": "cmd", "alt": "alt", "option": "alt", "opt": "alt",
    "shift": "shift", "fn": "fn",
}


def parse_hotkey(combo: str) -> Tuple[Set[str], str]:
    """``"Ctrl+Shift+Space"`` -> ``({"ctrl", "shift"}, "space")``."""
    parts = [p.strip().lower() for p in (combo or "").split("+") if p.strip()]
    if not parts:
        return set(), "space"
    *modifiers, key = parts
    return {MODIFIER_ALIASES.get(m, m) for m in modifiers}, key


class HotkeyDaemon:
    """Global shortcut listener with push-to-talk and toggle support."""

    def __init__(
        self,
        on_start: Optional[Callable[[], None]] = None,
        on_stop: Optional[Callable[[], None]] = None,
        hotkey: str = "Ctrl+Space",
        hold_to_talk: bool = True,
    ) -> None:
        self.on_start = on_start
        self.on_stop = on_stop
        self.hotkey = hotkey
        self.hold_to_talk = hold_to_talk
        self.is_active = False
        self._listener = None
        self._pressed_modifiers: Set[str] = set()
        self._chord_down = False
        self._lock = threading.Lock()
        self._unavailable_reason: Optional[str] = None

    # -- capability ---------------------------------------------------------
    def capabilities(self) -> dict:
        return {
            "available": _HAVE_PYNPUT,
            "hotkey": self.hotkey,
            "mode": "push-to-talk" if self.hold_to_talk else "toggle",
            "reason": self._unavailable_reason
            or (None if _HAVE_PYNPUT else "Install 'pynput' for global hotkeys; the on-screen controls still work."),
        }

    def configure(self, hotkey: str, hold_to_talk: bool) -> None:
        was_active = self.is_active
        if was_active:
            self.stop()
        self.hotkey = hotkey
        self.hold_to_talk = hold_to_talk
        if was_active:
            self.start()

    # -- listener -----------------------------------------------------------
    def _normalise(self, key) -> Optional[str]:  # noqa: ANN001
        if keyboard is None:
            return None
        mapping = {
            keyboard.Key.ctrl: "ctrl", keyboard.Key.ctrl_l: "ctrl", keyboard.Key.ctrl_r: "ctrl",
            keyboard.Key.cmd: "cmd", keyboard.Key.cmd_l: "cmd", keyboard.Key.cmd_r: "cmd",
            keyboard.Key.alt: "alt", keyboard.Key.alt_l: "alt", keyboard.Key.alt_r: "alt",
            keyboard.Key.shift: "shift", keyboard.Key.shift_l: "shift", keyboard.Key.shift_r: "shift",
            keyboard.Key.space: "space", keyboard.Key.enter: "enter", keyboard.Key.esc: "esc",
        }
        if key in mapping:
            return mapping[key]
        char = getattr(key, "char", None)
        return char.lower() if char else None

    def _modifiers_ok(self, expected: Set[str]) -> bool:
        return expected.issubset(self._pressed_modifiers)

    def _on_press(self, key) -> None:  # noqa: ANN001
        name = self._normalise(key)
        if name is None:
            return
        if name in {"ctrl", "cmd", "alt", "shift"}:
            self._pressed_modifiers.add(name)

        mods, main_key = parse_hotkey(self.hotkey)
        if name != main_key or not self._modifiers_ok(mods):
            return

        with self._lock:
            if self.hold_to_talk:
                if self._chord_down:
                    return
                self._chord_down = True
                should_start = True
            else:
                self._chord_down = not self._chord_down
                should_start = self._chord_down

        if should_start and self.on_start:
            logger.info("Hotkey %s pressed — starting dictation", self.hotkey)
            self.on_start()
        elif not should_start and self.on_stop:
            logger.info("Hotkey %s pressed — stopping dictation", self.hotkey)
            self.on_stop()

    def _on_release(self, key) -> None:  # noqa: ANN001
        name = self._normalise(key)
        if name is None:
            return
        if name in {"ctrl", "cmd", "alt", "shift"}:
            self._pressed_modifiers.discard(name)
            if self.hold_to_talk and self._chord_down:
                with self._lock:
                    self._chord_down = False
                if self.on_stop:
                    logger.info("Hotkey released — stopping dictation")
                    self.on_stop()

    def start(self) -> bool:
        if not _HAVE_PYNPUT:
            self._unavailable_reason = "pynput is not installed; global hotkeys disabled."
            logger.warning(self._unavailable_reason)
            return False
        if self.is_active:
            return True
        try:
            self._listener = keyboard.Listener(on_press=self._on_press, on_release=self._on_release)
            self._listener.daemon = True
            self._listener.start()
            self.is_active = True
            logger.info("Global hotkey %s bound (%s)", self.hotkey, self.capabilities()["mode"])
            return True
        except Exception as exc:  # pragma: no cover - platform specific
            self._unavailable_reason = f"Could not bind global hotkey: {exc}"
            logger.warning(self._unavailable_reason)
            return False

    def stop(self) -> None:
        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None
        self.is_active = False
