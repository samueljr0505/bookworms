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
  }

  measureCells(text) {
    this.ctx.font = this.font;
    const px = this.ctx.measureText(text).width + 18;   // padding inside the pill
    return Math.max(1, Math.ceil(px / this.cell));
  }

  bump() { this.shake = 1; }

  posColor(pack, pos) {
    if (pos === 'punctuation') return '#f5c26b';
    return (pack.pos[pos] && pack.pos[pos].color) || '#9aa7d7';
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

    // background + grid
    ctx.fillStyle = '#fdf6e8';
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.strokeStyle = 'rgba(120, 100, 70, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, H); }
    for (let y = 0; y <= rows; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(W, y * cell + 0.5); }
    ctx.stroke();

    this.drawTiles(state);
    this.drawWorm(state);

    ctx.restore();

    if (state.mode === 'countdown') this.drawCountdown(state, W, H);
    if (state.mode === 'paused') this.drawBanner('Paused', 'press P to keep going', W, H);
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

      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
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
     reading the worm from its tail up to its head spells out what you have built so far. */
  drawWorm(state) {
    const ctx = this.ctx;
    const cell = this.cell;
    const worm = state.worm;
    const cells = worm.cells;
    const labels = worm.bodyLabels();

    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      const label = labels[i];
      const t = i / Math.max(1, cells.length - 1);
      const pad = i === 0 ? 1 : (label ? 1.5 : 2 + t * 1.5);

      ctx.fillStyle = label
        ? this.posColor(state.pack, label.pos)
        : `hsl(${104 - t * 14}, 52%, ${42 + t * 18}%)`;
      this.roundRect(c.x * cell + pad, c.y * cell + pad,
                     cell - pad * 2, cell - pad * 2, i === 0 ? 8 : 6);
      ctx.fill();

      if (label) {
        ctx.fillStyle = '#20242e';
        ctx.font = this.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.char, c.x * cell + cell / 2, c.y * cell + cell / 2 + 1);
      }
    }

    // eyes on the head, looking the way it is going
    const h = worm.head();
    const d = worm.dir;
    const cx = h.x * cell + cell / 2, cy = h.y * cell + cell / 2;
    const fx = d.x * 4, fy = d.y * 4;
    const px = -d.y * 4, py = d.x * 4;
    ctx.fillStyle = '#fff';
    [[px, py], [-px, -py]].forEach(([ox, oy]) => {
      ctx.beginPath();
      ctx.arc(cx + fx + ox, cy + fy + oy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#1b2430';
    [[px, py], [-px, -py]].forEach(([ox, oy]) => {
      ctx.beginPath();
      ctx.arc(cx + fx * 1.3 + ox, cy + fy * 1.3 + oy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
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

  drawFlash(flash, W, H) {
    const ctx = this.ctx;
    const a = flash.life * 0.28;
    ctx.fillStyle = flash.kind === 'good'
      ? `rgba(120, 220, 150, ${a})`
      : `rgba(240, 120, 110, ${a})`;
    ctx.fillRect(0, 0, W, H);
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
};
