#!/usr/bin/env python3
"""
Linter for quiz JSON files. Produces a structured, colored table with flags.
Exit code 1 if any issues found that exceed the per-file threshold.

This version focuses on *true* length giveaways:
- Uses word counts instead of characters.
- Flags 'length-cue' only when the correct answer is an extreme (shortest or longest)
  AND clearly separated from the closest distractor (gap rule)
  AND the robust z-score is large (MAD-based).
- 'too-similar' is informational only.
- 'implausible' is removed as a blocker to avoid content heuristics in a length linter.
"""

import argparse
import glob
import json
import re
import subprocess
import sys
from statistics import mean, median, pstdev

CSI = "\x1b["
RESET = CSI + "0m"
BOLD = CSI + "1m"
RED = CSI + "31m"
YELLOW = CSI + "33m"
GREEN = CSI + "32m"


STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "by",
    "at",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "being",
    "been",
    "that",
    "this",
    "these",
    "those",
    "from",
    "over",
    "under",
    "into",
    "out",
    "up",
    "down",
    "than",
    "then",
    "also",
    "only",
}


# tiny stemmer for econ-y words (avoid heavy deps)
def _stem(w: str) -> str:
    w = w.lower()
    # strip plural/suffixes crudely
    for suf in ("ing", "ed", "es", "s"):
        if len(w) > 4 and w.endswith(suf):
            w = w[: -len(suf)]
            break
    return w


def content_tokens(s: str) -> set[str]:
    raw = re.findall(r"[A-Za-z0-9]+", (s or "").lower())
    return {_stem(t) for t in raw if t not in STOPWORDS}


ANTONYM_SWAPS = {
    ("equal", "differ"),
    ("equals", "differs"),
    ("marginal", "average"),
    ("mrs", "mrt"),
    ("mrt", "mrs"),
    ("public", "private"),
    ("pigouvian", "uniform"),
    ("tax", "subsidy"),
    ("separating", "pooling"),
    ("full", "partial"),
    ("rival", "nonrival"),
}
NEGATIONS = {"not", "never", "no", "non"}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def trivial_flip(a: set[str], b: set[str]) -> bool:
    # symmetric token diffs
    a_minus_b = a - b
    b_minus_a = b - a
    diffs = a_minus_b | b_minus_a
    if len(diffs) == 0:
        return True  # identical
    # Allow at most 2-token difference and must be a plausible negation/antonym
    if len(a_minus_b) <= 2 and len(b_minus_a) <= 2:
        if diffs & NEGATIONS:
            return True
        # any antonym pair across the diffs?
        for x in a_minus_b:
            for y in b_minus_a:
                if (x, y) in ANTONYM_SWAPS or (y, x) in ANTONYM_SWAPS:
                    return True
    return False


def normalize(s: str) -> str:
    return (s or "").strip()


def tokenize(s: str):
    return set(re.findall(r"[A-Za-z0-9]+", (s or "").lower()))


def word_count(s: str) -> int:
    return len(re.findall(r"\w+", (s or "")))


def median_absolute_deviation(values):
    if not values:
        return 0.0
    m = median(values)
    return median([abs(v - m) for v in values]) or 0.0


def check_file(fp, no_similar=False):
    """Return rows (for printing), total_questions, blocking_count.

    Blocking flags: length-cue, duplicate-correct, no-distractors.
    'too-similar' is informational only.
    """
    with open(fp, "r", encoding="utf-8") as f:
        data = json.load(f)

    rows = []
    blocking_count = 0
    questions = list(data.get("questions", []))
    total_q = len(questions)

    for q in questions:
        ca = normalize(q.get("correctAnswer", ""))
        ds = [normalize(d) for d in q.get("distractors", []) if normalize(d)]

        # no distractors
        if not ds:
            rows.append((fp, q.get("id"), "⚠️ no-distractors", "No distractors"))
            blocking_count += 1
            continue

        # lengths (in words)
        ca_w = word_count(ca)
        ds_w = [word_count(d) for d in ds]
        med_ds = median(ds_w)
        min_ds = min(ds_w)
        max_ds = max(ds_w)

        # similarity (diagnostic only, now off by default unless --show-similar)
        ca_tok = content_tokens(ca)
        sims = []
        too_similar = False
        similar_details = 0.0

        for d in ds:
            d_tok = content_tokens(d)
            sim = jaccard(ca_tok, d_tok)
            sims.append(sim)
            # Only call it "too-similar" if: very high overlap AND trivial flip
            if sim >= 0.90 and trivial_flip(ca_tok, d_tok):
                too_similar = True
                similar_details = max(similar_details, sim)

        max_sim = max(sims) if sims else 0.0

        flags = []

        # duplicate-correct (after normalization)
        dup_idx = None
        for i, d in enumerate(ds):
            if normalize(d) == normalize(ca):
                dup_idx = i
                break
        if dup_idx is not None:
            flags.append("duplicate-correct")

        # --- Robust length-cue heuristic ---
        # Only flag if:
        # (1) correct is an extreme (shortest or longest), AND
        # (2) there is a clear gap to the nearest distractor,
        # (3) robust z-score vs. distractor distribution is large,
        # (4) distractor dispersion is not already huge (to avoid noisy sets).
        extreme_short = ca_w <= min_ds
        extreme_long = ca_w >= max_ds
        is_extreme = extreme_short or extreme_long

        # nearest neighbor gap in words
        sorted_ds = sorted(ds_w)
        if extreme_short:
            nearest_gap = sorted_ds[0] - ca_w  # smallest distractor minus correct
        elif extreme_long:
            nearest_gap = ca_w - sorted_ds[-1]  # correct minus largest distractor
        else:
            nearest_gap = 0

        # robust effect size: MAD z-score
        mad = median_absolute_deviation(ds_w)
        z_robust = (abs(ca_w - med_ds) / mad) if mad > 0 else 0.0

        # dispersion guard (coefficient of variation over distractors)
        mu = mean(ds_w)
        sigma = pstdev(ds_w) if len(ds_w) > 1 else 0.0
        cv = (sigma / mu) if mu > 0 else 0.0

        # Require:
        # - extreme (shortest or longest),
        # - gap >= max(5 words, 0.2 * median distractor words),
        # - robust z-score >= 2.5 (if MAD>0), OR absolute gap >= 7 words,
        # - distractor CV <= 0.35 (if distractors wildly vary, don't flag).
        gap_threshold = max(5, int(0.2 * med_ds))
        strong_gap = nearest_gap >= gap_threshold
        big_effect = (mad > 0 and z_robust >= 2.5) or (nearest_gap >= 7)
        reasonable_dispersion = cv <= 0.35

        if is_extreme and strong_gap and big_effect and reasonable_dispersion:
            flags.append("length-cue")

        # diagnostic only
        if too_similar and not getattr(check_file, "_hide_similar", False):
            flags.append("too-similar")

        if flags:
            detail_bits = [
                f"len_ca={ca_w}",
                f"med_ds={med_ds:.1f}",
                f"gap={nearest_gap}",
                f"zMAD={z_robust:.2f}",
                f"cv={cv:.2f}",
                f"sim={max_sim:.2f}",
            ]
            if dup_idx is not None:
                # show 8-char preview to help locate in JSON
                prev = (
                    (ds[dup_idx][:8] + "...") if len(ds[dup_idx]) > 8 else ds[dup_idx]
                )
                detail_bits.append(f"dup_idx={dup_idx} prev={prev!r}")

            rows.append(
                (
                    fp,
                    q.get("id"),
                    " ".join(["❗" + f for f in flags]),
                    " ".join(detail_bits),
                )
            )

            # blocking only for these:
            if any(f in ("length-cue", "duplicate-correct") for f in flags):
                blocking_count += 1

    return rows, total_q, blocking_count


