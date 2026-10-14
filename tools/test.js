/* Headless check of the rules. Run with:  node tools/test.js
   It plays thousands of random games, checks every sentence the way the game does when
   punctuation is eaten (Req 4, Req 6), and makes sure the checker's verdicts hold up:
   nothing that breaks a sentence shape is ever passed by the rules, and every refusal
   comes with a reason. No browser and no API key needed - the judge is played by a fake. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
global.window = global;   // the game files expect a browser-style global
global.performance = { now: () => Date.now() };
for (const f of ['js/config.js', 'js/util.js', 'js/grammar.js', 'js/checker.js', 'js/judge.js',
                 'js/worm.js', 'js/board.js']) {
  eval(fs.readFileSync(path.join(root, f), 'utf8'));
}
const NS = global.window.BW;
let pack;   // the topic under test - every topic in data/topics.json is checked in turn

const measure = text => Math.max(1, Math.ceil((text.length * 8 + 18) / NS.CONFIG.grid.cell));

let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.error('  FAIL: ' + msg); } }

/* Independent re-check: walk the pattern's tree directly (not the game's state machine) and see
   whether the eaten words can line up with it from start to finish. */
function ends(node, tokens, i) {
  switch (node.t) {
    case 'pos':  return i < tokens.length && tokens[i].pos === node.pos ? [i + 1] : [];
    case 'word': return i < tokens.length && tokens[i].word === node.word ? [i + 1] : [];
    case 'seq': {
      let at = [i];
      for (const item of node.items) at = [...new Set(at.flatMap(j => ends(item, tokens, j)))];
      return at;
    }
    case 'alt': return [...new Set(node.opts.flatMap(o => ends(o, tokens, i)))];
    case 'opt': return [...new Set([i, ...ends(node.x, tokens, i)])];
    case 'star':
    case 'plus': {
      const out = new Set(node.t === 'star' ? [i] : []);
      let frontier = ends(node.x, tokens, i);
      while (frontier.length) {
        const next = [];
        for (const j of frontier) if (!out.has(j)) { out.add(j); next.push(...ends(node.x, tokens, j)); }
        frontier = next.filter(j => j > i);
      }
      return [...out];
    }
  }
  throw new Error('unknown node ' + node.t);
}

/* Does this sentence fit some shape in the pack, start to finish? */
function fitsSomeShape(tokens) {
  return pack.patterns.some(p =>
    ends(NS.Grammar.parse(NS.Grammar.shapeOf(p), pack.rules), tokens, 0).includes(tokens.length));
}
/* ...or could it still grow into one? (This one does lean on the game's own machine.) */
function startsSomeShape(tokens) {
  const s = NS.Grammar.newSentence(pack, NS.rng);
  for (const t of tokens) s.add(t.word, t.pos);
  return s.onTrack();
}

/* A sentence the rules passed must really follow a shape, and read properly. */
function validate(tokens, text, mark) {
  if (!fitsSomeShape(tokens)) {
    return 'words ' + tokens.map(t => t.word + '/' + t.pos).join(' ') + ' do not fit any pattern';
  }
  for (const tok of tokens) {
    if (!(pack.words[tok.pos] || []).includes(tok.word)) return '"' + tok.word + '" is not a ' + tok.pos;
  }
  const seen = new Set();
  const judge = NS.Grammar.newSentence(pack, NS.rng);
  for (const tok of tokens) {
    if (judge.isContent(tok.pos)) {
      if (seen.has(tok.word)) return 'a word was used twice: ' + text;
      seen.add(tok.word);
    }
  }
  if (!/^[A-Z]/.test(text)) return 'not capitalised: ' + text;
  if (!text.endsWith(mark)) return 'missing end punctuation: ' + text;
  if (/ ,/.test(text)) return 'space before a comma: ' + text;
  if (/,(?! )/.test(text)) return 'comma not followed by a space: ' + text;
  if (/\ba [aeiou]/i.test(text)) return '"a" before a vowel: ' + text;
  if (/\ban [^aeiou]/i.test(text)) return '"an" before a consonant: ' + text;
  return null;
}

