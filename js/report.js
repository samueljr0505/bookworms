/* The class report: how each student did in a class race, for the teacher.

   The server (tools/classroom.py) keeps what happened; build() turns it into something a
   teacher can act on. For every student it works out:

     - how well they place each kind of word. Every word the worm ate counts as placed; every
       word it refused for being the wrong kind for that spot counts as misplaced. A skill is
       only judged once there are enough tries to go on.
     - their most common mix-ups ("put a Verb where a Noun was needed"), with an example,
     - their sentences: how long, how varied, the best one, how fast compared with the class,
     - strengths, what to work on, and one next step to try with them,
     - and, kept apart from all of that, how engaged they looked: how much of the race they
       were steering in, whether they wrote the same sentence again and again, and whether
       they seemed to be driving at random. Driving at random says nothing about grammar, so
       then their skills are marked "not enough focused play to judge" rather than guessed.

   For the class as a whole: a grid of everyone's skills, and a few findings in plain words.

   It is practice data from one short race, not a grade, and the page says so. Every rule
   here is simple enough to explain to a parent, and the numbers behind each one are shown.

   No DOM in here: tools/test.js checks it with made-up classes. The page is js/teacher.js. */
window.BW = window.BW || {};

BW.Report = (function () {
  const MIN_TRIES = 4;          // fewer tries than this at a skill: too few to say
  const STRONG = 0.2;           // misplaced this share of tries or less: strong
  const PRACTICE = 0.4;         // more than this share: still practising...
  const PRACTICE_MIN = 3;       // ...as long as it happened at least this often
  const ACTIVE = 0.7;           // steering in this share of the race: active
  const PARTLY = 0.35;          // this share: partly active; less: mostly quiet
  const REPEATS = 3;            // repeated sentences before it is worth a mention
  const MENTION = 3;            // a mistake made this often goes under "Working on"
  // The board seldom offers these mistakes (a "The" in the middle of a sentence, two words that
  // do not go together), so a student with none may simply never have met one: "no slips
  // seen", not Strong.
  const RARE = ['capital', 'sense'];

  /* The kinds of word, by family id (data/topics/*.json), with a tip for each. */
  const KINDS = {
    determiner: { label: 'Determiners', one: 'Determiner',
                  tip: 'A naming word usually has a little word in front of it: the dog, a cat, my hat.' },
    adjective: { label: 'Adjectives', one: 'Adjective',
                 tip: 'A describing word goes just before the noun it describes: the big dog.' },
    noun: { label: 'Nouns', one: 'Noun',
            tip: 'After "the", "a" or a describing word comes a naming word: the dog, a red ball.' },
    pronoun: { label: 'Pronouns', one: 'Pronoun',
               tip: 'A pronoun stands in for a noun: "The dog ran" can be "It ran".' },
    verb: { label: 'Verbs', one: 'Verb',
            tip: 'Right after who the sentence is about comes what they did: The dog ran.' },
    adverb: { label: 'Adverbs', one: 'Adverb',
              tip: 'A how-word sits next to the verb and says how it happened: ran quickly.' },
    preposition: { label: 'Prepositions', one: 'Preposition',
                   tip: 'A where-word starts a little phrase about a place: into the pond, under the bed.' },
    end: { label: 'Ending', one: 'end mark',
           tip: 'A sentence is finished once it says who and what happened - then comes the end mark: The dog ran.' },
    capital: { label: 'Capitals', one: 'capital letter',
               tip: 'Only the first word starts with a capital letter, so "The" goes first and "the" goes in the middle.' },
    sense: { label: 'Making sense', one: 'sense',
             tip: 'Read the sentence out loud and ask: could that really happen? A mouse cannot carry a horse.' }
  };
  const GROW_TIP = 'Take a short sentence and add one thing: a describing word (the big dog ran) or a ' +
                   'where-phrase (the dog ran into the pond).';
  const KEEP_GOING_TIP = 'Keep stretching: try one sentence with a describing word and a where-phrase.';
  const REPEAT_TIP = 'Ask for a new sentence every time - even changing one word counts: the dog ran, the dog ' +
                     'jumped, the big dog jumped.';
  const START_TIP = 'Build one sentence together, saying the kind of each word as you go: the (Determiner) ' +
                    'dog (Noun) ran (Verb).';

  const WORD_FAMILIES = ['determiner', 'adjective', 'noun', 'pronoun', 'verb', 'adverb', 'preposition'];
  const DESCRIBING = ['adjective', 'adverb', 'preposition'];

  const kindOf = id => KINDS[id] || { label: cap(id), one: cap(id), tip: '' };
  const one = id => kindOf(id).one;
  const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const times = n => n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times';
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function orList(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' or ' + items[items.length - 1];
  }

  function median(list) {
    if (!list.length) return 0;
    const s = list.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* The words in a sentence: its shape when there is one, otherwise counted from the text. */
  function wordCount(s) {
    const shape = (s.shape || []).filter(f => f !== 'comma');
    if (shape.length) return shape.length;
    return String(s.text || '').replace(/[.!?,]/g, ' ').split(/\s+/).filter(Boolean).length;
  }

  /* The skills this race can show: the kinds of word in play, then ending, capitals and, in
     Real mode, making sense. */
  function columnsFor(mode) {
    const ids = WORD_FAMILIES.filter(f => f !== 'pronoun' || mode === 'silly')
      .concat(['end', 'capital'], mode === 'silly' ? [] : ['sense']);
    return ids.map(id => ({ id, label: kindOf(id).label }));
  }

  function level(tries, errors) {
    if (tries < MIN_TRIES) return 'few';
    const rate = errors / tries;
    if (rate <= STRONG) return 'strong';
    if (rate > PRACTICE && errors >= PRACTICE_MIN) return 'practice';
    return 'okay';
  }

  /* ---------- one student ---------- */

  function student(row, race, columns) {
    const sentences = row.sentences || [];
    const refusals = row.refusals || [];
    const counted = sentences.filter(s => s.ok && !s.repeat);
    const repeats = sentences.filter(s => s.repeat);
    const finished = sentences.length;
    const orders = refusals.filter(r => r.kind === 'order');
    const kindCount = k => refusals.filter(r => [].concat(k).includes(r.kind)).length;

    // how many of each kind of word the worm ate: sent by the game, or else read off the shapes
    let ate = row.ate || {};
    if (!Object.keys(ate).length) {
      ate = {};
      for (const s of counted) for (const f of s.shape || []) ate[f] = (ate[f] || 0) + 1;
    }
    const eaten = Object.values(ate).reduce((a, b) => a + b, 0);
    const refused = refusals.length + (row.refusedMore || 0);

    // ---- engagement ----
    const slotMs = race.slotMs || 15000;
    const since = row.since || 0;
    const span = Math.max(0, (race.playedMs || 0) - since);
    const totalSlots = Math.max(1, Math.ceil(span / slotMs));
    const firstSlot = Math.floor(since / slotMs);
    const activeSlots = Math.min(totalSlots, (row.slots || []).filter(i => i >= firstSlot).length);
    const share = activeSlots / totalSlots;

    const mixups = mixupsOf(orders);
    const topShare = orders.length ? mixups[0].count / orders.length : 0;
    const triedKinds = new Set(orders.map(r => r.tried)).size;
    const random = refused >= 15 && orders.length >= 10 && refused > 1.5 * eaten &&
                   topShare < 0.35 && triedKinds >= 4;

    const flags = [];
    const engagement = {
      level: share >= ACTIVE ? 'active' : share >= PARTLY ? 'partly' : 'quiet',
      share, activeSlots, totalSlots, steers: row.steers || 0
    };
    if (engagement.level !== 'active') {
      flags.push({ id: 'quiet', text: 'Steered in ' + activeSlots + ' of ' + totalSlots + ' quarter-minutes of the race (' +
                                      Math.round(share * 100) + '%).' });
    }
    if (random) {
      flags.push({ id: 'random', text: 'Bumped into ' + refused + ' words that did not fit, spread across ' + triedKinds +
                                       ' kinds of word, and placed ' + eaten + '. That looks like steering at random ' +
                                       'rather than choosing words, so their skills are not judged from this race.' });
    }
    if (repeats.length >= REPEATS) {
      const most = mostRepeated(sentences);
      flags.push({ id: 'repeats', text: 'Wrote "' + most.text + '" ' + times(most.count) + '. Repeats score nothing, ' +
                                        'so ' + plural(repeats.length, 'sentence') + ' did not count.' });
    }

    // ---- skills ----
    const skills = {};
    for (const col of columns) {
      let tries, errors;
      if (col.id === 'end') {
        errors = kindCount(['empty', 'unfinished', 'mark']);
        tries = finished + errors;
      } else if (col.id === 'capital') {
        errors = kindCount('capital');
        tries = finished + errors;
      } else if (col.id === 'sense') {
        errors = kindCount(['sense', 'clash']);
        tries = finished + errors;
      } else {
        errors = orders.filter(r => r.tried === col.id).length;
        tries = (ate[col.id] || 0) + errors;
      }
      skills[col.id] = { tries, errors, right: tries - errors,
                         level: random ? 'unclear'
                           : RARE.includes(col.id) && !errors && tries >= MIN_TRIES ? 'noslips' : level(tries, errors) };
    }

    // ---- sentences ----
    const lengths = counted.map(wordCount);
    const wordsPer = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    let best = null;
    counted.forEach((s, i) => { if (!best || lengths[i] > best.words) best = { text: s.text, words: lengths[i] }; });
    const uses = f => counted.filter(s => (s.shape || []).includes(f)).length;
    const describing = counted.filter(s => (s.shape || []).some(f => DESCRIBING.includes(f))).length;
    const marks = [...new Set(counted.map(s => s.mark).filter(Boolean))];
    const shapes = new Set(counted.filter(s => s.shape && s.shape.length).map(s => s.shape.join(' '))).size;
    const shortOnly = counted.length >= 4 && lengths.every(n => n <= 3);
    const perMinute = span > 0 ? counted.length / (span / 60000) : 0;

    const out = {
      name: row.name, rank: row.rank, correct: row.correct || 0, wrong: row.wrong || 0,
      written: finished, counted: counted.length, repeats: repeats.length,
      refused, eaten, crashes: row.crashes || 0,
      engagement, flags, random, skills, mixups,
      wordsPer, best, marks, shapes, perMinute, describing, uses: { adjective: uses('adjective'),
        adverb: uses('adverb'), preposition: uses('preposition') }, shortOnly,
      sentences
    };
    out.strengths = strengthsOf(out, columns);
    const working = workingOn(out, refusals, race.mode);
    out.working = working.map(w => w.text);
    out.next = nextStep(out, working);
    return out;
  }

  /* The wrong-kind-of-word refusals, grouped by what was tried and what was needed, most
     common first, each with its latest example. */
  function mixupsOf(orders) {
    const groups = new Map();
    for (const r of orders) {
      // grouped whatever order the needed kinds come in, shown in the checker's order
      const needed = r.needed || [];
      const key = r.tried + '>' + needed.slice().sort().join(',');
      const g = groups.get(key) || { tried: r.tried, needed, count: 0, example: null };
      g.count++;
      if (r.word) g.example = { word: r.word, after: r.after || '' };
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }

  function mostRepeated(sentences) {
    const counts = new Map();
    for (const s of sentences.filter(s => s.ok)) {
      const key = String(s.text).toLowerCase();
      const c = counts.get(key) || { text: s.text, count: 0 };
      c.count++;
      counts.set(key, c);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0];
  }

  /* "a Verb where a Noun or an Adjective was needed" */
  function mixupText(m) {
    const needed = m.needed.filter(f => f !== 'end').map(f => an(one(f)));
    const could = m.needed.includes('end');
    const where = needed.length ? ' where ' + orList(needed) + ' was needed' : '';
    return an(one(m.tried)) + where + (could ? (needed.length ? ', or the sentence could have ended' : ' when the sentence could have ended') : '');
  }

  function example(m) {
    if (!m.example) return '';
    return m.example.after ? ' - like "' + m.example.word + '" right after "' + m.example.after + '"'
                           : ' - like "' + m.example.word + '" to start the sentence';
  }

  function strengthsOf(s, columns) {
    if (s.random) return [];
    const out = [];
    // the same sentence again and again places the same words again and again: no strength
    const good = s.repeats >= REPEATS ? [] : columns.filter(c => WORD_FAMILIES.includes(c.id) &&
                                                                 s.skills[c.id].level === 'strong' && s.skills[c.id].tries >= 6)
      .sort((a, b) => s.skills[b.id].tries - s.skills[a.id].tries).slice(0, 2);
    for (const c of good) {
      const k = s.skills[c.id];
      out.push('Puts ' + c.label + ' in the right spot (' + k.right + ' of ' + k.tries + ').');
    }
    if (s.counted >= 3 && s.describing / s.counted >= 0.5) {
      out.push('Adds describing words or where-phrases to most sentences (' + s.describing + ' of ' + s.counted + ').');
    }
    if (s.marks.includes('?') || s.marks.includes('!')) {
      out.push('Tried ' + orList([s.marks.includes('?') && 'questions', s.marks.includes('!') && 'exclamations']
        .filter(Boolean)) + ', not just statements.');
    }
    if (s.shapes >= 4) out.push('Built ' + s.shapes + ' different kinds of sentence.');
    if (!out.length && s.counted > 0) out.push('Finished ' + plural(s.counted, 'correct sentence') + '.');
    return out.slice(0, 3);
  }

  /* What to work on, what happened most first: each with where its tip comes from. The
     shortest-sentences note has no count, so it goes last. */
  function workingOn(s, refusals, mode) {
    if (s.random) return [];
    const out = [];
    // the tip is about the kind of word that went in the wrong spot: where Verbs go
    for (const m of s.mixups.filter(m => m.count >= 2).slice(0, 2)) {
      out.push({ text: 'Put ' + mixupText(m) + ' (' + times(m.count) + ')' + example(m) + '.', tip: m.tried, count: m.count });
    }
    const n = kind => refusals.filter(r => r.kind === kind).length;
    if (n('unfinished') + n('empty') >= MENTION) {
      out.push({ text: 'Tried to end a sentence before it was finished (' + times(n('unfinished') + n('empty')) + ').',
                 tip: 'end', count: n('unfinished') + n('empty') });
    }
    if (n('mark') >= MENTION) {
      out.push({ text: 'Used the wrong end mark (' + times(n('mark')) + '): a question ends with "?".', tip: 'end',
                 count: n('mark') });
    }
    if (n('capital') >= MENTION) {
      out.push({ text: 'Mixed up capital letters (' + times(n('capital')) + ').', tip: 'capital', count: n('capital') });
    }
    if (mode !== 'silly' && n('sense') + n('clash') >= MENTION) {
      out.push({ text: 'Put words together that do not make sense (' + times(n('sense') + n('clash')) + ').', tip: 'sense',
                 count: n('sense') + n('clash') });
    }
    if (s.shortOnly) {
      out.push({ text: 'Every sentence was the shortest kind, like "' + s.best.text + '" - ready to add a describing word?',
                 tip: 'grow', count: 0 });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 3);
  }

  function nextStep(s, working) {
    if (s.random) return 'Sit with them for a round and talk through each word before they steer to it.';
    if (s.repeats >= REPEATS) return REPEAT_TIP;
    if (working.length) {
      const tip = working[0].tip;
      return tip === 'grow' ? GROW_TIP : kindOf(tip).tip || KEEP_GOING_TIP;
    }
    return s.counted > 0 ? KEEP_GOING_TIP : START_TIP;
  }

  /* ---------- the whole class ---------- */

  function findingsOf(students, columns) {
    const out = [];
    const judged = students.filter(s => !s.random);

    // the mix-up the most students made at least twice
    const byMixup = new Map();
    for (const s of judged) {
      for (const m of s.mixups.filter(m => m.count >= 2)) {
        const key = m.tried + '>' + m.needed.slice().sort().join(',');
        const g = byMixup.get(key) || { m, names: [] };
        g.names.push(s.name);
        byMixup.set(key, g);
      }
    }
    const common = [...byMixup.values()].sort((a, b) => b.names.length - a.names.length)[0];
    if (common && common.names.length >= 2) {
      out.push(common.names.length + ' students more than once put ' + mixupText(common.m) + '.' +
               (KINDS[common.m.tried] ? ' A quick whole-class look at where ' + kindOf(common.m.tried).label +
                                        ' go could help.' : ''));
    }

    // the skill the most students are still practising, and the one most have down
    const count = (id, lv) => judged.filter(s => s.skills[id].level === lv).length;
    const practising = columns.map(c => ({ c, n: count(c.id, 'practice') })).sort((a, b) => b.n - a.n)[0];
    if (practising && practising.n >= 2) {
      out.push(kindOf(practising.c.id).label + ': ' + practising.n + ' students are still practising this.');
    }
    const strong = columns.map(c => ({ c, n: count(c.id, 'strong'), of: judged.filter(s => s.skills[c.id].level !== 'few').length }))
      .filter(x => x.of >= 2).sort((a, b) => b.n / b.of - a.n / a.of)[0];
    if (strong && strong.n / strong.of >= 0.6) {
      out.push('A strength: ' + strong.n + ' of ' + strong.of + ' students put ' + kindOf(strong.c.id).label +
               ' in the right spot nearly every time.');
    }

    const lengths = students.filter(s => s.counted > 0);
    if (lengths.length) {
      const avg = lengths.reduce((a, s) => a + s.wordsPer, 0) / lengths.length;
      out.push('Sentences were ' + avg.toFixed(1) + ' words long on average.');
    }

    const check = students.filter(s => s.flags.length);
    if (check.length) {
      const why = (s, f) => f.id === 'quiet' ? (s.engagement.level === 'partly' ? 'partly active' : 'quiet')
        : f.id === 'random' ? 'random steering' : 'repeats';
      out.push('Worth a check-in: ' + check.map(s => s.name + ' (' + s.flags.map(f => why(s, f)).join(', ') + ')').join('; ') + '.');
    }
    return out;
  }

  /* The report for one race. `view` is the teacher's detailed look at the class
     (GET /api/class/<code>?teacher=...&detail=1). */
  function build(view) {
    const columns = columnsFor(view.mode);
    const race = { mode: view.mode, playedMs: view.playedMs || 0, slotMs: view.slotMs };
    const students = (view.board || []).map(row => student(row, race, columns))
      .sort((a, b) => a.name.localeCompare(b.name));

    // pace, next to the middle of the class
    const middle = median(students.filter(s => s.counted > 0).map(s => s.perMinute));
    for (const s of students) {
      s.pace = !middle || !s.counted ? '' : s.perMinute >= middle * 1.5 ? 'faster than most'
        : s.perMinute <= middle * 0.5 ? 'slower than most' : 'about the class\'s pace';
    }

    return {
      topic: view.topic, mode: view.mode, minutes: view.minutes, round: view.round,
      playedMs: race.playedMs, middlePace: middle, columns, students,
      findings: students.length ? findingsOf(students, columns) : ['Nobody was in this race.']
    };
  }

  return { build, KINDS, MIN_TRIES, REPEAT_TIP };
})();
