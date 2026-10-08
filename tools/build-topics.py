#!/usr/bin/env python3
"""Build the topic packs.

The rule that makes this work: within a topic, every word of a kind is
interchangeable with every other word of that kind. If the game asks for a
noun, ANY noun in the topic is a correct answer - which is the only honest
thing to do when the screen says "Noun".

That puts the burden on the word lists rather than on the sentences. A topic's
nouns all have to be able to do its verbs, and its adjectives all have to be
able to describe its nouns. So each list is kept narrow and coherent: the
Animals nouns are all animals that walk about, and because food does not run
anywhere, the Food topic describes things instead of having them act.

A bad word shows up immediately, because tools/list-sentences.py samples
across every combination rather than along a few fixed templates.

Run:  python3 tools/build-topics.py
"""
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "topics")

# The five kinds of word a sentence is built from, plus the punctuation that
# closes it. Real grammatical names, because that is what is being taught.
FAMILIES = {
    "determiner": {"label": "Determiner", "hint": "starts the sentence: A, The, My",
                   "color": "#9aa7d7", "role": "other"},
    "adjective":  {"label": "Adjective", "hint": "describes a noun: big, grey",
                   "color": "#f2a65a", "role": "describing"},
    "noun":       {"label": "Noun", "hint": "a person, place, or thing",
                   "color": "#5ec4a3", "role": "naming"},
    "verb":       {"label": "Verb", "hint": "what happens: ran, is",
                   "color": "#e9797a", "role": "action"},
    "adverb":     {"label": "Adverb", "hint": "how it happened: slowly",
                   "color": "#c79ae0", "role": "other"},
}
# "be" and "linking" are verbs as far as a player is concerned; they are held
# apart only so a structure can ask for one of them specifically.
FAMILY_OF = {"be": "verb", "linking": "verb"}

TOPICS = {
    "animals": {
        "name": "Animals",
        "emoji": "\U0001F43E",
        # every noun is an animal that can do every one of these verbs
        "words": {
            "determiner": ["A", "The", "My"],
            "adjective": ["big", "small", "brown", "grey", "fluffy",
                          "hungry", "sleepy", "quick", "noisy", "happy"],
            "noun": ["cat", "dog", "rabbit", "duck", "horse",
                     "mouse", "puppy", "kitten", "fox", "bird"],
            "verb": ["ran", "jumped", "walked", "played", "ate", "moved", "hid"],
            "be": ["is", "was"],
            "adverb": ["quickly", "slowly", "quietly"],
        },
        "structures": [
            ("doing",      "determiner adjective? noun verb adverb?"),
            ("describing", "determiner adjective? noun be adjective"),
        ],
    },
    "school": {
        "name": "School",
        "emoji": "\U0001F392",
        # people only, so every noun can do every verb
        "words": {
            "determiner": ["A", "The", "My"],
            "adjective": ["new", "old", "tall", "small", "quiet",
                          "noisy", "happy", "busy", "kind", "clever"],
            "noun": ["teacher", "student", "class", "boy", "girl",
                     "friend", "reader", "writer", "helper", "painter"],
            "verb": ["read", "wrote", "listened", "waited",
                     "studied", "walked", "worked", "smiled"],
            "be": ["is", "was"],
            "adverb": ["quickly", "slowly", "quietly", "carefully"],
        },
        "structures": [
            ("doing",      "determiner adjective? noun verb adverb?"),
            ("describing", "determiner adjective? noun be adjective"),
        ],
    },
    "food": {
        "name": "Food",
        "emoji": "\U0001F34E",
        # food does not run about, so this topic describes rather than acts
        "words": {
            "determiner": ["A", "The", "My"],
            "adjective": ["warm", "cold", "fresh", "sweet", "soft",
                          "big", "small", "sticky", "tasty"],
            "noun": ["soup", "bread", "rice", "apple", "cookie",
                     "pizza", "cheese", "carrot", "pancake", "pie"],
            "linking": ["tastes", "tasted", "looks", "looked",
                        "smells", "smelled"],
            "be": ["is", "was"],
        },
        "structures": [
            ("tasting",    "determiner adjective? noun linking adjective"),
            ("describing", "determiner adjective? noun be adjective"),
        ],
    },
}


def count(words, shape):
    """How many sentences a structure can make."""
    n = 1
    for token in shape.split():
        optional = token.endswith("?")
        pos = token[:-1] if optional else token
        choices = len(words.get(pos, []))
        n *= choices + 1 if optional else choices
    return n


def build():
    os.makedirs(OUT, exist_ok=True)
    index, grand = [], 0

    for tid, topic in TOPICS.items():
        words = topic["words"]
        total = sum(count(words, shape) for _, shape in topic["structures"])
        used_pos = sorted(words)

        pack = {
            "id": tid,
            "name": topic["name"],
            "emoji": topic["emoji"],
            "description": "Any word of the right kind fits, so there is never "
                           "one secret answer.",
            "sentenceCount": total,
            "families": {k: v for k, v in FAMILIES.items()
                         if any(FAMILY_OF.get(p, p) == k for p in used_pos)},
            "pos": {p: {"label": FAMILIES[FAMILY_OF.get(p, p)]["label"],
                        "hint": FAMILIES[FAMILY_OF.get(p, p)]["hint"],
                        "color": FAMILIES[FAMILY_OF.get(p, p)]["color"],
                        "family": FAMILY_OF.get(p, p)}
                    for p in used_pos},
            "words": words,
            "patterns": [{"id": "%s-%s" % (tid, name),
                          "name": name.capitalize() + " sentence",
                          "end": [".", "!"],
                          "shape": shape}
                         for name, shape in topic["structures"]],
            "punctuation": [
                {"mark": ".", "name": "period"},
                {"mark": "!", "name": "exclamation point"},
            ],
        }
        with open(os.path.join(OUT, tid + ".json"), "w") as f:
            json.dump(pack, f, indent=2, ensure_ascii=False)

        index.append({"id": tid, "name": topic["name"], "emoji": topic["emoji"],
                      "file": "topics/%s.json" % tid, "sentences": total})
        grand += total
        print("%-9s %7d sentences   %2d words across %d kinds"
              % (topic["name"], total, sum(len(v) for v in words.values()),
                 len(words)))

    with open(os.path.join(ROOT, "data", "topics.json"), "w") as f:
        json.dump({"defaultTopic": index[0]["id"], "topics": index}, f, indent=2)
    print("%-9s %7d sentences in total" % ("ALL", grand))


if __name__ == "__main__":
    build()
