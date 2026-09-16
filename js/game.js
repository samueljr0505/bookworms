/* The game loop and all the rules. */
window.BW = window.BW || {};

BW.Game = class Game {
  constructor(pack, canvas, hooks) {
    this.pack = pack;
    this.cfg = BW.CONFIG;
    this.hooks = hooks || {};
    this.renderer = new BW.Renderer(canvas, this.cfg);
    this.board = new BW.Board(this.cfg.grid.cols, this.cfg.grid.rows,
                              text => this.renderer.measureCells(text));
    this.showHints = true;
    this.flash = null;
    this.raf = null;
    this.newGame();
  }

  newGame() {
    this.worm = new BW.Worm(this.cfg.grid.cols, this.cfg.grid.rows, 4);
    this.sentence = BW.Grammar.newSentence(this.pack, BW.rng);
    this.finished = [];
    this.score = 0;
    this.stepMs = this.cfg.stepMs;
    this.acc = 0;
    this.last = performance.now();
    this.countdownMs = this.cfg.startDelayMs;   // Req 3
    this.crashMs = 0;
    this.mode = 'countdown';
    this.lastBeep = null;
    this.board.disperse(this.pack, this.sentence, this.worm, this.cfg);
    this.notify();
    if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t));
  }

  /* ---------- input (Req 1: arrow keys and WASD) ---------- */

  static KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
  };

  handleKey(e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (key === 'p' || key === ' ') {
      e.preventDefault();
      if (this.mode === 'playing') this.mode = 'paused';
      else if (this.mode === 'paused') { this.mode = 'playing'; this.last = performance.now(); }
      this.notify();
      return;
    }
    if (key === 'r') { e.preventDefault(); this.newGame(); return; }

    const dir = BW.Game.KEYS[key];
    if (!dir) return;
    e.preventDefault();
    if (this.mode === 'countdown') return;      // steering is locked until "Go!"
    if (this.mode === 'crashed') return;        // and while the crash is on screen
    if (this.mode === 'paused') return;
    this.worm.turn(dir[0], dir[1]);
  }

  attachInput(target) {
    this._onKey = e => this.handleKey(e);
    target.addEventListener('keydown', this._onKey);
  }

  /* ---------- loop ---------- */

  frame(now) {
    const dt = Math.min(100, now - this.last);
    this.last = now;

    if (this.mode === 'countdown') {
      this.countdownMs -= dt;
      const secs = Math.ceil(Math.max(0, this.countdownMs) / 1000);
      if (secs !== this.lastBeep && secs > 0) { this.lastBeep = secs; BW.Sound.tick(); }
      if (this.countdownMs <= 0) {
        this.mode = 'playing';
        this.worm.moving = true;
        BW.Sound.go();
        this.notify();
      }
    } else if (this.mode === 'crashed') {
      this.crashMs -= dt;
      if (this.crashMs <= 0) this.scatterAfterCrash();
    } else if (this.mode === 'playing') {
      this.acc += dt;
      while (this.acc >= this.stepMs) {
        this.acc -= this.stepMs;
        this.step();
      }
    }

    if (this.flash) {
      this.flash.life -= dt / 300;
      if (this.flash.life <= 0) this.flash = null;
    }

    this.renderer.draw(this.viewState());
    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  viewState() {
    return {
      board: this.board,
      worm: this.worm,
      pack: this.pack,
      mode: this.mode,
      countdownMs: this.countdownMs,
      flash: this.flash,
      showHints: this.showHints,
      isTileValid: tile => this.isTileValid(tile)
    };
  }

  isTileValid(tile) {
    if (tile.kind === 'punct') return this.sentence.canEnd() && this.sentence.tokens.length > 0;
    return this.sentence.allowedPos().includes(tile.pos);
  }

  /* ---------- one move ---------- */

  step() {
    if (!this.worm.moving) return;

    const next = this.worm.nextHead();
    const { cols, rows } = this.cfg.grid;
    const offBoard = next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows;

    if (offBoard) {
      if (this.cfg.wallBehavior === 'wrap') {
        next.x = (next.x + cols) % cols;
        next.y = (next.y + rows) % rows;
      } else {
        this.crash('wall');                      // Req 5
        return;
      }
    }

    if (this.cfg.selfCollision !== 'ignore' && this.worm.hitsSelf(next.x, next.y)) {
      this.crash('self');                      // Req 5, same deal as a wall
      return;
    }

    this.worm.step(next);

    // Req 2: the head landing on any square of a tile selects that exact word.
    const tile = this.board.tileAt(next.x, next.y);
    if (tile) this.eat(tile);
  }

  /* Req 5: crashing into a wall - or into your own body - costs you the sentence you were
     building. It happens in two beats. First the worm stops and the crash is held on screen
     for `crashDelayMs`, so the player can see what they hit and read the sentence still
     written along the body. Only then do the words fly off the body and scatter back onto
     the board. Scattering them the same instant the worm stopped was too fast to follow. */
  crash(reason) {
    this.worm.moving = false;
    this.worm.pendingDir = null;
    this.renderer.bump();
    BW.Sound.bonk();
    this.flash = { kind: 'bad', life: 0.9 };

    this.mode = 'crashed';
    this.crashMs = this.cfg.crashDelayMs;

    const bump = reason === 'self' ? 'Oops, you bit your own tail!' : 'Bonk, that was the wall!';
    this.say(this.worm.carried.length
      ? bump + ' There goes your sentence...'
      : bump + ' Pick a new direction.', 'warn');
    this.notify();
  }

  /* The second beat of a crash: the sentence is wiped, the words the body was carrying
     drop off and are scattered back across the board, and play resumes with the worm
     standing still waiting for a direction. */
  scatterAfterCrash() {
    const lost = this.sentence.reset();
    this.worm.dropCarried();
    this.board.disperse(this.pack, this.sentence, this.worm, this.cfg, lost);

    this.mode = 'playing';
    this.worm.moving = false;
    if (lost.length) this.say('The words are back on the board. Try again!', 'warn');
    this.notify();
  }

  eat(tile) {
    this.board.remove(tile);

    if (tile.kind === 'punct') {
      if (this.sentence.end(tile.word)) {
        this.finishSentence();
      } else {
        this.rejected(tile, 'That sentence is not finished yet!');
      }
      return;
    }

    if (this.sentence.accept(tile.word, tile.pos)) {
      this.score += this.cfg.points.correct;
      this.worm.carry(tile.word, tile.pos);      // the word becomes part of the body
      this.flash = { kind: 'good', life: 0.6 };
      BW.Sound.correct();
      this.say('"' + tile.word + '" - nice pick!', 'good');
      this.board.disperse(this.pack, this.sentence, this.worm, this.cfg);
      this.notify();
    } else {
      this.rejected(tile, this.whyNot(tile));
    }
  }

  whyNot(tile) {
    const need = this.sentence.allowedPos()
      .map(p => (this.pack.pos[p] && this.pack.pos[p].label) || p)
      .join(' or ');
    const got = (this.pack.pos[tile.pos] && this.pack.pos[tile.pos].label) || tile.pos;
    return '"' + tile.word + '" is a ' + got + '. You need a ' + need + '.';
  }

  rejected(tile, message) {
    this.score = Math.max(0, this.score + this.cfg.points.wrong);
    this.flash = { kind: 'bad', life: 0.6 };
    BW.Sound.wrong();
    this.say(message, 'bad');
    // put one fresh tile back so the board never thins out
    const pool = [];
    for (const pos of Object.keys(this.pack.words)) {
      for (const word of this.pack.words[pos]) {
        if (!this.board.tiles.some(t => t.word === word)) pool.push({ word, pos });
      }
    }
    if (pool.length) {
      const pick = BW.rng.pick(pool);
      this.board.place(pick.word, pick.pos, 'word', this.worm);
    }
    this.notify();
  }

  finishSentence() {
    const text = this.sentence.text();
    this.finished.push(text);
    this.score += this.cfg.points.sentence;
    this.flash = { kind: 'good', life: 1 };
    BW.Sound.sentence();
    this.say('Sentence complete: ' + text, 'good');

    // the finished sentence leaves the body, apart from one trophy square
    this.worm.dropCarried();
    this.worm.grow += this.cfg.trophyPerSentence;

    this.stepMs = Math.max(this.cfg.minStepMs, this.stepMs - this.cfg.speedUpPerSentence);
    this.sentence = BW.Grammar.newSentence(this.pack, BW.rng);
    this.board.disperse(this.pack, this.sentence, this.worm, this.cfg);
    this.notify();
  }

  say(message, kind) {
    if (this.hooks.onMessage) this.hooks.onMessage(message, kind);
  }

  notify() {
    if (this.hooks.onChange) this.hooks.onChange(this);
  }
};
