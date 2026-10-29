# Design patterns in Bookworms

Which patterns this codebase actually uses, where, and why. Patterns that were deliberately
*not* used are at the bottom, because leaving something out is a design decision too.

The guiding constraint: a 10-year-old should be able to open `js/worm.js` and recognise a worm.
Every layer of indirection is legibility spent, so each pattern here has to pay for itself.

---

## 1. Model - View - Controller

**Where:** the whole file layout.

| Role | Files | Knows about |
| --- | --- | --- |
| Model | `js/worm.js`, `js/board.js`, `js/grammar.js` | nothing but plain data |
| View | `js/render.js`, the HUD half of `js/main.js` | the model, read-only |
| Controller | `js/game.js` | both |

The model files never mention `document`, `canvas`, or `window`. That is not tidiness for its
own sake - it is what lets `tools/test.js` play thousands of games in a couple of seconds with no
browser anywhere. Every rule in the game is testable because the rules do not know they are
being drawn.

**The rule to protect:** if you ever need the DOM inside `worm.js`, `board.js` or `grammar.js`,
the design has gone wrong. Pass the value in instead.

---

## 2. Interpreter (a tiny language for sentences)

**Where:** `js/grammar.js`, driven by the topic files in `data/topics/`.

A sentence pattern is a miniature language:

```json
"<subject> verb adverb? ( , conjunction <clause> )?"
```

