/* The sentence checker (Req 4, Req 6).

   A sentence is built on a structure: Subject, Verb, then an Object, a Complement or
   Modifiers, each made of the right kinds of word (js/grammar.js). The worm only eats a word
   that fits where the sentence is up to, so this file has two jobs.

   refuse() is the moment a word does NOT fit. The worm leaves it on the board, and the
   player is told why, pinned to that word - "ran" is a Verb, and after "The" the sentence
   needs an Adjective or a Noun. A punctuation mark is refused the same way until the
   sentence is whole ("Not finished yet! What happens? Add a Verb.").

   check() is the moment a sentence is finished: punctuation was eaten, and the sentence is
   read out against the list a teacher uses for a complete sentence -

     Capital letter   does it start with one?
     Subject          is there a who or what?
     Verb             is there something that happens?
     Sounds right     are the words in an order that works?
     Makes sense      do the words fit together?
     End mark         is it the right mark for this kind of sentence?

   - every line with a note in plain words. check() can mark any list of words, right or
   wrong, but a sentence the worm built always passes: every word was checked on the way in.

   decide() folds in a second reader, the judge (js/judge.js), when there is one. It cannot
   fail a sentence the structure built. It can tick "Makes sense", which the rules otherwise
   leave for the child to read out loud, and praise the sentence or leave a tip.

   Like the rest of the model, this file never touches the page, so tools/test.js can
   check thousands of sentences with no browser. */
window.BW = window.BW || {};

