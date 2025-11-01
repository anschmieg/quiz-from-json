import json
import os
import statistics

cwd = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.dirname(cwd))

p = "src/_data/patched_stack.json"
qs = (
    json.load(open(p))["questions"]
    if isinstance(json.load(open(p)), dict)
    else json.load(open(p))
)
flags = []
for q in qs:
    opts = q.get("options", [])
    ca = q.get("correctAnswer")
    if not isinstance(opts, list) or len(opts) < 2 or ca not in opts:
        continue
    lens = [len(o) for o in opts]
    med = statistics.median(lens)
    clen = len(ca)
    if med > 0 and clen > 1.125 * med:
        flags.append((q["id"], clen, med))
print("Length-cue suspects (correct >> median):", len(flags))
for r in flags[:20]:
    print(r)
