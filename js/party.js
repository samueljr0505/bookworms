/* Word parties, the parts every page shares (party.html, party-teacher.html, the game).

   A word party is a class game in rounds (see tools/party.py): the students write words into a
   sentence frame, the teacher approves them, the approved words are chopped up into a word bank,
   everyone builds new sentences from the bank in the snake game, and the class votes for the
   best one.

   This file has the sentence frame, the prompts a teacher can pick from, and packFor(), which
   turns a topic's Silly mode and the class's word bank into the word pack the game plays. No
   DOM in here: tools/test.js checks packFor() on every topic. */
window.BW = window.BW || {};

BW.Party = (function () {
  /* The sentence frame students fill in. Each box says what kind of word goes in it; the
     colours are the game's own (data/topics/*.json). tools/party.py has the same fields. */
  const COLORS = { adjective: '#f2a65a', noun: '#5ec4a3', verb: '#e9797a', adverb: '#c79ae0', determiner: '#9aa7d7' };
  const FRAME = [
    { text: 'The' },
    { field: 'adjective', label: 'Adjective', color: COLORS.adjective, hint: 'describes the noun: sneaky, giant' },
    { field: 'noun', label: 'Noun', color: COLORS.noun, hint: 'a person, animal or thing: principal, taco' },
    { field: 'verb', label: 'Verb', color: COLORS.verb, hint: 'what it did, in the past: chased, danced' },
    { text: 'the', with: 'object' },
    { field: 'object', label: 'Noun', color: COLORS.noun, optional: true, hint: 'what it did it to: pizza' },
    { field: 'adverb', label: 'Adverb', color: COLORS.adverb, optional: true, hint: 'how it did it: loudly' }
  ];
  const FIELDS = FRAME.filter(b => b.field).map(b => b.field);
  const WORD = /^[a-z][a-z'-]{0,15}$/;

  /* The words a student typed, tidied the way the server tidies them. */
  function cleanWord(text) { return String(text || '').trim().toLowerCase(); }
  function isWord(text) { return WORD.test(cleanWord(text)); }

  /* The frame read out as a sentence: "The sneaky principal chased the pizza loudly." A blank
     box shows as ___ so a student can see what is still missing; struck words are left out. */
  function sentenceOf(words, options) {
    const blank = options && options.blank;
    const struck = (options && options.struck) || [];
    const out = [];
    for (const box of FRAME) {
      if (box.text) {
        if (!box.with || (words[box.with] && !struck.includes(box.with))) out.push(box.text);
        continue;
      }
      const w = struck.includes(box.field) ? '' : cleanWord(words[box.field]);
      if (w) out.push(w);
      else if (blank && !box.optional) out.push('___');
    }
    return out.join(' ') + '.';
  }

  /* Prompts for the teacher to pick from, or start from. */
  const WRITE_PROMPTS = [
    'Who showed up at school today?',
    'What happened at lunch?',
    'What did you see on the way to school?',
    'Who was at the zoo, and what did they do?',
    'What happened at recess?',
    'Something strange happened in the library. What was it?',
    'What did the class pet do last night?',
    'Who came to the birthday party?'
  ];
  const BUILD_PROMPTS = [
    'What happened on the field trip?',
    'What did the principal see?',
    'Why was everyone late for school?',
    'What happened during the fire drill?',
    'What was hiding under the bed?',
    'What happened at the big game?',
    'What did the substitute teacher find?',
    'What did the dragon eat for breakfast?'
  ];

  /* ---------- the board: a Silly pack made of the class's words ---------- */

  /* Which of the topic's word lists each list in the class bank stands in for. The bank's
     words take their place on the board; the topic's little words (the, a, into, him, was)
     stay, so the class's words can always be built into a sentence. */
  const STANDS_FOR = {
    adjective: ['adjective', 'mood', 'quality'],
    noun: ['noun', 'thing', 'place', 'mass'],
    move: ['move', 'stay'],
    take: ['take', 'push', 'see', 'use'],
    adverb: ['adverb']
  };
  const GLUE = ['determiner', 'subjectPronoun', 'objectPronoun', 'be', 'motionPrep', 'placePrep'];
  const TOP_UP = 4;    // a list with fewer of the class's words than this is topped up from the topic

  /* `pack` is a topic in Silly mode (BW.Grammar.forMode(topic, 'silly')); `bank` is the class's
     words, { adjective: [...], noun: [...], move: [...], take: [...], adverb: [...] }.

     The pack that comes back has the class's words in the lists the shapes use, a handful of
     the topic's own words where the class gave too few, and only the shapes those lists can
     build: an Action sentence (The giant taco danced loudly.), an Object sentence (The sneaky
     principal chased the pizza.) and a Describing sentence (The taco was sneaky.). The shapes
     are the topic's, so the worm still only eats a word that fits. */
  function packFor(pack, bank) {
    bank = bank || {};
    const words = {};
    const seen = new Set();          // a word can only be in one list
    for (const list of GLUE) {
      if (!pack.words[list]) continue;
      words[list] = pack.words[list].slice();
      for (const w of words[list]) seen.add(w.toLowerCase());
    }
    const classWords = [];
    for (const [list, from] of Object.entries(STANDS_FOR)) {
      const mine = [];
      for (const raw of bank[list] || []) {
        const w = cleanWord(raw);
        if (!WORD.test(w) || seen.has(w)) continue;
        seen.add(w);
        mine.push(w);
        classWords.push(w);
      }
      for (const w of from.flatMap(f => pack.words[f] || [])) {
        if (mine.length >= TOP_UP) break;
        if (seen.has(w.toLowerCase())) continue;
        seen.add(w.toLowerCase());
        mine.push(w);
      }
      words[list] = mine;
    }

    // every Adjective is "adjective" now, and every Noun is "noun" (Food's "some soup" kind of
    // Noun is folded in with the rest)
    const rules = { ...pack.rules, adj: 'adjective', anyNoun: 'noun' };
    if (rules.anything) rules.anything = '<one>';
    const owner = new Set(Object.values(words).flat());
    const usable = node => {
      if (node.t === 'pos' && !(words[node.pos] || []).length) return false;
      if (node.t === 'word' && !owner.has(node.word)) return false;
      return (node.items || node.opts || []).every(usable) && (!node.x || usable(node.x));
    };
    const patterns = pack.patterns.filter(p => {
      try { return usable(BW.Grammar.parse(BW.Grammar.shapeOf(p), rules)); } catch (err) { return false; }
    });
    const pos = {};
    for (const list of Object.keys(words)) if (pack.pos[list]) pos[list] = pack.pos[list];
    const clashes = (pack.clashes || []).filter(c => owner.has(c[0]) && owner.has(c[1]));

    return {
      ...pack, words, rules, patterns, pos, clashes,
      meaning: null, mode: 'silly', party: true,
      noJudge: true,            // the judge only knows the topic's words, not the class's
      classWords,               // the words the class wrote, for the bank on screen
      sentenceCount: null
    };
  }

  /* The word party's own corner of the server. */
  function call(path, body) { return BW.Class.call(path, body, 'api/party'); }

  return { FRAME, FIELDS, COLORS, WRITE_PROMPTS, BUILD_PROMPTS, cleanWord, isWord, sentenceOf, packFor, call };
})();
