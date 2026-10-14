"""Read sentence shapes the way js/grammar.js does, for the Python tools.

A shape is a row of parts: a part of speech (`noun`), an exact word (`'tastes'`), a named
phrase from the topic's rules (`<start>`), a group `( ... )` with choices `a | b`, and `?`
after a part to make it optional. Used by build-topics.py to count a topic's sentences and by
list-sentences.py to sample them. (No `*` or `+` - a topic with them has no fixed count.)
"""
import random
import re

TOKEN = re.compile(r"\s*(?:<([\w-]+)>|'([^']+)'|\"([^\"]+)\"|([A-Za-z][\w-]*)|([()|?]))")


def parse(src, rules=None):
    rules = rules or {}
    toks, at = [], 0
    while src[at:].strip():
        m = TOKEN.match(src, at)
        if not m:
            raise ValueError("cannot read shape %r at %r" % (src, src[at:]))
        at = m.end()
        if m.group(1):
            toks.append(("rule", m.group(1)))
        elif m.group(2) or m.group(3):
            toks.append(("word", m.group(2) or m.group(3)))
        elif m.group(4):
            toks.append(("pos", m.group(4)))
        else:
            toks.append((m.group(5), None))
    pos = [0]

    def peek():
        return toks[pos[0]][0] if pos[0] < len(toks) else None

    def alt():
        opts = [seq()]
        while peek() == "|":
            pos[0] += 1
            opts.append(seq())
        return ("alt", opts) if len(opts) > 1 else opts[0]

    def seq():
        items = []
        while peek() not in (None, ")", "|"):
            items.append(post())
        return ("seq", items)

    def post():
        node = atom()
        while peek() == "?":
            pos[0] += 1
            node = ("opt", node)
        return node

    def atom():
        kind, value = toks[pos[0]]
        pos[0] += 1
        if kind == "(":
            inner = alt()
            pos[0] += 1                       # the ")"
            return inner
        if kind == "rule":
            return parse(rules[value], rules)
        return (kind, value)

    return alt()


def fits_place(word, first):
    """A capital letter starts a sentence, and only "I" keeps one in the middle."""
    capital = word[0] != word[0].lower()
    return capital if first else (not capital or word == "I")


def count(node, words):
    """How many different sentences a shape can make, with capitals where they belong.
    (Repeated words and clashes are not taken off, so it is an upper bound.)"""
    return sum(_count(node, words, {True: 1}).values())


def _count(node, words, ways):
    """`ways` maps "still at the first word?" to how many ways there are to get here."""
    kind, value = node
    if kind in ("pos", "word"):
        options = words.get(value, []) if kind == "pos" else [value]
        out = {}
        for first, n in ways.items():
            k = sum(1 for w in options if fits_place(w, first))
            if k:
                out[False] = out.get(False, 0) + n * k
        return out
    if kind == "opt":
        out = dict(ways)
        for first, n in _count(value, words, ways).items():
            out[first] = out.get(first, 0) + n
        return out
    if kind == "alt":
        out = {}
        for o in value:
            for first, n in _count(o, words, ways).items():
                out[first] = out.get(first, 0) + n
        return out
    for item in value:
        ways = _count(item, words, ways)
    return ways


def sample(node, words, rng=random):
    """One random sentence from a shape, as (word, pos) pairs (pos is None for exact words)."""
    kind, value = node
    if kind == "pos":
        return [(rng.choice(words[value]), value)]
    if kind == "word":
        return [(value, None)]
    if kind == "opt":
        return sample(value, words, rng) if rng.random() < 0.6 else []
    if kind == "alt":
        return sample(rng.choice(value), words, rng)
    out = []
    for item in value:
        out += sample(item, words, rng)
    return out
