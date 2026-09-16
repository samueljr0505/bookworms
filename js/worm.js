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
    this.cells.unshift({ x: to.x, y: to.y });
    if (this.grow > 0) this.grow--;
    else this.cells.pop();
  }

  /* Eating a word writes it into the body: one letter, one square. A long word makes
     you a lot longer, which is the whole bargain of the game. */
  carry(word, pos) {
    this.carried.push({ word, pos });
    this.grow += word.length;
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
    return dropped;
  }

  /* Never shrink below the starting size - a two-square worm is no fun to steer. */
  shrink(n) {
    this.grow = 0;
    while (n-- > 0 && this.cells.length > this.startLength) this.cells.pop();
  }

  /* Which letter (and which word it belongs to) sits on each body square.

     The letters are laid out by where the squares actually are on screen, not by their
     position along the body, so the sentence always reads the normal way round: left to
     right when the worm is lying flat, top to bottom when it is standing on end. Without
     this, a worm travelling left or up spells everything backwards.

     While the body is still growing into a long word, the most recent letters are the ones
     shown. A word stretched around a corner is laid out by whichever axis it covers most,
     which is the best that can be done with a bent worm. */
  bodyLabels() {
    const labels = [];
    const avail = this.cells.length - 1;          // square 0 is the head, left blank
    if (avail <= 0) return labels;

    const letters = [];
    for (const item of this.carried) {
      for (const ch of item.word) letters.push({ char: ch, pos: item.pos });
    }
    const shown = letters.slice(Math.max(0, letters.length - avail));
    if (shown.length === 0) return labels;

    const n = shown.length;
    const near = this.cells[1];                   // the written square next to the head
    const far = this.cells[n];                    // the far end of the written stretch
    const dx = near.x - far.x;
    const dy = near.y - far.y;

    // Does the head end of the stretch come first when you read the screen normally?
    const headEndFirst = Math.abs(dx) >= Math.abs(dy) ? dx < 0 : dy < 0;

    for (let i = 0; i < n; i++) {
      labels[headEndFirst ? 1 + i : n - i] = shown[i];
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