def print_table(rows):
    if not rows:
        print(GREEN + BOLD + "No issues found ✅" + RESET)
        return
    print(BOLD + "Lint results (samples):" + RESET)
    print(f"{BOLD}File{' ' * 20} | ID         | Flags                | Details{RESET}")
    print("-" * 80)
    for fp, id_, flags, det in rows:
        short = fp.replace("src/_data/", "")
        print(f"{short:24} | {str(id_):10} | {YELLOW}{flags:20}{RESET} | {det}")


def main():
    parser = argparse.ArgumentParser(
        description="Lint quiz JSON files. By default only checks files staged for commit or modified against HEAD."
    )
    parser.add_argument(
        "--all", action="store_true", help="Lint all files in src/_data/*.json"
    )
    parser.add_argument(
        "--files",
        nargs="*",
        help="Specific files to lint (paths). Overrides staged/modified detection.",
    )
    parser.add_argument(
        "--no-similar",
        action="store_true",
        help="Do not report 'too-similar' diagnostics",
    )
    parser.add_argument(
        "--show-similar",
        action="store_true",
        help="Report non-blocking 'too-similar' diagnostics (hidden by default).",
    )
    args = parser.parse_args()

    # propagate the --show-similar setting to check_file via a function attribute
    check_file._hide_similar = not args.show_similar

    # determine target files
    targets = []
    if args.all:
        targets = glob.glob("src/_data/*.json")
    elif args.files:
        targets = [
            f for f in args.files if f.startswith("src/_data/") and f.endswith(".json")
        ]
    else:
        # detect git-staged and modified files (diff against HEAD)
        try:
            out_staged = (
                subprocess.check_output(
                    ["git", "diff", "--name-only", "--cached"], text=True
                )
                .strip()
                .splitlines()
            )
            out_modified = (
                subprocess.check_output(
                    ["git", "diff", "--name-only", "HEAD"], text=True
                )
                .strip()
                .splitlines()
            )
            files = set(out_staged + out_modified)
            targets = [
                f for f in files if f.startswith("src/_data/") and f.endswith(".json")
            ]
        except Exception:
            targets = []

    rows_all = []
    failed_files = []
    threshold = 0.20  # per-file blocking question ratio threshold

    if not targets:
        print(GREEN + BOLD + "No staged/modified data files to lint; skipping." + RESET)
        sys.exit(0)

    for fp in sorted(targets):
        rows, total_q, blocking_count = check_file(fp, args.no_similar)
        rows_all.extend(rows)
        ratio = (blocking_count / total_q) if total_q > 0 else 0
        if ratio >= threshold:
            failed_files.append((fp, blocking_count, total_q, ratio))

    print_table(rows_all)

    if failed_files:
        print()
        for fp, blocking_count, total_q, ratio in failed_files:
            short = fp.replace("src/_data/", "")
            print(
                RED
                + BOLD
                + f"{short}: {blocking_count}/{total_q} blocking questions ({ratio:.0%}) — exceeds per-file {threshold:.0%} threshold"
                + RESET
            )
        print(
            "\n"
            + RED
            + BOLD
            + f"{len(failed_files)} file(s) failed per-file threshold. Fix before commit."
            + RESET
        )
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
