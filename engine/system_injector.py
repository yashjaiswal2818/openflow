"""
OpenFlow Clipboard & Keystroke Injector
=======================================
Pastes cleaned dictation into whatever application currently has focus.

* Clipboard: ``pbcopy`` (macOS), ``clip`` (Windows), ``wl-copy`` / ``xclip`` (Linux).
* Paste chord: AppleScript + pynput on macOS, ``Ctrl+V`` via pynput elsewhere.
* Fallback: when no injection backend exists, the text is still copied to the
  clipboard where possible and the API reports the reason, so the UI can show
  "copied — press Ctrl+V" instead of silently failing.

``pynput`` is optional; importing this module never fails.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
import time
from typing import Optional, Tuple

logger = logging.getLogger("OpenFlow.Injector")

try:  # pragma: no cover - optional dependency
    from pynput.keyboard import Controller, Key  # type: ignore
    _HAVE_PYNPUT = True
except Exception:  # pragma: no cover
    Controller = None  # type: ignore
    Key = None  # type: ignore
    _HAVE_PYNPUT = False


def _lin_clipboard_tool() -> Optional[list]:
    if sys.platform == "darwin":
        return ["pbcopy"] if shutil.which("pbcopy") else None
    if sys.platform.startswith("win"):
        return ["clip"] if shutil.which("clip") else None
    if shutil.which("wl-copy"):
        return ["wl-copy"]
    if shutil.which("xclip"):
        return ["xclip", "-selection", "clipboard"]
    if shutil.which("xsel"):
        return ["xsel", "--clipboard", "--input"]
    return None


class SystemInjector:
    """Copies text to the clipboard and fires the native paste shortcut."""

    def __init__(self) -> None:
        self._keyboard = Controller() if _HAVE_PYNPUT else None

    # -- capability ---------------------------------------------------------
    @staticmethod
    def capabilities() -> dict:
        tool = _lin_clipboard_tool()
        return {
            "clipboard": bool(tool),
            "clipboard_tool": tool[0] if tool else None,
            "keystroke": _HAVE_PYNPUT,
            "platform": sys.platform,
            "reason": None if tool else "No clipboard tool found (install xclip/wl-copy).",
        }

    # -- clipboard ----------------------------------------------------------
    @staticmethod
    def set_clipboard(text: str) -> bool:
        command = _lin_clipboard_tool()
        if not command:
            logger.warning("No clipboard tool available; cannot copy text.")
            return False
        try:
            encoding = "utf-16le" if sys.platform.startswith("win") else "utf-8"
            process = subprocess.Popen(command, stdin=subprocess.PIPE, close_fds=True)
            process.communicate(text.encode(encoding))
            return process.returncode == 0
        except Exception as exc:
            logger.error("Clipboard write failed: %s", exc)
            return False

    # -- paste --------------------------------------------------------------
    def paste_into_active_window(self, text: str, auto_enter: bool = False) -> Tuple[bool, Optional[str]]:
        """
        Returns ``(pasted, reason)``. ``pasted=False`` still means the text is on
        the clipboard when the clipboard write succeeded.
        """
        if not text:
            return False, "Nothing to paste."

        if not self.set_clipboard(text):
            return False, "Clipboard unavailable on this machine."

        time.sleep(0.035)

        try:
            if sys.platform == "darwin" and shutil.which("osascript"):
                script = 'tell application "System Events" to keystroke "v" using {command down}'
                result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
                if result.returncode == 0:
                    if auto_enter:
                        self._press_enter()
                    return True, None
                logger.info("osascript paste failed, falling back to pynput: %s", result.stderr.strip())

            if self._keyboard is None or Key is None:
                return False, "Text copied to clipboard — keystroke injection needs the 'pynput' package."

            modifier = Key.cmd if sys.platform == "darwin" else Key.ctrl
            with self._keyboard.pressed(modifier):
                self._keyboard.press("v")
                self._keyboard.release("v")
            if auto_enter:
                self._press_enter()
            return True, None
        except Exception as exc:
            logger.error("Paste chord failed: %s", exc)
            return False, f"Text copied to clipboard — paste failed ({exc})."

    def _press_enter(self) -> None:
        if self._keyboard is None or Key is None:
            return
        time.sleep(0.04)
        self._keyboard.press(Key.enter)
        self._keyboard.release(Key.enter)
