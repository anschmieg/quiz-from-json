#!/usr/bin/env python3
"""
Auto-fix length-cue issues for the first 25 questions in UU_SGI.json.
Strategy:
 - Normalize distractors (trim, remove empties, dedupe, remove exact matches to correctAnswer).
 - If the correct answer is substantially longer than the median distractor (ratio > 1.125),
   lengthen distractors by appending a short, course-aligned qualifier extracted from the explanation
   or a generic clarifying phrase until the median distractor length reduces the ratio below threshold.
 - Do not truncate correct answers to avoid losing content; instead, extend distractors conservatively.

Writes changes in-place and prints a short summary.
"""

import json
import re
from statistics import median

PATH = "src/_data/UU_SGI.json"
THRESHOLD = 1.125
MAX_APPEND_PER_DISTRACTOR = 2


def parse_args():
    import argparse

    p = argparse.ArgumentParser(
        description="Auto-fix length-cue issues in UU_SGI.json (configurable range)."
    )
    p.add_argument(
        "--start", type=int, default=0, help="0-based start index of questions"
    )
    p.add_argument(
        "--count", type=int, default=25, help="number of questions to process"
    )
    p.add_argument(
        "--all", action="store_true", help="process all questions from start"
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="do not write changes; only print summary",
    )
    return p.parse_args()


def normalize_text(s):
    return (s or "").strip()


def unique_preserve_order(seq):
    seen = set()
    out = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def first_sentence(s):
    if not s:
        return ""
    # split on sentence enders
    m = re.split(r"[\.!?]\s+", s.strip())
    return m[0].strip()


def build_append_text(explanation):
    sent = first_sentence(explanation)
    if sent:
        # make it short and generic
        if len(sent) > 120:
            sent = sent[:120].rsplit(" ", 1)[0] + "..."
        return f" — {sent}"
    return " — this narrower interpretation is not supported by the course evidence."


def run():
    args = parse_args()

    with open(PATH, "r") as f:
        data = json.load(f)

    qs = data.get("questions", [])
    start = max(0, args.start)
    if args.all:
        end = len(qs)
    else:
        end = min(len(qs), start + max(0, args.count))

    summary = []

    for i in range(start, end):
        q = qs[i]
        ca = normalize_text(q.get("correctAnswer", ""))
        expl = q.get("explanation", "") or ""

        # normalize distractors
        raw_ds = q.get("distractors", [])
        if isinstance(raw_ds, list):
            ds = [normalize_text(d) for d in raw_ds]
        else:
            ds = [normalize_text(x) for x in str(raw_ds).split(";")]
        ds = [d for d in ds if d and d != ca]
        ds = unique_preserve_order(ds)

        # compute lengths
        if ds:
            med = median([len(d) for d in ds])
        else:
            med = 0
        ca_len = len(ca)
        ratio = (ca_len / med) if med > 0 else float("inf")

        changed = False
        if ratio > THRESHOLD:
            append_text = build_append_text(expl)
            # repeatedly append to distractors until median increases enough
            appended = 0
            # make copies to mutate
            new_ds = ds[:]
            # target median length
            target_med = int(ca_len / THRESHOLD) + 1
            # iterate up to a bounded number of times
            while median(
                [len(d) for d in new_ds]
            ) < target_med and appended < MAX_APPEND_PER_DISTRACTOR * len(new_ds):
                idx = appended % len(new_ds)
                new_ds[idx] = new_ds[idx] + append_text
                appended += 1
            q["distractors"] = new_ds
            changed = True

        else:
            q["distractors"] = ds

        # canonicalize other fields lightly
        if "difficulty" in q:
            try:
                q["difficulty"] = int(q["difficulty"])
            except Exception:
                pass

        summary.append(
            {
                "index": i,
                "id": q.get("id"),
                "changed": changed,
                "ratio_before": round(ratio, 2) if ratio != float("inf") else "inf",
            }
        )

    # write back (unless dry-run)
    if args.dry_run:
        print("Dry-run: no file changes will be written.")
    else:
        with open(PATH, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(
        f"Auto-fix completed for questions {start}..{end - 1} (requested {'ALL' if args.all else args.count}). Summary:"
    )
    for s in summary:
        print(
            f" - index={s['index']} id={s['id']}: changed={s['changed']} ratio_before={s['ratio_before']}"
        )
    if not args.dry_run:
        print("Wrote changes to:", PATH)
    else:
        print("No changes written (dry-run).")


if __name__ == "__main__":
    run()
