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
  index.html            the page
  serve.sh              starts the local web server
  Docs/
    Requirements.md              what the game has to do
    How-Requirements-Are-Met.md  how each one was built, with line numbers
    Design-Patterns.md           the patterns used, where, and what was left out
  css/style.css         all the styling
  data/
    packs.json          which word pack to load
    packs/starter.json  THE WORDS AND SENTENCE PATTERNS  <- edit this one
  js/
    config.js           tweakable numbers: speed, board size, rules
    util.js             random-number helpers and the sound effects
    grammar.js          sentence patterns, what may be eaten next, final text
    worm.js             the worm: its squares, turning, growing, shrinking
    board.js            word tiles: choosing them and finding space for them
    render.js           everything drawn on the canvas
    game.js             the game loop and all the rules
    main.js             loads the JSON, starts the game, updates the panels
  tools/test.js         headless checks, no browser needed
```

Files load as plain `<script>` tags in that order and share one global called `BW`. No build
step, no npm install, no framework - open a file, change it, reload the page.

## Growing it

### Add words

Open `data/packs/starter.json` and add to any list under `words`. This is the safest, most
useful change a student can make.

```json
"noun": ["cat", "dog", "dragon", "skateboard", "volcano"],
"adjective": ["happy", "sleepy", "glittery"]
```

Two rules for new words:

- Put it under the right part of speech, or sentences will come out wrong.
- **Verbs must be past tense** (`jumped`, `sang`, `flew`). Past-tense verbs agree with every
  subject, which is how the game guarantees correct grammar without any extra machinery. Adding
  `jumps` would let "My dogs jumps" happen.

### Add a sentence shape

A pattern is a list of slots. A `?` on the end means the slot is optional - the player may fill it
or skip straight past it.

```json
{ "id": "two-things", "name": "Two things sentence",
  "slots": ["determiner", "noun", "verb", "preposition", "determiner", "adjective?", "noun"] }
```

Add it to the `patterns` list and it starts showing up immediately. Run `node tools/test.js`
afterwards - it will tell you if the new pattern can produce something ungrammatical.

### Add a new part of speech

Add an entry to `pos` (with the kid-friendly label, hint, and colour), add a word list under
`words` with the same key, then use that key in a pattern. Nothing in the JavaScript needs to
change - the legend, the colours, and the hints are all generated from the pack file.

### Add a whole new pack

Drop `data/packs/animals.json` next to the starter pack, list it in `data/packs.json`, and point
`defaultPack` at it. A pack switcher in the sidebar is the obvious next feature.

### Change how it feels

Everything tunable is in `js/config.js` with a comment: board size, worm speed, how much the worm
grows, how many words are on the board at once, points, sound on or off, and what a crash does.

## Ideas for the next version

- A pack picker so a class can switch between topics.
- Questions: add `?` to `punctuation` plus a question pattern, and only offer `?` for that pattern.
- Present-tense verbs, which needs a `number` tag on nouns and verbs so they agree.
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
