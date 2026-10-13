#!/usr/bin/env python3
"""Show what each topic can produce, for a person to check.

Every word of a kind is interchangeable with every other, so the full list is
tens of thousands of sentences and nobody is going to read that. What matters
instead is the word lists - if they are right, every combination is right - so
this prints them, then a random sample that mixes them freely. A bad word
shows up in the sample fast, because it is paired with everything.

Run:  python3 tools/list-sentences.py [topic] [howmany]
"""
import json, os, random, sys

import shapes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
index = json.load(open(os.path.join(ROOT, "data", "topics.json")))
wanted = [a for a in sys.argv[1:] if not a.isdigit()] or [t["id"] for t in index["topics"]]
howmany = next((int(a) for a in sys.argv[1:] if a.isdigit()), 40)
VOWELS = "aeiou"

for entry in index["topics"]:
    if entry["id"] not in wanted:
        continue
    pack = json.load(open(os.path.join(ROOT, "data", entry["file"])))
    print("\n=== %s  (%d possible sentences) ===" % (pack["name"], pack["sentenceCount"]))

    print("\n  the words, which are what actually need checking:")
    for pos in sorted(pack["words"]):
        label = pack["pos"][pos]["label"]
        print("    %-11s %s" % (label + ":", ", ".join(pack["words"][pos])))

    kind_of = {w: pos for pos, ws in pack["words"].items() for w in ws}
    content = {pos for pos, info in pack["pos"].items()
               if info["family"] in ("noun", "adjective", "verb") and pos != "be"}
    for pattern in pack["patterns"]:
        print("\n  %s   [%s]" % (pattern["name"], pattern["shape"]))
        tree = shapes.parse(pattern["shape"], pack.get("rules"))
        seen, tries = set(), 0
        while len(seen) < howmany // len(pack["patterns"]) and tries < 5000:
            tries += 1
            # words spelled out in a shape ('sweet') still belong to a kind
            picked = [(w, pos or kind_of[w]) for w, pos in shapes.sample(tree, pack["words"])]
            # The checker refuses a content word that is already in the sentence
            # ("My quick puppy is quick"), so the sample skips those too - or it
            # shows sentences the game would never pass.
            used = [w for w, pos in picked if pos in content]
            if len(used) != len(set(used)):
                continue
            words = [w for w, _ in picked]
            # "a apple" -> "an apple"
            for i, w in enumerate(words[:-1]):
                if w in ("a", "A") and words[i + 1][0].lower() in VOWELS:
                    words[i] = "An" if w == "A" else "an"
            seen.add(" ".join(words) + random.choice(pattern["end"]))
        for s in sorted(seen):
            print("    " + s)
