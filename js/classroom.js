/* Class races, from the browser's side. The score is kept on the server (tools/classroom.py);
   this file is how join.html, teacher.html and the game talk to it, plus the little helpers
   they share: the class clock, "2nd", "4:05", and remembering your seat.

   No DOM in here either: tools/test.js drives it with a pretend fetch. */
window.BW = window.BW || {};

BW.Class = (function () {
  let fetchFn = (...args) => fetch(...args);
  let offset = 0;            // the server's clock minus this computer's

  function setFetch(fn) { fetchFn = fn; }

  /* Ask the server. Hands back { ok, status, data } for any answer at all - a 404 or a 409
     is news the page has to act on - and throws only when the server could not be reached.
     Every answer that carries the server's time keeps this computer's clock in step. */
  async function call(path, body) {
    const init = body === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
    const r = await fetchFn('api/class' + path, init);
    let data = {};
    try { data = await r.json(); } catch (err) { /* plain http.server: no class races there */ }
    if (data && typeof data.now === 'number') offset = data.now - Date.now();
    return { ok: r.ok, status: r.status, data: data || {} };
  }

  /* The server's clock. Every computer in the class counts down to the same moment, even if
     their own clocks disagree. */
  function now() { return Date.now() + offset; }

  /* 65000 -> "1:05" */
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd" */
  function ordinal(n) {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    return n + (teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  /* A place on the board. Everybody on nought shares last place, which says nothing - so
     until a player has a correct sentence their place is a dash. */
  function place(row) { return row.correct > 0 ? ordinal(row.rank) : '\u2013'; }

  /* What someone types as the code: any case, spaces and all. */
  function cleanCode(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  }

  /* A player's mini leaderboard: the top few, and then the player too if they are further
     down - everyone can see who is winning and where they are. */
  function nearTop(board, size) {
    const rows = board.slice(0, size);
    const me = board.find(r => r.you);
    if (me && !rows.includes(me)) rows.push({ gap: true }, me);
    return rows;
  }

  /* ---------- remembering who you are ---------- */

  /* A student's seat rides in the game's address (game.html?class=BCDF#seat=...) as well as in
     storage, so a reload works even where storage is blocked. It goes after the #, which the
     browser never sends to the server. The teacher's key is only kept in storage - a teacher's
     screen is often up on the projector, address bar and all. */
  const SEAT_KEY = 'bookworms.seat';
  const TEACHER_KEY = 'bookworms.teacher';

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (err) { return null; }
  }
  function store(key, value) {
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
    } catch (err) { /* not important */ }
  }

  /* { code, seat, name } if this browser has a seat in that class */
  function savedSeat(code) {
    const s = load(SEAT_KEY);
    return s && s.code === code && typeof s.seat === 'string' ? s : null;
  }
  function saveSeat(seat) { store(SEAT_KEY, seat); }

  function savedTeacher() {
    const t = load(TEACHER_KEY);
    return t && typeof t.code === 'string' && typeof t.teacher === 'string' ? t : null;
  }
  function saveTeacher(t) { store(TEACHER_KEY, t); }

  return { setFetch, call, now, clock, ordinal, place, cleanCode, nearTop,
           savedSeat, saveSeat, savedTeacher, saveTeacher };
})();
