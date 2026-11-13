"""
OpenFlow System Keystroke & Clipboard Injector
==============================================
Pastes transcribed and cleaned text directly into the user's active window.
Handles macOS (Cmd+V), Windows (Ctrl+V), and Linux (Ctrl+V) without stealing focus.
"""

from __future__ import annotations
import sys
import time
import subprocess
import logging
from typing import Optional
from pynput.keyboard import Controller, Key

logger = logging.getLogger("OpenFlow.Injector")

keyboard = Controller()


class SystemInjector:
    """Manages system clipboard copying and keystroke emulation."""

    @staticmethod
    def set_clipboard(text: str) -> bool:
        """Copies text to the system clipboard without external dependencies."""
        try:
            if sys.platform == "darwin":
                # macOS pbcopy with UTF-8
                process = subprocess.Popen(
                    ["pbcopy"],
                    stdin=subprocess.PIPE,
                    close_fds=True
                )
                process.communicate(text.encode("utf-8"))
                return process.returncode == 0

            elif sys.platform.startswith("win"):
                # Windows clip command
                process = subprocess.Popen(
                    ["clip"],
                    stdin=subprocess.PIPE,
                    close_fds=True,
                    shell=True
                )
                process.communicate(text.encode("utf-16le"))
                return process.returncode == 0

            else:
                # Linux xclip / wl-copy
                try:
                    p = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
                    p.communicate(text.encode("utf-8"))
                    return p.returncode == 0
                except FileNotFoundError:
                    p = subprocess.Popen(["wl-copy"], stdin=subprocess.PIPE)
                    p.communicate(text.encode("utf-8"))
                    return p.returncode == 0

        except Exception as e:
            logger.error(f"Failed to set clipboard: {e}")
            return False

    @classmethod
    def paste_into_active_window(cls, text: str, auto_enter: bool = False) -> bool:
        """
        Sets text to clipboard and triggers the OS paste shortcut in the focused window.
        """
        if not text:
            return False

        # 1. Copy to clipboard
        success = cls.set_clipboard(text)
        if not success:
            logger.error("Clipboard set failed. Aborting paste chord.")
            return False

        # Brief settle time (35ms) to ensure OS clipboard buffer has flushed
        time.sleep(0.035)

        # 2. Simulate paste keystroke
        try:
            if sys.platform == "darwin":
                # On macOS: Cmd + V
                # We use AppleScript or pynput. AppleScript is the most reliable on macOS
                # because it doesn't require Accessibility key-state polling.
                script = '''
                tell application "System Events"
                    keystroke "v" using {command down}
                end tell
                '''
                res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
                if res.returncode != 0:
                    # Fallback to pynput
                    with keyboard.pressed(Key.cmd):
                        keyboard.press('v')
                        keyboard.release('v')
            else:
                # On Windows / Linux: Ctrl + V
                with keyboard.pressed(Key.ctrl):
                    keyboard.press('v')
                    keyboard.release('v')

            # Optional auto-enter
            if auto_enter:
                time.sleep(0.04)
                keyboard.press(Key.enter)
                keyboard.release(Key.enter)

            return True
        except Exception as e:
            logger.error(f"Error injecting paste keystroke: {e}")
            return False
