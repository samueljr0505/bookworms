/* Drawing the worm and everything it can wear. Shared by the game board (js/render.js), the
   home page and the shop, so a crown looks the same everywhere. (Boards are drawn by
   js/board-art.js.)

   Every size is a fraction of `s`, the width of one body square, so the same code draws the
   26px worm on the board and the big worm in the shop. A "skin" is the worm's two colours
   plus what it has on: { body, head, pattern, hat, glasses, neck, trail } (see BW.skinFor). */
window.BW = window.BW || {};

BW.WormArt = (function () {
  const TAU = Math.PI * 2;

  /* ---------- colour helpers ---------- */

  function mix(hex, towards, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = c => Math.round(c + (towards - c) * amount);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }

  function star(ctx, x, y, r, points, inner) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / points;
      const d = i % 2 ? r * (inner || 0.45) : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
  }

  function heart(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
    ctx.closePath();
  }

  /* ---------- body ---------- */

  /* The colour of body square i (of n), counting from the head. Plain worms fade towards the
     tail so it looks lighter than the neck whatever colour was chosen. */
  function bodyFill(skin, i, n, now) {
    const t = i / Math.max(1, n - 1);
    switch (skin.pattern) {
      case 'stripes': return i % 2 ? skin.head : mix(skin.body, 255, 0.12);
      case 'rainbow': return `hsl(${(i * 32 + now / 14) % 360}, 78%, 66%)`;
      case 'gold':    return mix('#e8b730', 255, 0.18 + 0.2 * Math.max(0, Math.sin(now / 260 - i * 0.55)));
      case 'galaxy':  return mix('#3d2f86', 0, t * 0.35);
      default:        return mix(skin.body, 255, t * 0.34);
    }
  }

  function headFill(skin, now) {
    switch (skin.pattern) {
      case 'rainbow': return `hsl(${(now / 14) % 360}, 72%, 56%)`;
      case 'gold':    return '#d29a1c';
      case 'galaxy':  return '#2a1f63';
      default:        return skin.head;
    }
  }

  /* Little decorations on top of a square - only where no letter is written, so the
     sentence always stays easy to read. */
  function patternMarks(ctx, skin, x, y, w, i, now) {
    if (skin.pattern === 'spots') {
      ctx.fillStyle = mix(skin.head, 255, 0.1);
      circle(ctx, x + w * (i % 2 ? 0.32 : 0.66), y + w * (i % 2 ? 0.36 : 0.62), w * 0.16);
      ctx.fill();
    } else if (skin.pattern === 'galaxy') {
      for (let k = 0; k < 2; k++) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / 400 + i * 1.7 + k * 2.1));
        ctx.fillStyle = `rgba(255, 255, 255, ${tw})`;
        star(ctx, x + w * (0.3 + 0.4 * ((i * 7 + k * 3) % 5) / 4), y + w * (0.28 + 0.44 * k), w * 0.1, 4, 0.35);
        ctx.fill();
      }
    } else if (skin.pattern === 'gold') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      roundRect(ctx, x + w * 0.18, y + w * 0.16, w * 0.3, w * 0.12, w * 0.06);
      ctx.fill();
    }
  }

  /* One body square centred on (cx, cy). A square with a letter written on it (`written`)
     stays full size and plain, so the word on top of it is easy to read. */
  function segment(ctx, cx, cy, s, i, n, skin, now, written) {
    const t = i / Math.max(1, n - 1);
    const pad = written ? 1 : 1.5 + t * 1.5;
    const x = cx - s / 2 + pad, y = cy - s / 2 + pad, w = s - pad * 2;

    ctx.fillStyle = bodyFill(skin, i, n, now);
    roundRect(ctx, x, y, w, w, w * 0.28);
    ctx.fill();
    if (!written) patternMarks(ctx, skin, x, y, w, i, now);
  }

  /* The words written along the body. `letters` are in order along the body, each
     { x, y, char, color, word }. The letters of one word are joined into a single coloured
     strip, so the words stand apart from each other with a little of the worm showing
     between them - the gap a reader needs - without the worm getting any longer. The
     worm's own colour shows as a rim around every word. */
  function words(ctx, letters, s, font) {
    const tile = s - 2 - Math.max(2, s * 0.1) * 2;

    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.lineWidth = tile * 0.82;
    for (let i = 1; i < letters.length; i++) {
      const a = letters[i - 1], b = letters[i];
      // only neighbours are joined - not two letters on opposite edges when the walls wrap
      if (a.word !== b.word || Math.hypot(a.x - b.x, a.y - b.y) > s * 1.5) continue;
      ctx.strokeStyle = a.color;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of letters) {
      ctx.fillStyle = l.color;
      roundRect(ctx, l.x - tile / 2, l.y - tile / 2, tile, tile, tile * 0.24);
      ctx.fill();
      ctx.fillStyle = '#20242e';
      ctx.fillText(l.char, l.x, l.y + 1);
    }
  }

  /* ---------- head, eyes and glasses ---------- */

  /* The head centred on (cx, cy) facing `dir`. `neck` is the centre of the square behind it,
     where neckwear goes. `scale` puffs the head up for a moment when it gulps a word. */
  function head(ctx, cx, cy, s, dir, skin, now, opts) {
    opts = opts || {};
    const scale = opts.scale || 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    ctx.fillStyle = headFill(skin, now);
    roundRect(ctx, -s / 2 + 1, -s / 2 + 1, s - 2, s - 2, s * 0.34);
    ctx.fill();
    if (skin.pattern === 'gold' || skin.pattern === 'galaxy') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      roundRect(ctx, -s * 0.3, -s * 0.36, s * 0.26, s * 0.1, s * 0.05);
      ctx.fill();
    }

    // A cartoon face, like a sticker: the eyes always sit side by side, nudged the way the
    // worm is going, and the pupils look where it is heading. Glasses read best this way.
    const lean = dir.x * s * 0.07;
    const eyes = [[-s * 0.17 + lean, -s * 0.08], [s * 0.17 + lean, -s * 0.08]];
    const blink = (now + (opts.blinkOffset || 0)) % 4300 < 130;

    // where the pupils point: the way the worm is going, unless it is watching something
    // (opts.look, a direction no longer than 1 - see followPointer below)
    const look = opts.look || { x: dir.x * 0.8, y: dir.y * 0.8 };
    for (const [ex, ey] of eyes) {
      if (opts.happy) {
        // being petted: happy squinting eyes, ^ ^
        ctx.strokeStyle = '#1b2430'; ctx.lineWidth = s * 0.055; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(ex, ey + s * 0.04, s * 0.09, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, s * 0.13, blink ? s * 0.025 : s * 0.14, 0, 0, TAU);
      ctx.fill();
      if (!blink) {
        ctx.fillStyle = '#1b2430';
        circle(ctx, ex + look.x * s * 0.065, ey + look.y * s * 0.07, s * 0.065);
        ctx.fill();
      }
    }

    // a smile - or a round "O" while it gulps a word down
    ctx.strokeStyle = 'rgba(30, 30, 40, 0.65)';
    ctx.fillStyle = 'rgba(30, 30, 40, 0.65)';
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.lineCap = 'round';
    if (scale > 1.05) {
      circle(ctx, lean, s * 0.2, s * 0.08); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(lean, s * 0.1, s * 0.13, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }

    glasses(ctx, eyes, s, skin.glasses, dir);
    ctx.restore();

    // neckwear sits over the join between the head and the body
    if (opts.neck) neckwear(ctx, cx, cy, opts.neck.x, opts.neck.y, s, skin.neck);

    // hats always sit upright on the screen, like a sticker, so they read at a glance
    hat(ctx, cx, cy - s * 0.4 * scale, s * scale, skin.hat, dir, now);
  }

  function glasses(ctx, eyes, s, style, dir) {
    if (!style || style === 'none') return;
    const [a, b] = eyes;
    const r = s * 0.19;
    const bridge = (color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    };
    ctx.lineCap = 'round';

    switch (style) {
      case 'round':
        bridge('#3a2f2a', s * 0.05);
        ctx.strokeStyle = '#3a2f2a'; ctx.lineWidth = s * 0.055;
        for (const [x, y] of eyes) { circle(ctx, x, y, r); ctx.stroke(); }
        break;
      case 'sun':
        bridge('#11131c', s * 0.07);
        for (const [x, y] of eyes) {
          ctx.fillStyle = '#1b1e2b'; circle(ctx, x, y, r * 1.05); ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.25); ctx.fill();
        }
        break;
      case 'heart':
        bridge('#d6336c', s * 0.05);
        ctx.fillStyle = '#ff4f8b';
        for (const [x, y] of eyes) { heart(ctx, x, y, r * 1.05); ctx.fill(); }
        break;
      case 'star':
        bridge('#d39b10', s * 0.05);
        for (const [x, y] of eyes) {
          ctx.fillStyle = '#ffd23f'; star(ctx, x, y, r * 1.35, 5, 0.5); ctx.fill();
          ctx.strokeStyle = '#d39b10'; ctx.lineWidth = s * 0.03; ctx.stroke();
        }
        break;
      case 'monocle': {
        ctx.strokeStyle = '#d9a521'; ctx.lineWidth = s * 0.055;
        circle(ctx, a[0], a[1], r); ctx.stroke();
        ctx.lineWidth = s * 0.025;
        ctx.beginPath();
        ctx.moveTo(a[0] + r * 0.7, a[1] + r * 0.7);
        ctx.quadraticCurveTo(a[0] + r * 1.6, a[1] + r * 2.4, a[0] - dir.x * s * 0.3, a[1] + s * 0.42);
        ctx.stroke();
        break;
      }
      case 'threed':
        bridge('#fff', s * 0.06);
        ctx.fillStyle = 'rgba(232, 60, 70, 0.75)';
        roundRect(ctx, a[0] - r, a[1] - r * 0.85, r * 2, r * 1.7, r * 0.3); ctx.fill();
        ctx.fillStyle = 'rgba(60, 140, 235, 0.75)';
        roundRect(ctx, b[0] - r, b[1] - r * 0.85, r * 2, r * 1.7, r * 0.3); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.04;
        for (const [x, y] of eyes) { roundRect(ctx, x - r, y - r * 0.85, r * 2, r * 1.7, r * 0.3); ctx.stroke(); }
        break;
    }
  }

  /* ---------- hats ---------- */

  /* (cx, top) is the top middle of the head; up is negative y. */
  function hat(ctx, cx, top, s, style, dir, now) {
    if (!style || style === 'none') return;
    const u = s;
    ctx.save();
    ctx.translate(cx, top);
    if (style === 'cap' && dir.x < 0) ctx.scale(-1, 1);   // the brim points the way you go
    ctx.lineJoin = 'round';

    switch (style) {
      case 'party': {
        ctx.fillStyle = '#ff6fa8';
        ctx.beginPath();
        ctx.moveTo(-u * 0.28, u * 0.06); ctx.lineTo(u * 0.28, u * 0.06); ctx.lineTo(u * 0.04, -u * 0.72);
        ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = u * 0.09;
        for (const y of [-0.12, -0.38]) {
          ctx.beginPath(); ctx.moveTo(-u * 0.4, y * u + u * 0.1); ctx.lineTo(u * 0.4, y * u - u * 0.06); ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#ffe066'; circle(ctx, u * 0.04, -u * 0.74, u * 0.1); ctx.fill();
        break;
      }
      case 'flower': {
        const fx = -u * 0.24, fy = 0;
        ctx.fillStyle = '#ff9ecf';
        for (let k = 0; k < 5; k++) {
          const a = k * TAU / 5 + now / 2400;
          circle(ctx, fx + Math.cos(a) * u * 0.13, fy + Math.sin(a) * u * 0.13, u * 0.11); ctx.fill();
        }
        ctx.fillStyle = '#ffd23f'; circle(ctx, fx, fy, u * 0.09); ctx.fill();
        break;
      }
      case 'cap': {
        ctx.fillStyle = '#e24b4b';
        ctx.beginPath(); ctx.arc(0, u * 0.08, u * 0.36, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b52f35';
        roundRect(ctx, u * 0.05, -u * 0.02, u * 0.5, u * 0.13, u * 0.06); ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, 0, -u * 0.28, u * 0.05); ctx.fill();
        ctx.font = `900 ${u * 0.26}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('B', -u * 0.05, -u * 0.1);
        break;
      }
      case 'bow': {
        ctx.fillStyle = '#ff5c8a';
        ctx.beginPath();
        ctx.moveTo(u * 0.12, -u * 0.02); ctx.lineTo(-u * 0.14, -u * 0.22); ctx.lineTo(-u * 0.14, u * 0.18); ctx.closePath();
        ctx.moveTo(u * 0.12, -u * 0.02); ctx.lineTo(u * 0.38, -u * 0.22); ctx.lineTo(u * 0.38, u * 0.18); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d6336c'; circle(ctx, u * 0.12, -u * 0.02, u * 0.08); ctx.fill();
        break;
      }
      case 'beanie': {
        ctx.fillStyle = '#4aa3df';
        ctx.beginPath(); ctx.arc(0, u * 0.08, u * 0.38, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2f7fb8';
        roundRect(ctx, -u * 0.41, -u * 0.04, u * 0.82, u * 0.16, u * 0.06); ctx.fill();
        ctx.fillStyle = '#fff'; circle(ctx, 0, -u * 0.34, u * 0.11); ctx.fill();
        break;
      }
      case 'tophat': {
        ctx.fillStyle = '#2c2a3a';
        ctx.beginPath(); ctx.ellipse(0, u * 0.06, u * 0.44, u * 0.08, 0, 0, TAU); ctx.fill();
        roundRect(ctx, -u * 0.26, -u * 0.6, u * 0.52, u * 0.66, u * 0.05); ctx.fill();
        ctx.fillStyle = '#e2445c';
        ctx.fillRect(-u * 0.26, -u * 0.14, u * 0.52, u * 0.11);
        break;
      }
      case 'viking': {
        ctx.fillStyle = '#f4ead2'; ctx.strokeStyle = '#bfae86'; ctx.lineWidth = u * 0.03;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * u * 0.26, -u * 0.04);
          ctx.quadraticCurveTo(side * u * 0.6, -u * 0.1, side * u * 0.52, -u * 0.56);
          ctx.quadraticCurveTo(side * u * 0.42, -u * 0.22, side * u * 0.16, -u * 0.2);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath(); ctx.arc(0, u * 0.08, u * 0.36, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c7a14a';
        roundRect(ctx, -u * 0.38, -u * 0.04, u * 0.76, u * 0.12, u * 0.05); ctx.fill();
        break;
      }
      case 'crown': {
        ctx.fillStyle = '#f6c544'; ctx.strokeStyle = '#c9971c'; ctx.lineWidth = u * 0.04;
        ctx.beginPath();
        ctx.moveTo(-u * 0.32, u * 0.06); ctx.lineTo(-u * 0.36, -u * 0.38); ctx.lineTo(-u * 0.16, -u * 0.16);
        ctx.lineTo(0, -u * 0.46); ctx.lineTo(u * 0.16, -u * 0.16); ctx.lineTo(u * 0.36, -u * 0.38);
        ctx.lineTo(u * 0.32, u * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e2445c'; circle(ctx, 0, -u * 0.06, u * 0.07); ctx.fill();
        ctx.fillStyle = '#4aa3df';
        circle(ctx, -u * 0.19, -u * 0.04, u * 0.05); ctx.fill();
        circle(ctx, u * 0.19, -u * 0.04, u * 0.05); ctx.fill();
        const glint = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.fillStyle = `rgba(255, 255, 255, ${glint})`;
        star(ctx, u * 0.3, -u * 0.42, u * 0.08, 4, 0.3); ctx.fill();
        break;
      }
      case 'wizard': {
        ctx.fillStyle = '#5b3fa8';
        ctx.beginPath(); ctx.ellipse(0, u * 0.06, u * 0.46, u * 0.09, 0, 0, TAU); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-u * 0.3, u * 0.06);
        ctx.quadraticCurveTo(-u * 0.05, -u * 0.5, u * 0.28, -u * 0.95);
        ctx.quadraticCurveTo(u * 0.12, -u * 0.4, u * 0.3, u * 0.06);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        star(ctx, -u * 0.06, -u * 0.18, u * 0.08, 5); ctx.fill();
        star(ctx, u * 0.1, -u * 0.48, u * 0.06, 5); ctx.fill();
        circle(ctx, u * 0.28, -u * 0.95, u * 0.05); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  /* ---------- neckwear ---------- */

  /* Drawn where the head meets the body, turned to follow the body. */
  function neckwear(ctx, hx, hy, nx, ny, s, style) {
    if (!style || style === 'none') return;
    const u = s;
    const ang = Math.atan2(ny - hy, nx - hx);
    ctx.save();
    ctx.translate(hx + (nx - hx) * 0.55, hy + (ny - hy) * 0.55);
    ctx.rotate(ang);
    // local frame: +x runs down the body, y runs across it

    switch (style) {
      case 'bowtie':
        ctx.fillStyle = '#e2445c';
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-u * 0.15, -u * 0.36); ctx.lineTo(u * 0.15, -u * 0.36); ctx.closePath();
        ctx.moveTo(0, 0); ctx.lineTo(-u * 0.15, u * 0.36); ctx.lineTo(u * 0.15, u * 0.36); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#b52f35'; circle(ctx, 0, 0, u * 0.08); ctx.fill();
        break;
      case 'scarf':
        ctx.fillStyle = '#e2445c';
        roundRect(ctx, -u * 0.13, -u * 0.54, u * 0.26, u * 1.08, u * 0.1); ctx.fill();
        roundRect(ctx, -u * 0.02, u * 0.3, u * 0.5, u * 0.18, u * 0.06); ctx.fill();
        ctx.fillStyle = '#fff';
        for (const y of [-0.3, 0, 0.3]) ctx.fillRect(-u * 0.13, y * u - u * 0.04, u * 0.26, u * 0.07);
        ctx.fillRect(u * 0.3, u * 0.3, u * 0.06, u * 0.18);
        break;
      case 'bandana':
        ctx.fillStyle = '#3d7fd9';
        ctx.beginPath();
        ctx.moveTo(-u * 0.1, -u * 0.5); ctx.lineTo(-u * 0.1, u * 0.5); ctx.lineTo(u * 0.42, 0); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        for (const [x, y] of [[0.04, -0.22], [0.04, 0.22], [0.2, 0]]) { circle(ctx, x * u, y * u, u * 0.045); ctx.fill(); }
        break;
      case 'medal':
        ctx.strokeStyle = '#3d7fd9'; ctx.lineWidth = u * 0.1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-u * 0.05, -u * 0.45); ctx.lineTo(u * 0.22, 0); ctx.lineTo(-u * 0.05, u * 0.45); ctx.stroke();
        ctx.rotate(-ang);      // the medal itself hangs the right way up
        ctx.fillStyle = '#f6c544'; circle(ctx, 0, 0, u * 0.2); ctx.fill();
        ctx.strokeStyle = '#c9971c'; ctx.lineWidth = u * 0.04; ctx.stroke();
        ctx.fillStyle = '#c9971c'; star(ctx, 0, 0, u * 0.11, 5); ctx.fill();
        break;
    }
    ctx.restore();
  }

  /* ---------- particles: trails, crumbs, confetti ---------- */

  const CONFETTI = ['#ff6fa8', '#ffd23f', '#5ec4a3', '#72b6e8', '#c79ae0', '#f2a65a'];
  const GLOW = { sparkle: '#fff1a6', bubble: '#a9dcff', heart: '#ffb3c9', note: '#d7c2f5' };

  class Particles {
    constructor() { this.list = []; }

    /* kind: sparkle | bubble | heart | note | confetti | crumb | dust */
    emit(kind, x, y, n, opts) {
      opts = opts || {};
      for (let i = 0; i < (n || 1); i++) {
        const a = Math.random() * TAU;
        const speed = (opts.speed || 40) * (0.4 + Math.random() * 0.8);
        const p = {
          kind, x, y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          g: 0, life: 0, max: (opts.life || 900) * (0.7 + Math.random() * 0.6),
          size: (opts.size || 6) * (0.7 + Math.random() * 0.6),
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8,
          color: opts.color || CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
          glow: !!opts.glow
        };
        if (kind === 'bubble' || kind === 'note' || kind === 'heart') { p.vy = -Math.abs(p.vy) * 0.6 - 12; p.vx *= 0.5; }
        if (kind === 'confetti') { p.vy = -Math.abs(p.vy) - 60; p.g = 260; }
        if (kind === 'crumb' || kind === 'dust') p.g = 120;
        this.list.push(p);
      }
      if (this.list.length > 400) this.list.splice(0, this.list.length - 400);
    }

    /* The puff a worm leaves behind while it wears a trail: a couple of bits each step,
       big enough to see at a glance, with a soft glow, fading out over a second and a half.
       Enough to notice and enjoy - not so much that it hides the words on the board. */
    trail(kind, x, y, size) {
      if (!kind || kind === 'none') return;
      const r = size || 9;
      for (let i = 0; i < 2; i++) {
        this.emit(kind, x + (Math.random() - 0.5) * r * 1.4, y + (Math.random() - 0.5) * r * 1.4, 1,
                  { speed: 30, life: 1500, size: kind === 'confetti' ? r * 0.8 : r, glow: true });
      }
    }

    update(dt) {
      const s = dt / 1000;
      for (const p of this.list) {
        p.life += dt;
        p.vy += p.g * s;
        p.x += p.vx * s; p.y += p.vy * s;
        p.vx *= 0.985;
        p.rot += p.vr * s;
      }
      this.list = this.list.filter(p => p.life < p.max);
    }

    draw(ctx) {
      for (const p of this.list) {
        const t = p.life / p.max;
        ctx.save();
        // trail bits pop in, hold, then fade; everything else just fades
        ctx.globalAlpha = Math.max(0, p.glow ? 1 - t * t * t : 1 - t * t);
        ctx.translate(p.x, p.y);
        const pop = p.glow ? Math.min(1, t * 8) : 1;
        const r = p.size * (0.4 + 0.6 * pop);
        if (p.glow) {
          // a soft halo behind the bit, fading out to nothing, so it shows up on any board
          const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.4);
          halo.addColorStop(0, GLOW[p.kind] || p.color);
          halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = halo;
          ctx.globalAlpha *= 0.55;
          circle(ctx, 0, 0, r * 1.4); ctx.fill();
          ctx.globalAlpha /= 0.55;
        }
        ctx.rotate(p.kind === 'confetti' || p.kind === 'sparkle' ? p.rot : 0);
        switch (p.kind) {
          case 'sparkle': {
            const tw = 0.75 + 0.25 * Math.sin(p.life / 70 + p.rot * 5);    // a little twinkle
            ctx.fillStyle = '#ffd23f'; star(ctx, 0, 0, r * tw * (1 - t * 0.4), 4, 0.3); ctx.fill();
            ctx.fillStyle = '#fff'; circle(ctx, 0, 0, r * 0.16); ctx.fill(); break;
          }
          case 'bubble':
            ctx.strokeStyle = 'rgba(70, 150, 215, 0.95)'; ctx.lineWidth = 2;
            circle(ctx, 0, 0, r * (0.6 + t * 0.6)); ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; circle(ctx, -r * 0.3, -r * 0.3, r * 0.2); ctx.fill(); break;
          case 'heart':
            ctx.fillStyle = '#ff5c8a'; heart(ctx, 0, 0, r * 0.8); ctx.fill(); break;
          case 'note':
            ctx.fillStyle = '#7d5cae';
            ctx.font = `900 ${r * 2}px system-ui, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(p.rot > Math.PI ? '♫' : '♪', 0, 0); break;
          case 'confetti':
            ctx.fillStyle = p.color; ctx.fillRect(-r / 2, -r / 4, r, r / 2); break;
          case 'crumb':
            ctx.fillStyle = p.color; circle(ctx, 0, 0, r * 0.5 * (1 - t * 0.5)); ctx.fill(); break;
          case 'dust':
            ctx.fillStyle = 'rgba(150, 130, 100, 0.6)'; circle(ctx, 0, 0, r * (0.5 + t)); ctx.fill(); break;
        }
        ctx.restore();
      }
    }
  }

  /* ---------- little animated worms for the home page and the shop ---------- */

  /* One animation loop drives every preview on the page, however many shop cards there are. */
  const mounted = [];
  let looping = false;
  let lastFrame = 0;

  function loop(now) {
    const dt = Math.min(60, now - (lastFrame || now));
    lastFrame = now;
    for (const m of mounted) {
      if (!m.canvas.isConnected) continue;
      // one broken preview must not freeze every other worm on the page
      try { drawPreview(m, now, dt); } catch (err) { if (!m.failed) console.error(err); m.failed = true; }
    }
    for (let i = mounted.length - 1; i >= 0; i--) if (!mounted[i].canvas.isConnected) mounted.splice(i, 1);
    if (mounted.length) requestAnimationFrame(loop); else looping = false;
  }

  /* A wiggling worm on its own canvas. `getSkin` is called every frame, so changing what the
     worm wears shows straight away. opts: { segments, letters, fit: 'width' } */
  function mount(canvas, getSkin, opts) {
    opts = opts || {};
    const m = {
      canvas, getSkin, opts,
      fx: new Particles(), nextPuff: 0,
      blinkOffset: Math.floor(Math.random() * 4000)
    };
    mounted.push(m);
    if (!looping) { looping = true; lastFrame = 0; requestAnimationFrame(loop); }
    return m;
  }

  function drawPreview(m, now, dt) {
    const { canvas, opts } = m;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const skin = m.getSkin();
    const n = opts.segments || 6;
    const s = Math.min(ch / 2.6, cw / (n + 1.2));
    // the shop shows boards behind the worm; everywhere else the worm stands on the page
    const onBoard = typeof opts.board === 'function' ? opts.board() : opts.board;
    if (onBoard && BW.BoardArt) BW.BoardArt.draw(ctx, skin.board, cw, ch, s * 0.8, now);
    const gap = s * 0.96;
    const start = cw / 2 + (n - 1) * gap / 2;          // the head, on the right
    const baseY = ch * 0.6;
    const pos = i => ({ x: start - i * gap, y: baseY + Math.sin(now / 260 - i * 0.75) * s * 0.22 });
    const letters = opts.letters || '';
    const font = `800 ${Math.round(s * 0.5)}px ui-rounded, "Nunito", system-ui, sans-serif`;

    if (now > m.nextPuff && skin.trail && skin.trail !== 'none') {
      const tail = pos(n - 1);
      m.fx.trail(skin.trail, tail.x - s * 0.4, tail.y, s * 0.3);
      m.nextPuff = now + 240;
    }
    m.fx.update(dt);
    m.fx.draw(ctx);

    const written = [];
    for (let i = n - 1; i >= 1; i--) {
      const p = pos(i);
      const ch = letters[letters.length - i];
      segment(ctx, p.x, p.y, s, i, n, skin, now, !!ch);
      if (ch) written.push({ x: p.x, y: p.y, char: ch, color: opts.letterColor || '#ffe9a8', word: 0 });
    }
    words(ctx, written, s, font);
    const h = pos(0);
    const watch = opts.followPointer ? watching(m, canvas, h, s, dt) : {};
    head(ctx, h.x, h.y, s, { x: 1, y: 0 }, skin, now,
         { neck: pos(1), blinkOffset: m.blinkOffset, look: watch.look, happy: watch.happy });
  }

  /* ---------- eyes that follow the mouse ---------- */

  // where the mouse (or a finger) is on the page, or null once it has left the window
  let pointer = null;
  let listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
    document.addEventListener('pointerleave', () => { pointer = null; });
    window.addEventListener('blur', () => { pointer = null; });
  }

  /* Which way the eyes of preview `m` look, with its head at (h.x, h.y) on the canvas: towards
     the pointer, a little less the closer it is, easing there rather than snapping so the eyes
     seem to follow rather than twitch. A pointer right on the head is a pat on the head. */
  function watching(m, canvas, h, s, dt) {
    listen();
    const box = canvas.getBoundingClientRect();
    let target = { x: 0.8, y: 0 }, happy = false;      // nobody about: look ahead
    if (pointer) {
      const dx = pointer.x - (box.left + h.x), dy = pointer.y - (box.top + h.y);
      const dist = Math.hypot(dx, dy);
      happy = dist < s * 0.6;
      const reach = Math.min(1, dist / (s * 1.5));
      target = dist ? { x: dx / dist * reach, y: dy / dist * reach } : { x: 0, y: 0 };
    }
    const ease = Math.min(1, dt / 80);
    m.look = m.look || { x: 0.8, y: 0 };
    m.look = { x: m.look.x + (target.x - m.look.x) * ease, y: m.look.y + (target.y - m.look.y) * ease };
    return { look: m.look, happy };
  }

  return { mix, roundRect, segment, words, head, hat, glasses, neckwear, Particles, mount, CONFETTI };
})();
