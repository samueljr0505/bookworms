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

**Where:** `js/grammar.js`, driven by `data/packs/starter.json`.

A sentence pattern is a miniature language:

```json
["determiner", "adjective?", "noun", "verb", "adverb?"]
```

`allowedPos()` (`js/grammar.js:25`) and `accept()` (`js/grammar.js:48`) are its interpreter. They
walk the slot list and decide what may be eaten next; `?` means the slot may be skipped.

This is the single most important design decision in the project. Because the interpreter is the
only way a word can enter a sentence, **grammatical correctness is a property of the design, not a
check that runs afterwards.** There is no `isThisSentenceOk()` function anywhere, and there does
not need to be.

It is also what makes the game extensible by a child: a new sentence shape is three lines of JSON
and no JavaScript.

---

## 3. Data-driven design / external configuration

**Where:** `data/packs/*.json` for content, `js/config.js` for feel.

Two separate knobs for two separate audiences:

- **`data/packs/starter.json`** holds the words, the parts of speech, the sentence patterns, the
  punctuation, the colours and the kid-friendly labels ("Naming Word", not "noun"). Nothing in
  the JavaScript hard-codes a part of speech - the legend, the tile colours and the hint text are
  all generated from this file, so adding a new part of speech needs no code at all.
- **`js/config.js`** holds board size, speed, delays, scoring and rule variants.

**Why it matters here:** the target user is a 3rd-5th grader. The most valuable thing they can
change is content, and content changes must not be able to break the program.

---

## 4. Strategy (selected by name from config)

**Where:** `js/config.js:26-29`, applied in `js/game.js:132` and `js/game.js:137`.

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

**Where:** `js/game.js:8` takes `hooks`, and calls them via `say()` (`js/game.js:259`) and
`notify()` (`js/game.js:263`). `js/main.js:119` supplies them.

```js
new BW.Game(pack, canvas, { onChange: renderHud, onMessage: showMessage });
```

The game never touches the sidebar, the score element or the message strip. It announces that
something changed; `main.js` decides what that looks like on screen. You can drive the whole game
from `tools/test.js` with no hooks at all and nothing complains.

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

**Where:** `this.mode` in `js/game.js`, switched in `frame()` (`js/game.js:74-90`) and guarded in
`handleKey()` (`js/game.js:57-59`).

Four modes: `countdown`, `playing`, `crashed`, `paused`. Each one answers two questions
differently - what happens on a tick, and whether steering is accepted.

The crash delay is why this pattern earns its place. A crash is deliberately **two beats**:

1. `crash()` (`js/game.js:151`) stops the worm, shakes the board, and enters `crashed`. The
   sentence is still written along the body and the words are still where they were.
2. `crashDelayMs` later, `scatterAfterCrash()` (`js/game.js:178`) wipes the sentence, drops the
   words off the body and scatters them back across the board.

Doing both in the same instant was too fast to follow - words teleported before the player could
register what they had hit. Steering is locked in between so nobody drives into the same wall
twice.

Right now the modes are a string plus conditionals, which is honest at four modes. When a fifth
arrives (a pack picker, a tutorial, an end-of-round summary), convert to a map of
`{ enter, update, handleKey }` objects before the conditionals spread across the file.

---

## 7. Dependency injection (small and specific)

**Where:** `js/board.js:6` - `new Board(cols, rows, measureCells)`.

The board has to know how many grid squares the word "elephant" needs, and only the canvas can
measure text. Rather than let the board reach for a canvas, `game.js:11` hands it a function:

```js
new BW.Board(cols, rows, text => this.renderer.measureCells(text));
```

The board stays free of any drawing code, and `tools/test.js` passes a fake measurer based on
letter count. One seam, one line, and the model layer stays clean.

---

## 8. Factory

**Where:** `BW.Grammar.newSentence(pack, rng)` (`js/grammar.js:115`).

Callers never construct a `Sentence` themselves or choose a pattern. They ask for a new sentence
and get one with a random pattern already attached. `Sentence` is not even exported - the factory
is the only door in.

---

## 9. Module pattern (IIFE + one namespace)

**Where:** `js/grammar.js`, `js/util.js` and `js/main.js` are wrapped in
`(function () { ... })()`; everything public hangs off a single global, `BW`.

Helpers like `slotPos`, `VOWELS`, `tone()` and `renderHud` stay private. There is no build step,
no bundler and no `npm install` - the files load as plain `<script>` tags in dependency order and
a student can edit one and hit reload.

ES modules would give stricter encapsulation and explicit imports, and the project already
requires a local server, so they are viable. They are not used yet because `BW.Worm` is easier for
a beginner to follow than an import graph. Worth revisiting if the file count doubles.

---

## 10. Immediate-mode rendering

**Where:** `Renderer.draw(state)` (`js/render.js`), called every frame from `js/game.js:100`.

There are no sprite objects, no retained scene graph and no dirty-checking. Every frame redraws
the whole board from the current state, and the renderer keeps almost nothing of its own - just a
shake counter. `viewState()` (`js/game.js:104`) assembles a read-only snapshot for it, including
an `isTileValid` callback so the renderer can highlight correct words without knowing the grammar
rules.

The consequence worth knowing: **state changes can never desynchronise from the picture**, which
is the usual source of maddening bugs in a first game. At 34x22 squares it costs nothing.

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
- **A grammar checker.** The interpreter makes wrong sentences unconstructable, so there is
  nothing left to check. `tools/test.js` verifies this claim rather than the game relying on it.