/* --- test 4: a stopped worm can turn around, a moving one cannot --- */
const w1 = new NS.Worm(20, 20, 4);
w1.moving = true;
check(w1.turn(-1, 0) === false, 'a moving worm should not be able to reverse');
w1.moving = false;
const tailBefore = w1.cells[w1.cells.length - 1];
check(w1.turn(-1, 0) === true, 'a stopped worm should be able to turn around');
check(w1.head() === tailBefore, 'turning around should make the old tail the new head');

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

/* Build a sentence from tile words - free building, exactly as the game does it - then
   check it the way eating a punctuation mark does. */
function sentenceOf(words, onPack) {
  const p = onPack || pack;
  const s = NS.Grammar.newSentence(p, NS.rng);
  for (const w of words) s.add(w, w === ',' ? 'comma' : NS.Grammar.posOfWord(p, w));
  return s;
}
function checkOf(words, mark, onPack) {
  return NS.Checker.check(onPack || pack, sentenceOf(words, onPack), mark || '.');
}
const itemOf = (report, id) => report.items.find(i => i.id === id);
const failed = report => report.items.filter(i => i.ok === false).map(i => i.id).sort().join(',');

/* What the checker must say about real sentences from each topic: the verdict, which
   checklist lines fail, and a piece of the reason the child is given. */
const CASES = {
  animals: [
    ['The big dog ran quickly', 'correct', ''],
    ['My cat hid', 'correct', ''],
    ['A fluffy rabbit was sleepy', 'correct', ''],
    ['The dog quickly ran into the barn', 'correct', ''],          // an Adverb before the Verb is fine
    ['She chased the ball across the field', 'correct', ''],        // pronoun subject, object, place
    ['The puppy brought him a stick', 'correct', ''],               // two objects
    ['The puppy brought a stick to him', 'correct', ''],
    ['They were hungry', 'correct', ''],
    ['The big dog', 'unfinished', 'verb', 'What happens? Add a Verb'],
    ['The', 'unfinished', 'subject,verb', '"The" what? Add a Noun'],
    ['The dog was', 'unfinished', '', 'What is the dog like? Add an Adjective'],
    ['The dog chased', 'unfinished', '', 'It needs an object: chased what?'],
    ['The dog ran into', 'unfinished', '', '"into" where?'],
    ['The dog cat ran', 'wrong', 'order', '"dog cat" is two Nouns in a row'],
    ['dog ran', 'wrong', 'capital,order', 'starts with a Pronoun or a Determiner'],
    ['the dog ran', 'wrong', 'capital', 'use "The"'],
    ['The dog chased The cat', 'wrong', 'capital', 'needs a small letter: "the"'],
    ['The dog big', 'wrong', 'order,verb', 'It needs a verb'],
    ['The big fluffy dog ran', 'wrong', 'order', 'has room for one'],
    ['The dog ran quickly slowly', 'wrong', 'order', 'was already a whole sentence'],
    ['The dog ran the barn', 'wrong', 'order', 'needs a Preposition to say where'],
    ['The dog chased quickly', 'wrong', 'order', 'needs an object first'],
    ['They was hungry', 'wrong', 'order', '"They" goes with "were", not "was"'],
    ['The happy dog was happy', 'wrong', 'sense', '"happy" is used twice'],
    ['The quick fox ran slowly', 'wrong', 'sense', '"quick" and "slowly" do not go together'],
    ['The big mouse was small', 'wrong', 'sense', 'cannot be big and small at once'],
    ['I watched me', 'wrong', 'sense', 'myself'],
    ['The quickly', 'wrong', 'order,subject,verb', 'It needs a subject']
  ],
  school: [
    ['The kind teacher smiled', 'correct', ''],
    ['A old student was busy', 'correct', ''],     // shown as "An old student"
    ['The teacher read the book in the library', 'correct', ''],
    ['She handed the boy a red pencil', 'correct', ''],
    ['The teacher smiled happily quietly', 'wrong', 'order', 'was already a whole sentence'],
    ['The teacher was', 'unfinished', '', 'What is the teacher like?'],
    ['The small reader was tall', 'wrong', 'sense', '"small" and "tall" do not go together'],
    ['The student waited quickly', 'wrong', 'sense', 'waiting is not something you can hurry'],
    ['The old boy smiled', 'wrong', 'sense', 'a boy is young'],
    ['The girl read the pencil', 'wrong', 'sense', 'you cannot read it']
  ],
  food: [
    ['The apple tastes sweet', 'correct', ''],
    ['The rice looks sticky', 'correct', ''],
    ['A pie was big', 'correct', ''],
    ['The chef baked a warm pie in the kitchen', 'correct', ''],
    ['The soup tastes', 'unfinished', '', 'What is the soup like? Add an Adjective'],
    ['The soup sticky', 'wrong', 'order,verb', 'It needs a verb'],
    // the right kind of word, but not one that fits: a size is not a taste
    ['The cookie tasted big', 'wrong', 'order', '"big" does not go with "tasted". Adjectives that do: "sweet"'],
    ['The bread smelled soft', 'wrong', 'order', 'not "soft"'],
    ['The rice was big', 'wrong', 'order', '"big" does not go with "was"'],
    // rice is not something you count
    ['A rice was soft', 'wrong', 'order', '"rice" is not something you can count'],
    ['A warm bread tasted fresh', 'wrong', 'order', '"bread" is not something you can count'],
    ['The chef baked the soup', 'wrong', 'sense', 'soup is cooked, not baked']
  ],
  fantasy: [
    ['The brave knight found the golden sword in the old cave', 'correct', ''],
    ['She gave the wise wizard a magic wand', 'correct', ''],
    ['The dragon quickly flew over the old castle', 'correct', ''],
    ['He was a brave knight', 'correct', ''],
    ['We were in the tower', 'correct', ''],
    ['The knight walked the cave', 'wrong', 'order', '"walked" needs a Preposition'],
    ['The elf slept bravely', 'wrong', 'sense', 'sleeping takes no bravery'],
    ['him found the map', 'wrong', 'capital,order', 'starts with a Pronoun or a Determiner'],
    ['The troll hid under the river', 'wrong', 'sense', 'you swim in a river']
  ],
  sports: [
    ['The goalie kicked the ball into the net', 'correct', ''],
    ['The coach passed the ball to her', 'correct', ''],
    ['The proud runner held the shiny trophy', 'correct', ''],
    ['The coach kicked the trophy', 'wrong', 'order', '"kicked" goes with "ball", not "trophy"'],
    ['The swimmer swam into the gym', 'wrong', 'sense', 'you cannot swim in a gym']
  ]
};

