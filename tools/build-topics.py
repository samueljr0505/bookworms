#!/usr/bin/env python3
"""Build the topic packs.

Every topic shares ONE grammar, built from the blocks of a sentence:

    Subject     a Noun (with a Determiner, and maybe an Adjective) or a Pronoun
                    "The brave knight", "She"
    Verb        what happens, or was / were
                    "flew", "found", "was"
    Object      optional - who or what the action is done to; giving verbs take two
                    "found the map", "gave him a sword", "gave a sword to the elf"
    Complement  after was / were (or tastes, looks) - what the subject is like
                    "was a wise wizard", "was in the tower", "tastes sweet"
    Modifiers   optional - an Adverb (before or after the verb), or a Preposition
                    and a place
                    "quickly", "into the dark cave"

The worm only eats a word that keeps the sentence on one of these shapes, and the game's
strip shows each word in its block (each structure's `blocks` list names the optional ones).

So a student is never limited to one recipe: "The dragon flew.", "The dragon
quickly flew over the old castle.", "She gave the knight a golden sword." and
"The wizard was wise." are all sentences of the same topic. Topics differ only
in their WORDS, which keeps them manageable: add a topic by writing word lists.

The words still have to fit together, and that is where the care goes:

- A word only fits where its kind says it fits. Beings ("noun") do things;
  things ("thing") get carried, found and given; places ("place") come after a
  Preposition. Verbs are split by what they need: moving verbs go somewhere
  ("ran into the cave"), staying verbs stay ("slept in the cave"), and verbs
  that take an object take the right kind of one ("kicked the ball", never
  "kicked the coach"). Adjectives are split the same way: "mood" words describe
  beings (brave, sleepy), "quality" words describe things (shiny, sweet), and
  plain "adjective" words describe anything (big, old).
- Pairs of words that cannot share a sentence are listed as "clashes", with the
  reason the child is told: "The small reader is tall", "swam into the gym".
- The checker (js/checker.js) explains a word that is the right kind but does
  not fit (""big" does not go with "tasted"") when the worm refuses it.

A bad word shows up immediately, because tools/list-sentences.py samples across
every combination. Read a sample after any change, and add a clash for anything
that reads wrong.

Run:  python3 tools/build-topics.py
"""
import json
import os

import shapes

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "topics")

# The kinds of word a sentence is built from, plus the punctuation that closes
# it. Real grammatical names, because that is what is being taught.
FAMILIES = {
    "determiner":  {"label": "Determiner", "hint": "comes before a noun: The, a, my",
                    "color": "#9aa7d7", "role": "other"},
    "adjective":   {"label": "Adjective", "hint": "describes a noun: big, brave",
                    "color": "#f2a65a", "role": "describing"},
    "noun":        {"label": "Noun", "hint": "a person, place, or thing",
                    "color": "#5ec4a3", "role": "naming"},
    "pronoun":     {"label": "Pronoun", "hint": "takes a noun's place: he, them",
                    "color": "#7cc6e8", "role": "naming"},
    "verb":        {"label": "Verb", "hint": "what happens: ran, was",
                    "color": "#e9797a", "role": "action"},
    "adverb":      {"label": "Adverb", "hint": "how it happened: slowly",
                    "color": "#c79ae0", "role": "other"},
    "preposition": {"label": "Preposition", "hint": "where it happened: into, under",
                    "color": "#b8c97a", "role": "other"},
}

# Every list a topic can fill, and the kind of word a player sees it as.
FAMILY_OF = {
    "determiner": "determiner",
    "adjective": "adjective",     # describes anything: big, old
    "mood": "adjective",          # describes beings only: brave, sleepy
    "quality": "adjective",       # describes things only: shiny, sweet
    "noun": "noun",               # beings: they can be the subject
    "thing": "noun",              # things: carried, found, given
    "mass": "noun",               # things you cannot count: rice, soup
    "place": "noun",              # places: after a Preposition
    "subjectPronoun": "pronoun",  # He, She, I, They, We - start a sentence
    "objectPronoun": "pronoun",   # him, her, me, them, us - receive the action
    "move": "verb",               # ran: goes somewhere
    "stay": "verb",               # slept: stays put
    "take": "verb",               # carried: someone or something, can go somewhere
    "push": "verb",               # kicked: something only, can go somewhere
    "see": "verb",                # found: someone, something, or a place
    "use": "verb",                # ate: something only
    "give": "verb",               # gave: someone something, or something to someone
    "be": "verb",                 # was, were
    "taste": "verb", "smell": "verb", "look": "verb",
    "adverb": "adverb",
    "motionPrep": "preposition",  # into, toward: where something went
    "placePrep": "preposition",   # in, near: where something was
}

