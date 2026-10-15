/* The boards a worm can play on - bought in the shop (data/shop.json, slot "board") and
   drawn here. Shared by the game (js/render.js) and the shop's previews (js/worm-art.js).

   A board is only ever background. The word tiles and the letters on the worm keep their
   part-of-speech colours on every board, so the grammar reads the same wherever you play;
   that is why even the dark boards stay soft rather than busy.

   The still part of each board is painted once and kept (it is the same every frame); only
   the few things that move - falling snow, twinkling stars - are drawn each frame. Every
   size is in board squares (`cell`), so a board looks the same full size and in a shop card. */
window.BW = window.BW || {};

BW.BoardArt = (function () {
  const TAU = Math.PI * 2;

  /* The same "random" scatter every time, so a board does not reshuffle between frames. */
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function checker(ctx, W, H, cell, color) {
    ctx.fillStyle = color;
    for (let y = 0; y * cell < H; y++) {
      for (let x = y % 2; x * cell < W; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  /* Each board: `frame` colours the border round the board in the game; `grid` is the faint
     line round every square, so a player can still see the squares the worm moves along;
     `paint` draws the still part; `move` (if any) draws what moves, every frame. */
  const BOARDS = {
    garden: {
      frame: '#cdb98f',
      grid: 'rgba(120, 100, 70, 0.09)',
      paint(ctx, W, H, cell) {
        ctx.fillStyle = '#fdf6e8'; ctx.fillRect(0, 0, W, H);
        checker(ctx, W, H, cell, 'rgba(140, 190, 120, 0.08)');
      }
    },

    notebook: {
      frame: '#9fb7d9',
      grid: 'rgba(110, 160, 220, 0.16)',
      paint(ctx, W, H, cell) {
        ctx.fillStyle = '#fffefa'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(110, 160, 220, 0.35)'; ctx.lineWidth = Math.max(1, cell / 26);
        for (let y = cell; y < H; y += cell) {
          ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(230, 110, 110, 0.45)'; ctx.lineWidth = Math.max(1.5, cell / 16);
        ctx.beginPath(); ctx.moveTo(cell * 1.6, 0); ctx.lineTo(cell * 1.6, H); ctx.stroke();
        ctx.fillStyle = 'rgba(200, 190, 170, 0.5)';
        for (const f of [0.18, 0.5, 0.82]) {
          ctx.beginPath(); ctx.arc(cell * 0.75, H * f, cell * 0.26, 0, TAU); ctx.fill();
        }
      }
    },

    chalkboard: {
      frame: '#8a5a33',
      grid: 'rgba(255, 255, 255, 0.07)',
      paint(ctx, W, H, cell) {
        ctx.fillStyle = '#35564a'; ctx.fillRect(0, 0, W, H);
        const rnd = seeded(7);
        // smudges where something was rubbed out
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
          ctx.beginPath();
          ctx.ellipse(rnd() * W, rnd() * H, cell * (2 + rnd() * 4), cell * (0.6 + rnd()), rnd() * TAU, 0, TAU);
          ctx.fill();
        }
        // faint chalk letters, as if from an old lesson
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.font = `700 ${cell * 1.6}px "Comic Sans MS", "Chalkboard SE", ui-rounded, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const t of ['A b c', '1 2 3', 'noun', 'verb', '?!']) ctx.fillText(t, rnd() * W, rnd() * H);
        // chalk dust along the bottom ledge
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(0, H - cell * 0.35, W, cell * 0.35);
      }
    },

    candy: {
      frame: '#f29cc2',
      grid: 'rgba(200, 90, 140, 0.10)',
      paint(ctx, W, H, cell) {
        ctx.fillStyle = '#ffe6f1'; ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = cell * 0.7;
        for (let x = -H; x < W + H; x += cell * 2.2) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
        }
        ctx.restore();
        const rnd = seeded(3);
        const colors = ['#ff8fb8', '#ffd166', '#7fd4c1', '#9fc4f2', '#c9a7f0'];
        for (let i = 0; i < (W * H) / (cell * cell) * 0.35; i++) {
          ctx.save();
          ctx.translate(rnd() * W, rnd() * H);
          ctx.rotate(rnd() * TAU);
          ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
          ctx.globalAlpha = 0.45;
          ctx.fillRect(-cell * 0.16, -cell * 0.05, cell * 0.32, cell * 0.1);
          ctx.restore();
        }
      }
    },

    beach: {
      frame: '#e2bb72',
      grid: 'rgba(150, 110, 50, 0.10)',
      paint(ctx, W, H, cell) {
        const sand = ctx.createLinearGradient(0, 0, 0, H);
        sand.addColorStop(0, '#f8e7bd'); sand.addColorStop(1, '#f1d79f');
        ctx.fillStyle = sand; ctx.fillRect(0, 0, W, H);
        const rnd = seeded(11);
        ctx.fillStyle = 'rgba(170, 130, 70, 0.18)';
        for (let i = 0; i < (W * H) / (cell * cell) * 1.4; i++) {
          ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, cell * 0.04, 0, TAU); ctx.fill();
        }
        // the sea along the top, with a line of foam
        ctx.fillStyle = 'rgba(110, 190, 230, 0.35)';
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (let x = 0; x <= W; x += cell / 2) ctx.lineTo(x, cell * (0.9 + 0.25 * Math.sin(x / cell)));
        ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = Math.max(1.5, cell / 12);
        ctx.beginPath();
        for (let x = 0; x <= W; x += cell / 2) ctx.lineTo(x, cell * (0.9 + 0.25 * Math.sin(x / cell)));
        ctx.stroke();
        // a few shells and starfish, faint so they never look like something to eat
        ctx.globalAlpha = 0.3;
        ctx.font = `${cell * 0.75}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 7; i++) ctx.fillText(rnd() < 0.5 ? '🐚' : '⭐', rnd() * W, cell * 2 + rnd() * (H - cell * 3));
        ctx.globalAlpha = 1;
      }
    },

    cabin: {
      frame: '#9c6b3f',
      grid: 'rgba(110, 70, 30, 0.09)',
      paint(ctx, W, H, cell) {
        ctx.fillStyle = '#ecd2a6'; ctx.fillRect(0, 0, W, H);
        const rnd = seeded(5);
        // floorboards two squares tall, each a slightly different shade, with knots and grain
        for (let y = 0, row = 0; y < H; y += cell * 2, row++) {
          let x = -rnd() * cell * 6;
          while (x < W) {
            const len = cell * (5 + rnd() * 6);
            ctx.fillStyle = `rgba(150, 100, 50, ${0.04 + rnd() * 0.08})`;
            ctx.fillRect(x, y, len, cell * 2);
            ctx.strokeStyle = 'rgba(120, 80, 40, 0.25)'; ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, len, cell * 2);
            ctx.strokeStyle = 'rgba(120, 80, 40, 0.08)';
            for (let g = 1; g < 4; g++) {
              ctx.beginPath(); ctx.moveTo(x + 4, y + g * cell * 0.5);
              ctx.bezierCurveTo(x + len / 3, y + g * cell * 0.5 - 3, x + len * 2 / 3, y + g * cell * 0.5 + 3, x + len - 4, y + g * cell * 0.5);
              ctx.stroke();
            }
            if (rnd() < 0.3) {
              ctx.fillStyle = 'rgba(120, 80, 40, 0.18)';
              ctx.beginPath(); ctx.ellipse(x + len * rnd(), y + cell * (0.6 + rnd() * 0.8), cell * 0.25, cell * 0.12, 0, 0, TAU); ctx.fill();
            }
            x += len;
          }
        }
      }
    },

    snow: {
      frame: '#9cc7e4',
      grid: 'rgba(90, 140, 190, 0.12)',
      paint(ctx, W, H, cell) {
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#e3f1fb'); sky.addColorStop(1, '#f6fbff');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        checker(ctx, W, H, cell, 'rgba(140, 180, 220, 0.07)');
        // a soft drift along the bottom
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += cell) ctx.lineTo(x, H - cell * (0.35 + 0.2 * Math.sin(x / (cell * 3))));
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      },
      move(ctx, W, H, cell, now) {
        const rnd = seeded(21);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(150, 190, 225, 0.5)'; ctx.lineWidth = 1;
        const flakes = Math.round((W * H) / (cell * cell) / 16);
        for (let i = 0; i < flakes; i++) {
          const speed = (0.45 + rnd() * 0.6) * cell;        // how far it falls in a second
          const x0 = rnd() * W, y0 = rnd() * H, r = cell * (0.06 + rnd() * 0.08);
          const y = (y0 + now / 1000 * speed) % (H + 10) - 5;
          const x = x0 + Math.sin(now / 1400 + i) * cell * 0.4;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
    },

    space: {
      frame: '#4a3f7a',
      grid: 'rgba(200, 190, 255, 0.08)',
      paint(ctx, W, H, cell) {
        const sky = ctx.createLinearGradient(0, 0, W, H);
        sky.addColorStop(0, '#1d2347'); sky.addColorStop(1, '#2d2156');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
        const rnd = seeded(42);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < (W * H) / (cell * cell) * 0.5; i++) {
          ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, cell * (0.02 + rnd() * 0.035), 0, TAU); ctx.fill();
        }
        // a ringed planet, low in one corner
        const px = W * 0.86, py = H * 0.8, pr = cell * 2.2;
        ctx.fillStyle = 'rgba(242, 166, 90, 0.35)';
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 220, 160, 0.35)'; ctx.lineWidth = cell * 0.18;
        ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.45, -0.35, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(199, 154, 224, 0.25)';
        ctx.beginPath(); ctx.arc(W * 0.1, H * 0.16, cell * 0.9, 0, TAU); ctx.fill();
      },
      move(ctx, W, H, cell, now) {
        const rnd = seeded(9);
        const stars = Math.round((W * H) / (cell * cell) / 22);
        for (let i = 0; i < stars; i++) {
          const x = rnd() * W, y = rnd() * H, phase = rnd() * TAU;
          const a = Math.max(0, Math.sin(now / 700 + phase));
          ctx.fillStyle = `rgba(255, 245, 200, ${a * 0.9})`;
          const r = cell * 0.13 * (0.6 + a * 0.4);
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const ang = k * Math.PI / 4, d = k % 2 ? r * 0.3 : r;
            ctx.lineTo(x + Math.cos(ang) * d, y + Math.sin(ang) * d);
          }
          ctx.closePath(); ctx.fill();
        }
      }
    }
  };

  /* The faint grid over every board: one thin line along each edge of the squares. */
  function gridLines(ctx, W, H, cell, color) {
    ctx.strokeStyle = color || 'rgba(120, 100, 70, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cell; x < W; x += cell) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = cell; y < H; y += cell) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.stroke();
  }

  const cache = new Map();

  /* The still part of a board, painted once per size and kept. */
  function still(id, W, H, cell) {
    const dpr = window.devicePixelRatio || 1;
    const key = id + ':' + Math.round(W) + 'x' + Math.round(H) + ':' + Math.round(cell * 10) + ':' + dpr;
    let c = cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr);
      const cx = c.getContext('2d');
      cx.scale(dpr, dpr);
      BOARDS[id].paint(cx, W, H, cell);
      gridLines(cx, W, H, cell, BOARDS[id].grid);
      if (cache.size > 60) cache.delete(cache.keys().next().value);
      cache.set(key, c);
    }
    return c;
  }

  function get(id) { return BOARDS[id] ? id : 'garden'; }

  /* Draw board `id` filling W x H, with squares `cell` big. */
  function draw(ctx, id, W, H, cell, now) {
    id = get(id);
    ctx.drawImage(still(id, W, H, cell), 0, 0, W, H);
    if (BOARDS[id].move) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      BOARDS[id].move(ctx, W, H, cell, now);
      ctx.restore();
    }
  }

  function frame(id) { return BOARDS[get(id)].frame; }

  return { draw, frame, ids: Object.keys(BOARDS) };
})();
