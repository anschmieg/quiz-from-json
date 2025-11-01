import json

# Load the JSON
with open("src/_data/patched_stack.json", "r") as f:
    data = json.load(f)

# Difficulty mapping
diff_map = {"very easy": 1, "easy": 2, "medium": 3, "hard": 4, "very hard": 5}

# Update each question
for q in data["questions"]:
    # Rename options to distractors
    if "options" in q:
        q["distractors"] = q.pop("options")

    # Update difficulty
    if "difficulty" in q and q["difficulty"] in diff_map:
        q["difficulty"] = diff_map[q["difficulty"]]

    # Update topic to array
    if "topic" in q and isinstance(q["topic"], str):
        # Split by ; : – and strip
        topics = [
            t.strip()
            for t in q["topic"].replace("–", "-").replace(":", ";").split(";")
            if t.strip()
        ]
        q["topic"] = topics

# Save the updated JSON
with open("src/_data/patched_stack.json", "w") as f:
    json.dump(data, f, indent=2)

print("Updated JSON to match new schema.")
