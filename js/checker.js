/* The sentence checker (Req 4, Req 6).

   Punctuation ends a sentence, and that is the moment it gets checked - the way a teacher
   checks a sentence on a worksheet:

     Capital letter   does it start with one?
     Noun             is there a who or what?
     Verb             is there something that happens?
     Sounds right     are the words in an order that works?
     Makes sense      do the words fit together?
     End mark         is it the right mark for this kind of sentence?

   Every line comes back with a note in plain words, so a wrong sentence gets a reason a
   child can act on rather than a red cross.

   Two things do the checking. check() is the game's own rules: it compares the words with
   the topic's sentence shapes (js/grammar.js). That is instant, works with no internet,
   and is never wrong about a shape it knows. But rules only know shapes. They cannot tell
   "The hungry bird jumped quickly." from "The quick bird jumped quickly." - the second says
   the same thing twice - unless the topic lists that pair as a clash, and they turn down good English the recipe never taught, like "The big
   brown dog ran." So decide() folds in a second opinion from the judge (js/judge.js) when
   there is one, and the judge gets the last word on "sounds right" and "makes sense".

   Capital letters, repeated words and end marks stay the rules' call whatever the judge
   says. They are the game's rules about its own tiles, and there is no grey area in them.

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

  /* What a set of wanted tiles is, in words: "a Noun or a Verb", or "the word "and"". */
  function wantedText(pack, wanted) {
    const out = [];
    for (const m of wanted) {
      const t = m.word ? 'the word "' + m.word + '"' : an(labelOf(pack, m.pos));
      if (!out.includes(t)) out.push(t);
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

  /* Would these words pass the rules as they stand? */
  function passes(pack, tokens) {
    if (!tokens.length) return null;
    const s = BW.Grammar.newSentence(pack, BW.rng);
    for (const t of tokens) s.add(t.word, t.pos);
    return s.canEnd() && capitalTrouble(s) < 0 && !repeatedWord(s) && !clashIn(pack, s) &&
           !BW.Sense.problem(pack, s.tokens) ? s : null;
  }

  /* A corrected sentence to try, built from the topic's own tiles, so a wrong sentence always
     comes back with an example and not only a reason. It changes as little as it can at the
     first word that went wrong: add a word there, swap that word, or drop it - and if the
     words were already a whole sentence before it, just stop there. When there is more than
     one mistake, it keeps the words before the first one and finishes the sentence the
     shortest way it can. */
  function suggest(pack, sentence, mark, at, finished) {
    const toks = sentence.tokens;
    const tiles = [];
    for (const pos of Object.keys(pack.words)) for (const word of pack.words[pos]) tiles.push({ word, pos });
    const tries = [];
    // "A rice": nothing wrong with "rice" - it is the word before it that has to change
    const note = toks[at] && pack.pos[toks[at].pos] && pack.pos[toks[at].pos].note;
    if (note && at > 0) for (const t of tiles) tries.push([...toks.slice(0, at - 1), t, ...toks.slice(at)]);
    for (const t of tiles) tries.push([...toks.slice(0, at), t, ...toks.slice(at)]);
    for (const t of tiles) tries.push([...toks.slice(0, at), t, ...toks.slice(at + 1)]);
    tries.push([...toks.slice(0, at), ...toks.slice(at + 1)]);
    if (finished) tries.push(toks.slice(0, at));
    let fixed = null;
    for (const t of tries) if ((fixed = passes(pack, t))) break;
    // keep the words before the mistake and finish the sentence; if those words cannot be
    // finished either ("swam across a muddy..." - only a pool fits, and a pool is not muddy),
    // give back one word at a time until they can
    for (let cut = at; !fixed && cut >= 0; cut--) {
      for (let depth = 0; !fixed && depth <= 4; depth++) fixed = finishOff(pack, toks.slice(0, cut), depth);
    }
    if (!fixed) return '';
    return fixed.text(fixed.endMarks().includes(mark) ? mark : fixed.endMarks()[0]);
  }

  /* Add at most `depth` words to these so they pass the rules; null if that cannot be done. */
  function finishOff(pack, tokens, depth) {
    const done = passes(pack, tokens);
    if (done || depth === 0) return done;
    const s = BW.Grammar.newSentence(pack, BW.rng);
    for (const t of tokens) s.add(t.word, t.pos);
    for (const m of s.wants()) {
      const pos = m.pos || BW.Grammar.posOfWord(pack, m.word);
      for (const w of m.word ? [m.word] : (pack.words[m.pos] || [])) {
        if (!s.fits(w, pos)) continue;
        const found = finishOff(pack, [...tokens, { word: w, pos }], depth - 1);
        if (found) return found;
      }
    }
    return null;
  }

  /* Why the words stopped fitting every shape, pinned to the word where it happened. */
  function explain(pack, sentence, trace) {
    const tokens = sentence.tokens;
    const words = sentence.displayWords();
    const i = trace.at;
    const cur = tokens[i];
    const prev = tokens[i - 1];
    const word = '"' + words[i] + '"';

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
      return 'A sentence here starts with ' + orList(kinds) +
             (like.length ? ', like ' + orList(like.map(w => '"' + w + '"')) : '') + '.';
    }
    const family = t => pack.pos[t.pos] && pack.pos[t.pos].family;
    const wantsFamily = f => trace.wanted.some(m => family({ pos: m.pos || BW.Grammar.posOfWord(pack, m.word) }) === f);
    // "The knight walked the cave": walking does not take an object - it goes somewhere
    const placeWord = (family(cur) === 'determiner' || roleOf(pack, cur.pos) === 'naming') &&
                      sentence.capitalFits(cur.word, cur.pos, i);
    if (placeWord && wantsFamily('preposition') && roleOf(pack, prev.pos) === 'action') {
      const prep = trace.wanted.map(m => m.word || (pack.words[m.pos] || [])[0])
                        .find(w => w && family({ pos: BW.Grammar.posOfWord(pack, w) }) === 'preposition');
      return '"' + words[i - 1] + '" needs a Preposition to say where, like "' + words[i - 1] + ' ' +
             prep + ' ' + words[i] + '".';
    }
    if (trace.finished) {
      return quote(words.slice(0, i)) + ' was already a whole sentence, so ' + word +
             ' does not fit after it. You could have ended it there!';
    }
    if (roleOf(pack, prev.pos) === 'naming' && roleOf(pack, cur.pos) === 'describing') {
      return cap(an(labelOf(pack, cur.pos))) + ' goes before the ' + labelOf(pack, prev.pos) +
             ' it describes: "' + words[i] + ' ' + words[i - 1] + '", not "' +
             words[i - 1] + ' ' + words[i] + '".';
    }
    if (family(prev) && family(prev) === family(cur)) {
      const pair = '"' + words[i - 1] + ' ' + words[i] + '" is two ' + labelOf(pack, cur.pos) + 's in a row';
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
      return word + ' does not go with "' + words[i - 1] + '". ' + cap(kind) + 's that do: ' +
             orList(fits.slice(0, 4).map(w => '"' + w + '"')) + '.';
    }
    // "The knight carried quickly": carried what?
    const verb = tokens.slice(0, i).reverse().find(t => roleOf(pack, t.pos) === 'action');
    if (verb && roleOf(pack, prev.pos) === 'action' && (wantsFamily('determiner') || wantsFamily('pronoun'))) {
      return '"' + verb.word + '" needs an object first: ' + verb.word + ' what? Put a Noun or a ' +
             'Pronoun before ' + word + '.';
    }
    if (/^[A-Z]/.test(words[i]) && roleOf(pack, cur.pos) !== 'naming') {
      return word + ' has a capital letter because it starts a sentence, so it does not ' +
             'fit in the middle of one.';
    }
    return 'After ' + quote(words.slice(0, i)) + ', ' + word + ' does not fit. The sentence ' +
           'needed ' + wantedText(pack, trace.wanted) + ' there.';
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
    switch (role) {
      case 'naming':     return 'Who or what is it about? Add ' + an(label) + '.';
      case 'action':     return 'What happens? Add ' + an(label) + '.';
      case 'describing': return 'What is ' + (noun ? 'the ' + noun.word : 'it') + ' like? Add ' + an(label) + '.';
      default:           return 'Add ' + an(label) + ' next.';
    }
  }

  /* The game's own check. Returns a report:
       verdict    'correct', 'wrong', or 'unfinished' (every word fits, but something is missing)
       items      the checklist, in order: { id, title, ok: true | false | null, note }
                  (null means "not checked" - Makes sense, until a judge has looked)
       headline   the one thing to tell the player
       at         the index of the word where it went wrong, or -1
       text, words, mark, shape, by, rescued, suggestion */
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
      rescued: false,
      suggestion: '',
      praise: ''
    });
    if (report.verdict === 'wrong') {
      // fix the first thing that went wrong: the word that broke the shape, else the word
      // said twice, else the word that clashes; a wrong end mark just needs the right one
      const problems = [trace.at, capAt, twice ? twice.at : -1, clash ? clash.at : -1, odd ? odd.at : -1]
        .filter(i => i >= 0);
      const at = problems.length ? Math.min(...problems) : sentence.tokens.length;
      report.suggestion = suggest(pack, sentence, mark, at, trace.finished && at === trace.at);
    }
    return report;
  }

  /* Fold the judge's answer into a report from check(). `verdict` is what the judge - or a
     teacher, through the answer key - said: { grammatical, makes_sense, feedback,
     suggestion, by }. With no verdict the rules stand on their own. */
  function decide(report, verdict) {
    if (report.verdict === 'unfinished') return report;
    const out = { ...report, items: report.items.map(i => ({ ...i })) };
    if (!verdict) return finish(out);

    out.by = verdict.by === 'teacher' ? 'teacher' : 'judge';
    const order = out.items.find(i => i.id === 'order');
    const sense = out.items.find(i => i.id === 'sense');
    const feedback = String(verdict.feedback || '').trim();

    if (verdict.grammatical && order.ok === false) {
      // good English the recipe never taught - "The big brown dog ran."
      order.ok = true;
      order.note = 'It is not one of the recipe shapes, but it is a real sentence!';
      out.rescued = true;
    } else if (!verdict.grammatical && order.ok !== false) {
      // a shape the rules allow, with something else wrong in it
      order.ok = false;
      order.note = feedback || 'Something about the words does not sound right.';
    }
    // When both say no, the rules' reason stays: it points at the exact word.

    if (sense.ok !== false && !out.silly) {    // a word said twice stays a problem; Silly needs no sense
      sense.ok = !!verdict.makes_sense;
      sense.note = verdict.makes_sense ? 'The words fit together.'
                 : verdict.grammatical ? (feedback || 'The words do not fit together.')
                 : 'Fix how it sounds first, then check what it means.';
    }
    // the judge's corrected sentence when it gave one, otherwise the rules' own
    const suggestion = String(verdict.suggestion || '').trim();
    if (suggestion && suggestion !== report.text) out.suggestion = suggestion;
    // in Silly mode the judge's word on meaning ("a pencil cannot eat") is not praise
    out.praise = out.silly && !verdict.makes_sense ? '' : feedback;
    return finish(out);
  }

  function finish(r) {
    const get = id => r.items.find(i => i.id === id);
    const ok = id => !get(id) || get(id).ok !== false;
    if (r.unfinished && ok('capital') && ok('sense')) r.verdict = 'unfinished';
    else r.verdict = r.items.every(i => i.ok !== false) ? 'correct' : 'wrong';
    if (r.verdict !== 'wrong') r.suggestion = '';
    r.headline = headline(r, get);
    return r;
  }

  /* The one thing to say. For a wrong sentence, the most basic problem first: a sentence
     that starts wrong, then a missing Noun or Verb, then the order, and so on down. */
  function headline(r, get) {
    if (r.verdict === 'correct') {
      return r.praise || (r.rescued ? 'That is a real sentence!' : 'That is a complete sentence!');
    }
    if (r.verdict === 'unfinished') return 'Not finished yet! ' + r.next;
    const order = get('order');
    if (order && order.ok === false && r.at === 0) return order.note;
    for (const id of ['subject', 'verb', 'order', 'capital', 'sense', 'end']) {
      const item = get(id);
      if (item && item.ok === false) return item.note;
    }
    return 'Something is not quite right.';
  }

  BW.Checker = { check, decide };
})();
