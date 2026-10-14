/* Does the sentence make sense? (Real mode)

   The grammar (js/grammar.js) makes sure the words are in an order that works, so
   "The mouse carried the horse." is a fine English shape. This file knows that a mouse is
   too small to carry a horse. It reads the topic's `meaning` section, written in
   tools/build-topics.py:

     tags        tag -> words:            "flyer": ["dragon"]
     size        word -> how big it is:    0 for things you hold, 1 a mouse ... 5 a giant
     holds       place -> the biggest size that fits in / into / inside / through / under it,
                 or { "under": 5, "*": 2 } to say it per Preposition
     verbs       verb -> { who, what, bigger, base, why }
                   who     who can do it                  ("flew": only a "flyer")
                   what    what it can be done to          ("baked": a cake, not a sandwich)
                   bigger  how much bigger than the doer the object may be: -1 means it has
                           to be smaller ("carried"), 1 means up to one size bigger ("chased")
                   base    the verb said plainly, for the reason: "carry"
                   why     the reason a child is told when who or what does not fit
     adjectives  adjective -> { what, why }   what it can describe
     canBe       noun -> what it can be in "The boy was a ___"; "*" for every other noun

   A list may name words or tags. Every word is tagged with itself, beings with "being",
   things with "thing" and places with "place". A word starting with "!" rules that word or
   tag out. Pronouns could be anyone, so they are never ruled out.

   It reads the words one at a time and keeps a note of who the subject is, what the verb
   is and what it was done to, so a problem is pinned to the word where it showed up -
   exactly like the grammar's trace. Words the meaning section does not mention are never
   blocked, and a topic without one (or Silly mode, which drops it) is never blocked at all.

   No DOM here: tools/test.js runs it with no browser. */
window.BW = window.BW || {};

