/* Everything that draws on the canvas. */
window.BW = window.BW || {};

BW.Renderer = class Renderer {
  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg;
    this.cell = cfg.grid.cell;
    this.font = 'bold 13px ui-rounded, "Nunito", "Trebuchet MS", system-ui, sans-serif';

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cfg.grid.cols * this.cell * dpr;
    canvas.height = cfg.grid.rows * this.cell * dpr;
    canvas.style.width = (cfg.grid.cols * this.cell) + 'px';
    canvas.style.height = (cfg.grid.rows * this.cell) + 'px';
    this.ctx.scale(dpr, dpr);

    this.shake = 0;

    // the worm the player picked on the home page and dressed up in the shop
    // (see js/closet.js) - drawn by js/worm-art.js
    const worm = cfg.worm || BW.DEFAULT_WORM;
    this.skin = cfg.skin || { body: worm.body, head: worm.head };
    canvas.style.borderColor = BW.BoardArt.frame(this.skin.board);   // each board has its own frame

    this.fx = new BW.WormArt.Particles();   // crumbs, confetti and the worm's trail
    this.popups = [];                       // words that float up off the board
    this.lastDraw = performance.now();
  }

  /* A burst of particles on a board square. */
  burst(kind, x, y, n, opts) {
    this.fx.emit(kind, (x + 0.5) * this.cell, (y + 0.5) * this.cell, n, opts);
  }

  /* A word that floats up from a board square and fades: "Noun!", "+120" */
  popup(text, x, y, color, big) {
    this.popups.push({ text, x: (x + 0.5) * this.cell, y: (y + 0.5) * this.cell,
                       color, big: !!big, born: performance.now() });
  }

  measureCells(text) {
    this.ctx.font = this.font;
    const px = this.ctx.measureText(text).width + 18;   // padding inside the pill
    return Math.max(1, Math.ceil(px / this.cell));
  }

  bump() { this.shake = 1; }

  /* Tiles are coloured by word family, so the board shows a handful of colours
     rather than one per grammatical tag. */
  posColor(pack, pos) {
    if (pos === 'punctuation') return '#f5c26b';
    const info = pack.pos[pos];
    const fam = info && pack.families && pack.families[info.family];
    return (fam && fam.color) || (info && info.color) || '#9aa7d7';
  }

  draw(state) {
    const ctx = this.ctx;
    const { cols, rows } = this.cfg.grid;
    const cell = this.cell;
    const W = cols * cell, H = rows * cell;

    ctx.save();
    if (this.shake > 0) {
      const s = this.shake * 5;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shake = Math.max(0, this.shake - 0.06);
    }

    const now = performance.now();
    const dt = Math.min(100, now - this.lastDraw);
    this.lastDraw = now;

    // the board bought in the shop (js/board-art.js) - the garden lawn to start with
    ctx.fillStyle = '#fdf6e8';
    ctx.fillRect(-10, -10, W + 20, H + 20);
    BW.BoardArt.draw(ctx, this.skin.board, W, H, cell, now);

    this.drawTiles(state);
    this.fx.update(dt);
    this.fx.draw(ctx);
    this.drawWorm(state);
    this.drawPopups(now);

    ctx.restore();

    if (state.mode === 'countdown') this.drawCountdown(state, W, H);
    if (state.mode === 'paused') this.drawBanner('Paused', 'press P to keep going', W, H);
    // the sentence check sits on top of the board (an HTML card, see js/main.js), and so do a
    // class race's "waiting for your teacher" and "time's up" (js/race.js)
    if (['checking', 'checked', 'waiting', 'over'].includes(state.mode)) this.drawVeil(W, H);
    if (state.flash) this.drawFlash(state.flash, W, H);
  }

  drawTiles(state) {
    const ctx = this.ctx;
    const cell = this.cell;
    const now = performance.now();

    for (const t of state.board.tiles) {
      const x = t.x * cell, y = t.y * cell;
      const w = t.w * cell, h = cell;
      const age = Math.min(1, (now - t.born) / 220);       // little pop-in
      const scale = 0.7 + 0.3 * age;
      const bob = Math.sin(now / 520 + t.x * 0.9 + t.y * 1.3) * 1.2;   // tiles float gently
      // a word the worm would not eat shakes its head for a moment
      const no = t.refusedAt ? Math.max(0, 1 - (now - t.refusedAt) / 600) : 0;
      const shake = Math.sin(now / 28) * 4 * no;

      ctx.save();
      ctx.translate(x + w / 2 + shake, y + h / 2 + bob);
      ctx.scale(scale, scale);
      ctx.globalAlpha = age;

      const color = this.posColor(state.pack, t.pos);
      const valid = state.isTileValid(t);

      // shadow
      ctx.fillStyle = 'rgba(80, 60, 30, 0.18)';
      this.roundRect(-w / 2, -h / 2 + 3, w - 4, h - 4, 8);
      ctx.fill();

      ctx.fillStyle = color;
      this.roundRect(-w / 2, -h / 2, w - 4, h - 4, 8);
      ctx.fill();

      if (no > 0) {
        ctx.strokeStyle = `rgba(192, 86, 63, ${no})`;
        ctx.lineWidth = 3;
        this.roundRect(-w / 2, -h / 2, w - 4, h - 4, 8);
        ctx.stroke();
      }

      if (valid && state.showHints) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -(now / 60) % 7;
        this.roundRect(-w / 2, -h / 2, w - 4, h - 4, 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = '#20242e';
      ctx.font = this.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.word, -2, 1);
      ctx.restore();
    }
  }

  /* The worm's body is the sentence. Each word the worm has eaten is written into the
     squares behind the head, one letter per square, coloured by its part of speech - so
     reading the worm from its tail up to its head spells out what you have built so far.

     The rules move the worm a whole square at a time, but it is drawn gliding between
     squares (`state.progress` of the way through the current step), which reads as a
     living worm rather than a row of jumping blocks. */
  drawWorm(state) {
    const ctx = this.ctx;
    const cell = this.cell;
    const worm = state.worm;
    const cells = worm.cells;
    const prev = worm.prev;
    const p = state.progress;
    const labels = worm.bodyLabels();
    const now = performance.now();

    const at = i => {
      const c = cells[i];
      const o = prev && prev[i];
      // no glide for a new tail square, or across the board when walls wrap
      if (!o || Math.abs(o.x - c.x) + Math.abs(o.y - c.y) !== 1) {
        return { x: (c.x + 0.5) * cell, y: (c.y + 0.5) * cell };
      }
      return { x: (o.x + (c.x - o.x) * p + 0.5) * cell, y: (o.y + (c.y - o.y) * p + 0.5) * cell };
    };

    for (let i = cells.length - 1; i >= 1; i--) {
      const pos = at(i);
      BW.WormArt.segment(ctx, pos.x, pos.y, cell, i, cells.length, this.skin, now, !!labels[i]);
    }

    BW.WormArt.words(ctx, this.letterSpots(worm, labels, p, state.pack), cell, this.font);

    const h = at(0);
    const gulp = Math.max(0, 1 - (now - (worm.gulpAt || 0)) / 240);
    BW.WormArt.head(ctx, h.x, h.y, cell, worm.dir, this.skin, now, {
      neck: cells.length > 1 ? at(1) : null,
      scale: 1 + 0.3 * Math.sin(gulp * Math.PI)
    });
  }

  /* Where to draw each letter on the body, in order along the body. A letter glides from
     the square it was on before the last step to the square it is on now - so the words
     slide along with the worm, and a new letter written in at the neck nudges the sentence
     back one smooth square at a time. A letter that jumped further than one square (the
     sentence switched ends, the worm turned round) is simply put in its new place. */
  letterSpots(worm, labels, p, pack) {
    if (worm.steps !== this.letterStep || worm.carried !== this.letterWords) {
      this.letterWas = worm.carried === this.letterWords ? this.letterNow : new Map();
      this.letterStep = worm.steps;
      this.letterWords = worm.carried;
    }
    this.letterNow = new Map();
    const cell = this.cell;
    const spots = [];
    for (let i = 1; i < worm.cells.length; i++) {
      const l = labels[i];
      if (!l) continue;
      const c = worm.cells[i];
      this.letterNow.set(l.id, c);
      const o = this.letterWas && this.letterWas.get(l.id);
      const glide = o && Math.abs(o.x - c.x) + Math.abs(o.y - c.y) === 1;
      const x = glide ? o.x + (c.x - o.x) * p : c.x;
      const y = glide ? o.y + (c.y - o.y) * p : c.y;
      spots.push({ x: (x + 0.5) * cell, y: (y + 0.5) * cell, char: l.char,
                   color: this.posColor(pack, l.pos), word: l.word });
    }
    return spots;
  }

  /* The tail end in pixels - where a trail comes out. */
  tailPoint(worm) {
    const c = worm.cells[worm.cells.length - 1];
    return { x: (c.x + 0.5) * this.cell, y: (c.y + 0.5) * this.cell };
  }

  drawPopups(now) {
    const ctx = this.ctx;
    this.popups = this.popups.filter(pp => now - pp.born < 1100);
    for (const pp of this.popups) {
      const t = (now - pp.born) / 1100;
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.translate(pp.x, pp.y - 14 - t * 34);
      const pop = Math.min(1, t * 6);
      ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
      ctx.font = (pp.big ? '900 26px ' : '900 15px ') + 'ui-rounded, "Nunito", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      ctx.strokeText(pp.text, 0, 0);
      ctx.fillStyle = pp.color || '#3f6b4a';
      ctx.fillText(pp.text, 0, 0);
      ctx.restore();
    }
  }

  drawCountdown(state, W, H) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(253, 246, 232, 0.82)';
    ctx.fillRect(0, 0, W, H);
    const left = Math.max(0, state.countdownMs);
    const n = Math.ceil(left / 1000);
    const label = n > 0 ? String(n) : 'Go!';
    const frac = 1 - ((left % 1000) / 1000);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1 + frac * 0.25, 1 + frac * 0.25);
    ctx.globalAlpha = 0.35 + 0.65 * (1 - frac);
    ctx.fillStyle = '#3f6b4a';
    ctx.font = 'bold 84px ui-rounded, "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
    ctx.fillStyle = '#6b6152';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Arrow keys or W A S D to steer', W / 2, H / 2 + 76);
  }

  drawBanner(title, sub, W, H) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(253, 246, 232, 0.85)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3f6b4a';
    ctx.font = 'bold 48px ui-rounded, "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, W / 2, H / 2 - 10);
    ctx.fillStyle = '#6b6152';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(sub, W / 2, H / 2 + 34);
  }

  drawVeil(W, H) {
    this.ctx.fillStyle = 'rgba(253, 246, 232, 0.55)';
    this.ctx.fillRect(0, 0, W, H);
  }

  drawFlash(flash, W, H) {
    const ctx = this.ctx;
    const a = flash.life * 0.28;
    ctx.fillStyle = flash.kind === 'good'
      ? `rgba(120, 220, 150, ${a})`
      : `rgba(240, 120, 110, ${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  roundRect(x, y, w, h, r) {
    BW.WormArt.roundRect(this.ctx, x, y, w, h, r);
  }
};
