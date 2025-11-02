#!/usr/bin/env python3
"""
Linter for quiz JSON files. Produces a structured, colored table with flags.
Exit code 1 if any issues found.
"""

import argparse
import glob
import json
import re
import subprocess
import sys
from statistics import median

CSI = "\x1b["
RESET = CSI + "0m"
BOLD = CSI + "1m"
RED = CSI + "31m"
YELLOW = CSI + "33m"
GREEN = CSI + "32m"


def normalize(s):
    return (s or "").strip()


def tokenize(s):
    return set(re.findall(r"[A-Za-z0-9]+", (s or "").lower()))


def check_file(fp):
    """Return rows (for printing), total_questions, blocking_count.

    'too-similar' is reported but not considered blocking. A file is
    considered to have a blocking issue only when a question has
    one of: length-cue, implausible, duplicate-correct, or no-distractors.
    The caller will enforce a per-file threshold (default <10%).
    """
    with open(fp, "r") as f:
        data = json.load(f)
    rows = []
    blocking_count = 0
    questions = data.get("questions", [])[:]
    total_q = len(questions)
    for q in questions:
        ca = normalize(q.get("correctAnswer", ""))
        ds = [normalize(d) for d in q.get("distractors", []) if normalize(d)]
        if not ds:
            rows.append((fp, q.get("id"), "⚠️ no-distractors", "No distractors"))
            blocking_count += 1
            continue
        med = median([len(d) for d in ds])
        ratio = (len(ca) / med) if med > 0 else float("inf")
        # similarity
        ca_tok = tokenize(ca)
        sims = []
        for d in ds:
            d_tok = tokenize(d)
            inter = len(ca_tok & d_tok)
            uni = len(ca_tok | d_tok)
            sims.append(inter / uni if uni > 0 else 0)
        max_sim = max(sims) if sims else 0
        flags = []
        if ratio > 1.125:
            flags.append("length-cue")
        # always report too-similar but do NOT count it as blocking
        if max_sim > 0.6:
            flags.append("too-similar")
        if max_sim < 0.05:
            flags.append("implausible")
        if ca in ds:
            flags.append("duplicate-correct")
        if flags:
            rows.append(
                (
                    fp,
                    q.get("id"),
                    " ".join(["❗" + f for f in flags]),
                    f"ratio={ratio:.2f} sim={max_sim:.2f}",
                )
            )
            # count as blocking if any blocking flag present (exclude too-similar)
            blocking_flags = [f for f in flags if f in ("length-cue", "implausible", "duplicate-correct")]
            if blocking_flags:
                blocking_count += 1
    return rows, total_q, blocking_count


def print_table(rows):
    if not rows:
        print(GREEN + BOLD + "No issues found ✅" + RESET)
        return
    # simple table
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
    args = parser.parse_args()

    # determine target files
    targets = []
    if args.all:
        targets = glob.glob("src/_data/*.json")
    elif args.files:
        targets = [f for f in args.files if f.startswith("src/_data/") and f.endswith(".json")]
    else:
        # detect git-staged and modified files (diff against HEAD)
        try:
            out_staged = (
                subprocess.check_output(["git", "diff", "--name-only", "--cached"], text=True)
                .strip()
                .splitlines()
            )
            out_modified = (
                subprocess.check_output(["git", "diff", "--name-only", "HEAD"], text=True)
                .strip()
                .splitlines()
            )
            files = set(out_staged + out_modified)
            targets = [f for f in files if f.startswith("src/_data/") and f.endswith(".json")]
        except Exception:
            # git not available or not a repo: fallback to no targets
            targets = []

    rows_all = []
    failed_files = []
    total_blocking = 0

    if not targets:
        print(GREEN + BOLD + "No staged/modified data files to lint; skipping." + RESET)
        sys.exit(0)

    for fp in sorted(targets):
        rows, total_q, blocking_count = check_file(fp)
        rows_all.extend(rows)
        total_blocking += blocking_count
        # per-file threshold: fail if blocking_count / total_q >= 0.10
        ratio = (blocking_count / total_q) if total_q > 0 else 0
        if ratio >= 0.10:
            failed_files.append((fp, blocking_count, total_q, ratio))
    print_table(rows_all)
    if failed_files:
        print()
        for fp, blocking_count, total_q, ratio in failed_files:
            short = fp.replace("src/_data/", "")
            print(
                RED
                + BOLD
                + f"{short}: {blocking_count}/{total_q} blocking questions ({ratio:.0%}) — exceeds per-file 10% threshold"
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
