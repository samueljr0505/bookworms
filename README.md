# Bookworms

A Google-Snake-style game that teaches 3rd-5th graders how sentences are built. You steer a worm
around a board covered in words. Eat the words in an order that makes a real sentence, then eat a
punctuation mark to end it. **That is when the sentence is checked** - capital letter, noun, verb,
does it sound right, does it make sense, end mark - and if it passes, it goes up on your list.

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
refuse to read local files when you just double-click `index.html`. `serve.sh` starts
`tools/serve.py`, a small Python server (Python is already on every Mac), which also answers the
optional sentence judge - see [The sentence checker](#the-sentence-checker).

## Run the tests

```bash
node tools/test.js
python3 tools/test_judge.py
```

`test.js` plays several thousand games with no browser involved and checks the rules hold - most
importantly that the checker never passes a sentence that breaks the topic's sentence shapes,
even when the player eats words at random, and that every refusal comes with a reason.
`test_judge.py` checks the judge's server side with a stand-in for the AI, so it needs no API key
and costs nothing. See [Docs/How-Requirements-Are-Met.md](Docs/How-Requirements-Are-Met.md) for
what each test proves.

## How to play

| Key | What it does |
| --- | --- |
| Arrow keys or `W` `A` `S` `D` | Steer |
| `P` or `Space` | Pause |
| `R` | New game |

- The strip above the board is the **recipe**: the kinds of word to collect, in order, with
  optional ones dashed. It follows along as you eat, and if your words turn into a different
  sentence shape the topic knows, it switches to that one.
- **Every word you eat goes onto the worm**, whether it fits the recipe or not. Nothing is marked
  until the sentence is finished.
- Hints start off. Turn them on with the **Hints** button and words that would keep the sentence
  on track get a dashed white outline.
- **Eat a punctuation mark to end the sentence, and it gets checked.** The worm stops while the
  checker reads it, then shows a checklist with a reason for anything that failed. Press an arrow
  key to carry on.
  - **Right:** it goes up on your list, with points for every word in it.
  - **Not finished yet:** the checker says what is missing ("What happens? Add a Verb."), and the
    words stay on the worm so you can keep building.
  - **Not quite right:** the checker says which word and why, and the words go back on the board
    to try again. A wrong sentence costs a few points.
- After a crash the game holds still for a moment so you can see what you hit, *then* the words
  scatter. Steering is locked during that pause, so you cannot drive into the same wall twice.

## The sentence checker

When the worm eats a punctuation mark, the sentence is checked against the list a teacher uses for
a complete sentence: **capital letter, noun, verb, sounds right, makes sense, end mark**. Two
things do the checking.

**1. The game's rules (`js/checker.js`)** - always on, instant, no internet. They compare the words
with the topic's sentence shapes, so they know for certain when a noun or verb is missing, when a
word is in the wrong place ("An Adjective goes before the Noun it describes"), when a word is used
twice, and when the sentence was already finished before the last word. Each topic also says
which words fit where and which words cannot share a sentence, so the rules catch nonsense too:

- "The cookie tasted big." - *"big" does not go with "tasted". Adjectives that do: "sweet",
  "fresh", "warm" or "cold".*
- "A rice is soft." - *"rice" is not something you can count, so it goes with "The" or "My".*
- "The small reader is tall." - *"small" and "tall" do not go together: someone cannot be tall and
  small at once.*

**Every wrong sentence gets feedback**: the reason, pinned to the word, and a corrected sentence to
try, built from the topic's own tiles and changing as little as possible ("The dog cat ran." -
*Try: The dog ran.*). `tools/test.js` checks this for thousands of random sentences, and checks
that every suggested sentence passes the rules itself.

But the rules only know what the topic told them, so they can still get two kinds of sentence
wrong:

- **Wrong sentences they pass.** "The quick bird jumped quickly." says the same thing twice, and no
  word list can rule out every odd sentence.
- **Right sentences they fail.** "The big fluffy dog ran." is fine English, but the recipe only had
  room for one Adjective.

**2. The judge (`tools/judge.py`)** - optional. An AI (Claude) reads the words the way a careful
teacher would and answers two questions: does it sound right, and does it make sense? It gets the
last word on those two, so it catches the first kind of mistake and rescues the second. It always
gives a reason a child can read, and its own corrected sentence.
Capital letters, repeated words and end marks stay the rules' call.

Without the judge the game works exactly the same, using its rules only. "Makes sense" is then
left for the child to check by reading the sentence out loud.

### Turning the judge on

