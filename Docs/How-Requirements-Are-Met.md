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
- Steering is ignored during the countdown, while paused, and while a sentence is being checked
  (`handleKey()` in `js/game.js`). Once the check card is up, an arrow key puts it away and
  sets off in that direction.
- Extra keys: `P` or `Space` pauses (`Space` also closes the check card), `R` starts a new game.

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
- `eat()` in `js/game.js` - the word is added to the sentence and written onto the worm,
  whatever it is, and the message strip names its kind ("dog" - a Noun). Whether it was the
  right word is decided once, when the sentence is checked (Req 4).

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

**Status: done - every sentence is checked when punctuation ends it, and only a correct one
counts.**

Each topic describes its sentences as **shapes**, written in a small shape language such as
`"determiner adjective? noun verb adverb?"` - parts of speech, optional parts (`?`), and, for
bigger topics, commas, exact words, repeats, choices and reusable phrases. The shapes live in the
topic files in `data/topics/`, and every word is filed under its part of speech.

The player can eat any word - it goes onto the worm whatever it is. When they eat a punctuation
mark, the sentence is checked against the list a teacher uses for a complete sentence:

| Line | What is checked | By |
| --- | --- | --- |
| Capital letter | the first word starts with one | rules |
| Noun | there is a who or what | rules |
| Verb | something happens | rules |
| Sounds right | the words are in an order one of the topic's shapes allows | rules, then the judge |
| Makes sense | the words fit together, and no word is used twice | the judge (a repeated word: rules) |
| End mark | the right mark for that kind of sentence - questions take `?` | rules |

1. **The rules** (`check()` in `js/checker.js`) run first, instantly and with no internet. The
   grammar engine (`js/grammar.js`) runs every shape side by side, so it knows whether the words
   make a whole sentence of some shape, whether they could still become one, or exactly which
   word broke every shape. That gives three verdicts:
   - **correct** - it fits a shape and every line passes;
   - **unfinished** - every word fits so far, but something is missing. The words stay on the
     worm and the player is told what to add ("What happens? Add a Verb.");
   - **wrong** - with a reason pinned to the word: "An Adjective goes before the Noun it
     describes: "big dog", not "dog big".", ""dog cat" is two Nouns in a row", ""The dog ran"
     was already a whole sentence, so "slowly" does not fit after it".
2. **The judge** (`tools/judge.py`, optional) is then asked the two questions shapes cannot
   answer: does it sound right, and does it make sense? `decide()` folds its answer in. It
   catches sentences that fit a shape and are still wrong ("The apple tastes big.",
   "A rice is soft.") and rescues good English the shapes do not include ("The big fluffy dog
   ran."). It never overrules capital letters, repeated words or end marks.
3. **A teacher** can overrule both by editing `data/verdicts.json`.

A wrong sentence cannot be mended - a worm only eats forwards - so its words go back on the board
and the player builds the same recipe again, with the reason in front of them. Only a correct
sentence goes on the list. `text()` turns "a" into "an" before a vowel and attaches commas to the
word before them, but leaves capital letters exactly as the tiles have them, so a missing
capital is something the checker points out rather than something quietly fixed.

**Check it:** eat "The", "dog", then a punctuation mark - the card says the sentence is not
finished and asks for a Verb. Automated: `tools/test.js` plays 2000 sentences per topic with good
picks (every one must be marked correct) and 2000 with random picks, checking every time a mark is
eaten. Every sentence the rules pass is independently re-parsed against the shapes (walking the
shape trees directly, not the game's state machine), with its capital letter, end mark, a/an and
repeated words checked too; every "unfinished" verdict must be words that can still grow into a
sentence; every "wrong" verdict must come with a reason, pointing at a word when the shape is the
problem. A table of real sentences per topic pins down the exact verdict and reason for each kind
of mistake, a made-up pack with a question shape proves `?` is required where it belongs, and
`decide()` is tested against every way the rules and the judge can agree or disagree.
`tools/test_judge.py` tests the judge's server with a stand-in for the AI, so no API key is needed.

Sample output:

```
My small duck walked!
A mouse was happy.
A happy friend listened!
A warm carrot is soft!
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

5. The sentence is wiped - `reset()` (`js/grammar.js`) clears the tokens and returns them,
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

**Status: done - and punctuation is also the moment the sentence is checked.**

- Punctuation marks are data, not code - each topic lists its marks, and each shape says which
  of them may end it (`end`, default `.` and `!`; a question shape takes `?`).
- `disperse()` in `js/board.js` keeps ending marks on the board the whole time, so a player can
  finish whenever they think the sentence is done. Once it really can end, a mark that suits it
  is guaranteed to be out there.
- `check()` in `js/game.js` - eating a mark stops the worm and checks the sentence (Req 4). The
  card stays up until the player presses a key, so there is time to read it.
  - **Correct:** `finishSentence()` adds it to the "Sentences you wrote" list, scores a bonus
    plus points for every word, plays a jingle, clears the words off the worm's body (leaving one
    trophy square behind), speeds the game up slightly, and draws a brand new recipe.
  - **Not finished:** nothing is lost. The mark is not added, the words stay on the worm, and the
    card says what is still needed.
  - **Wrong:** `wrongSentence()` sends the words back to the board, with the reason on the card.
- The wrong end mark is caught too: a question ending in `.` fails the "End mark" line.
- The in-game instructions say it in as many words: *"Eat a punctuation mark (. or !) to end the
  sentence. That is when it gets checked."*
- Commas are not ending marks: they are tiles eaten mid-sentence wherever the shape has a `,`.

**Check it:** build a sentence until the strip's last chip, `. !`, glows, then eat a mark.

---

## Req 7 - Motivating sound effects

**Status: done.**

Short synthesised blips, built with the Web Audio API - no sound files to download, nothing to
keep in sync, and the whole thing is about 30 lines.

- `js/util.js` - `BW.Sound` with one function per moment:
  - `eat()` - a short chirp for every word eaten.
  - `sentence()` - a four-note fanfare when a sentence passes the check.
  - `hmm()` - two soft notes when a sentence is not finished yet.
  - `wrong()` - a short low buzz when a sentence is not right.
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

- **Hints.** Tiles that would keep the sentence on track get an animated dashed outline. Toggle
  with the "Hints" button (`js/render.js` `drawTiles`, `js/main.js`).
- **The recipe on the strip.** The strip shows every slot the sentence shape still has room for,
  with optional ones dashed, and switches to another shape if the player's words turn into one.
- **Labels and colours are data.** The kinds of word, their names and colours come from the topic
  file (`families` and `pos` in the JSON), not from code.
- **A wrong sentence teaches.** The check card names the word and the reason, and the judge, when
  it is on, suggests a corrected sentence built from the topic's own tiles.
- **The board is always winnable.** Every disperse guarantees at least two words that keep the
  sentence on track, and ending marks to finish with.
- **No game over.** Crashes and wrong sentences cost progress, never the session.