# Shared by every topic. A capital letter starts a sentence and a small one goes in the
# middle, so both are tiles - knowing which to use is part of the game.
DETERMINERS = ["The", "A", "My", "the", "a", "my"]
SUBJECT_PRONOUNS = ["He", "She", "I", "They", "We"]
OBJECT_PRONOUNS = ["him", "her", "me", "them", "us"]
BE = ["was", "were"]
SHARED_CLASHES = [
    ["quickly", "rested", "resting is slow, not quick"],
    ["quickly", "slept", "sleeping is not quick"],
    ["quickly", "sat", "sitting is not quick"],
    ["quickly", "waited", "waiting is not something you can hurry"],
    ["carefully", "saw", "you just see something - no care needed"],
    ["hurried", "slowly", "hurrying is fast, not slow"],
    ["I", "me", "say \"myself\" for that - or pick someone else"],
    ["We", "us", "say \"ourselves\" for that - or pick someone else"],
]

# Said by the checker when a word of the right kind still does not fit, because of
# something about that word itself. Only when one of the `after` words comes before it.
NOTES = {
    "mass": {"after": ["A", "a"],
             "text": '"{word}" is not something you can count, so it goes with "the" '
                     'or "my", not "a".'},
}


def grammar(words, extra_rules=None, extra_structures=()):
    """The shared rules and sentence shapes, for whichever lists a topic fills."""
    has = lambda *kinds: all(words.get(k) for k in kinds)
    either = lambda *kinds: " | ".join(k for k in kinds if words.get(k))
    rules = {}
    rules["beingWord"] = either("adjective", "mood")
    rules["being"] = "determiner <beingWord>? noun"
    rules["subjectOne"] = "<being> | 'He' | 'She' | 'I'"
    rules["subjectMany"] = "'They' | 'We'"
    rules["subject"] = "<subjectOne> | <subjectMany>"
    rules["someone"] = "<being> | objectPronoun"
    if has("thing"):
        rules["thingWord"] = either("adjective", "quality")
        rules["something"] = "determiner <thingWord>? thing" + (" | <mass>" if has("mass") else "")
    if has("mass"):
        rules["mass"] = "( 'The' | 'the' | 'My' | 'my' ) quality? mass"
    rules["takeTarget"] = "<someone> | <something>" if has("thing") else "<someone>"
    if has("thing"):
        rules["pushTarget"] = "<something>"   # a topic can narrow these: kicked -> a ball
        rules["useTarget"] = "<something>"
    rules["spot"] = "determiner adjective? place"
    rules["to"] = "motionPrep <spot>"
    rules["at"] = "placePrep <spot>"
    rules["where"] = "<to> | <at>"
    rules.update(extra_rules or {})

    # An Adverb can come before the verb or at the end - not both.
    def doing(verb, after):
        return ("<subject> ( adverb %s %s | %s %s adverb? )" % (verb, after, verb, after)).replace("  ", " ")

    structures = []
    if has("move"):
        structures.append(("moving", "Action sentence", ["Subject", "Verb", "Modifier?"],
                           doing("move", "<where>?")))
    if has("stay"):
        structures.append(("staying", "Action sentence", ["Subject", "Verb", "Modifier?"],
                           doing("stay", "<at>?")))
    if has("take"):
        structures.append(("taking", "Object sentence", ["Subject", "Verb", "Object", "Modifier?"],
                           doing("take", "<takeTarget> <where>?")))
    if has("push", "thing"):
        structures.append(("pushing", "Object sentence", ["Subject", "Verb", "Object", "Modifier?"],
                           doing("push", "<pushTarget> <where>?")))
    if has("see"):
        seen = "( ( <someone> | <something> ) <at>? | <spot> )" if has("thing") else "( <someone> <at>? | <spot> )"
        structures.append(("seeing", "Object sentence", ["Subject", "Verb", "Object", "Modifier?"],
                           doing("see", seen)))
    if has("use", "thing"):
        structures.append(("using", "Object sentence", ["Subject", "Verb", "Object", "Modifier?"],
                           doing("use", "<useTarget> <at>?")))
    if has("give", "thing"):
        structures.append(("giving", "Giving sentence", ["Subject", "Verb", "Object", "Object?"],
                           "<subject> adverb? give ( <someone> <something> | <something> ( 'to' <someone> )? )"))
    structures.append(("describing", "Describing sentence", ["Subject", "Verb", "Complement", "Modifier?"],
                       "<subjectOne> 'was' ( <beingWord> <at>? | 'a' <beingWord>? noun <at>? | <at> )"
                       " | <subjectMany> 'were' ( <beingWord> <at>? | <at> )"))
    if has("thing"):
        structures.append(("describing-things", "Describing sentence", ["Subject", "Verb", "Complement", "Modifier?"],
                           "determiner <thingWord>? thing 'was' ( <thingWord> <at>? | <at> )" +
                           (" | <mass> 'was' ( quality <at>? | <at> )" if has("mass") else "")))
    structures.extend(extra_structures)
    return rules, structures


# Grammar-only pronoun pairs: wrong in any mode ("I watched me").
GRAMMAR_CLASHES = [c for c in SHARED_CLASHES if c[0] in ("I", "We")]