BW.Sense = (function () {
  const HOLD_PREPS = ['in', 'into', 'inside', 'through', 'under'];
  const NAMING = { noun: 'being', thing: 'thing', mass: 'thing', place: 'place',
                   subjectPronoun: 'pronoun', objectPronoun: 'pronoun' };
  const LINKING = ['be', 'taste', 'smell', 'look'];

  /* ---------- reading the topic ---------- */

  const models = new WeakMap();
  function model(pack) {
    if (!pack.meaning) return null;
    let M = models.get(pack);
    if (M) return M;
    const m = pack.meaning;
    const tags = new Map();
    const tag = (w, t) => { if (!tags.has(w)) tags.set(w, new Set([w])); tags.get(w).add(t); };
    for (const pos of Object.keys(NAMING)) {
      for (const w of pack.words[pos] || []) tag(w, NAMING[pos] === 'pronoun' ? '*' : NAMING[pos]);
    }
    for (const t of Object.keys(m.tags || {})) for (const w of m.tags[t]) tag(w, t);
    M = { m, tags };
    models.set(pack, M);
    return M;
  }

  function tagsOf(M, word) { return M.tags.get(word) || new Set([word]); }

  /* Does a word pass a list like ["being", "!horse"]? No list means no limit. */
  function allowed(M, word, list) {
    if (!list || !list.length) return true;
    const tags = tagsOf(M, word);
    if (tags.has('*')) return true;
    if (list.some(x => x[0] === '!' && tags.has(x.slice(1)))) return false;
    const yes = list.filter(x => x[0] !== '!');
    return !yes.length || yes.some(x => tags.has(x));
  }

  function sizeOf(M, word) {
    const s = (M.m.size || {})[word];
    return typeof s === 'number' ? s : null;
  }

  function holdsOf(M, place, prep) {
    const h = (M.m.holds || {})[place];
    if (typeof h === 'number') return h;
    if (h && typeof h === 'object') return prep in h ? h[prep] : (h['*'] ?? null);
    return null;
  }

  /* "a horse", "an elf", "soup", "him" - for the reasons a child reads. */
  function named(pack, head) {
    if (head.kind === 'pronoun') return '"' + head.word + '"';
    if ((pack.words.mass || []).includes(head.word)) return head.word;
    return (/^[aeiou]/.test(head.word) ? 'an ' : 'a ') + head.word;
  }

  /* ---------- reading the sentence ---------- */

  /* The first word that stops the sentence making sense: { at, words: [a, b], why },
     or null. `tokens` are { word, pos }, as the grammar keeps them. */
  function problem(pack, tokens) {
    const M = model(pack);
    if (!M) return null;
    const m = M.m;
    const family = pos => pack.pos[pos] && pack.pos[pos].family;

    let subject = null;          // the head word of the subject
    let verb = null;             // { word, pos, at }
    const objects = [];          // heads of the objects, in order
    let recipient = null;
    let pending = [];            // Adjectives waiting for their Noun
    let prep = null;             // a Preposition waiting for its place
    let open = false;            // a Determiner has started a noun phrase
    let complement = false;      // "was a ___": the next Noun is what the subject is

    const say = (at, a, b, why) => ({ at, words: [a, b], why });

    for (let i = 0; i < tokens.length; i++) {
      const { word, pos } = tokens[i];
      const fam = family(pos);

      if (fam === 'determiner') {
        if (verb && verb.pos === 'be' && !open && !prep && (word === 'a' || word === 'A')) complement = true;
        open = true;
        continue;
      }
      if (fam === 'preposition' || (word === 'to' && !NAMING[pos])) {
        prep = { word, at: i };
        continue;
      }

      if (fam === 'adjective') {
        const rule = (m.adjectives || {})[word];
        if (!open && !prep && verb && LINKING.includes(verb.pos) && subject) {
          // "The pizza was sweet": the Adjective describes the subject
          if (rule && subject.kind !== 'pronoun' && !allowed(M, subject.word, rule.what)) {
            return say(i, subject.word, word, rule.why || ('"' + word + '" does not describe ' + named(pack, subject)));
          }
        } else {
          pending.push({ word, at: i });
        }
        continue;
      }

      if (fam === 'verb') {
        verb = { word, pos, at: i };
        const rule = (m.verbs || {})[word];
        if (rule && subject && !allowed(M, subject.word, rule.who)) {
          return say(i, subject.word, word, rule.why || (named(pack, subject) + ' cannot do that'));
        }
        continue;
      }

      const kind = NAMING[pos];
      if (!kind) continue;                       // Adverbs and anything else: the clashes see to those
      const head = { word, pos, at: i, kind: kind === 'pronoun' ? 'pronoun' : tagsOf(M, word).has('place') ? 'place' : kind };

      // the Adjectives in front of it have to suit it: "a tiny giant"
      for (const a of pending) {
        const rule = (m.adjectives || {})[a.word];
        if (rule && head.kind !== 'pronoun' && !allowed(M, word, rule.what)) {
          return say(i, a.word, word, rule.why || ('"' + a.word + '" does not describe ' + named(pack, head)));
        }
      }
      pending = [];
      open = false;

      if (prep) {
        const p = prep;
        prep = null;
        if (head.kind === 'place') {
          // whoever or whatever is there has to fit: "The horse hid in the nest"
          const there = objects.length ? objects[objects.length - 1] : subject;
          const room = HOLD_PREPS.includes(p.word) ? holdsOf(M, word, p.word) : null;
          const size = there && there.kind !== 'pronoun' ? sizeOf(M, there.word) : null;
          if (room !== null && size !== null && size > room) {
            return say(i, there.word, word, named(pack, there) + ' is too big to fit ' + p.word + ' ' + named(pack, head));
          }
        } else {
          recipient = head;                      // "gave a sword to the elf"
        }
        continue;
      }
      if (!verb) { subject = head; continue; }

      if (verb.pos === 'be') {
        if (complement && subject && subject.kind !== 'pronoun') {
          // "The boy was a teacher"
          const can = m.canBe || {};
          const list = can[subject.word] || can['*'] || [];
          if (!list.includes(word)) {
            return say(i, subject.word, word, named(pack, subject) + ' cannot be ' + named(pack, head));
          }
        }
        complement = false;
        continue;
      }

      // "gave him a sword": the first being is who gets it, the thing is what is given
      if (verb.pos === 'give' && !objects.length && !recipient && (head.kind === 'pronoun' || head.kind === 'being')) {
        recipient = head;
        continue;
      }
      objects.push(head);
      const rule = (m.verbs || {})[verb.word];
      if (!rule) continue;
      if (!allowed(M, word, rule.what)) {
        return say(i, verb.word, word, rule.why || ('you cannot ' + (rule.base || 'do that to') + ' ' + named(pack, head)));
      }
      if (typeof rule.bigger === 'number' && subject && subject.kind !== 'pronoun' && head.kind !== 'pronoun') {
        const a = sizeOf(M, subject.word), b = sizeOf(M, word);
        if (a !== null && b !== null && b > a + rule.bigger) {
          return say(i, subject.word, word, named(pack, head) + ' is too big for ' + named(pack, subject) +
                     ' to ' + (rule.base || verb.word));
        }
      }
    }
    return null;
  }

  /* Would this word, eaten next, still make sense? */
  function fits(pack, tokens, word, pos) {
    if (!pack.meaning) return true;
    const p = problem(pack, tokens.concat([{ word, pos }]));
    return !p || p.at < tokens.length;
  }

  return { problem, fits };
})();
