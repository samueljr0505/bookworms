# Bookworms

A Google-Snake-style game that teaches 3rd-5th graders how sentences are built. You steer a worm
around a board covered in words, and build a sentence one block at a time.

Every sentence follows real grammar: a **Subject**, a **Verb**, and if you like an **Object**, a
**Complement** or **Modifiers**, each made of the right kinds of word (*The* + *hungry* + *fox*).
**The worm only eats a word that fits the next spot.** Drive into one that does not and it stays
on the board, and the game says why, right at that word: *"ran" is a Verb. After "The", the
sentence needs a Noun or an Adjective.* Once the sentence is whole, eat a punctuation mark
(**.** or **!**) and it is complete.

The structure keeps the game's world small enough to get right - every sentence a topic allows
can be counted (Animals has about 7 billion) - while the creativity comes from five topics
(Animals, School, Food, Fantasy and Sports) and from longer sentences: *The dragon flew.*, *The
dragon quickly flew over the old castle.* and *She gave the knight a golden sword.* are all
sentences of the Fantasy topic. A short [grammar review](review.html) goes over the kinds of word
and the blocks, with a quick check at the end.

On the home page the player also picks **Real** or **Silly**:

- **Real** - the sentence has to make sense. After "The mouse carried the", the worm will not eat
  "horse": *a horse is too big for a mouse to carry.*
- **Silly** - the sentence only has to sound right. Any Adjective goes with any Noun and anything
  can do anything, so "The pencil ate the gym." is a fine sentence. Capitals, word order, *a* /
  *the* and repeated words still count.