function checkTopicCases() {
  for (const [words, verdict, fails, says] of CASES[pack.id] || []) {
    const r = checkOf(words.split(' '));
    const name = '[' + pack.id + '] "' + words + '"';
    check(r.verdict === verdict, name + ' should be ' + verdict + ', got ' + r.verdict + ' (' + r.headline + ')');
    if (verdict !== 'unfinished') check(failed(r) === fails, name + ' should fail [' + fails + '], failed [' + failed(r) + ']');
    if (verdict === 'unfinished' && fails) {
      for (const id of fails.split(',')) check(itemOf(r, id).ok === false, name + ' should be missing ' + id);
    }
    if (says) check(r.headline.includes(says), name + ' should say "' + says + '", said "' + r.headline + '"');
    check(r.headline.length > 0, name + ' needs a headline');
    for (const item of r.items) {
      check(item.ok === null || item.note.length > 0, name + ': line "' + item.id + '" needs a note');
    }
  }
}

function checkThisPack() {
  /* --- test 0: the pack itself is sound --- */
  console.log('Checking the word pack...');
  for (const p of NS.Grammar.checkPack(pack)) check(false, 'pack: ' + p);

  console.log('Checking sentences the checker must get right...');
  checkTopicCases();

  /* --- test 1: play well - eat only words that keep the sentence on track --- */
  let deadEnds = 0;
  console.log('Playing 2000 sentences with good picks...');
  const samples = [];
  const seenPatterns = new Set();
  for (let n = 0; n < 2000; n++) {
    const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
    const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
    const sentence = NS.Grammar.newSentence(pack, NS.rng);
    let guard = 0;

    while (!sentence.isComplete() && guard++ < 80) {
      board.disperse(pack, sentence, worm, NS.CONFIG);
      const legal = board.tiles.filter(t =>
        t.kind === 'punct' ? sentence.canEnd() && sentence.endMarks().includes(t.word)
                           : sentence.fits(t.word, t.pos));
      if (!legal.length) { deadEnds++; break; }
      const pick = NS.rng.pick(legal);
      if (pick.kind === 'punct') {
        const r = NS.Checker.check(pack, sentence, pick.word);
        check(r.verdict === 'correct', 'a sentence built from good picks was marked ' + r.verdict + ': ' +
              r.text + ' (' + r.headline + ')');
        sentence.end(pick.word);
      } else {
        sentence.add(pick.word, pick.pos);
      }
    }

    if (sentence.isComplete()) {
      const err = validate(sentence.tokens, sentence.text(), sentence.punctuation);
      check(!err, err + '  ->  ' + sentence.text());
      const shape = sentence.complete()[0].pattern;
      if (!seenPatterns.has(shape.id)) { seenPatterns.add(shape.id); samples.push(sentence.text()); }
    }
  }
  for (const p of pack.patterns) check(seenPatterns.has(p.id), 'pattern "' + p.id + '" never finished a sentence');
  // The board always carries words that keep a sentence on track, so good play never strands.
  check(deadEnds === 0, 'good play should never run out of moves, got ' + deadEnds + ' dead ends');

  /* --- test 2: mash buttons - eat whatever, and check whenever a mark is eaten --- */
  console.log('Playing 2000 sentences with random (often wrong) picks...');
  const verdicts = { correct: 0, wrong: 0, unfinished: 0 };
  for (let n = 0; n < 2000; n++) {
    const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
    const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
    const sentence = NS.Grammar.newSentence(pack, NS.rng);

    for (let k = 0; k < 40 && !sentence.isComplete(); k++) {
      board.disperse(pack, sentence, worm, NS.CONFIG);
      const pick = NS.rng.pick(board.tiles);
      if (pick.kind !== 'punct') { sentence.add(pick.word, pick.pos); continue; }
      if (!sentence.tokens.length) continue;

      const r = NS.Checker.check(pack, sentence, pick.word);
      verdicts[r.verdict]++;
      check(r.headline && r.headline.length > 0, 'every check needs a reason: ' + r.text);
      if (r.verdict === 'correct') {
        // the rules must never pass a sentence that breaks every shape
        const err = validate(sentence.tokens, r.text, pick.word);
        check(!err, 'button-mashing got a bad sentence past the rules: ' + err);
        sentence.end(pick.word);
      } else if (r.verdict === 'unfinished') {
        // nothing is wrong yet: the words must still be able to become a sentence
        check(startsSomeShape(sentence.tokens) && !fitsSomeShape(sentence.tokens),
              'an unfinished verdict for words that cannot grow into a sentence: ' + r.text);
        check(itemOf(r, 'end').ok === null, 'an unfinished sentence has not been ended yet');
      } else {
        // a wrong sentence always comes back with a reason and an example to try
        check(r.headline !== 'Something is not quite right.', 'a wrong sentence got no specific reason: ' + r.text);
        check(r.suggestion.length > 0, 'a wrong sentence got no example to try: ' + r.text + ' (' + r.headline + ')');
        if (r.suggestion) {
          const words = r.suggestion.slice(0, -1).split(' ').map(w => w === 'An' ? 'A' : w === 'an' ? 'a' : w);
          const again = NS.Checker.check(pack, sentenceOf(words), r.suggestion.slice(-1));
          check(again.verdict === 'correct', 'the example "' + r.suggestion + '" for "' + r.text +
                '" does not pass the rules itself: ' + again.headline);
        }
        // and says exactly where, when the shape is the problem
        if (itemOf(r, 'order').ok === false) {
          check(r.at >= 0 && r.at < sentence.tokens.length, 'a shape problem should point at a word: ' + r.text);
        }
        break;                         // in the game, the words go back on the board
      }
    }
  }
  // (a correct sentence by pure chance is rare in a strict topic - test 1 covers those)
  check(verdicts.wrong > 0 && verdicts.unfinished > 0,
        'random play should meet wrong and unfinished verdicts, got ' + JSON.stringify(verdicts));

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

  /* --- test 5: a crash, or a wrong sentence, returns every eaten word to the board (Req 5) --- */
  console.log('Checking that lost words go back on the board...');
  for (let n = 0; n < 500; n++) {
    const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
    const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
    const sentence = NS.Grammar.newSentence(pack, NS.rng);

    // eat a few words, fitting or not
    const eaten = [];
    for (let k = 0; k < 3; k++) {
      board.disperse(pack, sentence, worm, NS.CONFIG);
      const words = board.tiles.filter(t => t.kind === 'word');
      const pick = NS.rng.pick(words);
      sentence.add(pick.word, pick.pos);
      worm.carry(pick.word, pick.pos);
      eaten.push(pick.word);
    }

    const pattern = sentence.pattern;
    const lost = sentence.reset();
    const fromBody = worm.dropCarried();

    check(lost.length === eaten.length, 'reset should hand back every word that was eaten');
    check(fromBody.map(w => w.word).join(' ') === eaten.join(' '),
          'the body should be carrying exactly the words the sentence had');
    check(sentence.tokens.length === 0 && !sentence.canEnd() && sentence.onTrack(), 'reset should clear the sentence');
    check(sentence.pattern === pattern, 'reset should keep the same pattern to retry');

    board.disperse(pack, sentence, worm, NS.CONFIG, lost);
    const onBoard = board.tiles.map(t => t.word);
    for (const w of eaten) check(onBoard.includes(w), 'lost word "' + w + '" is not back on the board');
    const validOnBoard = board.tiles.filter(t => sentence.fits(t.word, t.pos));
    check(validOnBoard.length > 0, 'no word on the board can start the sentence again');
  }

  /* --- test 8: punctuation is always on the board, and suits the sentence once it is done --- */
  console.log('Checking that ending marks are always there to finish with...');
  for (let n = 0; n < 400; n++) {
    const worm = new NS.Worm(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, 4);
    const board = new NS.Board(NS.CONFIG.grid.cols, NS.CONFIG.grid.rows, measure);
    const sentence = NS.Grammar.newSentence(pack, NS.rng);
    check(sentence.end('.') === false, 'an empty sentence must not take an ending mark');

    let guard = 0;
    while (guard++ < 40) {
      board.disperse(pack, sentence, worm, NS.CONFIG);
      const marks = board.tiles.filter(t => t.kind === 'punct');
      check(marks.length > 0, 'there should always be an ending mark on the board');
      if (sentence.canEnd()) {
        check(marks.some(m => sentence.endMarks().includes(m.word)),
              'a mark that suits the sentence must be out once it can end');
        break;
      }
      const legal = board.tiles.filter(t => t.kind === 'word' && sentence.fits(t.word, t.pos));
      if (!legal.length) break;
      const pick = NS.rng.pick(legal);
      sentence.add(pick.word, pick.pos);
    }
  }

  console.log('\nSample sentences:');
  samples.forEach(s => console.log('  ' + s));
}

