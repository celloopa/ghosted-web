#!/usr/bin/env python3
# Vendored from ghosted/ats-job-docs/scripts/validate_ats.py — keep in sync.
# Original: https://github.com/celloopa/ghosted — MIT license (same author).
"""
validate_ats.py — assert that a generated PDF survives ATS-style text extraction.

The core idea: an ATS doesn't read your beautiful PDF, it reads the text it can
extract from it. So we extract the text ourselves and assert that everything
that matters survived, in the right order, un-garbled.

Usage:
  python validate_ats.py resume.pdf --expect expectations.json
  python validate_ats.py cover_letter.pdf --cover [--max-words 180]

expectations.json example:
{
  "required_strings": ["Marcelo Rondon", "cello@cello.design", "(305) 496-0039"],
  "ordered_headings": ["Experience", "Skills", "Education"],
  "required_keywords": ["design system", "React", "TypeScript", "Figma", "prototyp"],
  "required_years": ["2022", "2024", "2025"],
  "max_pages": 2
}

Exit code 0 = pass, 1 = fail (with a printed report), 2 = usage/extraction error.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

BANNED_COVER_PHRASES = [
    "i'm excited to",
    "i am excited to",
    "aligns perfectly",
    "passionate about",
    "leverage my skills",
    "fast-paced environment",
    "hit the ground running",
    "i believe i would be a great fit",
]

LIGATURE_CHARS = "\ufb00\ufb01\ufb02\ufb03\ufb04"  # ff fi fl ffi ffl


def extract_text(pdf_path: Path) -> tuple[str, int]:
    """Extract text + page count. Prefers pdftotext (closest to ATS parsers),
    falls back to pdfplumber if Poppler isn't installed."""
    if shutil.which("pdftotext"):
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"ERROR: pdftotext failed: {result.stderr}", file=sys.stderr)
            sys.exit(2)
        text = result.stdout
        pages = text.rstrip("\f \n").count("\f") + 1 if text.strip() else 0
        return text, pages
    try:
        import pdfplumber  # type: ignore
    except ImportError:
        print(
            "ERROR: need either `pdftotext` (poppler-utils) or `pip install pdfplumber`",
            file=sys.stderr,
        )
        sys.exit(2)
    with pdfplumber.open(pdf_path) as pdf:
        pages = len(pdf.pages)
        text = "\n\f\n".join(p.extract_text() or "" for p in pdf.pages)
    return text, pages


def norm(s: str) -> str:
    """Normalize for tolerant matching: NFKC, collapse whitespace, lowercase."""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", " ", s)
    return s.lower()


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passes: list[str] = []

    def check(self, ok: bool, label: str, detail: str = "") -> None:
        if ok:
            self.passes.append(f"PASS  {label}")
        else:
            self.failures.append(f"FAIL  {label}" + (f" — {detail}" if detail else ""))

    def emit(self) -> int:
        for line in self.passes:
            print(line)
        for line in self.failures:
            print(line)
        print()
        if self.failures:
            print(f"RESULT: FAIL ({len(self.failures)} problem(s)). Fix the document, not the expectations.")
            return 1
        print("RESULT: PASS — extracted text preserves everything required.")
        return 0


def validate_resume(text: str, pages: int, exp: dict) -> int:
    r = Report()
    ntext = norm(text)

    r.check(bool(text.strip()), "text extracted", "no text at all — is content rendered as an image?")

    max_pages = exp.get("max_pages", 2)
    r.check(pages <= max_pages, f"page count <= {max_pages}", f"got {pages}")

    for s in exp.get("required_strings", []):
        r.check(norm(s) in ntext, f"required string survives: {s!r}",
                "missing or garbled in extraction")

    # Heading order: each must exist and appear after the previous one
    pos = -1
    for h in exp.get("ordered_headings", []):
        i = ntext.find(norm(h), pos + 1)
        r.check(i > pos, f"heading in order: {h!r}",
                "missing or out of order — check section structure / column layout")
        if i > pos:
            pos = i

    for kw in exp.get("required_keywords", []):
        r.check(norm(kw) in ntext, f"keyword survives: {kw!r}")

    for yr in exp.get("required_years", []):
        r.check(yr in text, f"date year survives: {yr}")

    bad_ligs = [c for c in LIGATURE_CHARS if c in text]
    r.check(not bad_ligs, "no ligature codepoints in extraction",
            f"found {bad_ligs!r} — disable ligatures in the Typst template")

    # Hyphenation splits: a letter, hyphen, end of line, letter (word broken across lines)
    splits = re.findall(r"[a-z]-\n[a-z]", text)
    r.check(not splits, "no hyphenated line-break word splits",
            f"{len(splits)} found — turn off hyphenation")

    return r.emit()


def validate_cover(text: str, pages: int, max_words: int) -> int:
    r = Report()
    ntext = norm(text)
    words = len(re.findall(r"\b[\w'’-]+\b", text))

    r.check(bool(text.strip()), "text extracted")
    r.check(pages == 1, "single page", f"got {pages}")
    r.check(words <= max_words, f"word count <= {max_words}", f"got {words}")

    for phrase in BANNED_COVER_PHRASES:
        r.check(phrase not in ntext, f"no banned phrase: {phrase!r}",
                "rewrite — fails the generic-letter test")

    return r.emit()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--expect", type=Path, help="expectations JSON (resume mode)")
    ap.add_argument("--cover", action="store_true", help="cover letter mode")
    ap.add_argument("--max-words", type=int, default=180, help="cover letter word cap")
    args = ap.parse_args()

    if not args.pdf.exists():
        print(f"ERROR: {args.pdf} not found", file=sys.stderr)
        sys.exit(2)

    text, pages = extract_text(args.pdf)

    if args.cover:
        sys.exit(validate_cover(text, pages, args.max_words))

    if not args.expect:
        print("ERROR: resume mode requires --expect expectations.json", file=sys.stderr)
        sys.exit(2)
    exp = json.loads(args.expect.read_text())
    sys.exit(validate_resume(text, pages, exp))


if __name__ == "__main__":
    main()