def silly_grammar(words):
    """Silly mode: the same sentence shapes, with every word of a kind free to go anywhere
    that kind goes. Any Adjective describes anything, anything can be the subject, and any
    Noun can be carried, eaten or given - "The pencil ate the gym." sounds right, so it is
    right. Only the grammar is checked: capitals, word order, a / the with "rice", end marks."""
    has = lambda *kinds: all(words.get(k) for k in kinds)
    either = lambda *kinds: " | ".join(k for k in kinds if words.get(k))
    rules = {}
    rules["adj"] = either("adjective", "mood", "quality")
    rules["anyNoun"] = either("noun", "thing", "place")
    rules["one"] = "determiner <adj>? <anyNoun>"
    if has("mass"):
        rules["mass"] = "( 'The' | 'the' | 'My' | 'my' ) <adj>? mass"
    rules["anything"] = "<one> | <mass>" if has("mass") else "<one>"
    rules["subjectOne"] = "<anything> | 'He' | 'She' | 'I'"
    rules["subjectMany"] = "'They' | 'We'"
    rules["subject"] = "<subjectOne> | <subjectMany>"
    rules["someone"] = "<anything> | objectPronoun"
    rules["to"] = "motionPrep <someone>"
    rules["at"] = "placePrep <someone>"
    rules["where"] = "<to> | <at>"

    def doing(verb, after):
        return ("<subject> ( adverb %s %s | %s %s adverb? )" % (verb, after, verb, after)).replace("  ", " ")

    structures = []
    if has("move"):
        structures.append(("moving", "Action sentence", ["Subject", "Verb", "Modifier?"], doing("move", "<where>?")))
    if has("stay"):
        structures.append(("staying", "Action sentence", ["Subject", "Verb", "Modifier?"], doing("stay", "<at>?")))
    for kind, after in (("take", "<someone> <where>?"), ("push", "<someone> <where>?"),
                        ("see", "<someone> <at>?"), ("use", "<someone> <at>?")):
        if has(kind):
            structures.append((kind, "Object sentence", ["Subject", "Verb", "Object", "Modifier?"], doing(kind, after)))
    if has("give"):
        structures.append(("giving", "Giving sentence", ["Subject", "Verb", "Object", "Object?"],
                           "<subject> adverb? give ( <someone> <someone> | <someone> ( 'to' <someone> )? )"))
    linking = either("taste", "smell", "look")
    if linking:
        # "tastes" is singular, so no pronouns here: "I tastes sweet" is not English
        structures.append(("tasting", "Describing sentence", ["Subject", "Verb", "Complement"],
                           "<anything> ( %s ) <adj>" % linking))
    structures.append(("describing", "Describing sentence", ["Subject", "Verb", "Complement", "Modifier?"],
                       "<subjectOne> 'was' ( <adj> <at>? | 'a' <adj>? <anyNoun> <at>? | <at> )"
                       " | <subjectMany> 'were' ( <adj> <at>? | <at> )"))
    return rules, structures


