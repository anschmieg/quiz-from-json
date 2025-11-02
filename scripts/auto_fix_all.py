#!/usr/bin/env python3
"""
Apply conservative length-cue auto-fixes across all quiz JSON files in src/_data/.

Strategy (same as scripts/auto_fix_uu_sgi.py):
 - Normalize distractors
 - If correctAnswer is substantially longer than median distractor (ratio > THRESHOLD),
   lengthen distractors by appending a short qualifier extracted from the explanation
   until the median increases enough (bounded by MAX_APPEND_PER_DISTRACTOR per distractor).
 - Do not truncate correct answers.

This script supports --dry-run (no writes) and --pattern to limit files.
"""

import glob
import json
import os
import re
from statistics import median

THRESHOLD = 1.125
MAX_APPEND_PER_DISTRACTOR = 2


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
    m = re.split(r"[\.!?]\s+", s.strip())
    return m[0].strip()


def build_append_text(explanation):
    sent = first_sentence(explanation)
    if sent:
        if len(sent) > 120:
            sent = sent[:120].rsplit(" ", 1)[0] + "..."
        return f" — {sent}"
    return " — this narrower interpretation is not supported by the course evidence."


def process_questions(qs):
    changed_any = False
    summary = []
    for idx, q in enumerate(qs):
        ca = normalize_text(q.get("correctAnswer", ""))
        expl = q.get("explanation", "") or ""

        raw_ds = q.get("distractors", [])
        if isinstance(raw_ds, list):
            ds = [normalize_text(d) for d in raw_ds]
        else:
            ds = [normalize_text(x) for x in str(raw_ds).split(";")]
        ds = [d for d in ds if d and d != ca]
        ds = unique_preserve_order(ds)

        if ds:
            med = median([len(d) for d in ds])
        else:
            med = 0
        ca_len = len(ca)
        ratio = (ca_len / med) if med > 0 else float("inf")

        changed = False
        if ratio > THRESHOLD:
            append_text = build_append_text(expl)
            new_ds = ds[:]
            appended = 0
            target_med = int(ca_len / THRESHOLD) + 1
            while median(
                [len(d) for d in new_ds]
            ) < target_med and appended < MAX_APPEND_PER_DISTRACTOR * max(
                1, len(new_ds)
            ):
                idx2 = appended % len(new_ds)
                new_ds[idx2] = new_ds[idx2] + append_text
                appended += 1
            q["distractors"] = new_ds
            changed = True
        else:
            q["distractors"] = ds

        if "difficulty" in q:
            try:
                q["difficulty"] = int(q["difficulty"])
            except Exception:
                pass

        if changed:
            changed_any = True

        summary.append(
            {
                "id": q.get("id"),
                "changed": changed,
                "ratio_before": round(ratio, 2) if ratio != float("inf") else "inf",
            }
        )

    return changed_any, summary


def parse_args():
    import argparse

    p = argparse.ArgumentParser(
        description="Auto-fix length-cue across all src/_data quiz JSON files"
    )
    p.add_argument(
        "--pattern",
        default="src/_data/*.json",
        help="glob pattern for files to process",
    )
    p.add_argument("--dry-run", action="store_true", help="do not write changes")
    return p.parse_args()


def main():
    args = parse_args()
    files = sorted(glob.glob(args.pattern))
    if not files:
        print("No files matched pattern:", args.pattern)
        return

    total_changed = 0
    total_questions = 0
    file_summaries = {}

    for fp in files:
        try:
            with open(fp, "r") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Skipping {fp}: cannot read/parse ({e})")
            continue

        qs = data.get("questions")
        if not isinstance(qs, list):
            # nothing to do
            continue

        changed_any, summary = process_questions(qs)
        file_summaries[fp] = summary
        total_questions += len(summary)
        if changed_any:
            total_changed += sum(1 for s in summary if s["changed"])
            if not args.dry_run:
                # write back
                with open(fp, "w") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

    # print brief report
    print("Auto-fix report:")
    for fp, summ in file_summaries.items():
        changed_count = sum(1 for s in summ if s["changed"])
        print(
            f" - {os.path.basename(fp)}: questions={len(summ)} changed={changed_count}"
        )

    print(f"Total questions processed: {total_questions}")
    print(f"Total changed: {total_changed}")
    if args.dry_run:
        print("Dry-run: no files were modified.")
    else:
        print("Wrote changes to files where fixes applied.")


if __name__ == "__main__":
    main()
