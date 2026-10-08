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

    for pattern in pack["patterns"]:
        print("\n  %s   [%s]" % (pattern["name"], pattern["shape"]))
        seen = set()
        while len(seen) < howmany // len(pack["patterns"]):
            picked = []
            # The game refuses a content word that is already in the sentence
            # ("My quick puppy is quick"), so the sample has to as well - or it
            # shows sentences the game would never let anyone build.
            content = {"noun", "adjective", "verb", "linking"}
            used = set()
            for token in pattern["shape"].split():
                optional = token.endswith("?")
                pos = token[:-1] if optional else token
                if optional and random.random() < 0.4:
                    continue
                choices = pack["words"][pos]
                if pos in content:
                    choices = [w for w in choices if w not in used] or choices
                word = random.choice(choices)
                if pos in content:
                    used.add(word)
                picked.append(word)
            # "a apple" -> "an apple"
            for i, w in enumerate(picked[:-1]):
                if w == "a" and picked[i + 1][0] in VOWELS:
                    picked[i] = "an"
            s = " ".join(picked)
            s = s[0].upper() + s[1:] + random.choice(pattern["end"])
            seen.add(s)
        for s in sorted(seen):
            print("    " + s)
