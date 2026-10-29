/* The game loop and all the rules. */
window.BW = window.BW || {};

BW.Game = class Game {
  /* options.race: this is a class race (js/race.js). The class shares one clock, so there is
     no pausing and no starting over - the teacher says when it starts and when it ends. */
  constructor(pack, canvas, hooks, options) {
    this.pack = pack;
    this.cfg = BW.CONFIG;
    this.hooks = hooks || {};
    this.race = !!(options && options.race);
    this.renderer = new BW.Renderer(canvas, this.cfg);
    this.board = new BW.Board(this.cfg.grid.cols, this.cfg.grid.rows,
                              text => this.renderer.measureCells(text));
    this.showHints = false;     // teachers turn the dashed outlines on with the Hints button
    this.flash = null;
    this.raf = null;
    this.checkId = 0;
    this.newGame();
  }

  newGame() {
    this.worm = new BW.Worm(this.cfg.grid.cols, this.cfg.grid.rows, 4);
    this.sentence = BW.Grammar.newSentence(this.pack, BW.rng);
    this.finished = [];
    this.score = 0;
    this.streak = 0;            // correct sentences in a row
    this.stepMs = this.cfg.stepMs;
    this.acc = 0;
    this.last = performance.now();
    this.countdownMs = this.cfg.startDelayMs;   // Req 3
    this.crashMs = 0;
    this.mode = 'countdown';
    this.lastBeep = null;
    this.over = false;          // a class race whose time has run out
    this.checkId++;             // a check still waiting on the judge belongs to the old game
    this.pending = null;
    this.report = null;
    this.refusal = null;        // why the last word bumped into was not eaten, for the strip
    this.refused = null;        // that tile, while the head is still on it
    if (this.hooks.onReport) this.hooks.onReport(null);
    this.refill();
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

    // a checked sentence stays on screen until the player is ready to move on
    if (this.mode === 'checked' && (key === ' ' || key === 'Enter')) {
      e.preventDefault();
      this.carryOn(null);
      return;
    }
    if (key === 'p' || key === ' ') {
      e.preventDefault();
      if (this.race) return;      // the class clock does not stop, so neither does the worm
      if (this.mode === 'playing') this.mode = 'paused';
      else if (this.mode === 'paused') { this.mode = 'playing'; this.last = performance.now(); }
      this.notify();
      return;
    }
    if (key === 'r') { e.preventDefault(); if (!this.race) this.newGame(); return; }

    const dir = BW.Game.KEYS[key];
    if (!dir) return;
    e.preventDefault();
    if (this.mode === 'checked') { this.carryOn(dir); return; }
    if (this.mode === 'countdown') return;      // steering is locked until "Go!"
    if (this.mode === 'crashed') return;        // and while the crash is on screen
    if (this.mode === 'checking') return;       // and while the sentence is being read
    if (this.mode === 'paused') return;
    if (this.mode === 'waiting' || this.mode === 'over') return;   // a class race not running
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
    } else if (this.mode === 'checking') {
      // held for at least checkMs, and until the judge has answered (or given up)
      this.checkMs -= dt;
      if (this.checkMs <= 0 && this.pending.verdict !== undefined) this.settle();
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
      // how far through the current step the worm is, so it can be drawn gliding
      progress: this.worm.moving ? Math.min(1, this.acc / this.stepMs) : 1,
      flash: this.flash,
      showHints: this.showHints,
      isTileValid: tile => this.isTileValid(tile)
    };
  }

  /* Would the worm eat this tile right now? The hints outline the ones it would. */
  isTileValid(tile) {
    if (tile.kind === 'punct') {
      return this.sentence.canEnd() && this.sentence.endMarks().includes(tile.word);
    }
    return this.sentence.fits(tile.word, tile.pos);
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
    if (this.renderer.skin.trail && this.renderer.skin.trail !== 'none') {
      const tail = this.renderer.tailPoint(this.worm);
      this.renderer.fx.trail(this.renderer.skin.trail, tail.x, tail.y);
    }

    // Req 2: the head landing on any square of a tile selects that exact word.
    const tile = this.board.tileAt(next.x, next.y);
    if (tile) this.eat(tile);
    else this.refused = null;
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
    const h = this.worm.head();
    this.renderer.burst('dust', h.x, h.y, 10, { speed: 60, life: 600, size: 5 });
    BW.Sound.bonk();
    this.flash = { kind: 'bad', life: 0.9 };

    this.mode = 'crashed';
    this.crashMs = this.cfg.crashDelayMs;
    this.refusal = null;

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
    // back to the middle of the board, so nobody is handed a worm that is
    // already jammed against the wall it just hit
    this.worm.respawn(this.cfg.grid.cols, this.cfg.grid.rows);
    this.refill(lost);

    this.mode = 'playing';
    if (lost.length) this.say('The words are back on the board. Try again!', 'warn');
    else this.say('Back to the middle. Pick a direction.', 'warn');
    this.notify();
  }

  /* The worm only eats a word that fits where the sentence is up to - the right kind of
     word for the next spot in its structure - and a punctuation mark only once the
     sentence is whole. Anything else is refused: it stays on the board, and the player is
     told why. */
  eat(tile) {
    if (tile === this.refused) return;        // still crossing a word it was told about
    const no = BW.Checker.refuse(this.pack, this.sentence, tile.word, tile.pos);
    if (no) { this.refuse(tile, no); return; }

    this.board.remove(tile);
    this.refusal = null;
    if (tile.kind === 'punct') {
      this.complete(tile.word);
      return;
    }

    this.sentence.add(tile.word, tile.pos);
    this.worm.carry(tile.word, tile.pos);      // the word becomes part of the body
    this.worm.gulpAt = performance.now();
    BW.Sound.eat();
    const label = this.label(tile.pos);
    const color = this.renderer.posColor(this.pack, tile.pos);
    const h = this.worm.head();
    this.renderer.burst('crumb', h.x, h.y, 12, { color, speed: 70, life: 500, size: 6 });
    this.renderer.popup(label + '!', h.x, h.y, BW.WormArt.mix(color, 0, 0.35));
    this.say('"' + tile.word + '" - ' + (/^[AEIOU]/.test(label) ? 'an ' : 'a ') + label + '.', 'info');

    // The words could already be a whole sentence: ask the judge now, so its answer is
    // usually back before the worm reaches a punctuation mark.
    if (this.cfg.judgeEarly && this.sentence.canEnd()) BW.Judge.ask(this.pack, this.sentence);

    this.refill();
    this.notify();
  }

  /* A word that does not fit is not eaten. The worm slides over it, the tile shakes, and
     the reason goes up on the strip - right at the word, while the child still has it in
     mind. It costs no points, but it does end a streak: the streak counts sentences built
     without a word bounced. */
  refuse(tile, why) {
    this.refused = tile;
    this.refusal = { word: tile.word, ...why };
    tile.refusedAt = performance.now();
    this.streak = 0;
    BW.Sound.hmm();
    const h = this.worm.head();
    this.renderer.popup(why.short, h.x, h.y, '#c0563f');
    this.notify();
  }

  /* Put a fresh set of words out. The board always carries a couple of words that would
     keep the sentence on track (while it is on track), and ending marks to finish with. */
  refill(returnWords) {
    this.board.disperse(this.pack, this.sentence, this.worm, this.cfg, returnWords);
  }

  /* ---------- the check (Req 4, Req 6) ---------- */

  /* A punctuation mark was eaten, so the sentence is complete - every word in it fitted the
     structure on the way in. The worm stops while it is read out against the checklist, and
     while the judge, if there is one, has a look too. */
  complete(mark) {
    this.worm.moving = false;
    this.worm.pendingDir = null;
    const report = BW.Checker.check(this.pack, this.sentence, mark);

    BW.Sound.tick();
    this.mode = 'checking';
    this.checkMs = this.cfg.checkMs;
    this.pending = { report, mark, verdict: undefined };
    const id = ++this.checkId;
    BW.Judge.ask(this.pack, this.sentence, this.cfg.judgeWaitMs).then(verdict => {
      if (id === this.checkId && this.pending) this.pending.verdict = verdict;
    });
    this.report = { ...report, phase: 'checking' };
    if (this.hooks.onReport) this.hooks.onReport(this.report);
    this.notify();
  }

  /* The judge has answered, or there was none to ask: fold it in and finish the sentence. */
  settle() {
    const { report, mark, verdict } = this.pending;
    this.pending = null;
    this.finishSentence(BW.Checker.decide(report, verdict), mark);
    // the class race ran out while this one was being checked - it still counted
    if (this.over) this.stop();
  }

  finishSentence(report, mark) {
    const words = this.sentence.tokens.length;
    this.sentence.end(mark);
    this.finished.push(this.sentence.text());
    if (this.hooks.onSentence) this.hooks.onSentence('correct', this.sentence.text());
    const pts = this.cfg.points;
    this.streak++;
    const bonus = pts.streak * (Math.min(this.streak, pts.maxStreak) - 1);
    const points = pts.sentence + pts.word * words + bonus;
    this.score += points;
    this.flash = { kind: 'good', life: 1 };
    BW.Sound.sentence();

    // party time
    const { cols, rows } = this.cfg.grid;
    for (let k = 0; k < 4; k++) {
      this.renderer.burst('confetti', cols * (0.2 + 0.2 * k), rows * 0.55, 22, { speed: 150, life: 1600, size: 8 });
    }
    const h = this.worm.head();
    this.renderer.popup('+' + points, h.x, h.y, '#3f8f5f', true);
    if (this.hooks.onEarn) this.hooks.onEarn(points);

    // the finished sentence leaves the body, apart from one trophy square
    this.worm.dropCarried();
    this.worm.grow += this.cfg.trophyPerSentence;

    this.stepMs = Math.max(this.cfg.minStepMs, this.stepMs - this.cfg.speedUpPerSentence);
    this.sentence = BW.Grammar.newSentence(this.pack, BW.rng);
    this.refill();
    this.show({ ...report, points, bonus, streak: this.streak });
  }

  /* Hold the checked sentence on screen until the player moves on. */
  show(report) {
    this.mode = 'checked';
    this.report = { ...report, phase: 'done' };
    if (this.hooks.onReport) this.hooks.onReport(this.report);
    this.notify();
  }

  /* Put the report away and set off again - in the direction pressed, or straight on. */
  carryOn(dir) {
    if (this.mode !== 'checked') return;
    this.report = null;
    if (this.hooks.onReport) this.hooks.onReport(null);
    this.mode = 'playing';
    this.acc = 0;
    this.worm.prev = null;      // start gliding from where the worm stopped
    if (dir) this.worm.turn(dir[0], dir[1]);
    else this.worm.moving = true;
    this.notify();
  }

  /* ---------- a class race (js/race.js) ---------- */

  /* Stand still on the board until the teacher presses Start. */
  hold() {
    this.mode = 'waiting';
    this.worm.moving = false;
    this.notify();
  }

  /* The teacher pressed Start: count down to the moment the whole class sets off together. */
  startIn(ms) {
    if (this.mode !== 'waiting') return;
    this.mode = 'countdown';
    this.countdownMs = ms;
    this.lastBeep = null;
    this.notify();
  }

  /* The class's time is up. A sentence already being checked still counts - its ending mark
     was eaten in time - so in that case the game stops once the check is done (settle). */
  timeUp() {
    if (this.over) return;
    this.over = true;
    if (this.mode !== 'checking') this.stop();
  }

  stop() {
    this.mode = 'over';
    this.worm.moving = false;
    this.worm.pendingDir = null;
    this.report = null;
    if (this.hooks.onReport) this.hooks.onReport(null);
    this.notify();
  }

  label(pos) {
    const info = this.pack.pos[pos];
    const fam = info && this.pack.families && this.pack.families[info.family];
    return (fam && fam.label) || (info && info.label) || pos;
  }

  say(message, kind) {
    if (this.hooks.onMessage) this.hooks.onMessage(message, kind);
  }

  notify() {
    if (this.hooks.onChange) this.hooks.onChange(this);
  }
};