Parts of speech, commas, exact words (`'and'`), optional parts (`?`), repeats (`*`, `+`),
choices (`|`) and named phrases from the pack's `rules` (`<subject>`). `parse()` reads it into a
tree and `compile()` turns the tree into a small state machine (a Thompson NFA). A `Sentence`
runs one machine per shape in the topic, side by side, as the player eats: `add()` moves them
all on, `live()` says which shapes the words could still become, `wants()` and `fits()` say what
would keep the sentence on track (the hints, and the gate on what the worm eats), `outline()` and
`segments()` lay out the strip block by block, and `trace()` finds the first word no shape could
take (the checker's explanation).

**This is "correct by construction" - again, on purpose.** The interpreter is the only door into
a sentence: a word that does not move some machine forward is not eaten, so a finished sentence
cannot be wrong. An earlier version did exactly this, then moved to letting every word onto the
worm and judging the sentence when punctuation ended it, for three reasons. Here is what changed
about each:

- *A child was marked wrong one word at a time, with no reason.* Now every refused word comes
  with one, pinned to that word - what kind of word it is and what the sentence needs instead
  (`refuse()` in `js/checker.js`) - which is the moment the child can still act on it.
- *It passed sentences that fit a shape and still made no sense ("The apple tastes big.").* The
  topics now say which words fit where, list clashes, and carry a `meaning` section
  (`js/sense.js`), and `fits()` asks all of them before a word is eaten.
- *It refused good English the shapes did not include ("The big fluffy dog ran.").* Still true,
  and now the point: a structure the child can see and follow, and a world of sentences small
  enough to count and check offline. The creativity comes from the topics and longer sentences.

Free building had a cost of its own: a sentence could go wrong at word two and the child only
found out at the end, then had to rebuild it from scratch.

It is still what makes the game extensible by a child: a new sentence shape is one line of JSON
and no JavaScript.

---

## 3. Data-driven design / external configuration

**Where:** `tools/build-topics.py` -> `data/topics/*.json` for content, `js/config.js` for feel.

Two separate knobs for two separate audiences:

- **The topic files** hold the words, the parts of speech, the sentence shapes, the clashes, the
  punctuation, the colours and the labels. They are written by `tools/build-topics.py`, where
  every topic shares one grammar - Subject, Verb, Object, Modifiers - and differs only in its
  word lists, so a new topic is a page of words and no code. Nothing in the JavaScript
  hard-codes a part of speech - the legend, the tile colours and the hint text are all generated
  from the topic file.
- **`js/config.js`** holds board size, speed, delays, scoring and rule variants.

**Why it matters here:** the target user is a 3rd-5th grader. The most valuable thing they can
change is content, and content changes must not be able to break the program.

---

## 4. Strategy (selected by name from config)

**Where:** `wallBehavior` and `selfCollision` in `js/config.js`, applied in `step()` in `js/game.js`.

```js
wallBehavior: 'reset',    // or 'wrap'
selfCollision: 'reset',   // or 'ignore'
```

Crash handling is a named, swappable rule rather than a hard-coded behaviour, so a teacher can
make the game gentler for younger players without touching the game loop.

It is currently the simplest form of the pattern - a string checked in a conditional. Promote it
to a map of named functions (`CRASH_RULES[cfg.wallBehavior](game)`) the moment a third variant
appears; until then the conditional is easier to read.

---

## 5. Observer (callbacks out of the game loop)

**Where:** the `Game` constructor in `js/game.js` takes `hooks`, and calls them via `say()`,
`notify()` and, for the sentence check, `show()`. `boot()` in `js/main.js` supplies them.

```js
new BW.Game(pack, canvas, { onChange: renderHud, onMessage: showMessage, onReport: renderReport });
```

The game never touches the sidebar, the score element, the message strip or the check card. It
announces that something changed - `onReport` hands over the checker's report, or `null` to put
it away - and `main.js` decides what that looks like on screen. You can drive the whole game from
`tools/test.js` with no hooks at all and nothing complains.

Class races are the proof that this pays. The game had to start telling a server about every
sentence it checked, and the rules did not learn about the network to do it: there is one more
hook, `onSentence(verdict, text)`, and in a class race `main.js` points it at `js/race.js`, which
does the sending. In an ordinary game the hook is empty and nothing is sent.

**Known limit, and the next thing to fix.** Sound is *not* routed this way - `game.js` calls
`BW.Sound.correct()` directly, so the rules engine knows about audio. Every new reaction (score
popups, a streak counter, logging which words a student keeps getting wrong) would mean another
line inside the rules. The fix is a proper event emitter:

```js
this.emit('word:eaten', { word, pos, correct: true });
```

with sound, the HUD and anything later subscribing. This is the one place the current design will
bend as the project grows.

---

## 6. State machine (game modes)

**Where:** `this.mode` in `js/game.js`, switched in `frame()` and guarded in `handleKey()`.

Eight modes: `countdown`, `playing`, `crashed`, `paused`, `checking`, `checked`, and for a class
race `waiting` (for the teacher to press Start) and `over` (the time is up). Each one answers two
questions differently - what happens on a tick, and what a key press does.

The crash delay is why this pattern earned its place. A crash is deliberately **two beats**:

1. `crash()` stops the worm, shakes the board, and enters `crashed`. The sentence is still
   written along the body and the words are still where they were.
2. `crashDelayMs` later, `scatterAfterCrash()` wipes the sentence, drops the words off the body
   and scatters them back across the board.

Doing both in the same instant was too fast to follow - words teleported before the player could
register what they had hit. Steering is locked in between so nobody drives into the same wall
twice.

Finishing a sentence is the same idea. Eating punctuation enters `checking`: the worm stops and
the card shows the sentence with its checklist pending, for at least `checkMs` and until the judge
has answered or given up. `settle()` then finishes the sentence and enters `checked`, where the
card stays up until the child presses a key - the game waits for them rather than for a timer.

A refused word is deliberately *not* a mode. The worm keeps moving over it, because stopping the
game for every bump would make exploring the board feel like a punishment; the reason waits on
the strip instead, until the next word is eaten.

A class race's bell works the same way. `timeUp()` stops the game at once - unless a sentence is
in `checking`, because its ending mark was eaten in time. Then the game only notes that the time
is up, lets the check finish and count, and `settle()` stops it.

The modes are still a string plus conditionals. This doc said to convert them to a map of
`{ enter, update, handleKey }` objects when a fifth mode arrived; with eight, that conversion is
now overdue, and is the next tidy-up for `game.js`.

---

## 7. Dependency injection (small and specific)

**Where:** `js/board.js:6` - `new Board(cols, rows, measureCells)`.

The board has to know how many grid squares the word "elephant" needs, and only the canvas can
measure text. Rather than let the board reach for a canvas, the `Game` constructor hands it a function:

```js
new BW.Board(cols, rows, text => this.renderer.measureCells(text));
```

The board stays free of any drawing code, and `tools/test.js` passes a fake measurer based on
letter count. One seam, one line, and the model layer stays clean.

---

## 8. Factory

**Where:** `BW.Grammar.newSentence(pack, rng)` (`js/grammar.js`).

Callers never construct a `Sentence` themselves or choose a pattern. They ask for a new sentence
and get one with a random pattern already attached. `Sentence` is not even exported - the factory
is the only door in.

---

## 9. Module pattern (IIFE + one namespace)

**Where:** `js/grammar.js`, `js/util.js` and `js/main.js` are wrapped in
`(function () { ... })()`; everything public hangs off a single global, `BW`.

Helpers like `compile`, `VOWELS`, `tone()` and `renderHud` stay private. There is no build step,
no bundler and no `npm install` - the files load as plain `<script>` tags in dependency order and
a student can edit one and hit reload.

ES modules would give stricter encapsulation and explicit imports, and the project already
requires a local server, so they are viable. They are not used yet because `BW.Worm` is easier for
a beginner to follow than an import graph. Worth revisiting if the file count doubles.

---

## 10. Immediate-mode rendering

**Where:** `Renderer.draw(state)` (`js/render.js`), called every frame from `frame()` in `js/game.js`.

There are no sprite objects, no retained scene graph and no dirty-checking. Every frame redraws
the whole board from the current state, and the renderer keeps almost nothing of its own - just a
shake counter. `viewState()` in `js/game.js` assembles a read-only snapshot for it, including
an `isTileValid` callback so the renderer can highlight words that keep the sentence on track
without knowing the grammar rules.

The consequence worth knowing: **state changes can never desynchronise from the picture**, which
is the usual source of maddening bugs in a first game. At 34x22 squares it costs nothing.

---

## 11. Layered judgment (rules decide, then a judge and a teacher add notes)

**Where:** `js/checker.js` (`refuse()`, `check()` and `decide()`), `js/judge.js`, `tools/judge.py`,
`data/verdicts.json`.

A sentence is judged by three sources, each trusted for what it is actually good at:

| Who | Good at | Never trusted with |
| --- | --- | --- |
| The rules (`refuse()`, `check()`) | Shapes: the kind of word for each spot, capital letters, a word said twice, clashes, the topic's meaning table, end marks. Instant, offline, exact about *which* word. They decide what the worm eats. | Meaning the topic did not foresee |
| The judge (Claude, via `tools/judge.py`) | Reading a finished sentence like a teacher: ticks "Makes sense", praises it, or leaves a tip with its own version. | Failing a sentence the structure built |
| A teacher (`data/verdicts.json`) | The judge's answer for any sentence, written by hand | - |

`refuse()` runs before every word is eaten and `check()` when a sentence is finished; together
they make the decision. `decide()` only adds the judge's note to the finished sentence's card.

The judge's answers reach the game through a chain where each link can be missing:
`data/verdicts.json` (a teacher's ruling, or a saved answer) is tried first, then this session's
memory, then the server, and if none of them answers within `judgeWaitMs` the rules decide alone.
**A missing judge is never an error**: no Python package, no API key, no internet, a static host
with no server - the game behaves exactly as it did, with "Makes sense" left for the child to
check by reading aloud.

Every answer the judge gives is written to `data/verdicts.json`, so the AI's work accumulates into
a reviewable answer key: the same sentence always gets the same answer, nothing is asked twice,
the file works with no server at all, and a teacher can overrule any entry by marking it
`"by": "teacher"`, which the judge never overwrites.

---

## The worm's body as the display

Worth calling out on its own, because it is where the design and the teaching idea meet.

Eating a word writes it into the body - one letter per square, coloured by its part of speech
(`Worm.carry()`, `js/worm.js:51`). `bodyLabels()` (`js/worm.js:79`) is the only place that knows
the layout, and it returns plain `{ char, pos }` data so the renderer picks the colours and the
worm never learns what a colour is.

The layout is decided by **where the squares sit on screen, not by their position along the
body**. The stretch of written squares is compared end to end, the longer axis wins, and the end
that a reader would reach first gets the first letter. So the sentence reads left to right when
the worm is lying flat and top to bottom when it is standing on end, whichever way it happens to
be pointing. Laying the letters out along the body instead - the obvious first implementation -
spells everything backwards as soon as the worm travels left or up.

That single decision makes three separate rules obvious without any explaining:

- Long words make you long - a real cost, chosen by the player.
- Crashing gives the words back, because you can watch them fall off the body.
- Finishing a sentence clears the body, because the sentence has gone up on the list.

---

## Deliberately not used

- **Entity-component-system.** There is one worm and a handful of tiles. An ECS would be more
  code than the game.
- **Object pooling.** Nothing here allocates fast enough to matter.
- **Command pattern / undo stack.** Nothing needs to be undone or replayed. Worth revisiting only
  if a teacher-facing replay of a student's session is ever built - that is exactly what a command
  log would enable.
- **A DI container.** One injected function (pattern 7) does not need a framework.
- **An abstract `Entity` base class.** The worm and a word tile have nothing meaningful in common;
  a shared base class would invent a relationship that does not exist.
- **Free building, judged at the end.** Every word went onto the worm and the sentence was checked
  when punctuation ended it. It let a child finish a thought, but a sentence could go wrong at
  word two with nobody saying so until the end, and the judge had to rescue good English the
  shapes did not include. Word-by-word refusal, with a reason for each word, replaced it (pattern 2).
- **Letting the AI decide.** The judge cannot fail or rescue a sentence. What the worm eats is a
  fixed rule about the game's own tiles, the rules are never wrong about them, and a rule a child
  can learn should not depend on a model's mood.
- **Calling the AI from the browser.** The API key would have to be in the page, where anyone can
  read it. The browser asks `tools/serve.py`, which holds the key and only accepts sentences made
  of the topic's word tiles.
- **Hand-written meaning rules.** An earlier version tagged every noun with what it is (person,
  creature, food) and every verb with what it accepts, so "the book chased Omar" could be refused.
  It needed a tag for every word, broke quietly when one was missing, and still could not cover
  meaning in general. The judge does that job now, and the tagging code is gone from
  `js/grammar.js`.
