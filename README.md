# Bookworms

A Google-Snake-style game that teaches 3rd-5th graders how sentences are built. You steer a worm
around a board covered in words. Eat the words in an order that makes a real sentence, then eat a
punctuation mark to end it. **That is when the sentence is checked** - capital letter, subject,
verb, does it sound right, does it make sense, end mark - and if it passes, it goes up on your list.

Sentences are built from real building blocks - a subject, a verb, and if you like an object and
modifiers - in five topics: Animals, School, Food, Fantasy and Sports.

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
a complete sentence: **capital letter, subject, verb, sounds right, makes sense, end mark**. Two
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

### How a sentence is built

Every topic shares one grammar, made from the building blocks of a sentence:

| Block | What it is | Examples |
| --- | --- | --- |
| **Subject** | who or what the sentence is about: a Determiner + (Adjective) + Noun, or a Pronoun | *The brave knight*, *She* |
| **Verb** | what happens, or *was* / *were* | *flew*, *found*, *was* |
| **Object** (optional) | who or what gets the action; giving verbs take two | *found **the map***, *gave **him** **a sword*** |
| **Modifiers & Complements** (optional) | an Adverb before or after the verb, a Preposition and a place, or a complement after *was* | *quickly*, *into the dark cave*, *was **a wise wizard*** |

So there is never one recipe to follow: *The dragon flew.*, *The dragon quickly flew over the old
castle.* and *She gave the knight a golden sword.* are all sentences of the Fantasy topic. The
shapes live in `grammar()` in `tools/build-topics.py`. A capital letter is part of the lesson:
**The** and **the** are both tiles, and only one fits at the start of a sentence.

### Add words, or a topic

Topics are made by `tools/build-topics.py` - edit the `TOPICS` table there, never the JSON files
it writes - then run:

```bash
python3 tools/build-topics.py
python3 tools/list-sentences.py fantasy
node tools/test.js
```

A topic is just word lists. Which list a word goes in decides where it may go:

| List | Holds | Goes |
| --- | --- | --- |
| `noun` | beings - people, animals, creatures | subject or object |
| `thing` | things you can carry, find and give | object |
| `mass` | things you cannot count - rice, soup | with *the* / *my*, never *a* |
| `place` | places | after a Preposition, or seen / found |
| `adjective` | describes anything - big, old | before any noun |
| `mood` / `quality` | describes beings only / things only | brave knight / shiny sword |
| `move` / `stay` | verbs that go somewhere / stay put | *ran into the cave* / *slept in the cave* |
| `take`, `push`, `see`, `use`, `give` | verbs that take an object - of the right kind | *carried him*, *kicked the ball*, *found the cave*, *ate the pie*, *gave him a map* |
| `motionPrep` / `placePrep` | where something went / where it was | *into*, *toward* / *in*, *near* |

Determiners, pronouns and *was* / *were* are shared by every topic. A topic can narrow what one
kind of verb takes (in Sports, *kicked*, *hit* and *caught* only take a ball) and add shapes of its
own (Food's *The soup tastes warm.*).

Then read the sample from `list-sentences.py`. Anything that reads wrong is usually two words
that cannot share a sentence - add them to the topic's `clashes` with the reason a child should
hear:

```python
["swam", "gym", "you cannot swim in a gym"],
```

The game marks that sentence wrong with that reason, the hints never lead to it, and the tests
check that a correct sentence can still always be finished.

### Add a worm colour

Add an entry to `data/worms.json` and it appears on the home page immediately:

```json
{ "id": "coral", "name": "Coral", "body": "#f2857a", "head": "#c9524a" }
```

`body` colours the worm's plain squares (lightening towards the tail) and `head` colours its
head. The squares carrying letters keep their part-of-speech colours, so the worm colour shows
on the head and on any body squares that are not spelling anything yet.

### Change how it feels

Everything tunable is in `js/config.js` with a comment: board size, worm speed, how much the worm
grows, how many words are on the board at once, points, sound on or off, and what a crash does.

## Ideas for the next version

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