(function () {
  const ORDER = ['capital', 'subject', 'verb', 'order', 'sense', 'end'];

  function familyOf(pack, pos) {
    const info = pack.pos[pos];
    return (info && pack.families && pack.families[info.family]) || info || null;
  }
  function labelOf(pack, pos) {
    const fam = familyOf(pack, pos);
    return (fam && fam.label) || pos;
  }
  function familyWithRole(pack, role) {
    const fams = pack.families || {};
    return Object.keys(fams).map(id => fams[id]).find(f => f.role === role) || null;
  }
  const roleOf = (pack, pos) => BW.Grammar.roleOf(pack, pos);
  const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const quote = words => '"' + words.join(' ').replace(/ ,/g, ',') + '"';

  /* ["a Noun", "a Verb", "an Adverb"] -> "a Noun, a Verb or an Adverb" */
  function orList(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' or ' + items[items.length - 1];
  }

  /* What a set of wanted tiles is, in words: "a Noun or a Verb", "the word "was"", or when
     only some words of a kind fit, "an Adjective ("sweet", "fresh" or "warm")". */
  function wantedText(pack, wanted) {
    const out = [], some = new Map();
    for (const m of wanted) {
      if (m.word) {
        const label = labelOf(pack, BW.Grammar.posOfWord(pack, m.word));
        some.set(label, (some.get(label) || []).concat('"' + m.word + '"'));
      } else if (!out.includes(an(labelOf(pack, m.pos)))) {
        out.push(an(labelOf(pack, m.pos)));
      }
    }
    for (const [label, words] of some) {
      out.push(words.length === 1 ? 'the word ' + words[0] : an(label) + ' (' + orList(words) + ')');
    }
    return orList(out);
  }

  /* A content word used a second time - "The happy dog is happy." - with where it was. */
  function repeatedWord(sentence) {
    const seen = new Set();
    for (let i = 0; i < sentence.tokens.length; i++) {
      const t = sentence.tokens[i];
      if (!sentence.isContent(t.pos)) continue;
      if (seen.has(t.word)) return { word: t.word, at: i };
      seen.add(t.word);
    }
    return null;
  }

  /* Two words the topic says cannot share a sentence - "The small reader is tall." */
  function clashIn(pack, sentence) {
    const toks = sentence.tokens;
    for (let i = 1; i < toks.length; i++) {
      for (let j = 0; j < i; j++) {
        for (const c of pack.clashes || []) {
          if ((c[0] === toks[j].word && c[1] === toks[i].word) ||
              (c[1] === toks[j].word && c[0] === toks[i].word)) {
            return { first: toks[j].word, second: toks[i].word, why: c[2] || '', at: i };
          }
        }
      }
    }
    return null;
  }

  /* The first word with its capital letter in the wrong place: a small letter to start
     with, or a capital in the middle ("The dog chased The cat"). -1 when all is well. */
  function capitalTrouble(sentence) {
    return sentence.tokens.findIndex((t, i) => !sentence.capitalFits(t.word, t.pos, i));
  }

  /* The same word with its capital letter switched, if the topic has that tile. */
  function otherCase(pack, word) {
    const flip = word[0] === word[0].toLowerCase() ? word[0].toUpperCase() + word.slice(1)
                                                   : word[0].toLowerCase() + word.slice(1);
    return BW.Grammar.posOfWord(pack, flip) ? flip : null;
  }

  /* Why the words stopped fitting every shape, pinned to the word where it happened.
     `asked` is given when the word was refused rather than eaten - { before, ends }: the
     sentence as it reads without the word, and the marks that could end it now - and the
     reason then says what to find instead. */
  function explain(pack, sentence, trace, asked) {
    const tokens = sentence.tokens;
    const words = sentence.displayWords();
    const i = trace.at;
    const cur = tokens[i];
    const prev = tokens[i - 1];
    const word = '"' + words[i] + '"';
    const lead = quote(asked ? asked.before : words.slice(0, i));

    // what a refused word is, and what the sentence needs instead
    const is = asked ? word + ' is ' + an(labelOf(pack, cur.pos)) + '. ' : '';
    const needs = 'After ' + lead + ', the sentence needs ' + wantedText(pack, trace.wanted) + '.';
    if (i === 0) {
      // say it by kind of word, with real capitalised examples: "a Determiner or a Pronoun"
      const kinds = [], like = [];
      for (const m of trace.wanted) {
        const pos = m.pos || BW.Grammar.posOfWord(pack, m.word);
        const k = an(labelOf(pack, pos));
        if (!kinds.includes(k)) kinds.push(k);
        for (const w of m.word ? [m.word] : (pack.words[pos] || [])) {
          if (w[0] !== w[0].toLowerCase() && !like.includes(w) && like.length < 4) like.push(w);
        }
      }
      return is + 'A sentence here starts with ' + orList(kinds) +
             (like.length ? ', like ' + orList(like.map(w => '"' + w + '"')) : '') + '.';
    }
    const family = t => pack.pos[t.pos] && pack.pos[t.pos].family;
    const wantsFamily = f => trace.wanted.some(m => family({ pos: m.pos || BW.Grammar.posOfWord(pack, m.word) }) === f);
    // the verb this word would follow - not "was", which props up a description
    const doing = roleOf(pack, prev.pos) === 'action' && !BW.Grammar.isScaffold(prev.pos);
    // "The knight walked the cave": walking does not take an object - it goes somewhere
    const placeWord = (family(cur) === 'determiner' || roleOf(pack, cur.pos) === 'naming') &&
                      sentence.capitalFits(cur.word, cur.pos, i);
    if (placeWord && wantsFamily('preposition') && doing) {
      const prep = trace.wanted.map(m => m.word || (pack.words[m.pos] || [])[0])
                        .find(w => w && family({ pos: BW.Grammar.posOfWord(pack, w) }) === 'preposition');
      const place = (pack.words.place || [])[0];
      const spot = !place ? words[i] : family(cur) === 'determiner' ? words[i] + ' ' + place : 'the ' + place;
      return '"' + words[i - 1] + '" needs a Preposition to say where, like "' + words[i - 1] + ' ' +
             prep + ' ' + spot + '".';
    }
    if (trace.finished && asked) {
      return lead + ' is already a whole sentence, so ' + word + ' does not fit after it. End it with ' +
             orList(asked.ends.map(m => '"' + m + '"')) +
             (trace.wanted.length ? ', or add ' + wantedText(pack, trace.wanted) : '') + '.';
    }
    // "rolled kitten": a Noun needs its Determiner first - "rolled the kitten"
    const dets = !asked || family(cur) !== 'noun' || wantsFamily('noun') ? []
      : (pack.words.determiner || []).filter(d => {
          if (!sentence.capitalFits(d, 'determiner', i)) return false;
          const t = BW.Grammar.newSentence(pack, BW.rng);
          for (const x of tokens.slice(0, i)) t.add(x.word, x.pos);
          t.add(d, 'determiner');
          t.add(cur.word, cur.pos);
          return t.onTrack();
        });
    if (dets.length) {
      return is + 'It needs a Determiner in front of it first, like ' +
             orList(dets.slice(0, 3).map(d => '"' + d + ' ' + words[i] + '"')) + '.';
    }
    if (trace.finished) {
      return quote(words.slice(0, i)) + ' was already a whole sentence, so ' + word +
             ' does not fit after it. You could have ended it there!';
    }
    if (family(prev) === 'noun' && roleOf(pack, cur.pos) === 'describing') {
      return cap(an(labelOf(pack, cur.pos))) + ' goes before the ' + labelOf(pack, prev.pos) +
             ' it describes: "' + words[i] + ' ' + words[i - 1] + '", not "' +
             words[i - 1] + ' ' + words[i] + '".';
    }
    if (family(prev) && family(prev) === family(cur)) {
      const pair = '"' + words[i - 1] + ' ' + words[i] + '" is two ' + labelOf(pack, cur.pos) + 's in a row';
      if (asked) return pair + '. ' + needs;
      switch (roleOf(pack, cur.pos)) {
        case 'describing': return pair + ', and this sentence shape has room for one.';
        case 'naming':     return pair + '. Which one is the sentence about?';
        case 'action':     return pair + '. One is enough here.';
        default:           return pair + '.';
      }
    }
    // The right kind of word, but not one that fits here: "The cookie tasted big" - big is
    // an Adjective, just not a taste. Saying "it needed an Adjective" would be no help.
    const sameKind = trace.wanted.filter(m =>
      family({ pos: m.pos || BW.Grammar.posOfWord(pack, m.word) }) === family(cur));
    if (sameKind.length) {
      const note = pack.pos[cur.pos] && pack.pos[cur.pos].note;
      if (note && words.slice(0, i).some(w => note.after.includes(w))) {
        return note.text.replace(/\{word\}/g, words[i]);
      }
      const exact = sameKind.filter(m => m.word && m.word !== cur.word &&
                                     BW.Grammar.posOfWord(pack, m.word) === cur.pos).map(m => m.word);
      if (exact.length && exact.length <= 4) {
        // after "the" or "big", the word it has to suit is the verb before it: "kicked ... ball"
        const anchor = ['determiner', 'adjective'].includes(family(prev))
          ? tokens.slice(0, i).reverse().find(t => roleOf(pack, t.pos) === 'action') || prev : prev;
        return '"' + anchor.word + '" goes with ' + orList(exact.map(w => '"' + w + '"')) + ', not ' + word + '.';
      }
      const fits = [];
      for (const m of sameKind) {
        for (const w of m.word ? [m.word] : (pack.words[m.pos] || [])) {
          if (!fits.includes(w) && !sentence.repeats(w, m.pos || cur.pos)) fits.push(w);
        }
      }
      const kind = labelOf(pack, cur.pos);
      // "read the busy...": after "the", it is the verb the word has to suit
      const anchor = family(prev) === 'determiner'
        ? tokens.slice(0, i).reverse().find(t => roleOf(pack, t.pos) === 'action') || prev : prev;
      return word + ' does not go with "' + anchor.word + '". ' + cap(kind) + 's that do: ' +
             orList(fits.slice(0, 4).map(w => '"' + w + '"')) + '.';
    }
    // "The knight carried quickly": carried what?
    if (doing && (wantsFamily('determiner') || wantsFamily('pronoun'))) {
      return asked ? is + '"' + prev.word + '" needs an object first: ' + prev.word + ' what? Find ' +
                     wantedText(pack, trace.wanted) + '.'
                   : '"' + prev.word + '" needs an object first: ' + prev.word + ' what? Put a Noun or a ' +
                     'Pronoun before ' + word + '.';
    }
    if (/^[A-Z]/.test(words[i]) && roleOf(pack, cur.pos) !== 'naming') {
      return word + ' has a capital letter because it starts a sentence, so it does not ' +
             'fit in the middle of one.';
    }
    if (asked) return is + needs;
    return 'After ' + lead + ', ' + word + ' does not fit. The sentence ' +
           'needed ' + wantedText(pack, trace.wanted) + ' there.';
  }

  /* Why the worm cannot eat this tile now, or null when it can. The worm only eats a word
     that keeps the sentence on its structure (Sentence.fits), and a punctuation mark only
     once the sentence is whole. Anything else stays on the board, and this is what the
     player is told about it: { short, reason } - a few words to pop up over the worm, and
     the whole reason for the strip.

     The checks go in the order a teacher's would: is it the right kind of word for this
     spot, does it have the right capital letter, is it new, does it go with the words
     before it - and last, could the sentence still be finished after it. */
  function refuse(pack, sentence, word, pos) {
    if (pos === 'punctuation') return cannotEnd(pack, sentence, word);
    if (sentence.fits(word, pos)) return null;

    const at = sentence.tokens.length;
    const kind = labelOf(pack, pos);
    const tokens = sentence.tokens.concat([{ word, pos }]);
    const trial = BW.Grammar.newSentence(pack, BW.rng);
    for (const t of tokens) trial.add(t.word, t.pos);
    const trace = trial.trace();

    if (trace.at === at) {
      const kinds = [];
      for (const m of trace.wanted) {
        const label = labelOf(pack, m.pos || BW.Grammar.posOfWord(pack, m.word));
        if (!kinds.includes(label)) kinds.push(label);
      }
      const short = trace.finished ? 'End it here!'
        : kinds.includes(kind) ? 'Not that ' + kind + '!'
        : kinds.length <= 2 ? 'Need ' + an(kinds.join(' or ')) + '!'
        : 'Not here!';
      return { short, reason: explain(pack, trial, trace,
                                      { before: sentence.displayWords(), ends: sentence.endMarks() }) };
    }
    if (!sentence.capitalFits(word, pos, at)) {
      const fix = otherCase(pack, word);
      return {
        short: fix ? 'Use "' + fix + '"!' : 'Capital letter!',
        reason: at === 0
          ? 'A sentence starts with a capital letter, and "' + word + '" does not have one' +
            (fix ? ' - look for "' + fix + '".' : '.')
          : '"' + word + '" has a capital letter, so it starts a sentence. In the middle of one, ' +
            (fix ? 'look for "' + fix + '".' : 'use a word with a small letter.')
      };
    }
    if (sentence.repeats(word, pos)) {
      return { short: 'Used already!', reason: '"' + word + '" is already in your sentence. Find a different ' + kind + '.' };
    }
    const clash = sentence.clashWith(word);
    if (clash) {
      return { short: 'Does not fit!', reason: '"' + clash.other + '" and "' + word + '" do not go together' +
                                                (clash.why ? ': ' + clash.why + '.' : '.') };
    }
    const odd = BW.Sense.problem(pack, tokens);
    if (odd && odd.at === at) {
      return { short: 'No sense!', reason: '"' + odd.words[0] + '" and "' + odd.words[1] + '" do not go together: ' +
                                           odd.why + '.' };
    }
    return { short: 'Dead end!', reason: '"' + word + '" fits here, but then nothing could come after it and still ' +
                                         'make sense. Find a different ' + kind + '.' };
  }

  /* A punctuation mark ends the sentence only once the sentence is whole, and only a mark
     that suits it: null when this one can, otherwise why not. */
  function cannotEnd(pack, sentence, mark) {
    if (!sentence.tokens.length) {
      return { short: 'No words yet!', reason: 'Eat some words first, then end the sentence with "' + mark + '".' };
    }
    if (!sentence.canEnd()) return { short: 'Not finished!', reason: 'Not finished yet! ' + nextStep(pack, sentence) };
    const marks = sentence.endMarks();
    if (marks.includes(mark)) return null;
    const these = orList(marks.map(m => '"' + m + '"'));
    return { short: 'Use ' + these + '!',
             reason: (marks.includes('?') ? 'A question ends with ' : 'This kind of sentence ends with ') +
                     these + ', not "' + mark + '".' };
  }

  /* For a sentence that is not finished: the next thing it needs, as a question. */
  function nextStep(pack, sentence) {
    const rest = sentence.outline().filter(s => s.state !== 'done');
    const need = rest.find(s => !s.optional) || rest[0];
    if (!need) return '';
    const role = roleOf(pack, need.pos);
    if (need.literal && role !== 'naming' && role !== 'action' && role !== 'describing') {
      return 'Add the word "' + need.literal + '" next.';
    }
    // a slot only certain words fit - "tastes" takes taste words, not every Adjective
    const last = sentence.tokens[sentence.tokens.length - 1];
    const lastFamily = last && pack.pos[last.pos] && pack.pos[last.pos].family;
    if (lastFamily === 'preposition') {
      const place = (pack.words.place || [])[0];
      return '"' + last.word + '" where? Finish it with a place' + (place ? ', like "' + last.word + ' the ' + place + '"' : '') + '.';
    }
    if ((lastFamily === 'determiner' || lastFamily === 'adjective') && role === 'naming') return '"' + last.word + '" what? Add a Noun.';
    const doing = sentence.tokens.slice().reverse().find(t =>
      roleOf(pack, t.pos) === 'action' && !BW.Grammar.isScaffold(t.pos));
    if (doing && (role === 'naming' || (pack.pos[need.pos] || {}).family === 'determiner') && last === doing) {
      return 'It needs an object: ' + doing.word + ' what? Add a Noun or a Pronoun.';
    }
    const label = labelOf(pack, need.pos) + (need.literal && last ? ' that goes with "' + last.word + '"' : '');
    const noun = sentence.tokens.slice().reverse().find(t => roleOf(pack, t.pos) === 'naming');
    // "What is the dog like?", but "What were they like?"
    const who = noun && (pack.pos[noun.pos].family !== 'pronoun' ? 'the ' + noun.word
                         : noun.word === 'I' ? 'I' : noun.word.toLowerCase());
    const what = !noun ? 'What is it like?'
      : pack.pos[noun.pos].family === 'pronoun' ? 'What ' + (doing || last).word + ' ' + who + ' like?'
      : 'What is ' + who + ' like?';
    switch (role) {
      case 'naming':     return 'Who or what is it about? Add ' + an(label) + '.';
      case 'action':     return 'What happens? Add ' + an(label) + '.';
      case 'describing': return what + ' Add ' + an(label) + '.';
      default:           return 'Add ' + an(label) + ' next.';
    }
  }

  /* The game's own check. Returns a report:
       verdict    'correct', 'wrong', or 'unfinished' (every word fits, but something is missing)
       items      the checklist, in order: { id, title, ok: true | false | null, note }
                  (null means "not checked" - Makes sense, until a judge has looked)
       headline   the one thing to tell the player
       at         the index of the word where it went wrong, or -1
       text, words, mark, shape, by, and from the judge: praise, tip, suggestion */
  function check(pack, sentence, mark) {
    const tokens = sentence.tokens;
    const words = sentence.displayWords();
    const done = sentence.complete();
    const shape = done.length ? done[0].pattern : null;
    const trace = sentence.trace();
    const unfinished = !shape && trace.at === -1;
    const items = {};
    const say = (ok, note) => ({ ok, note });

    // A capital letter to start, and small letters after (but "I" and names): "The" opens a
    // sentence and "the" goes in the middle, and both are tiles.
    const first = words[0];
    const capAt = capitalTrouble(sentence);
    const fix = capAt >= 0 ? otherCase(pack, tokens[capAt].word) : null;
    items.capital = capAt < 0 ? say(true, 'It starts with "' + first + '".')
      : capAt === 0 ? say(false, 'A sentence starts with a capital letter, and "' + first + '" does not have one' +
                                 (fix ? ' - use "' + fix + '".' : '.'))
      : say(false, '"' + tokens[capAt].word + '" is in the middle of the sentence, so it needs a small letter' +
                   (fix ? ': "' + fix + '".' : '.'));

    // Is there a who-or-what, and something that happens? Read off the word families'
    // roles, so a topic that calls them something else still gets checked.
    const part = (role, need, tells) => {
      const fams = Object.keys(pack.families || {}).map(k => pack.families[k]).filter(f => f.role === role);
      if (!fams.length) return null;
      const t = tokens.find(x => roleOf(pack, x.pos) === role);
      return t ? say(true, '"' + t.word + '" ' + tells + '.')
               : say(false, need + ' Use ' + orList(fams.map(f => an(f.label))) + '.');
    };
    items.subject = part('naming', 'It needs a subject: who or what is it about?', 'is the subject: who or what it is about');
    items.verb = part('action', 'It needs a verb: what happens?', 'tells what happens');

    if (shape) items.order = say(true, 'The words make ' + an(shape.name || 'sentence') + '.');
    else if (unfinished) items.order = say(true, 'So far, so good.');
    else items.order = say(false, explain(pack, sentence, trace));

    // A word said twice is the game's own rule. In Real mode the topic's clashes and its
    // meaning section (js/sense.js) catch what they know about; the rest needs a judge - or,
    // with no judge about, a child reading it out loud. Silly mode only asks that it sounds
    // right, so "The pencil ate the gym." is fine.
    const twice = repeatedWord(sentence);
    const clash = clashIn(pack, sentence);
    const odd = BW.Sense.problem(pack, tokens);
    items.sense = twice
      ? say(false, '"' + twice.word + '" is used twice. Use a different word the second time.')
      : clash
      ? say(false, '"' + clash.first + '" and "' + clash.second + '" do not go together' +
                   (clash.why ? ': ' + clash.why + '.' : '.'))
      : odd
      ? say(false, '"' + odd.words[0] + '" and "' + odd.words[1] + '" do not go together: ' + odd.why + '.')
      : pack.mode === 'silly'
      ? say(true, 'Silly mode: it does not have to make sense!')
      : say(null, 'Read it out loud: does it make sense?');

    if (unfinished) {
      items.end = say(null, 'Not yet: finish the sentence first.');
    } else {
      const marks = shape ? sentence.endMarks() : [mark];
      items.end = marks.includes(mark)
        ? say(true, 'It ends with "' + mark + '".')
        : say(false, (marks.includes('?') ? 'A question ends with ' : 'This kind of sentence ends with ') +
                     orList(marks.map(m => '"' + m + '"')) + ', not "' + mark + '".');
    }

    const titles = {
      capital: 'Capital letter',
      subject: 'Subject',
      verb: (familyWithRole(pack, 'action') || {}).label,
      order: 'Sounds right',
      sense: 'Makes sense',
      end: 'End mark'
    };
    const report = finish({
      text: sentence.text(mark),
      words,
      mark,
      at: trace.at,
      shape: shape ? shape.name : null,
      unfinished,
      next: unfinished ? nextStep(pack, sentence) : '',
      items: ORDER.filter(id => items[id]).map(id => ({ id, title: titles[id], ...items[id] })),
      by: 'rules',
      silly: pack.mode === 'silly',
      praise: '',
      tip: '',
      suggestion: ''
    });
    return report;
  }

  /* Fold the judge's answer into the report on a finished sentence. `verdict` is what the
     judge - or a teacher, through the answer key - said: { grammatical, makes_sense,
     feedback, suggestion, by }. With no verdict the rules stand on their own.

     The sentence was built word by word on the topic's structure, so it is right, and the
     judge cannot take that away. What it adds is a second reader: it can tick "Makes sense",
     which the rules leave for the child to read out loud, and praise the sentence - or, when
     it thinks the sentence sounds odd ("The quick bird jumped quickly." says the same thing
     twice), leave a tip and its own version to try next time. */
  function decide(report, verdict) {
    if (report.verdict !== 'correct' || !verdict) return report;
    const out = { ...report, items: report.items.map(i => ({ ...i })) };
    out.by = verdict.by === 'teacher' ? 'teacher' : 'judge';
    const feedback = String(verdict.feedback || '').trim();

    const sense = out.items.find(i => i.id === 'sense');
    if (sense.ok === null && verdict.makes_sense) {
      sense.ok = true;
      sense.note = 'The words fit together.';
    }
    if (verdict.grammatical && verdict.makes_sense) {
      out.praise = feedback;
    } else if (!verdict.grammatical || !out.silly) {
      // (Silly mode does not have to make sense, so the judge saying so is no tip there)
      out.tip = feedback || 'Read it out loud. Could it sound better?';
      const suggestion = String(verdict.suggestion || '').trim();
      if (suggestion && suggestion !== report.text) out.suggestion = suggestion;
    }
    return finish(out);
  }

  function finish(r) {
    const get = id => r.items.find(i => i.id === id);
    const ok = id => !get(id) || get(id).ok !== false;
    if (r.unfinished && ok('capital') && ok('sense')) r.verdict = 'unfinished';
    else r.verdict = r.items.every(i => i.ok !== false) ? 'correct' : 'wrong';
    r.headline = headline(r, get);
    return r;
  }

  /* The one thing to say. For a wrong sentence, the most basic problem first: a sentence
     that starts wrong, then a missing Noun or Verb, then the order, and so on down. */
  function headline(r, get) {
    if (r.verdict === 'correct') return r.praise || 'That is a complete sentence!';
    if (r.verdict === 'unfinished') return 'Not finished yet! ' + r.next;
    const order = get('order');
    if (order && order.ok === false && r.at === 0) return order.note;
    for (const id of ['subject', 'verb', 'order', 'capital', 'sense', 'end']) {
      const item = get(id);
      if (item && item.ok === false) return item.note;
    }
    return 'Something is not quite right.';
  }

  BW.Checker = { check, decide, refuse };
})();