/* --- the judge's say: decide() folds a second opinion into the rules' report --- */
function checkDecide() {
  console.log('\n=== The judge\'s second opinion ===');
  const animals = loadTopic('animals');
  const food = loadTopic('food');
  const yes = { grammatical: true, makes_sense: true, feedback: 'Lovely describing!', suggestion: '', by: 'ai' };

  // no judge: the rules stand, and "Makes sense" is left for the child to read aloud
  let r = NS.Checker.decide(checkOf(['The', 'dog', 'ran'], '.', animals), null);
  check(r.verdict === 'correct' && r.by === 'rules', 'with no judge the rules should decide');
  check(itemOf(r, 'sense').ok === null, 'with no judge, "Makes sense" is not marked either way');

  // the judge agrees
  r = NS.Checker.decide(checkOf(['The', 'dog', 'ran'], '.', animals), yes);
  check(r.verdict === 'correct' && r.by === 'judge' && itemOf(r, 'sense').ok === true, 'judge agreeing should pass');
  check(r.headline === 'Lovely describing!', 'a passing sentence should show the judge\'s praise');

  // the rules pass it, the judge does not - meaning
  r = NS.Checker.decide(checkOf(['The', 'kind', 'girl', 'was', 'busy'], '.', loadTopic('school')),
    { grammatical: true, makes_sense: false, feedback: 'Pretend that makes no sense.', suggestion: 'The kind girl was happy.', by: 'ai' });
  check(r.verdict === 'wrong' && failed(r) === 'sense', 'a judge meaning no should fail on meaning, failed ' + failed(r));
  check(r.headline === 'Pretend that makes no sense.', 'the judge\'s reason should be the headline');
  check(r.suggestion === 'The kind girl was happy.', 'the judge\'s suggestion should be passed on');

  // a rescued sentence needs no corrected example
  r = NS.Checker.decide(checkOf(['The', 'big', 'fluffy', 'dog', 'ran'], '.', animals), yes);
  check(r.suggestion === '', 'a sentence the judge rescued should not come with a correction');

  // the rules pass it, the judge does not - grammar the shapes cannot see
  r = NS.Checker.decide(checkOf(['A', 'pie', 'was', 'soft'], '.', food),
    { grammatical: false, makes_sense: true, feedback: 'Pretend that is wrong.', suggestion: 'The pie was soft.', by: 'ai' });
  check(r.verdict === 'wrong' && failed(r) === 'order', 'a judge grammar no should fail on sounding right, failed ' + failed(r));
  check(r.headline === 'Pretend that is wrong.', 'the judge\'s grammar reason should be the headline');

  // the rules turn it down, the judge knows it is good English - rescued
  r = NS.Checker.decide(checkOf(['The', 'big', 'fluffy', 'dog', 'ran'], '.', animals), yes);
  check(r.verdict === 'correct' && r.rescued, 'two Adjectives should be rescued by the judge');
  check(itemOf(r, 'order').ok === true, 'a rescued sentence sounds right');

  // both say no: the rules' reason stays, because it points at the exact word
  const before = checkOf(['The', 'dog', 'cat', 'ran'], '.', animals);
  r = NS.Checker.decide(before, { grammatical: false, makes_sense: false, feedback: 'Two nouns.', suggestion: 'The dog ran.', by: 'ai' });
  check(r.verdict === 'wrong' && r.headline === before.headline, 'when both say no, the rules\' reason should lead');
  check(itemOf(r, 'sense').note.startsWith('Fix how it sounds first'), 'meaning waits until it sounds right');

  // the game's own rules hold whatever the judge says
  r = NS.Checker.decide(checkOf(['dog', 'ran'], '.', animals), yes);
  check(r.verdict === 'wrong' && itemOf(r, 'capital').ok === false, 'no capital letter stays wrong');
  r = NS.Checker.decide(checkOf(['The', 'happy', 'dog', 'was', 'happy'], '.', animals), yes);
  check(r.verdict === 'wrong' && itemOf(r, 'sense').ok === false, 'a repeated word stays wrong');

  // a teacher's ruling is credited to the teacher
  r = NS.Checker.decide(checkOf(['The', 'apple', 'tastes', 'sweet'], '.', food), { ...yes, by: 'teacher' });
  check(r.verdict === 'correct' && r.by === 'teacher', 'a teacher\'s answer should be credited to the teacher');

  // nothing to judge in a sentence that is not finished
  const half = checkOf(['The', 'big'], '.', animals);
  check(NS.Checker.decide(half, yes) === half, 'an unfinished sentence is not judged');
}