TOPICS = {
    "animals": {
        "name": "Animals",
        "emoji": "\U0001F43E",
        "words": {
            "adjective": ["big", "small", "brown", "grey"],
            "mood": ["fluffy", "hungry", "sleepy", "quick", "noisy", "happy"],
            "noun": ["cat", "dog", "rabbit", "duck", "horse", "mouse", "puppy", "kitten", "fox", "bird"],
            "thing": ["bone", "ball", "stick", "carrot", "toy", "leaf"],
            "place": ["barn", "field", "pond", "garden", "tree", "hole", "nest"],
            "move": ["ran", "jumped", "walked", "hopped", "raced", "crawled"],
            "stay": ["hid", "slept", "played", "waited", "rested", "sat"],
            "take": ["carried", "chased", "followed"],
            "push": ["dropped", "pushed", "rolled"],
            "see": ["found", "watched", "smelled"],
            "use": ["chewed", "buried"],
            "give": ["brought", "gave"],
            "adverb": ["quickly", "slowly", "quietly", "happily"],
            "motionPrep": ["into", "across", "toward", "to", "through", "over"],
            "placePrep": ["in", "near", "under", "behind"],
        },
        "clashes": [
            ["big", "small", "something cannot be big and small at once"],
            ["brown", "grey", "it cannot be two colours at once"],
            ["quick", "slowly", "quick and slow mean opposite things"],
            ["sleepy", "quick", "a sleepy animal is not quick"],
            ["sleepy", "noisy", "a sleepy animal is not noisy"],
            ["noisy", "quietly", "noisy and quiet mean opposite things"],
            ["raced", "slowly", "racing is fast, not slow"],
            ["crawled", "quickly", "crawling is slow"],
            ["across", "tree", "you go up or into a tree, not across it"],
            ["across", "hole", "you go into a hole, not across it"],
            ["across", "nest", "a nest is too small to go across"],
            ["through", "tree", "you go up a tree, not through it"],
            ["through", "nest", "a nest is too small to go through"],
            ["under", "pond", "nothing is under a pond but mud"],
            ["under", "field", "you are on a field, not under it"],
            ["under", "garden", "you are in a garden, not under it"],
        ],
    },
    "school": {
        "name": "School",
        "emoji": "\U0001F392",
        "words": {
            "adjective": ["tall", "small", "new", "old"],
            "mood": ["happy", "busy", "kind", "clever", "quiet", "noisy", "tired"],
            "quality": ["red", "blue", "yellow"],
            "noun": ["teacher", "student", "classmate", "boy", "girl", "friend", "reader", "writer", "helper"],
            "thing": ["book", "pencil", "paper", "backpack", "crayon", "note"],
            "place": ["classroom", "library", "hallway", "gym", "playground", "desk", "office"],
            "move": ["walked", "ran", "hurried", "skipped"],
            "stay": ["waited", "smiled", "listened", "studied", "sat", "laughed"],
            "take": ["carried"],
            "push": ["dropped", "slid"],
            "see": ["found", "saw", "watched"],
            "use": ["read", "wrote", "opened"],
            "give": ["gave", "handed", "showed", "lent"],
            "adverb": ["quickly", "slowly", "quietly", "carefully", "happily"],
            "motionPrep": ["into", "to", "toward", "across", "through"],
            "placePrep": ["in", "near", "at", "behind"],
        },
        "clashes": [
            ["tall", "small", "someone cannot be tall and small at once"],
            ["old", "new", "old and new mean opposite things"],
            ["quiet", "noisy", "quiet and noisy mean opposite things"],
            ["noisy", "quietly", "noisy and quiet mean opposite things"],
            ["old", "boy", "a boy is young, not old"],
            ["old", "girl", "a girl is young, not old"],
            ["listened", "quickly", "listening is not something you hurry"],
            ["listened", "slowly", "you listen carefully or quietly, not slowly"],
            ["waited", "quickly", "waiting is not something you can hurry"],
            ["waited", "slowly", "you wait quietly, not slowly"],
            ["waited", "carefully", "you wait quietly, not carefully"],
            ["smiled", "carefully", "a smile is not something you do carefully"],
            ["read", "pencil", "you write with a pencil - you cannot read it"],
            ["read", "backpack", "you cannot read a backpack"],
            ["read", "crayon", "you draw with a crayon - you cannot read it"],
            ["wrote", "pencil", "you write WITH a pencil, not write a pencil"],
            ["wrote", "backpack", "you cannot write a backpack"],
            ["wrote", "crayon", "you write WITH a crayon, not write a crayon"],
            ["opened", "pencil", "a pencil does not open"],
            ["opened", "crayon", "a crayon does not open"],
            ["opened", "paper", "you open a book or a note, not a paper"],
            ["through", "desk", "you cannot go through a desk"],
            ["in", "desk", "things are at a desk or behind it, not in it"],
            ["red", "blue", "it cannot be two colours at once"],
            ["red", "yellow", "it cannot be two colours at once"],
            ["blue", "yellow", "it cannot be two colours at once"],
            ["into", "desk", "you cannot go into a desk"],
            ["across", "desk", "a desk is too small to go across"],
        ],
    },
    "food": {
        "name": "Food",
        "emoji": "\U0001F34E",
        "words": {
            "adjective": ["big", "small"],
            "mood": ["hungry", "happy", "busy", "tired", "kind"],
            "quality": ["warm", "cold", "fresh", "sweet", "soft", "sticky", "tasty", "crunchy"],
            "noun": ["chef", "baker", "farmer", "girl", "boy", "mom", "dad", "friend"],
            "thing": ["apple", "cookie", "pizza", "carrot", "pancake", "pie", "sandwich", "cake"],
            "mass": ["soup", "bread", "rice", "cheese"],
            "place": ["kitchen", "garden", "market", "bakery", "table"],
            "move": ["ran", "walked", "hurried"],
            "stay": ["waited", "sat", "smiled", "rested"],
            "take": ["carried"],
            "push": ["dropped", "tossed"],
            "see": ["found", "saw"],
            "use": ["ate", "baked", "cooked", "cut", "made"],
            "give": ["gave", "brought", "served"],
            "taste": ["tastes", "tasted"],
            "smell": ["smells", "smelled"],
            "look": ["looks", "looked"],
            "adverb": ["quickly", "slowly", "carefully", "happily"],
            "motionPrep": ["into", "to", "toward", "through"],
            "placePrep": ["in", "near", "at"],
        },
        # a size or a feel is not a taste or a smell - "tasted big" never fits
        "rules": {
            "tasteWord": "'sweet' | 'fresh' | 'warm' | 'cold'",
            "smellWord": "'sweet' | 'fresh' | 'tasty'",
            "food": "determiner <thingWord>? thing | <mass>",
        },
        "structures": [
            ("tasting", "Tasting sentence", ["Subject", "Verb", "Complement"], "<food> taste <tasteWord>"),
            ("smelling", "Tasting sentence", ["Subject", "Verb", "Complement"], "<food> smell <smellWord>"),
            ("looking", "Describing sentence", ["Subject", "Verb", "Complement"],
             "determiner <thingWord>? thing look <thingWord> | <mass> look quality"),
        ],
        "clashes": [
            ["warm", "cold", "something cannot be warm and cold at once"],
            ["big", "small", "something cannot be big and small at once"],
            ["soft", "crunchy", "soft and crunchy mean opposite things"],
            ["sticky", "crunchy", "sticky and crunchy do not go together"],
            ["crunchy", "rice", "rice is soft, not crunchy"],
            ["crunchy", "cheese", "cheese is soft, not crunchy"],
            ["baked", "soup", "soup is cooked, not baked"],
            ["baked", "rice", "rice is cooked, not baked"],
            ["cut", "soup", "you cannot cut soup"],
            ["cut", "rice", "you cannot cut rice"],
            ["tossed", "soup", "you cannot toss soup"],
            ["crunchy", "soup", "soup is never crunchy"],
            ["sticky", "carrot", "a carrot is not sticky"],
            ["in", "table", "things are on a table or at it, not in it"],
            ["into", "table", "you cannot go into a table"],
            ["through", "table", "you cannot go through a table"],
            ["sat", "market", "you walk around a market, not sit in it"],
        ],
    },
    "fantasy": {
        "name": "Fantasy",
        "emoji": "\U0001F409",
        "words": {
            "adjective": ["big", "tiny", "old", "golden", "magic"],
            "mood": ["brave", "wise", "sleepy", "angry", "kind", "grumpy"],
            "quality": ["shiny", "heavy", "secret"],
            "noun": ["knight", "dragon", "wizard", "princess", "giant", "elf", "troll", "unicorn"],
            "thing": ["sword", "map", "crown", "potion", "shield", "treasure", "wand"],
            "place": ["castle", "forest", "cave", "tower", "river", "mountain", "village"],
            "move": ["flew", "ran", "walked", "marched", "jumped", "crept"],
            "stay": ["slept", "waited", "hid", "laughed", "sang", "rested"],
            "take": ["carried", "followed", "chased"],
            "push": ["dropped", "threw"],
            "see": ["found", "saw", "guarded", "protected"],
            "use": ["held", "waved"],
            "give": ["gave", "showed", "sent"],
            "adverb": ["quickly", "slowly", "quietly", "bravely", "happily"],
            "motionPrep": ["into", "through", "across", "toward", "to", "over", "up"],
            "placePrep": ["in", "near", "under", "behind", "inside"],
        },
        "clashes": [
            ["big", "tiny", "something cannot be big and tiny at once"],
            ["angry", "happily", "an angry creature does nothing happily"],
            ["grumpy", "happily", "a grumpy creature does nothing happily"],
            ["sleepy", "quickly", "a sleepy creature is not quick"],
            ["crept", "quickly", "creeping is slow and quiet"],
            ["bravely", "slept", "sleeping takes no bravery"],
            ["bravely", "rested", "resting takes no bravery"],
            ["bravely", "laughed", "laughing takes no bravery"],
            ["bravely", "sang", "singing takes no bravery"],
            ["bravely", "saw", "seeing takes no bravery"],
            ["bravely", "showed", "showing takes no bravery"],
            ["bravely", "sent", "sending takes no bravery"],
            ["heavy", "map", "a map is not heavy"],
            ["heavy", "potion", "a potion is too small to be heavy"],
            ["heavy", "wand", "a wand is not heavy"],
            ["waved", "treasure", "you cannot wave treasure"],
            ["waved", "potion", "you drink a potion - you do not wave it"],
            ["up", "village", "you go into a village, not up it"],
            ["up", "forest", "you go into a forest, not up it"],
            ["up", "cave", "you go into a cave, not up it"],
            ["across", "tower", "you climb a tower, not go across it"],
            ["across", "cave", "you go into a cave, not across it"],
            ["under", "river", "you swim in a river, not under it"],
            ["under", "forest", "you are in a forest, not under it"],
            ["under", "village", "you are in a village, not under it"],
            ["inside", "river", "you are in a river, not inside it"],
        ],
    },
    "sports": {
        "name": "Sports",
        "emoji": "⚽",
        "words": {
            "adjective": ["big", "small", "new", "muddy", "wet"],
            "mood": ["fast", "strong", "tired", "happy", "proud", "nervous"],
            "quality": ["shiny", "heavy"],
            "noun": ["player", "coach", "runner", "swimmer", "goalie", "referee", "fan"],
            "thing": ["ball", "bat", "helmet", "trophy", "medal", "whistle", "glove"],
            "place": ["field", "court", "gym", "pool", "track", "net", "stadium"],
            "move": ["ran", "jumped", "raced", "swam", "slid", "dashed"],
            "stay": ["waited", "cheered", "rested", "clapped", "stretched", "laughed"],
            "take": ["chased", "followed"],
            "push": ["kicked", "rolled", "bounced", "hit", "caught"],
            "see": ["found", "watched", "guarded"],
            "use": ["held", "cleaned", "carried"],
            "give": ["threw", "passed", "handed", "gave"],
            "adverb": ["quickly", "slowly", "proudly", "carefully", "happily"],
            "motionPrep": ["into", "across", "toward", "to", "over", "around"],
            "placePrep": ["in", "near", "on", "at"],
        },
        # kicked, hit, bounced, rolled, caught: only a ball
        "rules": {"pushTarget": "determiner <thingWord>? 'ball'",
                  # chased, followed: a person or the ball
                  "takeTarget": "<someone> | determiner <thingWord>? 'ball'"},
        "clashes": [
            ["big", "small", "something cannot be big and small at once"],
            ["fast", "slowly", "fast and slow mean opposite things"],
            ["tired", "quickly", "a tired player is not quick"],
            ["raced", "slowly", "racing is fast, not slow"],
            ["dashed", "slowly", "dashing is fast, not slow"],
            ["swam", "field", "you cannot swim on a field"],
            ["swam", "court", "you cannot swim on a court"],
            ["swam", "gym", "you cannot swim in a gym"],
            ["swam", "track", "you cannot swim on a track"],
            ["swam", "stadium", "you swim in a pool, not a stadium"],
            ["swam", "net", "you cannot swim to a net"],
            ["swam", "on", "you swim in a pool, not on it"],
            ["muddy", "trophy", "a trophy is kept clean and shiny"],
            ["muddy", "medal", "a medal is kept clean and shiny"],
            ["heavy", "whistle", "a whistle is not heavy"],
            ["muddy", "shiny", "something muddy is not shiny"],
            ["wet", "shiny", "say wet or shiny - not both"],
            ["heavy", "glove", "a glove is not heavy"],
            ["heavy", "medal", "a medal is not heavy"],
            ["on", "pool", "you swim in a pool, not on it"],
            ["on", "gym", "you are in a gym, not on it"],
            ["on", "stadium", "you are in a stadium, not on it"],
            ["on", "net", "a ball goes into a net, not on it"],
            ["in", "track", "you run on a track, not in it"],
            ["around", "net", "the ball goes into the net, not around it"],
            ["cheered", "carefully", "cheering is loud, not careful"],
            ["clapped", "carefully", "clapping is loud, not careful"],
            ["laughed", "carefully", "laughing is not careful"],
            ["proudly", "rested", "resting is nothing to be proud of"],
            ["proudly", "waited", "waiting is nothing to be proud of"],
            ["proudly", "stretched", "stretching is nothing to be proud of"],
            ["proudly", "laughed", "you laugh happily, not proudly"],
            ["nervous", "proudly", "a nervous player is not proud"],
        ],
    },
}


