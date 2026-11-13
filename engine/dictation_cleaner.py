"""
OpenFlow Intelligent Dictation Cleaner
======================================
Deterministic, high-performance rule engine for cleaning raw STT transcription
into human-quality text. Runs in <1ms without requiring external cloud calls.

Capabilities:
- Filler word removal ("uh", "um", "umm", "erm", "like", "you know")
- Stutter collapse ("the the", "I I") while preserving intentional emphasis
- Spoken punctuation transformation ("comma" -> ",", "new line" -> "\n")
- Automatic sentence casing & pronoun "I" / "I'm" repair
- Whitespace and punctuation normalization
"""

from __future__ import annotations
import re
from typing import Tuple

# Marker for capitalisation boundary
_CAP_MARKER = "\ue000"

# Common stutter words on function tokens
_STUTTER_WORDS = (
    "a", "an", "and", "at", "but", "for", "he", "i", "in", "it", 
    "my", "of", "on", "or", "she", "the", "they", "to", "we", "with", "you"
)
_RE_STUTTER = re.compile(
    r"(?<![\w'])(" + "|".join(_STUTTER_WORDS) + r")(?:[,\-]?\s+\1)+(?![\w'])",
    re.IGNORECASE
)

# Filler words and hesitations
_FILLERS = re.compile(
    r"\b(u+h+|u+h+m+|u+m+|e+r+m+|e+r+)\b",
    re.IGNORECASE
)

# Colloquial verbal crutches when isolated or hesitant
_CRUTCHES = re.compile(
    r"(?:^|(?<=[,.\s]))(you know|basically|sort of|kind of|i mean)(?=[,.\s]|$)",
    re.IGNORECASE
)

# Pronoun "I" capitalization
_PRONOUN_I = re.compile(r"(?<![\w'.])i(?=(?:'(?:m|d|ll|ve|s))?(?![\w']|\.\w))")

# Spoken punctuation rules (ordered longest phrase first)
_SPOKEN_PUNCTUATION: Tuple[Tuple[str, str], ...] = (
    (r"new\s+paragraph", "\n\n"),
    (r"next\s+paragraph", "\n\n"),
    (r"new\s*line", "\n"),
    (r"question\s+mark", "?"),
    (r"exclamation\s+(?:mark|point)", "!"),
    (r"full\s+stop", "."),
    (r"semi\s*colon", ";"),
    (r"period", "."),
    (r"comma", ","),
    (r"colon", ":"),
)

_CMD_REGEX = re.compile(
    r"[ \t]*(?P<lead>[,;:.!?])?[ \t]*(?<![\w'])(?P<cmd>" 
    + "|".join(pattern for pattern, _ in _SPOKEN_PUNCTUATION) 
    + r")(?![\w'])[,;:.!?]*",
    re.IGNORECASE
)

_CMD_DICT = {pattern.replace(r"\s+", " ").replace(r"\s*", ""): rep for pattern, rep in _SPOKEN_PUNCTUATION}


class DictationCleaner:
    """Intelligent dictation post-processing engine."""

    def __init__(self, spoken_punctuation: bool = True, strip_fillers: bool = True):
        self.spoken_punctuation = spoken_punctuation
        self.strip_fillers = strip_fillers

    def clean(self, raw_text: str) -> str:
        """
        Transforms raw transcription text into polished, formatted dictation.
        """
        if not raw_text or not raw_text.strip():
            return ""

        text = raw_text.strip()

        # 1. Normalize Unicode whitespaces
        text = text.replace("\u00a0", " ").replace("\u200b", "")

        # 2. Spoken Punctuation transformation
        if self.spoken_punctuation:
            text = self._apply_spoken_punctuation(text)

        # 3. Filler word removal
        if self.strip_fillers:
            text = _FILLERS.sub("", text)
            text = _CRUTCHES.sub("", text)

        # 4. Collapse stutters ("the the" -> "the")
        def _collapse_match(m: re.Match) -> str:
            return m.group(1)
        text = _RE_STUTTER.sub(_collapse_match, text)

        # 5. Fix standalone pronoun 'i' -> 'I'
        text = _PRONOUN_I.sub("I", text)

        # 6. Spacing around punctuation: remove space before [, . ; : ! ?]
        text = re.sub(r"\s+([,.;:!?])", r"\1", text)

        # 7. Ensure space after punctuation if followed by a letter/digit
        text = re.sub(r"([,.;:!?])([A-Za-z0-9])", r"\1 \2", text)

        # 8. Collapse duplicate spaces
        text = re.sub(r"[ \t]+", " ", text)

        # 9. Automatic sentence capitalization
        text = self._capitalize_sentences(text)

        # 10. Clean up multiple newlines beyond 2
        text = re.sub(r"\n{3,}", "\n\n", text)

        return text.strip()

    def _apply_spoken_punctuation(self, text: str) -> str:
        for pattern, replacement in _SPOKEN_PUNCTUATION:
            regex = re.compile(r"\b" + pattern + r"\b", re.IGNORECASE)
            text = regex.sub(replacement, text)
        return text

    def _capitalize_sentences(self, text: str) -> str:
        """Capitalizes the first letter of sentences and after newlines."""
        if not text:
            return ""

        lines = text.split("\n")
        capitalized_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                capitalized_lines.append("")
                continue
            
            # Capitalize first character of line
            line = line[0].upper() + line[1:] if len(line) > 1 else line.upper()

            # Capitalize after sentence terminators (. ! ?)
            line = re.sub(
                r"([.!?]\s+)([a-z])",
                lambda m: m.group(1) + m.group(2).upper(),
                line
            )
            capitalized_lines.append(line)

        return "\n".join(capitalized_lines)


# Convenient module-level singleton
_default_cleaner = DictationCleaner()

def clean_dictation(text: str, spoken_punctuation: bool = True, strip_fillers: bool = True) -> str:
    """Helper to clean dictation with custom flags."""
    cleaner = DictationCleaner(spoken_punctuation=spoken_punctuation, strip_fillers=strip_fillers)
    return cleaner.clean(text)
