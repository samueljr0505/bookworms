/* Headless check of the rules. Run with:  node tools/test.js
   It plays thousands of random games and makes sure every finished sentence
   really does follow one of the patterns (Req 4) and ends with punctuation (Req 6). */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
global.window = global;   // the game files expect a browser-style global
global.performance = { now: () => Date.now() };
for (const f of ['js/config.js', 'js/util.js', 'js/grammar.js', 'js/worm.js', 'js/board.js']) {
  eval(fs.readFileSync(path.join(root, f), 'utf8'));
}
const NS = global.window.BW;
const pack = JSON.parse(fs.readFileSync(path.join(root, 'data/packs/starter.json'), 'utf8'));

const measure = text => Math.max(1, Math.ceil((text.length * 8 + 18) / NS.CONFIG.grid.cell));

let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.error('  FAIL: ' + msg); } }

/* Independent re-check: do the chosen parts of speech line up with the pattern? */
function validate(pattern, tokens, text, mark) {
  let i = 0;
  for (const tok of tokens) {
    let matched = false;
    while (i < pattern.slots.length) {
      const slot = pattern.slots[i];
      const pos = NS.Grammar.slotPos(slot);
      i++;
      if (pos === tok.pos) { matched = true; break; }
      if (!NS.Grammar.slotOptional(slot)) return 'required slot "' + slot + '" was skipped';
    }
    if (!matched) return 'word "' + tok.word + '" (' + tok.pos + ') does not fit the pattern';
  }
  for (; i < pattern.slots.length; i++) {
    if (!NS.Grammar.slotOptional(pattern.slots[i])) return 'sentence ended before a required slot';
  }
  if (!/^[A-Z]/.test(text)) return 'not capitalised: ' + text;
  if (!text.endsWith(mark)) return 'missing end punctuation: ' + text;
  if (/\ba [aeiou]/i.test(text)) return '"a" before a vowel: ' + text;
  if (/\ban [^aeiou]/i.test(text)) return '"an" before a consonant: ' + text;
  return null;
}

/* --- test 1: play greedily, always eating a legal tile --- */
console.log('Playing 2000 sentences with correct picks...');
const samples = [];
for (let n = 0; n < 2000; n++) {
  const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
  const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
  const sentence = NS.Grammar.newSentence(pack, NS.rng);
  let guard = 0;

  while (!sentence.isComplete() && guard++ < 40) {
    board.disperse(pack, sentence, worm, NS.CONFIG);
    const legal = board.tiles.filter(t =>
      t.kind === 'punct' ? sentence.canEnd() && sentence.tokens.length > 0
                         : sentence.allowedPos().includes(t.pos));
    check(legal.length > 0, 'board had no legal move at all');
    if (!legal.length) break;
    const pick = NS.rng.pick(legal);
    if (pick.kind === 'punct') check(sentence.end(pick.word), 'punctuation was refused');
    else check(sentence.accept(pick.word, pick.pos), 'legal word "' + pick.word + '" was refused');
  }

  check(sentence.isComplete(), 'sentence never finished');
  if (sentence.isComplete()) {
    const err = validate(sentence.pattern, sentence.tokens, sentence.text(), sentence.punctuation);
    check(!err, err + '  ->  ' + sentence.text());
    if (samples.length < 12) samples.push(sentence.text());
  }
}

/* --- test 2: mash buttons - eat whatever, legal or not --- */
console.log('Playing 2000 sentences with random (often wrong) picks...');
for (let n = 0; n < 2000; n++) {
  const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
  const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
  const sentence = NS.Grammar.newSentence(pack, NS.rng);

  for (let k = 0; k < 60 && !sentence.isComplete(); k++) {
    board.disperse(pack, sentence, worm, NS.CONFIG);
    if (!board.tiles.length) break;
    const pick = NS.rng.pick(board.tiles);
    if (pick.kind === 'punct') sentence.end(pick.word);
    else sentence.accept(pick.word, pick.pos);
  }
  if (sentence.isComplete()) {
    const err = validate(sentence.pattern, sentence.tokens, sentence.text(), sentence.punctuation);
    check(!err, 'button-mashing produced a bad sentence: ' + err + ' -> ' + sentence.text());
  }
}

/* --- test 3: tiles never overlap each other or the worm --- */
console.log('Checking tile placement...');
for (let n = 0; n < 500; n++) {
  const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
  const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
  const sentence = NS.Grammar.newSentence(pack, NS.rng);
  board.disperse(pack, sentence, worm, NS.CONFIG);
  const seen = new Map();
  for (const t of board.tiles) {
    check(t.x >= 0 && t.y >= 0 && t.x + t.w <= NS.CONFIG.grid.cols && t.y < NS.CONFIG.grid.rows,
          'tile "' + t.word + '" fell off the board');
    for (let i = 0; i < t.w; i++) {
      const key = (t.x + i) + ',' + t.y;
      check(!seen.has(key), 'tiles "' + t.word + '" and "' + seen.get(key) + '" overlap');
      seen.set(key, t.word);
      check(!worm.occupies(t.x + i, t.y), 'tile "' + t.word + '" landed on the worm');
    }
  }
  // every square of a tile must select that tile (Req 2)
  for (const t of board.tiles) {
    for (let i = 0; i < t.w; i++) check(board.tileAt(t.x + i, t.y) === t, 'tileAt missed a square');
  }
}

