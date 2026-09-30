# Bookworms

A Google-Snake-style game that teaches 3rd-5th graders how sentences are built. You steer a worm
around a board covered in words. Eat the words in an order that makes a real sentence, then eat a
punctuation mark to end it and it goes up on your list.

**The worm's body is the sentence.** Every word you eat is written along the body, one letter per
square, coloured by its part of speech - read your worm from its tail to its head to see what you
have built. Long words make you long. Crash into a wall or into yourself and those words fall off
the body and scatter back onto the board for you to collect again.

There is no game over. Nobody gets eliminated.


## Run it

```bash
./serve.sh
```

Then open <http://localhost:8000>.

You need the little web server because Bookworms reads its words from JSON files, and browsers
refuse to read local files when you just double-click `index.html`. `serve.sh` is a one-line
wrapper around `python3 -m http.server 8000`, which is already on every Mac.

## Run the tests

```bash
node tools/test.js
```

This plays several thousand games with no browser involved and checks the rules hold - most
importantly that every finished sentence is grammatically correct, even when the player eats
words at random. See [Docs/How-Requirements-Are-Met.md](Docs/How-Requirements-Are-Met.md) for
what each test proves.

## How to play

| Key | What it does |
| --- | --- |
| Arrow keys or `W` `A` `S` `D` | Steer |
| `P` or `Space` | Pause |
| `R` | New game |

- The strip above the board shows the sentence you are building and what to hunt for next.
- Words that would be a correct pick have a dashed white outline. Turn that off with the
  **Hints** button once the class is ready.
- A wrong word costs a few points and tells you what you needed instead. It does not end anything.
- Once your sentence can stand on its own, a `.` and a `!` appear. **Eat a punctuation mark to
  end the sentence** - it goes up on your list and your body clears for the next one.
- After a crash the game holds still for a moment so you can see what you hit, *then* the words
  scatter. Steering is locked during that pause, so you cannot drive into the same wall twice.

## Files

```
bookworms/
  index.html            the home page: pick your worm, then play
  game.html             the game itself
  serve.sh              starts the local web server
  Docs/
    Requirements.md              what the game has to do
    How-Requirements-Are-Met.md  how each one was built, with line numbers
    Design-Patterns.md           the patterns used, where, and what was left out
  css/home.css          styling for the home page
  css/style.css         styling for the game
  data/
    packs.json          which word pack to load (the default is "words")
    packs/words.json    THE WORDS AND SENTENCE PATTERNS, from words.pdf  <- edit this one
    packs/starter.json  the original, smaller pack (past tense only)
    worms.json          the worm colours offered on the home page
  js/
    home.js             the home page: worm picker
    worm-skin.js        which worm was picked (shared by both pages)
    config.js           tweakable numbers: speed, board size, rules
    util.js             random-number helpers and the sound effects
    grammar.js          sentence-shape language, what may be eaten next, final text
    worm.js             the worm: its squares, turning, growing, shrinking
    board.js            word tiles: choosing them and finding space for them
    render.js           everything drawn on the canvas
    game.js             the game loop and all the rules
    main.js             loads the JSON, starts the game, updates the panels
  tools/test.js         headless checks, no browser needed
  tools/verbs.py        writes the verb lists in words.json from one table of verb forms
```

Files load as plain `<script>` tags in that order and share one global called `BW`. No build
step, no npm install, no framework - open a file, change it, reload the page.

## Growing it

### Add words

Open `data/packs/words.json` and add to any list under `words`. This is the safest, most
useful change a student can make.

```json
"noun": ["cat", "dog", "dragon", "skateboard", "volcano"],
"adjective": ["happy", "sleepy", "glittery"]
```

Rules for new words:

- Put it under the right part of speech, or sentences will come out wrong.
- **Add verbs to the table in `tools/verbs.py`, not straight into the pack**, then run
  `python3 tools/verbs.py`. Each verb has four forms, and each form has its own list:

  | Form | Stands alone | Needs something after it |
  | --- | --- | --- |
  | now, for he / she / it | `verbS` - hops | `transitiveS` - builds |
  | plain: I / you / we / they, after a helper, commands | `baseVerb` - hop | `baseTransitive` - build |
  | past, for anyone | `verb` - hopped | `transitive` - built |
  | -ing, after am / is / are / was / were | `ing` - hopping | |

  The pack's rules pick the form that agrees with the subject: `<one>` (a singular noun, a name,
  he, she, it) takes `hops` and `is`; `<iOrMany>` (I, you, we, they, or "Mom and Dad") takes
  `hop` and `are`. Verbs in the table's `EITHER` group (`eat`, `paint`, `sing`) stand alone or
  take something after them: "The bear eats." and "The bear eats the berries."