/* --- end marks, literal words and pack checks, on a small pack made for the purpose --- */
function checkSyntheticPack() {
  console.log('\n=== A made-up pack with questions ===');
  const fam = (label, role, color) => ({ label, hint: '', color, role });
  const q = {
    id: 'test', name: 'Test',
    families: { determiner: fam('Determiner', 'other'), noun: fam('Noun', 'naming'), verb: fam('Verb', 'action'),
                adjective: fam('Adjective', 'describing') },
    pos: { determiner: { family: 'determiner' }, noun: { family: 'noun' }, verb: { family: 'verb' },
           be: { family: 'verb' }, question: { family: 'determiner' }, adjective: { family: 'adjective' } },
    words: { determiner: ['The', 'the'], noun: ['cat', 'dog'], verb: ['ran'], be: ['Is'], question: ['Did'],
             adjective: ['big'] },
    patterns: [
      { id: 'statement', name: 'Telling sentence', shape: 'determiner noun verb' },
      { id: 'yes-no', name: 'Asking sentence', end: ['?'], shape: "be determiner noun adjective" }
    ],
    punctuation: [{ mark: '.' }, { mark: '!' }, { mark: '?' }]
  };
  check(NS.Grammar.checkPack(q).length === 0, 'the made-up pack should be sound: ' + NS.Grammar.checkPack(q).join('; '));
  let r = checkOf(['Is', 'the', 'cat', 'big'], '?', q);
  check(r.verdict === 'correct', 'a question ending in "?" should pass, got ' + r.headline);
  r = checkOf(['Is', 'the', 'cat', 'big'], '.', q);
  check(r.verdict === 'wrong' && failed(r) === 'end' && r.headline.includes('A question ends with'),
        'a question ending in "." should fail on its end mark: ' + r.headline);
  r = checkOf(['The', 'cat', 'ran'], '?', q);
  check(r.verdict === 'wrong' && failed(r) === 'end', 'a statement ending in "?" should fail on its end mark');

  // a shape that can open with a lower-case tile could never pass the capital-letter check
  const bad = { ...q, patterns: [{ id: 'lower', name: 'Lower', shape: 'noun verb' }] };
  check(NS.Grammar.checkPack(bad).some(p => p.includes('no capital letter')),
        'checkPack should flag a shape that starts with a lower-case word');

  // the strip lists every slot left, optional ones included
  const opt = { ...q, patterns: [{ id: 'o', name: 'O', shape: 'determiner adjective? noun verb' }] };
  const s = sentenceOf(['The'], opt);
  const rest = s.outline().filter(o => o.state !== 'done');
  check(rest.map(o => o.pos + (o.optional ? '?' : '')).join(' ') === 'adjective? noun verb',
        'the outline should show optional slots, got ' + rest.map(o => o.pos).join(' '));
  check(rest[0].state === 'next' && rest[1].state === 'next' && rest[2].state === 'todo',
        'an optional slot and the slot after it could both come next');
  check(sentenceOf(['The', 'cat'], opt).outline().filter(o => o.state !== 'done').map(o => o.pos).join() === 'verb',
        'skipping an optional slot should drop it from the outline');
}