**The worm's body is the sentence.** Every word you eat is written along the body, one letter per
square, coloured by its part of speech, with a little gap between words. Whichever way the worm
goes, the words read the normal way round - left to right, or top to bottom - and a new word slides
in a letter at a time as the body grows. Long words make you long. Crash into a wall or into yourself and those words fall off
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
optional sentence judge - see [The sentence checker](#the-sentence-checker) - and keeps the score
for [class races](#class-races).

## Run the tests

```bash
node tools/test.js
python3 tools/test_judge.py
python3 tools/test_classroom.py
```

`test.js` plays several thousand games with no browser involved and checks the rules hold - most
importantly that the worm never eats a word that takes the sentence off its structure, even when
the player drives into words at random, that every sentence it finishes is correct, and that
every word it refuses comes with a reason.
`test_judge.py` checks the judge's server side with a stand-in for the AI, so it needs no API key
and costs nothing. `test_classroom.py` plays class races against the server with a pretend clock,
so a five-minute race takes no time. See [Docs/How-Requirements-Are-Met.md](Docs/How-Requirements-Are-Met.md) for
what each test proves.

## How to play

| Key | What it does |
| --- | --- |
| Arrow keys or `W` `A` `S` `D` | Steer |
| `P` or `Space` | Pause |
| `R` | New game |

- The strip above the board is the sentence **block by block**: Subject, Verb, then an Object,
  a Complement or a Modifier, each box holding its words in their part-of-speech colours. The box
  the next word goes in has a green border and names the kinds of word that fit there ("Adjective
  or Noun"); boxes still to come show the kinds of word they are built from, and optional ones are
  dashed. If your words turn into a different sentence shape the topic knows, it switches to that one.
- **The worm only eats a word that fits the next spot** - the right kind of word, with the right
  capital letter, not used already, and (in Real mode) making sense with the words before it.
  Drive into any other word and it is **not eaten**: the tile shakes, a pop-up over the worm says
  what was wrong ("Need a Noun!"), and the strip gives the whole reason until the next word is
  eaten. It costs no points, but it ends a streak.
- Hints start off. Turn them on with the **Hints** button and the words the worm would eat get a
  dashed white outline.
- **Once the sentence is whole, eat a punctuation mark and it is complete.** A mark eaten too
  early is refused like any other word ("Not finished yet! What happens? Add a Verb."). The worm
  stops while the sentence is read back against the checklist - capital letter, subject, verb,
  sounds right, makes sense, end mark - then it goes up on your list and scores 20 points. Press
  an arrow key to carry on.
- After a crash the game holds still for a moment so you can see what you hit, *then* the words
  scatter. Steering is locked during that pause, so you cannot drive into the same wall twice.
- Sentences **in a row** built without a refused word earn a streak bonus, shown with a 🔥 in the
  sidebar.

## The worm shop

Every correct sentence's points are also **saved up** (the ⭐ in the top corner) to spend in the
shop, `shop.html`, on things for the worm to wear:

| Slot | What there is |
| --- | --- |
| Colors | the eight original colours are free; six more (Cotton Candy, Lava, Royal...) are bought |
| Hats | party hat, flower, cap, bow, beanie, top hat, viking helmet, crown, wizard hat |
| Glasses | reading glasses, 3-D, sunglasses, monocle, heart and star glasses |
| Neckwear | bow tie, bandana, scarf, gold medal |
| Patterns | stripes, spots, rainbow, shiny gold, galaxy |
| Trails | sparkles, bubbles, hearts, music notes, confetti puffing out behind the worm |
| Boards | the garden lawn is free; notebook, chalkboard, candy shop, beach, cozy cabin, snow day (with falling snow) and outer space (with twinkling stars) are bought |

- Tap anything to **try it on** in the dressing room before buying. Buying takes two taps, so
  nothing is bought by accident, and the worm puts it on straight away.
- Saved points only go up by playing and down by buying. Prices run from 100 to 1000; a
  sentence is worth 20 (more on a streak).
- The game's sidebar shows the cheapest thing not bought yet, with the worm already wearing it,
  and says when you can afford it.
- The words written on the body always keep their part-of-speech colours. Patterns show on the
  head, on the plain squares, and as a rim around each letter.
- Everything is saved in the browser (`localStorage`), so it belongs to that browser on that
  computer. To give a player points for testing, run this in the browser console:
  `BW.closet.earn(500)`.

## Class races

A whole class plays at once, every child on their own board, racing to build the most correct
sentences before the time runs out. The teacher puts the leaderboard up on the board.

1. **The teacher** starts the server (`./serve.sh`) on their computer, clicks **Run one
   (teachers)** at the bottom of the home page (`teacher.html`), and picks a topic, Real or
   Silly, and how long the race lasts (2, 3, 5 or 10 minutes). Opening the class makes a
   **link** for it, and the page shows the link and a four-letter code.
2. **Each student** goes to the link on their own computer - something like
   `butler-wrist-sisters-soft.trycloudflare.com` - and types the code and their first name. Their
   game opens and waits, and their name pops up on the teacher's screen.
3. The teacher presses **Start the race**. Every game counts down together, then the clock runs.
   Nobody can pause it or start over.
4. Each student plays on their own board, exactly as in an ordinary game. Every sentence the
   checker passes moves them up the board. The sidebar shows the time left and a **mini
   leaderboard**: the top five, and the student's own place if they are further down.
5. The teacher's screen shows the **class leaderboard** live, biggest score first, with a bar for
   each student. Click a name to see every sentence that student wrote.
6. When the time is up every game stops. A sentence whose ending mark was eaten before the bell
   still counts. The teacher sees the top three on a podium and can **print what the class
   wrote**, then **race again** (same class, everyone back to nought) or change the topic or time.

The rules:

- The leaderboard counts **finished sentences** (the worm only finishes correct ones). Two
  students on the same score share the place, and the one who got there first is listed first.
  Nobody has a place until they have a correct sentence.
- Students on the board are shown by first name only. Names are cut to 16 letters, and two
  students cannot have the same one ("Add the first letter of your last name").
- The teacher can take a student out of the class with the **✕** next to their name, before the
  race starts (press it twice - the first press asks). That student can join again. **End the
  race now** and **Close this class** also ask with a second press, not a pop-up box, because
  some browsers never show pop-ups and just answer "no".
- Points a student earns in a race also go into their shop savings, as in an ordinary game.

**The link.** Students reach the teacher's computer through a link, because school Wi-Fi often
will not let one computer reach another - but it lets everyone reach the internet. Cloudflare's
free `cloudflared` program makes the link; the teacher's computer needs it once:
`brew install cloudflared`. (If it is missing, the teacher's page says so and has a **Try
again** button - no restart needed after installing it.)

- The link opens when the teacher opens a class. It is new and random every time, so nobody can
  find it unless the teacher gives it out, and on its own it opens the join page.
- It closes when the teacher presses **Close this class**, or stops the server. After that it
  never works again; the next class gets a new one.
- Only the computer running Bookworms can open or close it. Nobody using the link can.
- The server itself only listens to the teacher's computer. Nothing on the Wi-Fi can reach it
  directly - only through the link.

While a link is open, **anyone who has it can open the game** - the repository being private on
GitHub has nothing to do with it - and anyone who also has the code can join that class. What
they cannot do:

- see anything but the game itself. The server only hands out the pages, `css/`, `js/` and
  `data/`. The `.git` history, `tools/`, `Docs/` and anything else in the folder get "not
  found". (The game's own files are visible to every player - a browser has to download a page
  to show it.)
- see the API key. It is read from `ANTHROPIC_API_KEY` on the teacher's computer and never sent
  anywhere but Anthropic. If the AI judge is on, though, sentences from the link use it (at most
  30 new questions a minute).
- run the race. Only the browser that made the class can start it, end it or remove students.
- score for someone else. Each student's browser has its own secret seat.

So the risk is someone who has the link joining a class they should not, for example with a
silly name. The teacher sees every name as it arrives and can remove it.

**What is kept, and where.** The server keeps each class in memory: the code, the settings, the
students' first names and their sentences. Nothing is written to disk. A class disappears when
the server stops, or after 12 hours without anyone looking at it. Each browser remembers its own
seat (or, for the teacher, the class's key) so a reload carries on where it was.

**Cheating.** Each student's browser reports its own sentences, so a student who knows how to
use the browser's console could send made-up ones. The teacher would see them: every sentence on
the board can be read by clicking the student's name.

## The sentence checker

A sentence is checked **word by word, as it is built** (`js/checker.js`, on the grammar engine in
`js/grammar.js`). Before the worm eats a word, the game asks whether it fits the next spot of a
sentence shape the topic knows - the same list a teacher uses for a complete sentence, one word at
a time:

- **Sounds right** - is it the right kind of word for the next spot? *"ran" is a Verb. After
  "The", the sentence needs a Noun or an Adjective.* *An Adjective goes before the Noun it
  describes: "big dog", not "dog big".* *"chased" needs an object first: chased what?*
- **Capital letter** - *"The" has a capital letter, so it starts a sentence. In the middle of one,
  look for "the".*
- **Makes sense** - is it new, and does it go with the words before it? *"happy" is already in
  your sentence.* *"small" and "tall" do not go together: someone cannot be tall and small at
  once.* *"big" does not go with "tasted". Adjectives that do: "sweet", "fresh", "warm" or "cold".*
- **Subject, Verb and End mark** - a punctuation mark is only eaten once the sentence is whole,
  and only one that suits it: *Not finished yet! What happens? Add a Verb.*

A word that fails is refused with that reason, pinned to the word, and the sentence is left as it
was. `refuse()` in `js/checker.js` works out the reason; `tools/test.js` drives into thousands of
random words and checks that every refusal has one, that every word eaten keeps the sentence on
its structure, and that every sentence finished is correct.

Each topic says which words fit where and which words cannot share a sentence, so the rules catch
nonsense too. In Real mode the topic's `meaning` section catches sentences that sound right but
could not happen (see [Real mode: what makes sense](#real-mode-what-makes-sense)):

- "The mouse carried the horse." - *a horse is too big for a mouse to carry.*
- "The knight flew over the castle." - *only a dragon has wings to fly.*
- "The boy was a teacher." - *a boy cannot be a teacher.*

When punctuation completes a sentence, `check()` reads it back as a checklist on the card, so the
child sees why it is a complete sentence. "Makes sense" is left for the child to check by reading
it out loud - unless the judge has looked at it.

**The structure is the point.** A sentence the topic's shapes do not include is refused, even when
it is good English - "The big fluffy dog ran." has room for one Adjective - and the creativity
comes from the topics and from longer sentences instead. That keeps every sentence the game can
make countable and checkable without an internet connection.

**The judge (`tools/judge.py`)** - optional. An AI (Claude) reads each finished sentence the way a
careful teacher would. It cannot fail a sentence the structure built - every word was checked on
the way in - but it is a second reader for what word lists cannot foresee: it ticks "Makes sense",
praises the sentence, or, when it thinks the sentence sounds odd ("The quick bird jumped quickly."
says the same thing twice), leaves a tip on the card with its own version to try next time.

Without the judge the game works exactly the same, using its rules only.

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
  its note is ready when the worm reaches the punctuation. Turn it off to ask only about
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

  The same file is where the judge saves its answers, so a teacher can read through what it said
  and overrule any of it. The judge never overwrites an entry marked `"by": "teacher"`. Like the
  judge's, a teacher's answer adds a note to the card; it does not fail a sentence the worm built.
- **Tighter word lists.** In `tools/build-topics.py` a topic can say which words fit where (in
  Food, "tastes" only takes taste words and rice never takes "A") and list `clashes`: pairs of
  words that cannot share a sentence, with the reason the child is told -
  `["waited", "quickly", "waiting is not something you can hurry"]`. The worm then refuses the
  second word with that reason. Run `python3 tools/build-topics.py`, then read a sample with
  `python3 tools/list-sentences.py school` and add a clash for anything that reads wrong.

### What is sent to the AI

Only the words of the sentence and the topic's word list. No names, no class, nothing about who
is playing. The API key stays in the terminal running `serve.sh` and is never sent to a browser.

## Files

```
bookworms/
  index.html            the home page: pick your worm and a topic, then play
  game.html             the game itself (game.html?class=BCDF is a class race)
  shop.html             the worm shop: spend points on hats, glasses, colours and more
  join.html             a student joins a class race with the teacher's code
  teacher.html          the teacher runs a class race: the code, Start, the leaderboard
  how-to-play.html      how to play, for the players
  review.html           a short grammar review: kinds of word, the blocks, little rules, a quick check
  serve.sh              starts the local web server
  requirements.txt      the one Python package the (optional) judge needs
  Docs/
    Requirements.md              what the game has to do
    How-Requirements-Are-Met.md  how each one was built
    Design-Patterns.md           the patterns used, where, and what was left out
  css/home.css          styling for the home page
  css/style.css         styling for the game
  css/how.css           styling for the how-to-play page (and the base of the grammar review)
  css/review.css        styling for the grammar review
  css/shop.css          styling for the shop
  css/class.css         styling for the join page and the teacher's page
  data/
    topics.json         the topics offered on the home page
    topics/*.json       THE WORDS AND SENTENCE SHAPES, one file per topic (from tools/build-topics.py)
    verdicts.json       the judge's saved answers, and the teacher's answer key
    worms.json          the worm colours - the ones with a price are bought in the shop
    shop.json           everything else the shop sells, and what it costs
  js/
    home.js             the home page: worm and topic pickers
    shop.js             the shop page: trying on, buying, wearing
    closet.js           saved points, what has been bought, what is being worn
    worm-skin.js        which worm and topic were picked (shared by every page)
    worm-art.js         draws the worm and everything it wears, plus particles (shared by every page)
    board-art.js        draws the boards from the shop (shared by the game and the shop)
    config.js           tweakable numbers: speed, board size, rules, points
    util.js             random-number helpers and the sound effects
    grammar.js          sentence-shape language: which shapes the words fit, what could come next,
                        and which block (Subject, Verb, Object...) each word is in
    sense.js            Real mode: does the sentence make sense (sizes, who can do what)
    checker.js          why a word cannot be eaten; reads back a finished sentence; adds the judge's note
    judge.js            asks the judge: saved answers first, then the server
    review.js           the grammar review's quick check
    worm.js             the worm: its squares, turning, growing, shrinking
    board.js            word tiles: choosing them and finding space for them
    render.js           the game board: tiles, the gliding worm, pop-ups and confetti
    game.js             the game loop and all the rules
    main.js             loads the JSON, starts the game, updates the panels and the check card
    classroom.js        class races: talking to the server, the class clock, remembering your seat
    race.js             a class race in the game: waits for Start, sends sentences, the mini leaderboard
    join.js             the join page
    teacher.js          the teacher's page: setup, who is here, the leaderboard, the podium, printing
  tools/
    serve.py            the local web server, with the judge at /api/judge and class races at /api/class
    judge.py            the sentence judge: asks Claude, saves the answers
    classroom.py        class races: codes, who has joined, the clock and the leaderboard
    test.js             headless checks of the game, no browser needed
    test_judge.py       checks of the judge, no API key needed
    test_classroom.py   checks of class races, with a pretend clock
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

The strip shows each word in its block. `blocksOf()` in `js/grammar.js` reads the block off the
kinds of word and where they sit, the way a teacher marks up a sentence: everything before the
Verb is the Subject, an Adverb is a Modifier, the first phrase after *was* or *tastes* is the
Complement, a Noun or Pronoun phrase after any other verb is an Object, and any other Preposition
starts a Modifier. A shape's `blocks` list (`["Subject", "Verb", "Object", "Modifier?"]`) adds the
optional blocks it has room for.

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

The worm refuses the second word with that reason, the hints never lead to it, and the tests
check that a correct sentence can still always be finished.

### Real mode: what makes sense

The word lists already keep beings, things and places apart. The `MEANING` table in
`tools/build-topics.py` says which of them go together, and `js/sense.js` checks it as each word
is eaten - so the hints never lead to nonsense, and a wrong word gets a reason pinned to it:

| Field | Says | Example |
| --- | --- | --- |
| `tags` | names groups of words | `"flyer": ["dragon"]` |
| `size` | how big something is: 0 you hold it, 1 a mouse, 3 a person, 5 a giant | `"horse": 5` |
| `holds` | the biggest size that fits in / into / inside / through / under a place | `"nest": 1` |
| `verbs` | `who` can do it, `what` it is done to, `bigger` for carry-like verbs, and the `why` | `"flew": {"who": ["flyer"], "why": "only a dragon has wings to fly"}` |
| `adjectives` | what an Adjective can describe | `"tall": {"what": ["being"]}` |
| `canBe` | "The boy was a ___" | `"teacher": ["friend", "reader"]` |

A list names words or tags, and `"!"` rules one out (`"who": ["!horse"]`). Pronouns could be
anyone, so they are never ruled out, and a word the table does not mention is never blocked.
`build-topics.py` refuses to build if the table names a word the topic does not have.

Silly mode uses a looser copy of the sentence shapes that `build-topics.py` writes into each topic
file under `"silly"`, and ignores the meaning table and the meaning clashes.

`tools/list-sentences.py` still samples by shape and clashes only, so it can show sentences that
Real mode's meaning table would turn down.

### Add a worm colour

Add an entry to `data/worms.json` and it appears on the home page immediately:

```json
{ "id": "coral", "name": "Coral", "body": "#f2857a", "head": "#c9524a" }
```

Give it a `"price"` and it is sold in the shop instead, and only shows on the home page once
bought. `body` colours the worm's plain squares (lightening towards the tail) and `head` colours
its head. The squares carrying letters keep their part-of-speech colours, with the worm colour
as a rim around them.

### Add something to the shop

Add an entry to `data/shop.json` - `slot`, `id`, `name` and `price` - then draw it in
`js/worm-art.js`: hats in `hat()`, glasses in `glasses()`, neckwear in `neckwear()`, patterns in
`bodyFill()` / `patternMarks()`, trails as a particle kind in `Particles`, and boards in
`js/board-art.js` (a `paint` for the still part, an optional `move` for what moves, and a `frame`
colour). Boards are only ever background: tiles and letters keep their colours on all of them. Each drawing is sized as
a fraction of one body square, so it works on the board and in the shop alike. `node tools/test.js`
checks that every slot has a free starting item and every price is sensible.

### Change how it feels

Everything tunable is in `js/config.js` with a comment: board size, worm speed, how much the worm
grows, how many words are on the board at once, points, sound on or off, and what a crash does.

## Ideas for the next version

- Questions: a shape like *Was the dog happy?* that ends with **?** (the engine already supports
  a shape that only takes `?`; no topic has one yet).
- Two players on one board.
- Keep a class's results after the server stops, so a teacher can look back over the week.

## Documentation

- [Docs/Requirements.md](Docs/Requirements.md) - the requirement list.
- [Docs/How-Requirements-Are-Met.md](Docs/How-Requirements-Are-Met.md) - requirement by
  requirement: what was built, which lines do it, and how to verify it.
- [Docs/Design-Patterns.md](Docs/Design-Patterns.md) - the design patterns used, where each one
  lives, why it earns its place, and which ones were deliberately left out.
- Every `.js` file opens with a comment saying what it is for, and the rules themselves are
  commented in place.