- Nouns under `noun` must be singular things you can count ("a cat"). Plurals and stuff you
  cannot count (`berries`, `mud`) go under `mass`, which is never used after "a" and only
  appears after the verb.
- A word may only appear in one list, because a tile carries a single part of speech.

### Add a sentence shape

A pattern describes the shape of a sentence in a tiny language. Words in it are parts of speech
from the pack; the symbols around them say how they may be combined:

| Write | Means | Example |
| --- | --- | --- |
| `noun` | eat any word of that part of speech | `determiner noun verb` |
| `,` | eat a comma tile here | `adverb , <clause>` -> "Suddenly, the cat ran." |
| `'and'` | eat exactly this word | `<object> 'and' <object> <action>` |
| `x?` | optional | `verb adverb?` |
| `x*` / `x+` | any number of times / one or more | `adjective ( , adjective )*` |
| `( a b )` | a group | `( preposition <thing> )?` |
| `a \| b` | either one | `( name \| pronoun )` |
| `<clause>` | a phrase from the pack's `rules` | see below |

Reusable phrases live under `rules` so patterns stay short:

```json
"rules": {
  "thing":   "determiner ( adjective ( , adjective )? )? noun",
  "subject": "<thing> | name | pronoun",
  "clause":  "<subject> <action>"
}
```

Then a pattern is one line. `end` lists the marks that may finish it (default `.` and `!`), and
`weight` makes it show up more or less often (default 1):

```json
{ "id": "compound", "name": "Joined sentence", "shape": "<clause> , conjunction <clause>" },
{ "id": "yes-no", "name": "Yes-or-no question", "end": ["?"],
  "shape": "helper <subject> baseVerb adverb? <place>?" }
```

The words pack ships 40 shapes that follow the sections of words.pdf: simple and doing-to
sentences in the present and past, describing (`The soup is hot.`), is-a (`He is a brave
firefighter.`), where (`The frog jumps into the pond.`), time-first (`At night, the moon
glows.`), two and three actions (`She jumps, spins, and lands.`), want-to, future (`will`),
-ing (`The kids were playing.`), negatives (`does not`, `can't`), there-is, joined and
when-or-why sentences, five kinds of question, commands (`Please ...`, `Don't ...`, `Let's ...`),
and exclamations (`What a big dog!`, `How cold!`). A word with an apostrophe goes in double
quotes inside a shape, which in the JSON file is written `\"can't\"`.

The old list form (`"slots": ["determiner", "adjective?", "noun", "verb"]`) still works. Run
`node tools/test.js` afterwards - it checks the pack, and will tell you if a new pattern can
produce something ungrammatical or can never be finished.

### Add a new part of speech

Add an entry to `pos` (with the kid-friendly label, hint, and colour), add a word list under
`words` with the same key, then use that key in a pattern. Nothing in the JavaScript needs to
change - the legend, the colours, and the hints are all generated from the pack file.

### Add a worm colour

Add an entry to `data/worms.json` and it appears on the home page immediately:

```json
{ "id": "coral", "name": "Coral", "body": "#f2857a", "head": "#c9524a" }
```

`body` colours the worm's plain squares (lightening towards the tail) and `head` colours its
head. The squares carrying letters keep their part-of-speech colours, so the worm colour shows
on the head and on any body squares that are not spelling anything yet.

### Add a whole new pack

Drop `data/packs/animals.json` next to the starter pack, list it in `data/packs.json`, and point
`defaultPack` at it. A pack switcher in the sidebar is the obvious next feature.

### Change how it feels

Everything tunable is in `js/config.js` with a comment: board size, worm speed, how much the worm
grows, how many words are on the board at once, points, sound on or off, and what a crash does.

## Ideas for the next version

- A pack picker so a class can switch between topics.
- Two players on one board.
- Save finished sentences so a teacher can print what the class wrote.

## Documentation

- [Docs/Requirements.md](Docs/Requirements.md) - the requirement list.
- [Docs/How-Requirements-Are-Met.md](Docs/How-Requirements-Are-Met.md) - requirement by
  requirement: what was built, which lines do it, and how to verify it.
- [Docs/Design-Patterns.md](Docs/Design-Patterns.md) - the design patterns used, where each one
  lives, why it earns its place, and which ones were deliberately left out.
- Every `.js` file opens with a comment saying what it is for, and the rules themselves are
  commented in place.
