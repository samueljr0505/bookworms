"""Writes the verb lists and verb rules in data/packs/words.json from one table.

Every verb from words.pdf is listed once, with all four of its forms, so the "hop / hops /
hopped / hopping" lists can never drift out of step. Run it after changing the table:

    python3 tools/verbs.py

A form written as "-" is left out, usually because it is spelled the same as another form or
as a word in another list (a tile can only carry one part of speech): "read" is both the plain
and the past form, and "water" is already a Stuff Word.
"""
import json
import os
import re

# plain, does (he/she/it), did (past), -ing
ALONE = """
buzz buzzes buzzed buzzing       cheer cheers cheered cheering     clap claps clapped clapping
crawl crawls crawled crawling    dance dances danced dancing       drift drifts drifted drifting
fly flies flew flying            glow glows glowed glowing         hop hops hopped hopping
jump jumps jumped jumping        land lands landed landing         pounce pounces pounced pouncing
run runs ran running             shine shines shone shining        sit sits sat sitting
skip skips skipped skipping      sneak sneaks snuck sneaking       swim swims swam swimming
walk walks walked walking        wave waves waved waving           laugh laughs laughed laughing
listen listens listened listening  smile smiles smiled smiling     think thinks thought thinking
yawn yawns yawned yawning        giggle giggles giggled giggling   creak creaks creaked creaking
sleep sleeps slept sleeping      tick ticks ticked ticking
"""

# These stand alone ("The bear eats.") OR take something after them ("The bear eats the berries.").
# They live in the stand-alone lists; the pack's rules say they may also be followed by an object.
EITHER = """
bake bakes baked baking          blow blows blew blowing           chew chews chewed chewing
clean cleans cleaned cleaning    climb climbs climbed climbing     cook cooks cooked cooking
dig digs dug digging             draw draws drew drawing           drive drives drove driving
eat eats ate eating              help helps helped helping         kick kicks kicked kicking
knit knits knitted knitting      learn learns learned learning     melt melts melted melting
paint paints painted painting    play plays played playing         read reads - reading
ride rides rode riding           ring rings rang ringing           roll rolls rolled rolling
search searches searched searching  sing sings sang singing        spin spins spun spinning
stop stops stopped stopping      stretch stretches stretched stretching
visit visits visited visiting    wash washes washed washing        write writes wrote writing
"""

# These always need something after them: "The dog buried ..." is not finished.
# (no -ing list for these - "is building" would need its own list of doing-to -ing words)
TO = """
brush brushes brushed -   build builds built -     bury buries buried -     carry carries carried -
catch catches caught -    cross crosses crossed -  cut cuts - -             feed feeds fed -
fill fills filled -       give gives gave -        grab grabs grabbed -     hear hears heard -
leave leaves left -       make makes made -        pack packs packed -      pick picks picked -
plant plants planted -    pull pulls pulled -      raise raises raised -    reach reaches reached -
rub rubs rubbed -         see sees saw -           set sets - -             tell tells told -
throw throws threw -      tie ties tied -          wag wags wagged -        want wants wanted -
wear wears wore -         - waters watered -
"""


def table(text):
    words = text.split()
    assert len(words) % 4 == 0, 'every verb needs four forms'
    return [words[i:i + 4] for i in range(0, len(words), 4)]


def column(rows, i):
    return [r[i] for r in rows if r[i] != '-']


def literal_rule(words):
    return ' | '.join("'" + w + "'" for w in words)


def wrap(words, indent):
    lines, line = [], ''
    for w in (json.dumps(w) for w in words):
        piece = (', ' if line else '') + w
        if len(indent) + len(line) + len(piece) > 100:
            lines.append(line + ',')
            line = w
        else:
            line += piece
    lines.append(line)
    return ('\n' + indent).join(lines)


alone, either, to = table(ALONE), table(EITHER), table(TO)
stand = alone + either
lists = {
    'verbS': column(stand, 1), 'baseVerb': column(stand, 0), 'verb': column(stand, 2), 'ing': column(stand, 3),
    'transitiveS': column(to, 1), 'baseTransitive': column(to, 0), 'transitive': column(to, 2),
}
rules = {
    'eitherBase': literal_rule(column(either, 0)),
    'eitherS': literal_rule(column(either, 1)),
    'eitherPast': literal_rule(column(either, 2)),
    'eitherIng': literal_rule(column(either, 3)),
}

path = os.path.join(os.path.dirname(__file__), '..', 'data', 'packs', 'words.json')
src = open(path).read()
for key, words in lists.items():
    src, n = re.subn(r'("' + key + r'": \[)[^\]]*(\])',
                     lambda m: m.group(1) + '\n      ' + wrap(words, '      ') + '\n    ' + m.group(2), src)
    assert n == 1, key
for key, shape in rules.items():
    src, n = re.subn(r'("' + key + r'":\s*)"[^"]*"', lambda m: m.group(1) + json.dumps(shape), src)
    assert n == 1, key
open(path, 'w').write(src)
print('wrote', sum(len(v) for v in lists.values()), 'verb forms to', os.path.normpath(path))