# What makes sense in each topic, for Real mode (read by js/sense.js). The word lists above
# already keep beings, things and places apart; this says which ones go together:
#
#   tags        name groups of words, to use in the lists below
#   size        how big something is: 0 = you hold it, 1 = a mouse, 3 = a person, 5 = a giant
#   holds       the biggest size that fits in / into / inside / through / under a place
#               (a number, or {"under": 5, "*": 2} to say it per Preposition)
#   verbs       who can do it ("who"), what it can be done to ("what"), and for verbs like
#               carried, how much bigger than the doer the object may be ("bigger": -1 means
#               it has to be smaller). "base" says the verb plainly for the reason ("carry"),
#               and "why" is the reason a child is told when who or what does not fit.
#   adjectives  what an Adjective can describe, with the reason
#   canBe       "The boy was a ___": what each noun can be ("*" = any other noun)
#
# A list can name words or tags, and "!" rules one out. Every word is tagged with itself, and
# with "being", "thing" or "place". A word not mentioned is never blocked. After a change,
# read a sample with tools/list-sentences.py and add whatever still reads wrong.
MEANING = {
    "animals": {
        "tags": {"bird": ["bird", "duck"],
                 "digger": ["dog", "puppy", "fox"],
                 "chewer": ["cat", "dog", "rabbit", "horse", "mouse", "puppy", "kitten", "fox"]},
        "size": {"mouse": 1, "bird": 1, "kitten": 1, "duck": 2, "rabbit": 2, "puppy": 2, "cat": 2,
                 "fox": 2, "dog": 3, "horse": 5,
                 "bone": 0, "ball": 0, "stick": 0, "carrot": 0, "toy": 0, "leaf": 0},
        "holds": {"nest": 1, "hole": 2, "tree": {"under": 9, "*": 2}},
        "verbs": {
            "hopped": {"who": ["rabbit", "bird", "mouse"], "why": "only small, light animals hop"},
            "crawled": {"who": ["!horse", "!bird"], "why": "that animal walks - it does not crawl"},
            "carried": {"bigger": -1, "base": "carry"},
            "chased": {"bigger": 1, "base": "chase", "what": ["being", "ball", "leaf", "stick", "toy"],
                       "why": "you chase something that moves"},
            "followed": {"bigger": 1, "base": "follow", "what": ["being"],
                         "why": "you follow someone who is going somewhere"},
            "chewed": {"who": ["chewer"], "why": "a bird has a beak - it cannot chew"},
            "buried": {"who": ["digger"], "why": "dogs and foxes bury things - not that animal"},
            "gave": {"who": ["!being"], "why": "animals do not give presents - try a Pronoun like \"She\""},
            "brought": {"who": ["dog", "puppy"], "why": "a dog brings things back - not that animal"},
        },
        "adjectives": {
            "fluffy": {"what": ["!bird", "!duck", "!horse"], "why": "that animal has feathers or short hair, not fluff"},
            "grey": {"what": ["!carrot"], "why": "a carrot is orange"},
            "brown": {"what": ["!carrot"], "why": "a carrot is orange"},
        },
        "canBe": {"*": []},
    },
    "school": {
        "tags": {"kid": ["student", "classmate", "boy", "girl"],
                 "role": ["friend", "reader", "writer", "helper"]},
        "size": {"teacher": 4, "student": 3, "classmate": 3, "boy": 3, "girl": 3, "friend": 3,
                 "reader": 3, "writer": 3, "helper": 3,
                 "book": 0, "pencil": 0, "paper": 0, "backpack": 1, "crayon": 0, "note": 0},
        "holds": {"desk": {"under": 3, "*": 0}},
        "verbs": {
            "carried": {"bigger": -1, "base": "carry"},
            "read": {"what": ["book", "note", "paper"], "why": "you read a book, a note or a paper"},
            "wrote": {"what": ["book", "note", "paper"], "why": "you write a book, a note or on paper"},
            "opened": {"what": ["book", "backpack", "note"], "why": "you open a book, a note or a backpack"},
            "lent": {"what": ["thing"], "why": "you lend things, not people"},
        },
        "adjectives": {
            "tall": {"what": ["being"], "why": "tall describes a person"},
        },
        "canBe": {"*": ["friend", "reader", "writer", "helper", "student", "classmate"],
                  "teacher": ["friend", "reader", "writer", "helper"]},
    },
    "food": {
        "tags": {"grownup": ["chef", "baker", "farmer", "mom", "dad"]},
        "size": {"chef": 3, "baker": 3, "farmer": 3, "girl": 3, "boy": 3, "mom": 3, "dad": 3, "friend": 3},
        "verbs": {
            "baked": {"what": ["cookie", "pizza", "pie", "cake", "bread", "apple"],
                      "why": "you bake cookies, pizza, pies, cakes and bread"},
            "cooked": {"what": ["soup", "rice", "pancake", "carrot"],
                       "why": "you cook soup, rice, pancakes and carrots"},
            "made": {"what": ["!apple", "!carrot"], "why": "apples and carrots grow - nobody makes them"},
            "cut": {"what": ["!soup", "!rice"], "why": "you cannot cut that"},
            "tossed": {"what": ["apple", "carrot", "cookie", "pizza", "pancake"],
                       "why": "that would make a big mess"},
        },
        "adjectives": {
            "crunchy": {"what": ["apple", "carrot", "cookie", "pizza", "bread", "being"],
                        "why": "that food is not crunchy"},
            "sticky": {"what": ["cake", "pie", "rice", "pancake", "cookie", "sandwich", "being"],
                       "why": "that food is not sticky"},
            "sweet": {"what": ["!pizza", "!sandwich", "!soup", "!cheese", "!rice"],
                      "why": "that food is not sweet"},
        },
        "canBe": {"*": ["friend"],
                  "mom": ["chef", "baker", "farmer", "friend"], "dad": ["chef", "baker", "farmer", "friend"],
                  "chef": ["baker", "friend"], "baker": ["chef", "friend"], "farmer": ["friend"]},
    },
    "fantasy": {
        "tags": {"flyer": ["dragon"],
                 "hands": ["knight", "wizard", "princess", "giant", "elf", "troll"],
                 "walker": ["knight", "wizard", "princess", "giant", "elf", "troll"]},
        "size": {"elf": 2, "princess": 3, "knight": 3, "wizard": 3, "troll": 4, "unicorn": 4,
                 "giant": 5, "dragon": 5,
                 "sword": 0, "map": 0, "crown": 0, "potion": 0, "shield": 0, "treasure": 1, "wand": 0},
        "holds": {"tower": 4},
        "verbs": {
            "flew": {"who": ["flyer"], "why": "only a dragon has wings to fly"},
            "marched": {"who": ["walker"], "why": "marching is for people on two feet"},
            "carried": {"bigger": -1, "base": "carry"},
            "followed": {"what": ["being", "map"], "why": "you follow someone, or a map"},
            "chased": {"what": ["being"], "why": "you chase someone who runs away"},
            "held": {"who": ["hands"], "why": "that creature has no hands to hold it"},
            "waved": {"who": ["hands"], "why": "that creature has no hands to wave it"},
            "threw": {"who": ["hands"], "why": "that creature has no hands to throw it"},
        },
        "adjectives": {
            "tiny": {"what": ["!giant", "!dragon", "!troll", "!place"], "why": "that is never tiny"},
            "big": {"what": ["!elf"], "why": "elves are small"},
            "golden": {"what": ["thing", "castle", "tower", "dragon", "unicorn"],
                       "why": "that is not made of gold"},
        },
        "canBe": {"*": [],
                  "elf": ["knight", "wizard", "princess"], "giant": ["knight", "wizard"],
                  "troll": ["knight", "wizard"], "princess": ["knight", "wizard"]},
    },
    "sports": {
        "size": {"player": 3, "coach": 3, "runner": 3, "swimmer": 3, "goalie": 3, "referee": 3, "fan": 3,
                 "ball": 0, "bat": 0, "helmet": 0, "trophy": 0, "medal": 0, "whistle": 0, "glove": 0},
        "holds": {"net": 0},
        "verbs": {
            "threw": {"what": ["ball", "glove", "helmet", "being"], "why": "you throw a ball, not that"},
            "passed": {"what": ["ball", "bat", "glove", "helmet", "whistle", "being"],
                       "why": "you pass a ball, not that"},
            "cheered": {"who": ["!referee"], "why": "a referee has to stay fair - no cheering"},
        },
        "canBe": {"*": [],
                  "player": ["goalie", "runner", "swimmer"], "runner": ["player", "swimmer"],
                  "swimmer": ["player", "runner"], "goalie": ["player"], "fan": ["player", "runner", "swimmer"]},
    },
}


