#!/usr/bin/env python3
import glob
import json
import os


def normalize_text(s):
    if s is None:
        return ""
    return str(s).strip()


def unique_preserve_order(seq):
    seen = set()
    out = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def coerce_difficulty(val):
    # Accept names or numbers, return int in 1..5, default 3
    if val is None:
        return 3
    if isinstance(val, int):
        return max(1, min(5, val))
    s = str(val).strip().lower()
    name_map = {
        "very easy": 1,
        "very_easy": 1,
        "1": 1,
        "easy": 2,
        "2": 2,
        "medium": 3,
        "3": 3,
        "hard": 4,
        "4": 4,
        "very hard": 5,
        "very_hard": 5,
        "5": 5,
    }
    # allow simple numeric strings
    if s.isdigit():
        return max(1, min(5, int(s)))
    return name_map.get(s, 3)


def ensure_topic_array(val):
    if val is None:
        return []
    if isinstance(val, list):
        return [normalize_text(t) for t in val if normalize_text(t)]
    s = str(val)
    # split on common separators
    parts = [
        p.strip()
        for p in s.replace("\u2013", "-").replace(":", ";").replace("/", ";").split(";")
    ]
    # also split comma-separated subparts
    expanded = []
    for part in parts:
        expanded.extend([p.strip() for p in part.split(",") if p.strip()])
    return [normalize_text(p) for p in expanded if normalize_text(p)]


def process_questions(data, filename):
    changed = 0
    if "questions" not in data or not isinstance(data["questions"], list):
        print(f"Skipping {filename}: no questions array")
        return changed

    for idx, q in enumerate(data["questions"]):
        modified = False
        # canonicalize question text field
        if "questionText" not in q:
            for alt in ("question", "text"):
                if alt in q:
                    q["questionText"] = normalize_text(q.pop(alt))
                    modified = True
                    break
        else:
            q["questionText"] = normalize_text(q.get("questionText"))

        # ensure id exists
        if "id" not in q or not str(q["id"]).strip():
            q["id"] = f"q_{idx + 1:03d}"
            modified = True

        # canonicalize correctAnswer (accept older keys)
        if "correctAnswer" not in q:
            for alt in ("answer", "correct"):
                if alt in q:
                    q["correctAnswer"] = normalize_text(q.pop(alt))
                    modified = True
                    break
        else:
            q["correctAnswer"] = normalize_text(q.get("correctAnswer"))

        # rename options -> distractors
        if "options" in q:
            q["distractors"] = q.pop("options")
            modified = True

        # ensure distractors is a list of trimmed strings
        distractors = []
        if "distractors" in q and isinstance(q["distractors"], list):
            distractors = [normalize_text(d) for d in q["distractors"]]
        elif "distractors" in q and q["distractors"] is not None:
            # sometimes stored as semicolon-separated string
            distractors = [normalize_text(x) for x in str(q["distractors"]).split(";")]

        distractors = [d for d in distractors if d]

        # remove any distractor equal to correctAnswer
        correct = q.get("correctAnswer", "")
        filtered = [d for d in distractors if d != correct]
        # de-duplicate while preserving order
        filtered = unique_preserve_order(filtered)
        q["distractors"] = filtered
        # If correct answer is empty, try to salvage from remaining options (take first)
        if not correct and filtered:
            q["correctAnswer"] = filtered.pop(0)
            modified = True

        # ensure difficulty is integer 1..5
        q["difficulty"] = coerce_difficulty(q.get("difficulty"))

        # ensure topic is array
        q["topic"] = ensure_topic_array(q.get("topic"))

        if modified:
            changed += 1

    return changed


def main():
    files = glob.glob("src/_data/*.json")
    summary = {}
    for filepath in files:
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Failed to load {filepath}: {e}")
            continue

        changed = process_questions(data, filepath)
        try:
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Failed to write {filepath}: {e}")
            continue

        summary[os.path.basename(filepath)] = changed

    print("\nUpdate summary:")
    for fn, c in summary.items():
        print(f"  {fn}: {c} question(s) normalized")


if __name__ == "__main__":
    main()