/* --- the judge, from the game's side: answers come from the file, the session, or the server --- */
async function checkJudgeClient() {
  console.log('\n=== Asking the judge ===');
  const animals = loadTopic('animals');
  const calls = [];
  let serverAnswer = { grammatical: true, makes_sense: true, feedback: 'ok', suggestion: '', by: 'ai' };
  let serverDelay = 0;
  let judgeOn = true;
  const respond = (status, body) => ({ ok: status === 200, status, json: async () => body });
  const fakeFetch = async (url, init) => {
    calls.push(url + (init && init.body ? ' ' + init.body : ''));
    if (url === 'data/verdicts.json') {
      return respond(200, { verdicts: { 'The cat hid': { grammatical: true, makes_sense: true, by: 'teacher', feedback: 'From the file' } } });
    }
    if (url === 'api/judge' && !init) return respond(200, { available: judgeOn, model: 'test-model' });
    if (url === 'api/judge') {
      if (serverDelay) await new Promise(r => setTimeout(r, serverDelay));
      return serverAnswer ? respond(200, { verdict: serverAnswer }) : respond(502, { error: 'no' });
    }
    return respond(404, {});
  };

  const st = await NS.Judge.start({ fetch: fakeFetch });
  check(st.state === 'on' && st.saved === 1, 'the judge should be on with one saved answer: ' + JSON.stringify(st));

  let v = await NS.Judge.ask(animals, sentenceOf(['The', 'cat', 'hid'], animals), 1000);
  check(v && v.feedback === 'From the file', 'a saved answer should come from the file');
  check(!calls.some(c => c.startsWith('api/judge {')), 'a saved answer should not ask the server');

  v = await NS.Judge.ask(animals, sentenceOf(['The', 'dog', 'ran'], animals), 1000);
  check(v && v.feedback === 'ok', 'a new sentence should be asked of the server');
  const posted = calls.find(c => c.startsWith('api/judge {'));
  check(posted === 'api/judge {"topic":"animals","words":["The","dog","ran"]}', 'only the topic and words are sent: ' + posted);

  const before = calls.length;
  await NS.Judge.ask(animals, sentenceOf(['The', 'dog', 'ran'], animals), 1000);
  check(calls.length === before, 'the same sentence should not be asked twice');

  // too slow: give up on time, but the answer still lands for next time
  serverDelay = 120;
  serverAnswer = { grammatical: true, makes_sense: false, feedback: 'slow', suggestion: '', by: 'ai' };
  v = await NS.Judge.ask(animals, sentenceOf(['My', 'fox', 'ran'], animals), 20);
  check(v === null, 'an answer that takes too long should be given up on');
  await new Promise(r => setTimeout(r, 200));
  v = await NS.Judge.ask(animals, sentenceOf(['My', 'fox', 'ran'], animals), 20);
  check(v && v.feedback === 'slow', 'a slow answer should still be kept for next time');

  // a server error is nobody's answer, and may be asked again later
  serverDelay = 0;
  serverAnswer = null;
  v = await NS.Judge.ask(animals, sentenceOf(['A', 'duck', 'ran'], animals), 1000);
  check(v === null, 'a server error should give null');
  serverAnswer = { grammatical: true, makes_sense: true, feedback: 'second try', suggestion: '', by: 'ai' };
  v = await NS.Judge.ask(animals, sentenceOf(['A', 'duck', 'ran'], animals), 1000);
  check(v && v.feedback === 'second try', 'a failed question should be asked again');

  // no judge: no questions at all
  judgeOn = false;
  await NS.Judge.start({ fetch: fakeFetch });
  const n = calls.length;
  v = await NS.Judge.ask(animals, sentenceOf(['A', 'puppy', 'hid'], animals), 1000);
  check(v === null && calls.length === n, 'with the judge off nothing should be asked');

  // the browser cannot reach anything: still no error, just the rules
  await NS.Judge.start({ fetch: async () => { throw new Error('offline'); } });
  check(NS.Judge.status().state === 'off', 'an unreachable server means no judge');
  v = await NS.Judge.ask(animals, sentenceOf(['A', 'puppy', 'hid'], animals), 1000);
  check(v === null, 'with no network the judge should quietly give null');
}

function loadTopic(id) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
  const entry = index.topics.find(t => t.id === id);
  return JSON.parse(fs.readFileSync(path.join(root, 'data', entry.file), 'utf8'));
}

(async function main() {
  /* Every topic the game offers gets the full run. Whether its sentences MAKE SENSE is
     the judge's job (tools/judge.py) - or a person's, reading the output of
     tools/list-sentences.py. */
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/topics.json'), 'utf8'));
  for (const entry of index.topics) {
    pack = JSON.parse(fs.readFileSync(path.join(root, 'data', entry.file), 'utf8'));
    console.log('\n=== ' + pack.name + ' (' + pack.sentenceCount + ' sentences) ===');
    checkThisPack();
  }
  checkDecide();
  checkSyntheticPack();
  await checkJudgeClient();

  console.log(failures === 0 ? '\nAll checks passed.' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
