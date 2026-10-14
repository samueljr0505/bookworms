/* The worm itself: a list of grid squares, head first. */
window.BW = window.BW || {};

BW.Worm = class Worm {
  constructor(cols, rows, startLength) {
    const x = Math.floor(cols / 2);
    const y = Math.floor(rows / 2);
    this.cells = [];
    for (let i = 0; i < (startLength || 4); i++) this.cells.push({ x: x - i, y });
    this.dir = { x: 1, y: 0 };
    this.pendingDir = null;
    this.grow = 0;
    this.startLength = startLength || 4;
    this.carried = [];     // the words of the sentence, in the order they were eaten
    this.moving = false;   // stays still during the countdown and after a wall bonk
    this.prev = null;      // where each square was before the last step - only for drawing the glide
    this.writing = 0;      // letters eaten but not written into the body yet (it grows one per step)
    this.steps = 0;        // how many steps taken - lets the drawing tell when the worm has moved
    this.headFirst = null; // which end of the body the sentence reads from (see bodyLabels)
    this.wordWays = [];    // and which way round each word is written
  }

  head() { return this.cells[0]; }

  /* A worm cannot fold straight back into its own neck while it is moving.
     But if it is sitting still after a wall bonk, turning around is fair - so the
     whole worm flips and the tail becomes the new head. */
  turn(dx, dy) {
    const reversing = this.cells.length > 1 && dx === -this.dir.x && dy === -this.dir.y;
    if (reversing) {
      if (this.moving) return false;
      this.cells.reverse();
      this.prev = null;
      this.headFirst = null;
      this.wordWays = [];
      this.dir = { x: dx, y: dy };
    }
    this.pendingDir = { x: dx, y: dy };
    this.moving = true;
    return true;
  }

  /* Where the head would land next step. */
  nextHead() {
    const d = this.pendingDir || this.dir;
    const h = this.head();
    return { x: h.x + d.x, y: h.y + d.y };
  }

  step(to) {
    if (this.pendingDir) { this.dir = this.pendingDir; this.pendingDir = null; }
    const old = this.cells.map(c => ({ x: c.x, y: c.y }));
    this.cells.unshift({ x: to.x, y: to.y });
    if (this.grow > 0) {
      // growing: the head reaches forward and the rest of the body stays where it is,
      // so only the head glides - and one more letter of the newest word is written in
      this.grow--;
      this.prev = [old[0]].concat(old);
      if (this.writing > 0) this.writing--;
    } else {
      // moving: every square slides up into the place of the one in front
      this.cells.pop();
      this.prev = old;
    }
    this.steps++;
  }

  /* Eating a word writes it into the body: one letter, one square. A long word makes
     you a lot longer, which is the whole bargain of the game. */
  carry(word, pos) {
    this.carried.push({ word, pos });
    this.grow += word.length;
    this.writing += word.length;
  }

  carriedLength() {
    return this.carried.reduce((n, item) => n + item.word.length, 0);
  }

  /* Let go of the whole sentence - either because it was finished, or because the worm
     crashed and has to give the words back. The body shrinks by exactly what those words
     had written into it. Returns the words that were let go. */
  dropCarried() {
    const dropped = this.carried;
    this.shrink(this.carriedLength());
    this.carried = [];
    this.writing = 0;
    this.wordWays = [];
    return dropped;
  }

  /* Start again from the middle of the board, facing right and standing still.
     After a crash the worm is pressed against a wall or folded over itself,
     which is a miserable place to be handed back to a player. */
  respawn(cols, rows) {
    const x = Math.floor(cols / 2);
    const y = Math.floor(rows / 2);
    this.cells = [];
    for (let i = 0; i < this.startLength; i++) this.cells.push({ x: x - i, y });
    this.dir = { x: 1, y: 0 };
    this.pendingDir = null;
    this.prev = null;
    this.headFirst = null;
    this.wordWays = [];
    this.grow = 0;
    this.writing = 0;
    this.moving = false;
  }

  /* Never shrink below the starting size - a two-square worm is no fun to steer. */
  shrink(n) {
    this.grow = 0;
    this.writing = 0;
    while (n-- > 0 && this.cells.length > this.startLength) this.cells.pop();
  }

  /* Which letter sits on each body square: { char, pos, word, id } by square, where `word`
     is which word of the sentence it belongs to and `id` which letter of the sentence it is.
     Square 0 is the head and is left blank.

     The sentence has to read the normal way round to a child looking at the screen - left
     to right, or top to bottom - whichever way the worm is going. Two things make that work:

     1. Which end of the body the sentence starts at. Lying flat and heading right, the
        sentence starts at the tail; heading left, at the neck. This only switches when the
        written part of the body clearly points the other way, so a worm wiggling along a
        diagonal does not flip its sentence back and forth every step.
     2. Each word on its own. Every word is laid out by where its own squares lie, so a
        word on a stretch that doubles back (the top of a U-turn) still reads forwards.
        Only a word bent right round a corner can look odd, and it is short-lived. Like the
        sentence, a word only turns itself round once it clearly points the other way.

     A newly eaten word is written in one letter per step as the body grows to fit it,
     rather than shoving the whole sentence along in one jump. */
  bodyLabels() {
    const labels = [];
    const avail = this.cells.length - 1;
    if (avail <= 0) return labels;

    // the letters written in so far, keeping track of which word each one is from
    const letters = [];
    this.carried.forEach((item, word) => {
      for (const ch of item.word) letters.push({ char: ch, pos: item.pos, word, id: letters.length });
    });
    const written = letters.slice(0, Math.max(0, letters.length - this.writing));
    const shown = written.slice(Math.max(0, written.length - avail));
    const n = shown.length;
    if (n === 0) return labels;

    // Does a stretch of body, from its neck end `a` to its tail end `b`, run right or down -
    // so it reads forwards starting at the neck end? `was` is the answer last time: it only
    // changes once the stretch clearly runs the other way.
    const runsOn = (a, b, len, was) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const wants = Math.abs(dx) >= Math.abs(dy) ? dx > 0 : dy > 0;
      // "clearly" means by a couple of squares, and by half again: a long worm coiled up
      // along a diagonal points no particular way, and should not be flipped by every step
      const big = Math.max(Math.abs(dx), Math.abs(dy)), small = Math.min(Math.abs(dx), Math.abs(dy));
      const clear = big - small >= Math.min(2, len - 1) && big >= small * 1.5;
      if (was === null || was === undefined) return wants;
      return clear ? wants : was;
    };

    // 1. which end the sentence reads from: the way the written stretch runs from the neck
    // (one letter on its own points nowhere, so it keeps whatever was decided before)
    if (n > 1 || this.headFirst === null) this.headFirst = runsOn(this.cells[1], this.cells[n], n, this.headFirst);

    // the words in the order they sit outwards from the neck
    const words = [];
    for (const l of shown) {
      if (!words.length || words[words.length - 1][0].word !== l.word) words.push([]);
      words[words.length - 1].push(l);
    }
    if (!this.headFirst) words.reverse();

    // 2. each word laid out along its own squares, so it reads forwards on screen
    let at = 1;
    for (const word of words) {
      const id = word[0].word;
      const r = this.wordWays[id];
      const fromNeck = runsOn(this.cells[at], this.cells[at + word.length - 1], word.length,
                              r === undefined ? null : r ? this.headFirst : !this.headFirst);
      // remembered relative to the sentence's own direction, so a sentence that switches
      // ends takes its words round with it
      this.wordWays[id] = fromNeck === this.headFirst;
      word.forEach((l, i) => { labels[fromNeck ? at + i : at + word.length - 1 - i] = l; });
      at += word.length;
    }
    return labels;
  }

  occupies(x, y) {
    return this.cells.some(c => c.x === x && c.y === y);
  }

  hitsSelf(x, y) {
    // the tail square is about to move out of the way, so it does not count
    return this.cells.slice(0, -1).some(c => c.x === x && c.y === y);
  }
};
