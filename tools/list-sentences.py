#!/usr/bin/env python3
"""Print every sentence the game can produce, so a person can read them all.

Run:  python3 tools/list-sentences.py          (all topics)
      python3 tools/list-sentences.py animals  (one topic)
"""
import json, os, re, sys, itertools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
index = json.load(open(os.path.join(ROOT, "data", "topics.json")))
wanted = sys.argv[1:] or [t["id"] for t in index["topics"]]

TOKEN = re.compile(r"\(([^)]*)\)|'([^']*)'")

def sentences(pattern):
    slots = []
    for group, lone in TOKEN.findall(pattern["shape"]):
        slots.append([o.strip().strip("'") for o in group.split("|")] if group else [lone])
    end = pattern.get("end", ["."])
    for combo in itertools.product(*slots):
        s = " ".join(combo)
        yield s[0].upper() + s[1:] + end[0]

total = 0
for entry in index["topics"]:
    if entry["id"] not in wanted:
        continue
    pack = json.load(open(os.path.join(ROOT, "data", entry["file"])))
    lines = [s for p in pack["patterns"] for s in sentences(p)]
    total += len(lines)
    print("\n=== %s  (%d sentences) ===" % (pack["name"], len(lines)))
    for s in lines:
        print("  " + s)
print("\n%d sentences in total." % total)