def check_meaning(tid, meaning, words):
    """Every word the meaning section names has to be a real word or tag of the topic."""
    known = {w for ws in words.values() for w in ws} | set(meaning.get("tags", {})) | {"being", "thing", "place"}
    named = set()
    for t, ws in meaning.get("tags", {}).items():
        named |= set(ws)
    named |= set(meaning.get("size", {})) | set(meaning.get("holds", {}))
    for section in ("verbs", "adjectives"):
        for w, rule in meaning.get(section, {}).items():
            named.add(w)
            for key in ("who", "what"):
                named |= {x.lstrip("!") for x in rule.get(key, [])}
    for w, can in meaning.get("canBe", {}).items():
        named |= set(can) | ({w} if w != "*" else set())
    unknown = sorted(named - known)
    if unknown:
        raise SystemExit("%s: the meaning section names words the topic does not have: %s"
                         % (tid, ", ".join(unknown)))


def build():
    os.makedirs(OUT, exist_ok=True)
    index, grand = [], 0

    for tid, topic in TOPICS.items():
        words = {"determiner": DETERMINERS, "subjectPronoun": SUBJECT_PRONOUNS,
                 "objectPronoun": OBJECT_PRONOUNS, "be": BE, **topic["words"]}
        rules, structures = grammar(words, topic.get("rules"), topic.get("structures", ()))
        total = sum(shapes.count(shapes.parse(shape, rules), words) for *_, shape in structures)
        silly_rules, silly_structures = silly_grammar(words)
        silly_total = sum(shapes.count(shapes.parse(shape, silly_rules), words) for *_, shape in silly_structures)
        meaning = MEANING.get(tid, {})
        check_meaning(tid, meaning, words)
        used_pos = [p for p in FAMILY_OF if words.get(p)]
        used_fam = {FAMILY_OF[p] for p in used_pos}

        pack = {
            "id": tid,
            "name": topic["name"],
            "emoji": topic["emoji"],
            "description": "Build a sentence from a subject, a verb, and as much more as you like.",
            "sentenceCount": total,
            "families": {k: v for k, v in FAMILIES.items() if k in used_fam},
            "pos": {p: {"label": FAMILIES[FAMILY_OF[p]]["label"],
                        "hint": FAMILIES[FAMILY_OF[p]]["hint"],
                        "color": FAMILIES[FAMILY_OF[p]]["color"],
                        "family": FAMILY_OF[p],
                        **({"note": NOTES[p]} if p in NOTES else {})}
                    for p in used_pos},
            "words": {p: words[p] for p in used_pos},
            "rules": rules,
            "patterns": [{"id": "%s-%s" % (tid, sid), "name": name, "blocks": blocks,
                          "end": [".", "!"], "shape": shape}
                         for sid, name, blocks, shape in structures],
            "clashes": [c for c in SHARED_CLASHES + topic.get("clashes", [])
                        if all(any(w in ws for ws in words.values()) for w in c[:2])],
            "meaning": meaning,
            # Silly mode swaps these in (see BW.Grammar.forMode): looser shapes, no meaning
            "silly": {
                "sentenceCount": silly_total,
                "rules": silly_rules,
                "patterns": [{"id": "%s-silly-%s" % (tid, sid), "name": name, "blocks": blocks,
                              "end": [".", "!"], "shape": shape}
                             for sid, name, blocks, shape in silly_structures],
                "clashes": GRAMMAR_CLASHES,
            },
            "punctuation": [
                {"mark": ".", "name": "period"},
                {"mark": "!", "name": "exclamation point"},
            ],
        }
        with open(os.path.join(OUT, tid + ".json"), "w") as f:
            json.dump(pack, f, indent=2, ensure_ascii=False)

        index.append({"id": tid, "name": topic["name"], "emoji": topic["emoji"],
                      "file": "topics/%s.json" % tid, "sentences": total, "sillySentences": silly_total})
        grand += total
        print("%-9s %12s sentences   %3d words across %d kinds"
              % (topic["name"], "{:,}".format(total), sum(len(v) for v in pack["words"].values()),
                 len(used_fam)))

    with open(os.path.join(ROOT, "data", "topics.json"), "w") as f:
        json.dump({"defaultTopic": index[0]["id"], "topics": index}, f, indent=2)
    print("%-9s %12s sentences in total" % ("ALL", "{:,}".format(grand)))


if __name__ == "__main__":
    build()
