/* The board keeps track of the word tiles: which words are out there and where they sit.
   A tile is one grid row tall and however many squares wide the word needs. */
window.BW = window.BW || {};

BW.Board = class Board {
  constructor(cols, rows, measureCells) {
    this.cols = cols;
    this.rows = rows;
    this.measureCells = measureCells;   // (text) -> how many grid squares wide
    this.tiles = [];
  }

  /* Every square that is already spoken for, plus a ring of padding so tiles stay readable. */
  blockedSet(worm, pad) {
    const set = new Set();
    const add = (x, y) => set.add(x + ',' + y);
    if (worm) worm.cells.forEach(c => add(c.x, c.y));
    for (const t of this.tiles) {
      for (let x = t.x - pad; x < t.x + t.w + pad; x++) {
        for (let y = t.y - pad; y <= t.y + pad; y++) add(x, y);
      }
    }
    return set;
  }

  /* Find somewhere a tile of this width fits. Gives up politely rather than looping forever. */
  findSpot(w, worm, pad) {
    const blocked = this.blockedSet(worm, pad);
    const margin = 1;
    for (let tries = 0; tries < 400; tries++) {
      const x = margin + BW.rng.int(Math.max(1, this.cols - w - margin * 2));
      const y = margin + BW.rng.int(Math.max(1, this.rows - margin * 2));
      let ok = true;
      for (let i = 0; i < w && ok; i++) if (blocked.has((x + i) + ',' + y)) ok = false;
      // keep a little breathing room in front of the worm's head so tiles are not unavoidable
      if (ok && worm) {
        const h = worm.head();
        if (y === h.y && Math.abs(x - h.x) < 3) ok = false;
      }
      if (ok) return { x, y };
    }
    return null;
  }

  place(word, pos, kind, worm) {
    const w = this.measureCells(word);
    let spot = this.findSpot(w, worm, 1) || this.findSpot(w, worm, 0);
    if (!spot) return null;
    const tile = { word, pos, kind, x: spot.x, y: spot.y, w, born: performance.now() };
    this.tiles.push(tile);
    return tile;
  }

  clear() { this.tiles = []; }

  tileAt(x, y) {
    return this.tiles.find(t => t.y === y && x >= t.x && x < t.x + t.w) || null;
  }

  remove(tile) {
    const i = this.tiles.indexOf(tile);
    if (i >= 0) this.tiles.splice(i, 1);
  }

  /* Throw a fresh set of words onto the board for the slot the player needs next.
     Always includes a few correct choices so the game is never unwinnable.
     `returnWords` are words the player already ate and then lost on a wall bonk -
     those always go back out so the sentence can be rebuilt. */
  disperse(pack, sentence, worm, cfg, returnWords) {
    this.clear();

    const allowed = sentence.allowedPos();
    const valid = [];
    const wrong = [];
    for (const pos of Object.keys(pack.words)) {
      const bucket = allowed.includes(pos) ? valid : wrong;
      for (const word of pack.words[pos]) bucket.push({ word, pos });
    }

    const chosen = [];
    const used = new Set();
    const isValid = item => allowed.includes(item.pos);
    const add = item => {
      if (used.has(item.word)) return false;
      used.add(item.word);
      chosen.push(item);
      return true;
    };

    // the words handed back after a bonk go out first, no matter what
    const returned = (returnWords || []).map(t => ({ word: t.word, pos: t.pos }));
    returned.forEach(add);

    const total = Math.max(cfg.wordsOnBoard, chosen.length + cfg.minValidWords);
    const wantValid = cfg.minValidWords + BW.rng.int(2);   // a couple of right answers, sometimes three

    const take = (list, n) => {
      for (const item of BW.rng.shuffle(list)) {
        if (n <= 0 || chosen.length >= total) break;
        if (add(item)) n--;
      }
    };

    take(valid, wantValid - chosen.filter(isValid).length);
    take(wrong, total - chosen.length);
    take(valid, total - chosen.length);   // tiny word banks: top up with more correct options

    for (const item of BW.rng.shuffle(chosen)) this.place(item.word, item.pos, 'word', worm);

    // Req 6: once the sentence can stand on its own, offer punctuation to finish it.
    if (sentence.canEnd() && sentence.tokens.length > 0) {
      const marks = BW.rng.shuffle(pack.punctuation).slice(0, 1 + BW.rng.int(2));
      for (const m of marks) this.place(m.mark, 'punctuation', 'punct', worm);
    }
  }
};
