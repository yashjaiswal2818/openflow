"""
OpenFlow Intelligent Dictation Cleaner
======================================
A deterministic, dependency-free rule engine that turns raw Whisper output into
publishable text. It runs in well under a millisecond, never touches the network
and produces identical output on every platform, which makes it fully unit
testable (see ``tests/test_dictation_cleaner.py``).

Pipeline (order matters):

    1. unicode / whitespace normalisation
    2. spoken punctuation  ("comma" -> ",", "new line" -> "\n")
    3. stutter collapse    ("the the" -> "the", "th-the" -> "the")
    4. filler removal      ("uh", "um", "you know", hesitation "like")
    5. punctuation spacing ("hello ,World" -> "hello, World")
    6. casing              (sentence starts, "i" -> "I", tech acronyms)
    7. final whitespace trim

Every stage reports what it changed so the Studio can show a transparent
"raw vs clean" diff instead of a black box.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

__all__ = ["CleanReport", "DictationCleaner", "clean_dictation"]


# ---------------------------------------------------------------------------
# Stage 2 — spoken punctuation
# ---------------------------------------------------------------------------
# Longest phrases must be matched first so "question mark" never degrades into
# "mark". ``\b`` boundaries keep "periodic" and "commas" intact.
_SPOKEN_PUNCTUATION: Tuple[Tuple[str, str], ...] = (
    (r"new\s+paragraph|next\s+paragraph|new\s+para", "\n\n"),
    (r"new\s+line|next\s+line|line\s+break", "\n"),
    (r"question\s+mark", "?"),
    (r"exclamation\s+(?:mark|point)", "!"),
    (r"full\s+stop", "."),
    (r"semi\s*colon", ";"),
    (r"open\s+paren(?:thesis)?|open\s+bracket", "("),
    (r"close\s+paren(?:thesis)?|close\s+bracket", ")"),
    (r"ellipsis|dot\s+dot\s+dot", "…"),
    (r"\bperiod\b", "."),
    (r"\bcomma\b", ","),
    (r"\bcolon\b", ":"),
)

_SPOKEN_PUNCT_RE = re.compile(
    r"[ \t]*(?P<lead>[,;:.!?])?[ \t]*,?\s*(?<![\w'])(?:"
    + "|".join(f"(?:{pattern})" for pattern, _ in _SPOKEN_PUNCTUATION)
    + r")(?![\w'])[,;:.!?]*[ \t]*",
    re.IGNORECASE,
)

_REPLACEMENT_LOOKUP: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(rf"^(?:{pattern})$", re.IGNORECASE), replacement)
    for pattern, replacement in _SPOKEN_PUNCTUATION
]


def _punctuation_for(command: str) -> str:
    for regex, replacement in _REPLACEMENT_LOOKUP:
        if regex.match(command.strip()):
            return replacement
    return ""


# ---------------------------------------------------------------------------
# Stage 3 — stutters
# ---------------------------------------------------------------------------
# Only function words are collapsed as repeated tokens. This deliberately keeps
# rhetorical emphasis intact: "no, no, no!" and "very, very good" survive.
_STUTTER_WORDS: Sequence[str] = (
    "a", "an", "and", "at", "but", "for", "he", "i", "in", "is", "it",
    "my", "of", "on", "or", "she", "so", "that", "the", "they", "this",
    "to", "was", "we", "were", "with", "you", "your",
)

_RE_REPEATED_WORD = re.compile(
    r"(?<![\w'])(?P<word>" + "|".join(_STUTTER_WORDS) + r")(?P<sep>[\s,]+)(?P=word)(?![\w'])",
    re.IGNORECASE,
)

# "th-the", "b-basically", "I-I" -> the full word
_RE_HYPHEN_STUTTER = re.compile(r"(?<![\w'])\w{1,3}-(?P<word>[A-Za-z']{2,})(?![\w'])")


# ---------------------------------------------------------------------------
# Stage 4 — fillers
# ---------------------------------------------------------------------------
_FILLERS = re.compile(
    r"(?<![\w'])(?:u+h+|u+h*m+|u+m+|e+r+m+|e+r+|a+h+|h+m+|m+h+m+)(?![\w'])",
    re.IGNORECASE,
)

# Multi-word verbal crutches, removed when set off by punctuation/edges.
_CRUTCHES = re.compile(
    r"(?:(?<=[\s,;])|^)(?:you\s+know|i\s+mean|sort\s+of|kind\s+of|basically|honestly)"
    r"(?=[\s,;.]|$)[,]?",
    re.IGNORECASE,
)

# Hesitation "like" is only dropped when it is clearly a filler: set off by
# commas, or repeated. "I like apples" is never touched.
_LIKE_FILLER = re.compile(
    r"(?:,\s*like\s*,|(?:^|(?<=[.!?]\s))like\s*,\s*|\blike\s*,\s*like\b)", re.IGNORECASE
)

# Remove leftover empty comma pairs ("hello, , world" style damage)
_ORPHAN_COMMA = re.compile(r",\s*,+")


# ---------------------------------------------------------------------------
# Stage 6 — casing
# ---------------------------------------------------------------------------
# Tech vocabulary that Whisper often lowercases. Keyed by lowercase form.
_ACRONYMS: Dict[str, str] = {
    "ai": "AI", "api": "API", "apis": "APIs", "asr": "ASR", "bi": "BI",
    "cli": "CLI", "cpu": "CPU", "cpus": "CPUs", "css": "CSS", "cuda": "CUDA",
    "db": "DB", "gpu": "GPU", "gpus": "GPUs", "gui": "GUI", "html": "HTML",
    "http": "HTTP", "https": "HTTPS", "id": "ID", "ids": "IDs", "ip": "IP",
    "json": "JSON", "llm": "LLM", "llms": "LLMs", "ml": "ML", "npm": "npm",
    "onnx": "ONNX", "os": "OS", "oss": "OSS", "pdf": "PDF", "png": "PNG",
    "ram": "RAM", "rest": "REST", "sdk": "SDK", "sql": "SQL", "ssh": "SSH",
    "stt": "STT", "tauri": "Tauri", "tts": "TTS", "ui": "UI", "url": "URL",
    "urls": "URLs", "usb": "USB", "ux": "UX", "vm": "VM", "vpn": "VPN",
    "wasm": "WASM", "wav": "WAV", "yaml": "YAML", "zip": "ZIP",
    # product / model names
    "openflow": "OpenFlow", "wispr": "Wispr", "wispr flow": "Wispr Flow",
    "elevenlabs": "ElevenLabs", "github": "GitHub", "git": "Git",
    "macos": "macOS", "ios": "iOS", "linux": "Linux", "windows": "Windows",
    "javascript": "JavaScript", "typescript": "TypeScript", "python": "Python",
    "rust": "Rust", "react": "React", "vite": "Vite", "tailwind": "Tailwind",
    "kokoro": "Kokoro", "piper": "Piper", "whisper": "Whisper",
    "silero": "Silero", "coreaudio": "CoreAudio", "wasapi": "WASAPI",
    "alsa": "ALSA", "pynput": "pynput", "npm": "npm",
}

_RE_ACRONYM = re.compile(
    r"(?<![\w'-])(" + "|".join(re.escape(k) for k in sorted(_ACRONYMS, key=len, reverse=True)) + r")(?![\w'-])",
    re.IGNORECASE,
)

# Standalone pronoun "i" -> "I" ("i", "i'm", "i've", "i'll", "i'd")
_RE_PRONOUN_I = re.compile(r"(?<![\w'.])i(?=(?:'(?:m|ve|ll|d|s))?(?![\w']))", re.IGNORECASE)


_STRONGER = {",": ",", ";": ";", ":": ":", ".": ".", "!": "!", "?": "?"}


def _collapse_terminators(match: re.Match[str]) -> str:
    """Collapses stacked terminators: ".?" -> "?", ".." -> ".", "?!" -> "?!"."""
    chain = "".join(ch for ch in match.group(0) if ch in ".!?")
    if "?" in chain and "!" in chain:
        return "?!" if chain.index("?") < chain.index("!") else "!?"
    return chain[-1]


def _match_case(source: str, replacement: str) -> str:
    """Preserves SHOUTING / Capitalised input while applying a mapping."""
    if source.isupper() and len(source) > 1:
        return replacement.upper()
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


@dataclass
class CleanReport:
    """Result of a cleaning pass plus per-stage statistics."""

    raw: str
    cleaned: str
    fillers_removed: int = 0
    stutters_collapsed: int = 0
    punctuation_converted: int = 0
    crutches_removed: int = 0
    acronyms_fixed: int = 0
    sentences_capitalized: int = 0
    stages: List[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return self.raw != self.cleaned

    @property
    def total_fixes(self) -> int:
        return (
            self.fillers_removed
            + self.stutters_collapsed
            + self.punctuation_converted
            + self.crutches_removed
            + self.acronyms_fixed
            + self.sentences_capitalized
        )

    def to_dict(self) -> Dict[str, object]:
        return {
            "raw": self.raw,
            "cleaned": self.cleaned,
            "changed": self.changed,
            "total_fixes": self.total_fixes,
            "fillers_removed": self.fillers_removed,
            "stutters_collapsed": self.stutters_collapsed,
            "punctuation_converted": self.punctuation_converted,
            "crutches_removed": self.crutches_removed,
            "acronyms_fixed": self.acronyms_fixed,
            "sentences_capitalized": self.sentences_capitalized,
            "stages": list(self.stages),
        }


class DictationCleaner:
    """Stateless-with-configuration dictation post-processor."""

    def __init__(
        self,
        spoken_punctuation: bool = True,
        strip_fillers: bool = True,
        fix_casing: bool = True,
        collapse_stutters: bool = True,
    ) -> None:
        self.spoken_punctuation = spoken_punctuation
        self.strip_fillers = strip_fillers
        self.fix_casing = fix_casing
        self.collapse_stutters = collapse_stutters

    # -- public API ---------------------------------------------------------
    def clean(self, raw_text: str) -> str:
        return self.clean_with_report(raw_text).cleaned

    def clean_with_report(self, raw_text: str) -> CleanReport:
        report = CleanReport(raw=(raw_text or "").strip(), cleaned="")
        if not report.raw:
            return report

        text = self._normalise_unicode(report.raw)

        if self.spoken_punctuation:
            before = report.punctuation_converted
            text = self._apply_spoken_punctuation(text, report)
            if report.punctuation_converted > before:
                report.stages.append("spoken_punctuation")

        if self.collapse_stutters:
            before = report.stutters_collapsed
            text = self._collapse_stutters(text, report)
            if report.stutters_collapsed > before:
                report.stages.append("stutter_collapse")

        if self.strip_fillers:
            before = report.fillers_removed + report.crutches_removed
            text = self._strip_fillers(text, report)
            if report.fillers_removed + report.crutches_removed > before:
                report.stages.append("filler_removal")

        text = self._normalise_punctuation_spacing(text)

        if self.fix_casing:
            text = self._fix_casing(text, report)
            if report.acronyms_fixed:
                report.stages.append("acronyms")
            if report.sentences_capitalized:
                report.stages.append("capitalization")

        text = self._finalise_whitespace(text)

        report.cleaned = text
        return report

    # -- stage 1 ------------------------------------------------------------
    @staticmethod
    def _normalise_unicode(text: str) -> str:
        table = {
            "\u00a0": " ", "\u200b": "", "\u2009": " ", "\u202f": " ",
            "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
            "\u2013": "—", "\u2014": "—", "\r\n": "\n", "\r": "\n",
        }
        for src, dst in table.items():
            text = text.replace(src, dst)
        return re.sub(r"[ \t]+", " ", text)

    # -- stage 2 ------------------------------------------------------------
    def _apply_spoken_punctuation(self, text: str, report: CleanReport) -> str:
        def replace(match: re.Match[str]) -> str:
            command = match.group(0)
            glyph = _punctuation_for(re.sub(r"^[\s,]+|[\s,]+$", "", command))
            if not glyph:
                return command
            report.punctuation_converted += 1
            lead = match.group("lead") or ""
            if glyph == "\n\n":
                return "\n\n"
            if glyph == "\n":
                return "\n"
            if glyph in "(!":
                return lead + glyph if lead not in "(" else glyph
            if glyph in "),":
                return glyph
            return lead + glyph

        text = _SPOKEN_PUNCT_RE.sub(replace, text)

        # Deterministic tidy-ups after substitution
        text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"([,;:])(?=[A-Za-z0-9])", r"\1 ", text)
        text = re.sub(r"([,;:])\s*([,;:.!?])", r"\2", text)
        return text

    # -- stage 3 ------------------------------------------------------------
    def _collapse_stutters(self, text: str, report: CleanReport) -> str:
        # "th-the" -> "the" only when the prefix really is a partial repeat
        def hyphen_guard(match: re.Match[str]) -> str:
            full = match.group(0)
            head, _, tail = full.partition("-")
            if tail.lower().startswith(head.lower()[:1]):
                report.stutters_collapsed += 1
                return tail
            return full

        previous = text
        # Repeat up to 3 times so "the the the" fully collapses.
        for _ in range(3):
            text = _RE_REPEATED_WORD.sub(lambda m: m.group("word"), text)
        collapsed = len(_RE_REPEATED_WORD.findall(previous))
        if collapsed:
            report.stutters_collapsed += collapsed
        text = _RE_HYPHEN_STUTTER.sub(hyphen_guard, text)
        return text

    # -- stage 4 ------------------------------------------------------------
    def _strip_fillers(self, text: str, report: CleanReport) -> str:
        text, n_like = _LIKE_FILLER.subn(" ", text)
        report.fillers_removed += n_like

        text, n_fillers = _FILLERS.subn(" ", text)
        report.fillers_removed += n_fillers

        text, n_crutches = _CRUTCHES.subn(" ", text)
        report.crutches_removed += n_crutches

        text = _ORPHAN_COMMA.sub(",", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"[ \t]+([,.;:!?])", r"\1", text)
        text = re.sub(r"(?<![A-Za-z0-9])[,;:](\s*[,;:.!?])", r"\1", text)
        text = re.sub(r"([.!?])\s*,", r"\1", text)
        return text

    # -- stage 5 ------------------------------------------------------------
    @staticmethod
    def _normalise_punctuation_spacing(text: str) -> str:
        text = re.sub(r"[ \t]+([,.;:!?…])", r"\1", text)
        text = re.sub(r"([,.;:!?…])([A-Za-z0-9])", r"\1 \2", text)
        text = re.sub(r"([(\[])\s+", r"\1", text)
        text = re.sub(r"\s+([)\]])", r"\1", text)
        text = re.sub(r",(?:\s*,)+", ",", text)
        # A spoken sequence like "period question mark" must not stack glyphs.
        text = re.sub(r"[.!?](?:\s*[.!?])+", _collapse_terminators, text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text

    # -- stage 6 ------------------------------------------------------------
    def _fix_casing(self, text: str, report: CleanReport) -> str:
        text = _RE_PRONOUN_I.sub("I", text)

        def acronym(match: re.Match[str]) -> str:
            source = match.group(1)
            target = _ACRONYMS[source.lower()]
            fixed = _match_case(source, target)
            if fixed != source:
                report.acronyms_fixed += 1
            return fixed

        text = _RE_ACRONYM.sub(acronym, text)

        lines = text.split("\n")
        out: List[str] = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                out.append("")
                continue
            lowered_first = stripped[0].islower()
            if lowered_first:
                report.sentences_capitalized += 1
                stripped = stripped[0].upper() + stripped[1:]

            def capitalise(match: re.Match[str]) -> str:
                report.sentences_capitalized += 1
                return match.group(1) + match.group(2).upper()

            stripped = re.sub(r"([.!?—]\s+)([a-z])", capitalise, stripped)
            # Capitalise after a colon when the clause clearly restarts.
            stripped = re.sub(r"(:\s+)([a-z])(?=\w+\s+\w+)", capitalise, stripped)
            out.append(stripped)
        return "\n".join(out)

    # -- stage 7 ------------------------------------------------------------
    @staticmethod
    def _finalise_whitespace(text: str) -> str:
        lines = [line.strip() for line in text.split("\n")]
        # Drop empty lines created by over-eager spoken punctuation.
        collapsed: List[str] = []
        for line in lines:
            if not line and collapsed and not collapsed[-1]:
                continue
            collapsed.append(line)
        text = "\n".join(collapsed)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text.strip()


_default_cleaner = DictationCleaner()


def clean_dictation(
    text: str,
    spoken_punctuation: bool = True,
    strip_fillers: bool = True,
    fix_casing: bool = True,
) -> str:
    """Convenience wrapper used by the STT pipeline and the HTTP API."""
    return DictationCleaner(
        spoken_punctuation=spoken_punctuation,
        strip_fillers=strip_fillers,
        fix_casing=fix_casing,
    ).clean(text)