/* --- test 4: a stopped worm can turn around, a moving one cannot --- */
const w1 = new NS.Worm(20, 20, 4);
w1.moving = true;
check(w1.turn(-1, 0) === false, 'a moving worm should not be able to reverse');
w1.moving = false;
const tailBefore = w1.cells[w1.cells.length - 1];
check(w1.turn(-1, 0) === true, 'a stopped worm should be able to turn around');
check(w1.head() === tailBefore, 'turning around should make the old tail the new head');

/* --- test 5: a wall bonk returns every eaten word to the board (Req 5) --- */
console.log('Checking that a wall bonk hands the words back...');
for (let n = 0; n < 500; n++) {
  const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
  const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
  const sentence = NS.Grammar.newSentence(pack, NS.rng);

  // eat a few correct words
  const eaten = [];
  for (let k = 0; k < 3; k++) {
    board.disperse(pack, sentence, worm, NS.CONFIG);
    const legal = board.tiles.filter(t => t.kind === 'word' && sentence.allowedPos().includes(t.pos));
    if (!legal.length) break;
    const pick = NS.rng.pick(legal);
    sentence.accept(pick.word, pick.pos);
    worm.carry(pick.word, pick.pos);
    eaten.push(pick.word);
  }

  const pattern = sentence.pattern;
  const lost = sentence.reset();
  const fromBody = worm.dropCarried();

  check(lost.length === eaten.length, 'reset should hand back every word that was eaten');
  check(fromBody.map(w => w.word).join(' ') === eaten.join(' '),
        'the body should be carrying exactly the words the sentence had');
  check(sentence.tokens.length === 0 && sentence.slotIndex === 0, 'reset should clear the sentence');
  check(sentence.pattern === pattern, 'reset should keep the same pattern to retry');

  board.disperse(pack, sentence, worm, NS.CONFIG, lost);
  const onBoard = board.tiles.map(t => t.word);
  for (const w of eaten) check(onBoard.includes(w), 'lost word "' + w + '" is not back on the board');
  const validOnBoard = board.tiles.filter(t => sentence.allowedPos().includes(t.pos));
  check(validOnBoard.length > 0, 'no legal move after a bonk');
}

/* --- test 6: the body spells the sentence, and gives it all back on a crash --- */
console.log('Checking that the body spells the sentence...');
const w2 = new NS.Worm(30, 20, 4);
w2.carry('the', 'determiner');
w2.carry('happy', 'adjective');
check(w2.grow === 8, 'the worm should grow one square per letter, got ' + w2.grow);

// walk the worm forward until every letter has somewhere to sit
for (let i = 0; i < 20; i++) w2.step(w2.nextHead());
check(w2.cells.length === 4 + 8, 'worm should be starting length plus every letter');

/* Read the worm the way a person looks at the screen: top to bottom, then left to right. */
function spell(worm) {
  const labels = worm.bodyLabels();
  return worm.cells
    .map((c, i) => ({ c, label: labels[i] }))
    .filter(o => o.label)
    .sort((a, b) => (a.c.y - b.c.y) || (a.c.x - b.c.x))
    .map(o => o.label.char)
    .join('');
}

check(spell(w2) === 'thehappy', 'body should spell "thehappy" on screen, got "' + spell(w2) + '"');
check(w2.bodyLabels()[0] === undefined, 'the head square should stay blank');

const dropped = w2.dropCarried();
check(dropped.map(d => d.word).join(' ') === 'the happy', 'dropCarried should hand back the words');
check(w2.cells.length === 4, 'dropping the sentence should return the worm to its start length');
check(w2.carried.length === 0 && w2.bodyLabels().length === 0, 'the body should be blank again');

w2.carry('elephant', 'noun');
w2.shrink(999);
check(w2.cells.length === 4, 'worm should never shrink past its starting length');

/* --- test 6b: the sentence reads the right way round whichever way the worm points --- */
console.log('Checking the body reads correctly in all four directions...');
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const w = new NS.Worm(40, 40, 4);
  w.dir = { x: dx, y: dy };
  w.cells = [0, 1, 2, 3].map(i => ({ x: 20 - dx * i, y: 20 - dy * i }));
  w.carry('cat', 'noun');
  w.carry('ran', 'verb');
  for (let i = 0; i < 12; i++) w.step(w.nextHead());

  const facing = 'dir (' + dx + ',' + dy + ')';
  check(w.cells.length === 4 + 6, facing + ': body should be start length plus six letters');
  check(spell(w) === 'catran', facing + ': body should read "catran", got "' + spell(w) + '"');
}

/* --- test 7: biting your own body is a crash, the tail square is not --- */
const w3 = new NS.Worm(30, 20, 5);
const neck = w3.cells[1];
check(w3.hitsSelf(neck.x, neck.y) === true, 'running into the neck should count as a crash');
const tail = w3.cells[w3.cells.length - 1];
check(w3.hitsSelf(tail.x, tail.y) === false, 'the tail square moves away, so it is safe');

console.log('\nSample sentences:');
samples.forEach(s => console.log('  ' + s));

console.log(failures === 0 ? '\nAll checks passed.' : '\n' + failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
