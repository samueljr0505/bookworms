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
   "The apple tastes sweet." from "The apple tastes big." - both are Determiner Noun Verb
   Adjective - and they turn down good English the recipe never taught, like "The big
   brown dog ran." So decide() folds in a second opinion from the judge (js/judge.js) when
   there is one, and the judge gets the last word on "sounds right" and "makes sense".

   Capital letters, repeated words and end marks stay the rules' call whatever the judge
   says. They are the game's rules about its own tiles, and there is no grey area in them.

   Like the rest of the model, this file never touches the page, so tools/test.js can
   check thousands of sentences with no browser. */
window.BW = window.BW || {};

(function () {
  const ORDER = ['capital', 'noun', 'verb', 'order', 'sense', 'end'];

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

  /* A content word used a second time - "The happy dog is happy." */
  function repeatedWord(sentence) {
    const seen = new Set();
    for (const t of sentence.tokens) {
      if (!sentence.isContent(t.pos)) continue;
      if (seen.has(t.word)) return t.word;
      seen.add(t.word);
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
      const kind = trace.wanted.find(m => m.pos);
      const like = kind ? ', like ' + orList((pack.words[kind.pos] || []).slice(0, 3).map(w => '"' + w + '"')) : '';
      return 'A sentence here starts with ' + wantedText(pack, trace.wanted) + like + '.';
    }
    if (trace.finished) {
      return quote(words.slice(0, i)) + ' was already a whole sentence, so ' + word +
             ' does not fit after it. You could have ended it there!';
    }
    const family = t => pack.pos[t.pos] && pack.pos[t.pos].family;
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
    if (need.literal) return 'Add the word "' + need.literal + '" next.';
    const label = labelOf(pack, need.pos);
    const noun = sentence.tokens.slice().reverse().find(t => roleOf(pack, t.pos) === 'naming');
    switch (roleOf(pack, need.pos)) {
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

    const first = words[0];
    items.capital = first[0] !== first[0].toLowerCase()
      ? say(true, 'It starts with "' + first + '".')
      : say(false, 'A sentence starts with a capital letter, and "' + first + '" does not have one.');

    // Is there a who-or-what, and something that happens? Read off the word families'
    // roles, so a topic that calls them something else still gets checked.
    const part = (role, question, tells) => {
      const fam = familyWithRole(pack, role);
      if (!fam) return null;
      const t = tokens.find(x => roleOf(pack, x.pos) === role);
      return t ? say(true, '"' + t.word + '" ' + tells + '.')
               : say(false, 'It needs ' + an(fam.label) + ': ' + question);
    };
    items.noun = part('naming', 'who or what is it about?', 'tells who or what it is about');
    items.verb = part('action', 'what happens?', 'tells what happens');

    if (shape) items.order = say(true, 'The words make ' + an(shape.name || 'sentence') + '.');
    else if (unfinished) items.order = say(true, 'So far, so good.');
    else items.order = say(false, explain(pack, sentence, trace));

    // A word said twice is the game's own rule. Whether the rest makes sense needs a judge -
    // or, with no judge about, a child reading it out loud.
    const twice = repeatedWord(sentence);
    items.sense = twice
      ? say(false, '"' + twice + '" is used twice. Use a different word the second time.')
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
      noun: (familyWithRole(pack, 'naming') || {}).label,
      verb: (familyWithRole(pack, 'action') || {}).label,
      order: 'Sounds right',
      sense: 'Makes sense',
      end: 'End mark'
    };
    return finish({
      text: sentence.text(mark),
      words,
      mark,
      at: trace.at,
      shape: shape ? shape.name : null,
      unfinished,
      next: unfinished ? nextStep(pack, sentence) : '',
      items: ORDER.filter(id => items[id]).map(id => ({ id, title: titles[id], ...items[id] })),
      by: 'rules',
      rescued: false,
      suggestion: '',
      praise: ''
    });
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
      // a shape the rules allow, with something else wrong in it - "A rice is soft."
      order.ok = false;
      order.note = feedback || 'Something about the words does not sound right.';
    }
    // When both say no, the rules' reason stays: it points at the exact word.

    if (sense.ok !== false) {                  // a word said twice stays a problem
      sense.ok = !!verdict.makes_sense;
      sense.note = verdict.makes_sense ? 'The words fit together.'
                 : verdict.grammatical ? (feedback || 'The words do not fit together.')
                 : 'Fix how it sounds first, then check what it means.';
    }
    const suggestion = String(verdict.suggestion || '').trim();
    out.suggestion = suggestion && suggestion !== report.text ? suggestion : '';
    out.praise = feedback;
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
    if (r.verdict === 'correct') {
      return r.praise || (r.rescued ? 'That is a real sentence!' : 'That is a complete sentence!');
    }
    if (r.verdict === 'unfinished') return 'Not finished yet! ' + r.next;
    const order = get('order');
    if (order && order.ok === false && r.at === 0) return order.note;
    for (const id of ['noun', 'verb', 'order', 'capital', 'sense', 'end']) {
      const item = get(id);
      if (item && item.ok === false) return item.note;
    }
    return 'Something is not quite right.';
  }

  BW.Checker = { check, decide };
})();
