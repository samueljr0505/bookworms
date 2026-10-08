#!/usr/bin/env python3
"""Build the topic packs from hand-written sentence templates.

Every sentence the game can produce is written out here by hand. A template is
a sentence with a few interchangeable choices, and the choices are picked so
that EVERY combination reads correctly - that is the whole point. There are no
meaning rules to get wrong, because nothing is inferred: if a sentence can
appear in the game, a person wrote it.

The trade is variety. A topic offers a few hundred sentences rather than
millions, so players will see repeats. That is the right trade for a classroom:
a child never meets a sentence an adult has not read first.

Run:  python3 tools/build-topics.py
It writes data/topics/*.json and prints how many sentences each topic can make.
"""
import itertools
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "topics")

# --------------------------------------------------------------- vocabulary
# Each word is filed under its part of speech once, for colour and for the
# legend. The same word may appear in several topics.
POS_OF = {}


def pos(name, words):
    for w in words.split():
        POS_OF[w] = name


pos("determiner", "a an the this that my our your")
pos("adjective", "big small brown grey fluffy hungry sleepy noisy quick slow "
                 "warm cold fresh sweet tall old new happy")
pos("noun", "cat dog rabbit bird bee horse fish frog duck mouse puppy kitten "
            "garden pond field barn nest tree branch pool "
            "teacher student class desk book pencil bag door window bell "
            "playground library gym lunchbox backpack chair board "
            "apple bread soup rice cheese carrot banana cookie pizza milk "
            "water juice plate bowl spoon kitchen table lunch breakfast dinner")
pos("verb", "made ran jumped slept barked sang flew swam hopped climbed rested "
            "runs jumps sleeps barks sings flies swims hops climbs rests "
            "read wrote drew listened waited studied packed opened closed rang "
            "reads writes draws listens waits studies packs opens closes rings "
            "ate cooked baked poured washed shared tasted stirred "
            "eats cooks bakes pours washes shares tastes stirs")
pos("preposition", "in on under over by near into")
pos("adverb", "quickly slowly quietly loudly carefully together")
pos("conjunction", "and but so")
pos("pronoun", "it they we")
pos("question", "where what")
pos("be", "is are was were")

FAMILIES = {
    "determiner":  {"label": "Determiner",  "hint": "a, the, my",                 "color": "#9aa7d7", "role": "other"},
    "adjective":   {"label": "Adjective",   "hint": "describes a noun: big, red", "color": "#f2a65a", "role": "describing"},
    "noun":        {"label": "Noun",        "hint": "a person, place, or thing",  "color": "#5ec4a3", "role": "naming"},
    "pronoun":     {"label": "Pronoun",     "hint": "stands for a noun: it, they", "color": "#8fd694", "role": "naming"},
    "verb":        {"label": "Verb",        "hint": "an action or a state",       "color": "#e9797a", "role": "action"},
    "adverb":      {"label": "Adverb",      "hint": "describes a verb: slowly",   "color": "#c79ae0", "role": "other"},
    "preposition": {"label": "Preposition", "hint": "shows where: under, near",   "color": "#72b6e8", "role": "other"},
    "conjunction": {"label": "Conjunction", "hint": "joins ideas: and, but, so",  "color": "#e7c35a", "role": "other"},
    "question":    {"label": "Question Word", "hint": "where, what",              "color": "#7fb0c9", "role": "other"},
}

# ------------------------------------------------------------------ topics
# A template is plain text. {a|b|c} is a choice. Every combination has been
# read and makes sense - that is the contract. Keep choices in a slot the same
# kind of thing, or the contract breaks.
TOPICS = {
    "animals": {
        "name": "Animals",
        "emoji": "🐾",
        "templates": [
            "the {cat|dog|rabbit|duck} {ran|jumped|hopped} {quickly|slowly|quietly}",
            "the {cat|dog|rabbit|duck} slept {quietly|outside|inside}",
            "a {small|big|fluffy} {puppy|kitten|rabbit} slept {under|near} the {barn|tree}",
            "the {hungry|sleepy|quick} {cat|dog|horse} {ran|rested} {in|near} the {field|garden}",
            "a {bird|bee|duck} flew [{over|near} the {pond|garden|tree}]",
            "the {fish|frog} swam {in|under} the {pond|pool}",
            "a {brown|grey|small} {mouse|rabbit} hopped {into|under} the {nest|barn}",
            "the {dog|puppy} barked {loudly|quietly} [and the {cat|kitten} ran {away|inside}]",
            "where {is|was} the {cat|dog|bird}",
            "the {bird|duck} {sings|sleeps} [{in|on} a {tree|branch}]",
            "my {dog|cat|rabbit} {is|was} {hungry|sleepy|happy}",
        ],
    },
    "school": {
        "name": "School",
        "emoji": "🎒",
        "templates": [
            "the {teacher|student} {read|wrote|drew} [{quickly|slowly|carefully}]",
            "a {student|teacher} opened the {book|door|window}",
            "the {class|student} {listened|waited} {quietly|carefully}",
            "my {book|pencil|bag} {is|was} {new|old|big}",
            "the {bell} rang {loudly|quietly}",
            "the teacher {opened|closed} the {door|window|book}",
            "a {student|teacher} packed the {lunchbox|backpack|bag}",
            "the {class|student} studied [{in|near} the {library|gym|playground}]",
            "where {is|was} my {book|pencil|bag}",
            "the {student|class} {reads|writes} {quietly|together}",
            "a {tall|small|new} {desk|chair|board} {is|was} {in|near} the {class|library}",
        ],
    },
    "food": {
        "name": "Food",
        "emoji": "🍎",
        "templates": [
            "the {cook|teacher|student} {baked|cooked} {bread|soup|rice}",
            "a {student|teacher} ate the {apple|banana|cookie} [{quickly|slowly}]",
            "the {soup|rice|milk} {is|was} {warm|cold|fresh}",
            "we {washed|shared} the {apple|carrot|plate} {carefully|together}",
            "a {small|big|fresh} {apple|carrot|cookie} {is|was} {on|in} the {plate|bowl}",
            "the {cook|student} poured {milk|water|juice} {into|in} a {bowl|plate}",
            "they {cooked|made} {pizza|soup|rice} {in|near} the {kitchen}",
            "they baked {bread|cookies} {in|near} the {kitchen}",
            "where {is|was} my {lunch|breakfast|dinner}",
            "the {cheese|bread|pizza} {tastes|tasted} {sweet|fresh|warm}",
            "we {ate|shared} {lunch|breakfast|dinner} {together|quietly}",
        ],
    },
}

