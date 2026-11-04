/* Pretend students for trying out a class race - and its class report - on your own.

     1. ./serve.sh, open the teacher's page (Class race), and open a class. Pick 2 minutes.
     2. node tools/demo-class.js BCDF          (the class's code; add a port if it is not 8000)
     3. Press Start. The pretend students play the whole race; you can join and play too.
     4. When the time is up, press Class report.

   Each student plays a different way, so the report has something to say about each:

     Maya   builds long sentences, and rarely bumps into a word that does not fit
     Leo    plays steadily, mostly short sentences
     Priya  keeps steering to a Verb where a Noun or an Adjective goes
     Sam    keeps trying to end sentences before they are finished
     Ivy    keeps putting a describing word where it does not go
     Zoe    writes one sentence, then the same one again and again
     Omar   plays for twenty seconds, then stops
     Jake   steers at random

   Their words go through the game's real rules (js/grammar.js, js/checker.js), and they talk to
   the server exactly the way a game in a browser does (js/race.js). Nothing here is used by
   the game itself. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
global.window = global;
for (const f of ['js/config.js', 'js/util.js', 'js/grammar.js', 'js/sense.js', 'js/checker.js', 'js/worm.js', 'js/board.js']) {
  eval(fs.readFileSync(path.join(root, f), 'utf8'));
}
const NS = global.window.BW;

const code = String(process.argv[2] || '').toUpperCase().replace(/[^A-Z]/g, '');
const port = Number(process.argv[3] || 8000);
if (code.length !== 4) {
  console.error('Usage: node tools/demo-class.js <class code> [port]\n  e.g.  node tools/demo-class.js BCDF');
  process.exit(1);
}
const api = 'http://localhost:' + port + '/api/class/' + code;

const TICK_MS = 1300;        // a pretend student picks a word about this often
const MOVES_MS = 10000;      // as in js/race.js
const SLOT_MS = 15000;
const BATCH = 12;

const STUDENTS = [
  { name: 'Maya', good: 0.93, longer: 0.65 },
  { name: 'Leo', good: 0.8, longer: 0.15 },
  { name: 'Priya', good: 0.72, longer: 0.2, wrong: 'verb' },
  { name: 'Sam', good: 0.75, longer: 0.2, wrong: 'end' },
  { name: 'Ivy', good: 0.75, longer: 0.3, wrong: 'adjective' },
  { name: 'Zoe', good: 0.95, longer: 0, repeats: true },
  { name: 'Omar', good: 0.8, longer: 0.2, stopsAfterMs: 20000 },
  { name: 'Jake', good: 0.1, longer: 0.5 }
];

let offset = 0;      // the server's clock minus this one's
const now = () => Date.now() + offset;
const sleep = ms => new Promise(done => setTimeout(done, ms));
const chance = p => Math.random() < p;
const pick = list => list[Math.floor(Math.random() * list.length)];

async function call(more, body) {
  const r = await fetch(api + more, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (typeof data.now === 'number') offset = data.now - Date.now();
  return { ok: r.ok, status: r.status, data };
}

function loadPack(topic, mode) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
  const entry = index.topics.find(t => t.id === topic);
  return NS.Grammar.forMode(JSON.parse(fs.readFileSync(path.join(root, 'data', entry.file), 'utf8')), mode);
}

class Student {
  constructor(profile, pack, view) {
    Object.assign(this, profile);
    this.pack = pack;
    this.view = view;
    const { cols, rows } = NS.CONFIG.grid;
    this.worm = new NS.Worm(cols, rows, 4);
    this.board = new NS.Board(cols, rows, text => Math.max(1, Math.ceil((text.length * 8 + 18) / NS.CONFIG.grid.cell)));
    this.sentence = NS.Grammar.newSentence(pack, NS.rng);
    this.written = [];
    this.sent = 0;
    this.batches = 0;
    this.moves = { refusals: [], ate: {}, crashes: 0, steers: 0, slots: new Set() };
    this.movesAt = Date.now();
    this.outbox = Promise.resolve();
  }

  async join() {
    const r = await call('/join', { name: this.name });
    if (r.status === 409 && /already called/.test(r.data.error || '')) {
      throw new Error(this.name + ' is already in this class. Pretend students cannot get back into a class ' +
                      'they were in before - close it and open a new one for each try.');
    }
    if (!r.ok) throw new Error(this.name + ' could not join: ' + (r.data.error || r.status));
    this.seat = r.data.seat;
  }

  /* One move: steer, then bump into a word - one that fits, or one that does not. */
  tick() {
    if (this.stopsAfterMs && now() - this.view.startsAt > this.stopsAfterMs) return;
    this.moves.steers++;
    this.moves.slots.add(Math.min(this.view.minutes * 4, Math.floor((now() - this.view.startsAt) / SLOT_MS)));
    if (this.repeats && this.written.length) return this.repeatLast();
    if (chance(0.03)) return this.crash();

    this.board.disperse(this.pack, this.sentence, this.worm, NS.CONFIG);
    const tiles = this.board.tiles;
    const fits = t => t.kind === 'punct' ? this.sentence.canEnd() && this.sentence.endMarks().includes(t.word)
                                        : this.sentence.fits(t.word, t.pos);
    const good = tiles.filter(fits);
    let tile;
    if (chance(this.good) && good.length) {
      const words = good.filter(t => t.kind === 'word'), marks = good.filter(t => t.kind === 'punct');
      tile = marks.length && (!words.length || !chance(this.longer)) ? pick(marks) : pick(words);
    } else {
      tile = pick(this.wrongTiles(tiles.filter(t => !fits(t))) || tiles);
    }
    if (!tile) return this.crash();

    const no = NS.Checker.refuse(this.pack, this.sentence, tile.word, tile.kind === 'punct' ? 'punctuation' : tile.pos);
    if (no) {
      const last = this.sentence.tokens[this.sentence.tokens.length - 1];
      this.moves.refusals.push({ kind: no.kind, tried: no.tried, needed: no.needed.slice(0, 6),
                                 word: tile.word.slice(0, 24), after: last ? last.word.slice(0, 24) : '' });
      if (this.moves.refusals.length >= BATCH) this.sendMoves();
      return;
    }
    this.board.remove(tile);
    if (tile.kind === 'punct') return this.finish(tile.word);
    this.sentence.add(tile.word, tile.pos);
    const family = NS.Checker.familyId(this.pack, tile.pos);
    this.moves.ate[family] = (this.moves.ate[family] || 0) + 1;
  }

  /* The kind of wrong word this student keeps going for, if they have one and it is there. */
  wrongTiles(wrong) {
    if (!this.wrong) return null;
    const why = t => NS.Checker.refuse(this.pack, this.sentence, t.word, t.kind === 'punct' ? 'punctuation' : t.pos);
    const mine = wrong.filter(t => {
      const no = why(t);
      return this.wrong === 'end' ? no.kind === 'unfinished' : no.kind === 'order' && no.tried === this.wrong;
    });
    return mine.length && chance(0.8) ? mine : null;
  }

  crash() {
    if (!this.sentence.tokens.length) return;
    this.moves.crashes++;
    this.board.disperse(this.pack, this.sentence, this.worm, NS.CONFIG, this.sentence.reset());
  }

  finish(mark) {
    const shape = this.sentence.tokens.map(t => NS.Checker.familyId(this.pack, t.pos));
    this.sentence.end(mark);
    const text = this.sentence.text();
    this.written.push({ text, shape, mark });
    this.report(text, shape, mark);
    this.sentence = NS.Grammar.newSentence(this.pack, NS.rng);
  }

  /* Zoe: the same sentence again, a word at a time. */
  repeatLast() {
    this.wordsAgain = (this.wordsAgain || 0) + 1;
    const last = this.written[0];
    if (this.wordsAgain <= last.shape.length) {
      const family = last.shape[this.wordsAgain - 1];
      this.moves.ate[family] = (this.moves.ate[family] || 0) + 1;
      return;
    }
    this.wordsAgain = 0;
    this.report(last.text, last.shape, last.mark);
  }

  report(text, shape, mark) {
    this.send('/sentence', { seat: this.seat, round: this.view.round, n: ++this.sent, verdict: 'correct',
                             text, shape, mark });
  }

  sendMoves() {
    const m = this.moves;
    this.movesAt = Date.now();
    if (!m.refusals.length && !m.steers && !m.crashes && !Object.keys(m.ate).length) return;
    this.moves = { refusals: [], ate: {}, crashes: 0, steers: 0, slots: new Set() };
    this.send('/moves', { seat: this.seat, round: this.view.round, n: ++this.batches, refusals: m.refusals,
                          ate: m.ate, crashes: m.crashes, steers: m.steers, slots: [...m.slots] });
  }

  /* One at a time and in order, like js/race.js's outbox. */
  send(more, body) {
    this.outbox = this.outbox.then(() => call(more, body)).then(r => {
      if (!r.ok) console.error('  ' + this.name + ': ' + more + ' was turned down: ' + (r.data.error || r.status));
    }).catch(err => console.error('  ' + this.name + ': could not reach the server (' + err.message + ')'));
  }
}

