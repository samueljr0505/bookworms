# How each requirement is met

The requirement list itself lives in [Requirements.md](Requirements.md). This file is the
answer sheet: for every requirement, what was built, which lines of code do it, and how to
check it yourself.

Run `node tools/test.js` from the project root for the automated checks referred to below.

---

## Req 1 - The worm moves with the arrow keys and WASD

**Status: done.**

A single key table maps both sets of keys onto the same four directions, so
`ArrowUp` and `w` are literally the same input.

- `js/game.js:37` - `Game.KEYS` maps `ArrowUp/Down/Left/Right` and `w/a/s/d` to direction vectors.
- `js/game.js:42` - `handleKey()` lower-cases single characters, so `W` works as well as `w`,
  and calls `preventDefault()` so the arrow keys do not scroll the page.
- `js/worm.js:21` - `turn()` refuses a 180-degree flip while the worm is moving (standard
  snake rule), **except** when the worm is standing still after a crash: then the whole worm
  flips around and the tail becomes the head, so a player who is stuck facing a wall is never
  trapped.
- Steering is ignored during the countdown and while paused (`js/game.js:51-53`).
- Extra keys: `P` or `Space` pauses, `R` starts a new game.

**Check it:** press each of the eight keys and watch the worm turn. Automated: test 4 in
`tools/test.js` covers the reverse rule and the turn-around.

---

## Req 2 - When the worm touches a word, that word is correctly selected

**Status: done.**

Words are not single squares - a word like `elephant` is several grid squares wide. The head
touching **any** square of a tile selects that whole tile, and never a neighbouring one.

- `js/board.js:56` - `tileAt(x, y)` returns the tile whose row matches and whose horizontal
  span covers `x`.
- `js/game.js:144` - after every move, the head's square is looked up and `eat()` is called
  with the tile it found.
- `js/board.js` `place()` / `findSpot()` keep a one-square gap around every tile, so two words
  can never share or touch a square and there is no ambiguity about which one you ate.
- `js/game.js:181` - a correct word is appended to the sentence, scores points, and grows the
  worm; a wrong word is rejected with an explanation of what was needed instead
  (`whyNot()`, `js/game.js:195`).

**Check it:** eat a long word from its left end, its middle, and its right end - the same word
is selected every time. Automated: test 3 in `tools/test.js` asserts that tiles never overlap,
never sit on the worm, and that every square of every tile resolves back to that same tile.

---

## Req 3 - Initial delay when the game begins (nice to have)

**Status: done.**

- `js/config.js:8` - `startDelayMs: 3000`, easy to change.
- `js/game.js:27` - a new game starts in `countdown` mode with the timer set.
- `js/game.js:74-81` - the timer counts down, beeps once per second, then switches to
  `playing`, sets the worm moving, and plays a "go" chime.
- `js/render.js:154` - draws the big 3 / 2 / 1 / Go! with a pulse, plus the
  "Arrow keys or W A S D to steer" reminder.

The worm does not move and cannot be steered until the countdown ends, so nobody loses a
sentence before they have looked at the board.

**Check it:** reload the page, or press `R`. Set `startDelayMs: 0` in `js/config.js` to skip it.

---

## Req 4 - The sentences that are formulated are grammatically correct

**Status: done - correct by construction, not by checking afterwards.**

Each sentence follows a **pattern**, which is a list of slots such as
`["determiner", "adjective?", "noun", "verb", "adverb?"]`. A `?` marks an optional slot.
Patterns live in `data/packs/starter.json` and every word in the word bank is filed under its
part of speech.

The rules that keep sentences correct:

1. **Only a word that fits the next slot can be added.** `allowedPos()` (`js/grammar.js:25`)
   returns the next required slot plus any optional slots in front of it; `accept()`
   (`js/grammar.js:48`) refuses anything else. A wrong word bounces off with a hint - it is
   never added to the sentence.
