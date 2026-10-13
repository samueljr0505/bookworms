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

Where a word only fits SOME of its kind, the shape says so instead of the
word list. "The cookie tasted big" is a perfectly good Determiner Noun Verb
Adjective - but big is a size, not a taste. So in the Food topic "tastes" is
followed only by taste words, spelled out in the topic's "rules", and rice,
bread, cheese and soup - which cannot be counted - never take "A". The checker
(js/checker.js) explains a word that is the right kind but does not fit:
""big" does not go with "tasted"".

And some pairs of words just cannot share a sentence, whatever the shape:
"The small reader is tall", "The quick fox ran slowly", "The student waited
quickly". Each topic lists those as "clashes" - two words and the reason - and
the checker turns one down with that reason.

A bad word shows up immediately, because tools/list-sentences.py samples
across every combination rather than along a few fixed templates.

Run:  python3 tools/build-topics.py
"""
import json
import os

import shapes

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
# Held apart only so a structure can ask for one of them specifically; to a
# player they are just Verbs, or just Nouns.
FAMILY_OF = {"be": "verb", "linking": "verb", "taste": "verb", "smell": "verb",
             "look": "verb", "mass": "noun"}

# Said by the checker when a word of the right kind still does not fit, because of
# something about that word itself. {word} is the word.
# A note only applies when one of the `after` words comes earlier in the sentence.
NOTES = {
    "mass": {"after": ["A"],
             "text": '"{word}" is not something you can count, so it goes with "The" '
                     'or "My", not "A".'},
}

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
        "clashes": [
            ["big", "small", "something cannot be big and small at once"],
            ["brown", "grey", "an animal cannot be two colours at once"],
            ["quick", "slowly", "quick and slow mean opposite things"],
            ["sleepy", "quick", "a sleepy animal is not quick"],
            ["noisy", "quietly", "noisy and quiet mean opposite things"],
            ["sleepy", "noisy", "a sleepy animal is not noisy"],
        ],
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
            "noun": ["teacher", "student", "classmate", "boy", "girl",
                     "friend", "reader", "writer", "helper", "painter"],
            "verb": ["read", "wrote", "listened", "waited",
                     "studied", "walked", "worked", "smiled"],
            "be": ["is", "was"],
            "adverb": ["quickly", "slowly", "quietly", "carefully"],
        },
        "clashes": [
            ["tall", "small", "someone cannot be tall and small at once"],
            ["old", "new", "old and new mean opposite things"],
            ["old", "boy", "a boy is young, not old"],
            ["old", "girl", "a girl is young, not old"],
            ["quiet", "noisy", "quiet and noisy mean opposite things"],
            ["noisy", "quietly", "noisy and quiet mean opposite things"],
            ["listened", "quickly", "listening is not something you hurry"],
            ["listened", "slowly", "you listen carefully or quietly, not slowly"],
            ["waited", "quickly", "waiting is not something you can hurry"],
            ["waited", "slowly", "you wait quietly, not slowly"],
            ["waited", "carefully", "you wait quietly, not carefully"],
            ["smiled", "carefully", "a smile is not something you do carefully"],
        ],
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
            # things you can count: "an apple", "a pie"
            "noun": ["apple", "cookie", "pizza", "carrot", "pancake", "pie"],
            # things you cannot: "the rice", never "a rice"
            "mass": ["soup", "bread", "rice", "cheese"],
            "taste": ["tastes", "tasted"],
            "smell": ["smells", "smelled"],
            "look": ["looks", "looked"],
            "be": ["is", "was"],
        },
        "rules": {
            "count": "determiner adjective? noun",
            # rice, soup, bread and cheese: "The" or "My", never "A", and not a size
            "stuff": "( 'The' | 'My' ) <stuffWord>? mass",
            "start": "<count> | <stuff>",
            "stuffWord": "'warm' | 'cold' | 'fresh' | 'sweet' | 'soft' | 'sticky' | 'tasty'",
            # a size or a feel is not a taste or a smell - "tasted big" never fits
            "tasteWord": "'sweet' | 'fresh' | 'warm' | 'cold'",
            "smellWord": "'sweet' | 'fresh' | 'tasty'",
        },
        "clashes": [
            ["warm", "cold", "something cannot be warm and cold at once"],
            ["big", "small", "something cannot be big and small at once"],
        ],
        "structures": [
            ("tasting",    "<start> taste <tasteWord>"),
            ("smelling",   "<start> smell <smellWord>"),
            ("looking",    "<count> look adjective | <stuff> look <stuffWord>"),
            ("describing", "<count> be adjective | <stuff> be <stuffWord>"),
        ],
    },
}


def build():
    os.makedirs(OUT, exist_ok=True)
    index, grand = [], 0

    for tid, topic in TOPICS.items():
        words = topic["words"]
        rules = topic.get("rules", {})
        total = sum(shapes.count(shapes.parse(shape, rules), words)
                    for _, shape in topic["structures"])
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
                        "family": FAMILY_OF.get(p, p),
                        **({"note": NOTES[p]} if p in NOTES else {})}
                    for p in used_pos},
            "words": words,
            **({"rules": rules} if rules else {}),
            **({"clashes": topic["clashes"]} if topic.get("clashes") else {}),
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
