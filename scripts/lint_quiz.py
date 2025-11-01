#!/usr/bin/env python3
"""
Linter for quiz JSON files. Produces a structured, colored table with flags.
Exit code 1 if any issues found.
"""

import glob
import json
import re
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
    with open(fp, "r") as f:
        data = json.load(f)
    rows = []
    issues = 0
    for q in data.get("questions", [])[:]:
        ca = normalize(q.get("correctAnswer", ""))
        ds = [normalize(d) for d in q.get("distractors", []) if normalize(d)]
        if not ds:
            rows.append((fp, q.get("id"), "⚠️ no-distractors", "No distractors"))
            issues += 1
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
        if max_sim > 0.6:
            flags.append("too-similar")
        if max_sim < 0.05:
            flags.append("implausible")
        if ca in ds:
            flags.append("duplicate-correct")
        if flags:
            issues += 1
            rows.append(
                (
                    fp,
                    q.get("id"),
                    " ".join(["❗" + f for f in flags]),
                    f"ratio={ratio:.2f} sim={max_sim:.2f}",
                )
            )
    return rows, issues


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
    rows_all = []
    total_issues = 0
    for fp in glob.glob("src/_data/*.json"):
        rows, issues = check_file(fp)
        rows_all.extend(rows)
        total_issues += issues
    print_table(rows_all)
    if total_issues > 0:
        print(
            "\n"
            + RED
            + BOLD
            + f"{total_issues} file(s)/question(s) flagged. Fix before commit."
            + RESET
        )
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