(async function main() {
  let r;
  try {
    r = await call('');
  } catch (err) {
    console.error('Could not reach the Bookworms server on port ' + port + '. Is ./serve.sh running?');
    process.exit(1);
  }
  if (!r.ok) {
    console.error('No class with the code ' + code + ' (' + (r.data.error || r.status) + ').');
    process.exit(1);
  }
  if (r.data.state !== 'lobby') {
    console.error('That class is already racing. Press "Race again" on the teacher\'s page, then run this again.');
    process.exit(1);
  }
  const pack = loadPack(r.data.topic, r.data.mode);
  const students = STUDENTS.map(p => new Student(p, pack, r.data));
  try {
    for (const s of students) await s.join();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log('Joined ' + students.map(s => s.name).join(', ') + ' to class ' + code + ' (' + pack.name + ', ' +
              r.data.mode + '). Press Start on the teacher\'s page.');

  let view = r.data;
  while (view.state === 'lobby') {
    await sleep(1000);
    view = (await call('')).data;
  }
  for (const s of students) s.view = view;
  while (now() < view.startsAt) await sleep(100);
  console.log('Racing for ' + view.minutes + ' minutes...');

  // every student plays on their own timer, a little out of step with the rest
  students.forEach((s, i) => {
    s.timer = setTimeout(function again() {
      s.tick();
      if (Date.now() - s.movesAt >= MOVES_MS) s.sendMoves();
      s.timer = setTimeout(again, TICK_MS * (0.6 + Math.random() * 0.8));
    }, 150 * i);
  });

  // until the bell - or until the teacher ends it early
  while (now() < view.endsAt) {
    await sleep(1000);
    const look = await call('');
    if (look.ok) view = look.data;
  }
  for (const s of students) {
    clearTimeout(s.timer);
    s.sendMoves();
  }
  await Promise.all(students.map(s => s.outbox));
  console.log('Time is up. Press "Class report" on the teacher\'s page.');
})();