2. **The sentence cannot be ended early.** `canEnd()` (`js/grammar.js:38`) is only true once
   every remaining slot is optional, so a subject with no verb can never be punctuated.
3. **"a" becomes "an" before a vowel.** `text()` (`js/grammar.js:78`) fixes the article when it
   renders, so "a elephant" is impossible.
4. **The first word is capitalised** and the ending mark is appended (`js/grammar.js:86`).
5. **Subject-verb agreement is sidestepped on purpose.** Every verb in the pack is past tense
   (`ran`, `sang`, `wiggled`), which agrees with any subject, singular or plural. That keeps the
   first version simple. If you add present-tense verbs later you will need agreement tags -
   see the note in `README.md`.

**Check it:** tests 1 and 2 in `tools/test.js` play 4000 sentences - 2000 with correct picks and
2000 with deliberate button-mashing - and independently re-parse every finished sentence against
its pattern, checking slot order, no skipped required slots, capitalisation, end punctuation, and
the a/an rule. The button-mashing run is the important one: it proves that wrong picks cannot
sneak into a finished sentence.

Sample output:

```
My pizza marched.
This grumpy elephant ran under our silly penguin!
An astronaut hopped!
The sleepy dog painted happily.
A fuzzy teacher sang under our wiggly rocket.
```

---

## Req 5 - When a wall is hit, words are redispersed (nice to have)

**Status: done, and extended twice as requested - a crash costs you the sentence, and it now
happens in two beats instead of all at once.**

Crashing into a wall **or biting your own body** runs the same handler.

**Beat one** - `crash(reason)` (`js/game.js:151`):

1. The worm stops. It does not die, and the game never ends.
2. The board shakes, a thud plays, and the message strip names what you hit.
3. Mode becomes `crashed` and steering is locked, so nobody drives straight back into the
   same wall.
4. **Nothing moves yet.** The sentence is still written along the worm's body and every word
   tile is still where it was.

**Beat two**, `crashDelayMs` later (900ms by default) - `scatterAfterCrash()` (`js/game.js:178`):

5. The sentence is wiped - `reset()` (`js/grammar.js:63`) clears the tokens and returns them,
   keeping the same pattern so you retry the same shape of sentence.
6. The words fall off the body - `dropCarried()` (`js/worm.js:63`) empties the body and shrinks
   the worm by exactly the letters those words had written into it.
7. Everything is scattered back across the board. `disperse(..., returnWords)`
   (`js/board.js:69`) places the returned words **first**, so the words you lost are guaranteed
   to be out there to collect again, mixed in with a fresh set of others.
8. Play resumes with the worm standing still, waiting for a direction.

**Why the delay exists.** In the first version the words were redispersed the same instant the
worm stopped. That was too fast to react to - and often impossible to react to, because the board
rearranged itself before the player had registered the crash. The pause holds the crash on screen
long enough to see what was hit and read the sentence one last time before it falls apart. It is
tunable in `js/config.js` (`crashDelayMs`), and the lock on steering during it is deliberate.

Your score and your finished sentences are **not** taken away - only the sentence in progress.

The worm shrinking back is not only thematic. Without it, a long worm could end up permanently
pinned against its own body after a self-bite, with no legal move.

Rule variants live in `js/config.js:26-29`: `wallBehavior` (`'reset'` or `'wrap'`) and
`selfCollision` (`'reset'` or `'ignore'`) for a gentler game with younger players.

**Check it:** build up two or three words, then drive into a wall and watch. Automated: test 5 in
`tools/test.js` confirms every eaten word comes back onto the board, that the body was carrying
exactly what the sentence had, and that a legal move always exists afterwards; tests 6 and 7 cover
the drop and the self-bite rule (the tail square is safe, because it moves away as you arrive).

---

## Req 6 - Punctuation ends the current sentence

**Status: done.**

- Punctuation marks are data, not code - `data/packs/starter.json` lists `.` and `!`.
- `js/board.js:110` - punctuation tiles only appear once `canEnd()` is true and at least one
  word has been eaten, so there is never a full stop available for an empty sentence.