1. Get an API key from the Claude Developer Platform (<https://platform.claude.com>). You add a
   payment method there, and you can set a spending limit.
2. Install the one package the judge needs, and give it the key:

   ```bash
   pip install -r requirements.txt
   export ANTHROPIC_API_KEY=your-key-here
   ./serve.sh
   ```

3. The terminal prints `judge: on`, and the game's sidebar says sentences are checked by the rules
   *and* an AI judge. If something is wrong, the terminal says what (no key, key not accepted, and
   so on) and the game carries on with its rules.

Try one sentence from the command line first:

```bash
python3 tools/judge.py animals The quick bird jumped quickly
```

### What it costs

The judge uses the Claude API, which is pay-as-you-go and billed separately from any Claude.ai
subscription. Each question is small (a short sentence, the topic's word list, and instructions
that are cached between questions), so the estimate is **about half a cent to a cent per new
sentence** with the default model, Claude Opus 5.5 - roughly $3-13 per 1,000 new sentences. That
is an estimate, not a measurement: check the usage page on the platform after your first few
tries. Things that keep it down:

- **Every answer is saved** in `data/verdicts.json` and never asked for again, so a sentence costs
  something only the first time anyone in the class writes it.
- **A cheaper model** is one setting away: `export BOOKWORMS_JUDGE_MODEL=claude-haiku-5-5` before
  `./serve.sh` is roughly 30 times cheaper (well under a dollar per 1,000 sentences). It may make
  more mistakes on subtle meaning calls, so try it on a handful of sentences first.
- The server asks at most 30 new questions a minute (`BOOKWORMS_JUDGE_PER_MINUTE`), and only about
  sentences made of the game's own word tiles, so nobody can use it to ask anything else.
- `judgeEarly` in `js/config.js` asks the judge as soon as the words could be a whole sentence, so
  the answer is ready when the worm reaches the punctuation. Turn it off to ask only about
  finished sentences: fewer questions, slightly longer waits.

### No API key? Two free options

- **A teacher's answer key.** `data/verdicts.json` is a plain file of sentences and verdicts, and
  the game reads it with no server and no internet. Add a sentence by hand, and from then on every
  child who writes it gets that answer and reason:

  ```json
  "The quick bird jumped quickly": {
    "grammatical": true, "makes_sense": false, "by": "teacher",
    "feedback": "Quick and quickly say the same thing twice. Try a different Adjective!",
    "suggestion": "The hungry bird jumped quickly."
  }
  ```

  The same file is where the judge saves its answers, so a teacher can read through what it decided
  and overrule any of it. The judge never overwrites an entry marked `"by": "teacher"`.
- **Tighter word lists.** In `tools/build-topics.py` a topic can say which words fit where (in
  Food, "tastes" only takes taste words and rice never takes "A") and list `clashes`: pairs of
  words that cannot share a sentence, with the reason the child is told -
  `["waited", "quickly", "waiting is not something you can hurry"]`. Run
  `python3 tools/build-topics.py`, then read a sample with `python3 tools/list-sentences.py school`
  and add a clash for anything that reads wrong.

### What is sent to the AI

Only the words of the sentence and the topic's word list. No names, no class, nothing about who
is playing. The API key stays in the terminal running `serve.sh` and is never sent to a browser.

## Files

```
bookworms/
  index.html            the home page: pick your worm and a topic, then play
  game.html             the game itself
  how-to-play.html      how to play, for the players
  serve.sh              starts the local web server
  requirements.txt      the one Python package the (optional) judge needs
  Docs/
    Requirements.md              what the game has to do
    How-Requirements-Are-Met.md  how each one was built
    Design-Patterns.md           the patterns used, where, and what was left out
  css/home.css          styling for the home page
  css/style.css         styling for the game
  css/how.css           styling for the how-to-play page
  data/
    topics.json         the topics offered on the home page
    topics/*.json       THE WORDS AND SENTENCE SHAPES, one file per topic (from tools/build-topics.py)
    verdicts.json       the judge's saved answers, and the teacher's answer key
    worms.json          the worm colours offered on the home page
  js/
    home.js             the home page: worm and topic pickers
    worm-skin.js        which worm and topic were picked (shared by both pages)
    config.js           tweakable numbers: speed, board size, rules, points
    util.js             random-number helpers and the sound effects
    grammar.js          sentence-shape language: which shapes the words fit, what could come next
    checker.js          checks a finished sentence, and folds in the judge's answer
    judge.js            asks the judge: saved answers first, then the server
    worm.js             the worm: its squares, turning, growing, shrinking
    board.js            word tiles: choosing them and finding space for them
    render.js           everything drawn on the canvas
    game.js             the game loop and all the rules
    main.js             loads the JSON, starts the game, updates the panels and the check card
  tools/
    serve.py            the local web server, with the judge at /api/judge
    judge.py            the sentence judge: asks Claude, saves the answers
    test.js             headless checks of the game, no browser needed
    test_judge.py       checks of the judge, no API key needed
    build-topics.py     writes the topic files
    list-sentences.py   prints a sample of a topic's sentences for a person to read
```

Files load as plain `<script>` tags in that order and share one global called `BW`. No build
step, no npm install, no framework - open a file, change it, reload the page. The judge is the
only part that needs anything installed, and the game runs without it.

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