# a few words only the templates use
pos("noun", "cook cookies")
pos("adverb", "away inside outside")

# parts of speech that share a family (and so one legend row, one colour)
FAMILY_OF = {"be": "verb"}

CHOICE = re.compile(r"\{([^}]*)\}")
OPTIONAL = re.compile(r"\[([^\]]*)\]")


def variants(template):
    """A template with [an optional ending] stands for both forms."""
    m = OPTIONAL.search(template)
    if not m:
        return [template]
    without = (template[:m.start()] + template[m.end():])
    with_it = (template[:m.start()] + m.group(1) + template[m.end():])
    out = []
    for v in (without, with_it):
        out.extend(variants(" ".join(v.split())))
    return out


def expand(template):
    """Every sentence a template can make."""
    parts, slots = [], []
    last = 0
    for m in CHOICE.finditer(template):
        parts.append(template[last:m.start()])
        slots.append(m.group(1).split("|"))
        last = m.end()
    parts.append(template[last:])

    out = []
    for combo in itertools.product(*slots) if slots else [()]:
        text = ""
        for i, piece in enumerate(parts):
            text += piece
            if i < len(combo):
                text += combo[i]
        out.append(" ".join(text.split()))
    return out


def shape_of(template):
    """Turn a template into the pack's shape syntax, all literals."""
    out = []
    for token in template.split():
        m = CHOICE.fullmatch(token)
        if m:
            opts = " | ".join("'%s'" % o for o in m.group(1).split("|"))
            out.append("( %s )" % opts)
        else:
            out.append("'%s'" % token)
    return " ".join(out)


def words_in(templates):
    used = set()
    for t in templates:
        for token in t.split():
            m = CHOICE.fullmatch(token)
            used.update(m.group(1).split("|") if m else [token])
    return used


def build():
    os.makedirs(OUT, exist_ok=True)
    index, total = [], 0

    for tid, topic in TOPICS.items():
        used = words_in([v for t in topic["templates"] for v in variants(t)])
        unknown = sorted(w for w in used if w not in POS_OF)
        if unknown:
            raise SystemExit("%s: words with no part of speech: %s" % (tid, unknown))

        words = {}
        for w in sorted(used):
            words.setdefault(POS_OF[w], []).append(w)

        patterns = []
        count = 0
        flat = [v for t in topic["templates"] for v in variants(t)]
        for i, t in enumerate(flat):
            n = len(expand(t))
            count += n
            patterns.append({
                "id": "%s-%d" % (tid, i + 1),
                "name": "Sentence %d" % (i + 1),
                "end": ["?"] if t.startswith("where ") else [".", "!"],
                "shape": shape_of(t),
            })

        # Every sentence, written out. The game validates against this list,
        # so it never has to work out whether something makes sense - a person
        # already did, when they wrote the template.
        sentences = []
        for i, t in enumerate(flat):
            end = ["?"] if t.startswith("where ") else [".", "!"]
            for text in expand(t):
                sentences.append({"words": text.split(), "end": end})

        pack = {
            "id": tid,
            "name": topic["name"],
            "emoji": topic["emoji"],
            "description": "%d sentences, every one written and checked by hand."
                           % count,
            "sentenceCount": count,
            "families": {k: v for k, v in FAMILIES.items()
                         if any(FAMILY_OF.get(POS_OF[w], POS_OF[w]) == k for w in used)},
            "pos": {p: {"label": FAMILIES[FAMILY_OF.get(p, p)]["label"],
                        "hint": FAMILIES[FAMILY_OF.get(p, p)]["hint"],
                        "color": FAMILIES[FAMILY_OF.get(p, p)]["color"],
                        "family": FAMILY_OF.get(p, p)}
                    for p in words},
            "words": words,
            "sentences": sentences,
            "patterns": patterns,
            "punctuation": [
                {"mark": ".", "name": "period"},
                {"mark": "!", "name": "exclamation point"},
                {"mark": "?", "name": "question mark"},
            ],
        }
        with open(os.path.join(OUT, tid + ".json"), "w") as f:
            json.dump(pack, f, indent=2, ensure_ascii=False)

        index.append({"id": tid, "name": topic["name"], "emoji": topic["emoji"],
                      "file": "topics/%s.json" % tid, "sentences": count})
        total += count
        print("%-10s %4d sentences  from %d templates  (%d words)"
              % (topic["name"], count, len(flat), len(used)))

    with open(os.path.join(ROOT, "data", "topics.json"), "w") as f:
        json.dump({"defaultTopic": index[0]["id"], "topics": index}, f, indent=2)
    print("%-10s %4d sentences total" % ("ALL", total))


if __name__ == "__main__":
    build()