- `js/grammar.js:71` - `end(mark)` double-checks `canEnd()` before accepting the mark, so even a
  stale tile cannot end a sentence early.
- `js/game.js:170` - eating a mark finishes the sentence: it is added to the "Sentences you
  wrote" list, scores a bonus, plays a jingle, clears the words off the worm's body (leaving one
  trophy square behind), speeds the game up slightly, and draws a brand new pattern.
- The in-game instructions say it in as many words: *"Eat a punctuation mark (. or !) to end the
  sentence."*
- Only `.` and `!` ship in the starter pack. `?` is deliberately left out because the current
  patterns are all statements - see `README.md` for how to add question patterns.

**Check it:** build any sentence until the strip says "a punctuation mark (. or !) to end it",
then eat the mark.

---

## Req 7 - Motivating sound effects

**Status: done.**

Short synthesised blips, built with the Web Audio API - no sound files to download, nothing to
keep in sync, and the whole thing is about 30 lines.

- `js/util.js` - `BW.Sound` with one function per moment:
  - `correct()` - a rising two-note chirp when you eat the right word.
  - `sentence()` - a four-note fanfare when you finish a sentence.
  - `wrong()` - a short low buzz for a wrong pick.
  - `bonk()` - a dull thud when you crash.
  - `tick()` / `go()` - the countdown beeps and the starting chime.
- The audio context is created on the first sound and resumed if the browser suspended it, which
  is what browsers require - they will not play audio until the player has interacted with the
  page.
- Turn it all off with `sound: false` in `js/config.js` (useful for a classroom of 25).

**Check it:** play with the volume up. The countdown alone tells you it is working.

---

## The worm's body is the sentence

Not a numbered requirement, but the idea behind the game, so it is worth its own section.

Every word you eat is written into the worm's body - **one letter per square**, coloured by its
part of speech to match the tile it came from. The head stays blank: that is where you are writing.

The sentence always reads the normal way round - left to right when the worm is lying flat, top to
bottom when it is standing on end - **whichever direction the worm is travelling**.

- `js/worm.js:51` - `carry()` adds the word and grows the body by `word.length`.
- `js/worm.js:79` - `bodyLabels()` lays the letters out by screen position rather than by position
  along the body: it measures the written stretch end to end, takes the longer axis, and gives the
  first letter to whichever end a reader reaches first. Laying them out along the body instead
  spells everything backwards the moment the worm turns left or up. It returns plain
  `{ char, pos }` data, so the renderer chooses colours and the worm never learns what a colour is.
- A word stretched around a corner is laid out by whichever axis it covers most - the best that
  can be done with a bent worm.
- `js/render.js` - `drawWorm()` paints each square in its part-of-speech colour with its letter on
  top; squares with no letter stay plain green.
- `js/game.js:250` - finishing a sentence clears the body, leaving `trophyPerSentence` squares
  behind. That trophy is the only way the worm grows permanently.

This makes three rules obvious without anyone explaining them:

- **Long words make you long.** Eating `elephant` costs you eight squares of body to steer around.
  That is a real trade-off the player chooses.
- **Crashing gives the words back**, because you watch them fall off the body.
- **Finishing clears the body**, because the sentence has gone up on the list.

---

## Beyond the seven requirements

Small things added because the game needed them to be playable for 3rd-5th graders:

- **Hints.** Tiles that would be a correct pick get an animated dashed outline. Toggle with the
  "Hints" button (`js/render.js` `drawTiles`, `js/main.js`).
- **Plain-English labels.** "Naming Word" rather than "noun", with the grown-up word available in
  the pack file. Labels and colours are data (`pos` in the JSON), not code.
- **A wrong pick teaches.** "\"quickly\" is a How Word. You need a Naming Word."
  (`whyNot()`, `js/game.js:195`).
- **The board is always winnable.** Every disperse guarantees at least two correct choices.
- **No game over.** Crashes cost progress, never the session.
