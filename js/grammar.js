/* Grammar engine.
   A pattern describes a sentence shape in a tiny language, for example

       "adverb , <subject> verb ( preposition <thing> )?"

   - a word like `noun` or `verb` is a part of speech from the pack - eat any word of that kind
   - `,` is a comma the player has to eat, just like a word
   - `'and'` in quotes means that exact word (use double quotes for a word with an apostrophe: "can't")
   - `<subject>` pulls in a reusable phrase from the pack's `rules`
   - `( ... )` groups things, and `a | b` inside a group means "either a or b"
   - after a part or a group: `?` optional, `*` any number of times, `+` one or more times

   The shape is turned into a little state machine. The player can only ever eat a word that
   moves the machine forward, and punctuation only appears once the machine is somewhere a
   sentence may stop - so every finished sentence is grammatically correct by construction
   (Req 4). The old list form, ["determiner", "adjective?", "noun"], still works too. */
window.BW = window.BW || {};

(function () {
  const VOWELS = ['a', 'e', 'i', 'o', 'u'];
  const DEFAULT_ENDS = ['.', '!'];

  /* Kept for the old ["noun", "adjective?"] slot lists. */
  function slotPos(slot) { return slot.endsWith('?') ? slot.slice(0, -1) : slot; }
  function slotOptional(slot) { return slot.endsWith('?'); }

  /* ---------- reading a shape ---------- */

  function tokenize(src) {
    const out = [];
    const re = /\s*(?:(<[\w-]+>)|'([^']+)'|"([^"]+)"|([A-Za-z][\w-]*)|([(),|?*+]))/y;
    let m;
    re.lastIndex = 0;
    while (re.lastIndex < src.length) {
      const at = re.lastIndex;
      if (/^\s*$/.test(src.slice(at))) break;
      m = re.exec(src);
      if (!m) throw new Error('Pattern "' + src + '": do not understand "' + src.slice(at).trim() + '"');
      if (m[1]) out.push({ t: 'rule', v: m[1].slice(1, -1) });
      else if (m[2] || m[3]) out.push({ t: 'word', v: m[2] || m[3] });
      else if (m[4]) out.push({ t: 'pos', v: m[4] });
      else out.push({ t: m[5] });
    }
    return out;
  }

  /* Turns a shape string into a tree. `rules` are the pack's named phrases; `seen` catches a
     phrase that (directly or not) contains itself, which would never end. */
  function parse(src, rules, seen) {
    rules = rules || {};
    seen = seen || [];
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i] && toks[i].t;

    function alt() {
      const opts = [seq()];
      while (peek() === '|') { i++; opts.push(seq()); }
      return opts.length === 1 ? opts[0] : { t: 'alt', opts };
    }
    function seq() {
      const items = [];
      while (i < toks.length && peek() !== ')' && peek() !== '|') items.push(post());
      return items.length === 1 ? items[0] : { t: 'seq', items };
    }
    function post() {
      let node = atom();
      while (peek() === '?' || peek() === '*' || peek() === '+') {
        const op = toks[i++].t;
        node = { t: op === '?' ? 'opt' : op === '*' ? 'star' : 'plus', x: node };
      }
      return node;
    }
    function atom() {
      const tok = toks[i++];
      if (!tok) throw new Error('Pattern "' + src + '" ends too early');
      if (tok.t === '(') {
        const inner = alt();
        if (peek() !== ')') throw new Error('Pattern "' + src + '" is missing a ")"');
        i++;
        return inner;
      }
      if (tok.t === ',') return { t: 'pos', pos: 'comma' };
      if (tok.t === 'pos') return { t: 'pos', pos: tok.v };
      if (tok.t === 'word') return { t: 'word', word: tok.v };
      if (tok.t === 'rule') {
        if (!(tok.v in rules)) throw new Error('Pattern "' + src + '" uses <' + tok.v + '>, which is not in "rules"');
        if (seen.includes(tok.v)) throw new Error('Rule <' + tok.v + '> ends up containing itself');
        return parse(rules[tok.v], rules, seen.concat(tok.v));
      }
      throw new Error('Pattern "' + src + '": unexpected "' + tok.t + '"');
    }

    const tree = alt();
    if (i < toks.length) throw new Error('Pattern "' + src + '": unexpected "' + toks[i].t + '"');
    return tree;
  }

  function shapeOf(pattern) {
    if (typeof pattern.shape === 'string') return pattern.shape;
    if (Array.isArray(pattern.slots)) return pattern.slots.join(' ');
    throw new Error('Pattern "' + (pattern.id || '?') + '" needs a "shape"');
  }

  /* ---------- the state machine ---------- */

  /* Classic Thompson construction: every node has "eat this" edges and free (empty) edges. */
  function compile(tree) {
    const nodes = [];
    const node = () => { nodes.push({ edges: [], free: [] }); return nodes.length - 1; };

    function build(n, from) {
      switch (n.t) {
        case 'pos':
        case 'word': {
          const to = node();
          nodes[from].edges.push({ m: n.t === 'pos' ? { pos: n.pos } : { word: n.word }, to });
          return to;
        }
        case 'seq': return n.items.reduce((at, item) => build(item, at), from);
        case 'alt': {
          const end = node();
          for (const o of n.opts) {
            const s = node();
            nodes[from].free.push(s);
            nodes[build(o, s)].free.push(end);
          }
          return end;
        }
        case 'opt': {
          const s = node(), end = node();
          nodes[from].free.push(s, end);
          nodes[build(n.x, s)].free.push(end);
          return end;
        }
        case 'star': {
          const s = node(), end = node();
          nodes[from].free.push(s);
          nodes[build(n.x, s)].free.push(s);
          nodes[s].free.push(end);
          return end;
        }
        case 'plus': return build({ t: 'star', x: n.x }, build(n.x, from));
      }
      throw new Error('unknown pattern part ' + n.t);
    }

    const start = node();
    const accept = build(tree, start);
    return { nodes, start, accept };
  }

  function closure(nfa, ids) {
    const out = new Set(ids);
    const stack = [...ids];
    while (stack.length) {
      for (const next of nfa.nodes[stack.pop()].free) {
        if (!out.has(next)) { out.add(next); stack.push(next); }
      }
    }
    return out;
  }

  function matches(m, word, pos) { return m.word ? m.word === word : m.pos === pos; }
  function sameMatcher(a, b) { return a.word === b.word && a.pos === b.pos; }

  const compiled = new WeakMap();
  function machineFor(pack, pattern) {
    let entry = compiled.get(pattern);
    if (!entry) {
      entry = compile(parse(shapeOf(pattern), pack.rules));
      compiled.set(pattern, entry);
    }
    return entry;
  }


  /* ---------- meaning, not just shape ----------------------------------
     A sentence can follow a pattern perfectly and still be nonsense: "the book
     chased Omar", "she played into dad". The pattern only knows a noun is a noun.

     These helpers read the pack's "semantics" block: what each naming word IS
     (person, creature, thing, place, food, stuff, idea) and what each action or
     where-word ACCEPTS. Everything is driven by the pack - which parts of speech
     count as naming or action words comes from their family - so a pack can add
     categories without touching this file. Untagged words stay unconstrained, so
     a half-tagged pack still plays. */

  /* A family's label is for the player and can be renamed at will. Its ROLE is
     what the meaning checks key off, so renaming "Naming Word" to "Noun" cannot
     silently switch those checks off - which is exactly what happened once. */
  function roleOf(pack, pos) {
    const info = pack.pos && pack.pos[pos];
    const fam = info && pack.families && pack.families[info.family];
    return (fam && fam.role) || (info && info.family);
  }
  function isHead(pack, pos) { return roleOf(pack, pos) === 'naming'; }
  function isVerb(pack, pos) { return roleOf(pack, pos) === 'action'; }

  function classesOf(pack, word, pos) {
    const sem = pack.semantics;
    if (sem && sem.classes && sem.classes[word]) return sem.classes[word];
    return null;                        // unknown: do not block it
  }

  /* Frames are stored per lemma, so hops / hopped / hopping share one entry. */
  function frameOf(pack, word) {
    const sem = pack.semantics;
    if (!sem || !sem.frames) return null;
    const base = (sem.lemma && sem.lemma[word]) || word;
    return sem.frames[base] || sem.frames[word] || null;
  }

  function allowed(need, have) {
    if (!need || !need.length) return true;
    if (!have || !have.length) return true;
    return have.some(c => need.includes(c));
  }

  class Sentence {
    /* Verbs that carry no meaning of their own - they prop up a real verb. */
    static SCAFFOLD = ['be', 'helper', 'negative'];

    /* How many words ahead to check before offering one. 1 catches "the book
       cannot chase"; 2 also catches "our treat will <no verb fits>", where the
       trap is one word further on. Each extra level costs real time. */
    static LOOKAHEAD = 2;


    constructor(pack, pattern) {
      this.pack = pack;
      this.pattern = pattern;
      this.nfa = machineFor(pack, pattern);
      this.ends = pattern.end || DEFAULT_ENDS;
      this.reset();
    }

    /* Every kind of tile that would be a correct pick right now, as { pos } or { word }.
       An exact word is dropped when its whole part of speech is already wanted - "a Does-It
       Word" already covers "eats", so the hints do not list it twice. */
    wants() {
      if (this.wanted) return this.wanted;
      const out = [];
      for (const id of this.states) {
        for (const e of this.nfa.nodes[id].edges) {
          if (!out.some(m => sameMatcher(m, e.m))) out.push(e.m);
        }
      }
      this.wanted = out.filter(m => !m.word || !out.some(o => o.pos && o.pos === posOfWord(this.pack, m.word)));
      return this.wanted;
    }

    /* Content words carry meaning, so saying one twice in a sentence reads as a
       mistake: "purple and purple", "Leo chased Leo", "tiny, tiny pizza". Little
       words like "the" and "and" repeat perfectly naturally, so they are exempt. */
    repeats(word, pos) {
      if (!this.isContent(pos)) return false;
      return this.tokens.some(t => t.word === word && this.isContent(t.pos));
    }

    /* Words that carry meaning. Little words like "the" and "and" repeat
       naturally; so do "is" and "did", which are scaffolding rather than content. */
    isContent(pos) {
      const role = roleOf(this.pack, pos);
      if (role === 'naming' || role === 'describing') return true;
      return role === 'action' && !['be', 'helper', 'negative'].includes(pos);
    }


    /* The naming word this sentence is talking about most recently. */
    lastHead() {
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        if (isHead(this.pack, this.tokens[i].pos)) return this.tokens[i];
      }
      return null;
    }

    /* Everything the coming verb is about. "Her cookie and our bear chew" has
       two subjects and BOTH have to be able to chew - checking only the nearest
       one lets half the nonsense straight through. Collects the naming words
       back to the previous verb, which is where this clause began. */
    subjectHeads() {
      const heads = [];
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        const t = this.tokens[i];
        // "is", "did", "not" are scaffolding - the real subject is behind them,
        // so stopping here would miss it ("your snowflake is learning")
        if (Sentence.SCAFFOLD.includes(t.pos)) continue;
        if (isVerb(this.pack, t.pos)) break;
        if (isHead(this.pack, t.pos)) heads.push(t);
      }
      return heads;
    }

    /* The action word this where-phrase would hang off. */
    lastVerb() {
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        if (isVerb(this.pack, this.tokens[i].pos)) return this.tokens[i];
      }
      return null;
    }

    /* A word still waiting for the thing it applies to - a where-word with no
       noun after it yet, or a doing-to word with nothing done to it yet. */
    openSlot() {
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        const t = this.tokens[i];
        if (isHead(this.pack, t.pos)) return null;        // already filled
        const f = frameOf(this.pack, t.word);
        if (f && f.object) return t;
      }
      return null;
    }

    /* A linking word whose describing word has not arrived yet. */
    openLinking() {
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        const t = this.tokens[i];
        const f = frameOf(this.pack, t.word);
        if (f && f.complement) return t;
        // Step over only what can legitimately sit between a linking verb and
        // its adjective: "smelled TOO happy", "looked happy AND warm". Skipping
        // anything else walks back into an earlier clause and applies the wrong
        // verb's rule to this adjective.
        if (t.pos === 'adjective' || t.pos === 'conjunction' ||
            t.pos === 'adverb' || t.word === 'too') continue;
        return null;
      }
      return null;
    }

    /* Would this word actually mean something here? */
    makesSense(word, pos) {
      const pack = this.pack;

      if (isVerb(pack, pos)) {
        const f = frameOf(pack, word);
        if (!f || !f.subject) return true;
        const heads = this.subjectHeads();
        if (!heads.length) return true;
        return heads.every(h => allowed(f.subject, classesOf(pack, h.word, h.pos)));
      }

      if (isHead(pack, pos)) {
        const open = this.openSlot();
        if (!open) return true;
        const f = frameOf(pack, open.word);
        if (!f || !f.object) return true;
        return allowed(f.object, classesOf(pack, word, pos));
      }

      /* A where-phrase has to suit the verb it hangs off: you can run INTO a
         house, but you cannot buzz onto one. A verb with no "prep" list in the
         pack is left alone, so this can be filled in gradually. */
      if (pos === 'preposition') {
        const verb = this.lastVerb();
        if (!verb) return true;
        const f = frameOf(pack, verb.word);
        if (!f || !f.prep) return true;
        return f.prep.includes(word);
      }

      if (pos === 'adjective') {
        const link = this.openLinking();
        if (!link) return true;
        const f = frameOf(pack, link.word);
        if (!f || !f.complement) return true;
        return allowed(f.complement, classesOf(pack, word, pos));
      }

      return true;
    }

    /* Does this word fit the pattern and make sense, ignoring what comes after? */
    fitsHere(word, pos) {
      if (this.repeats(word, pos)) return false;
      const wanted = this.wants();
      // A word the pattern names outright - the 'to' in "want to swim", the
      // 'and' in a list - is there because the pattern author put it there.
      // Meaning rules must not second-guess it: "want" does not license "to"
      // as a where-word, but "want to swim" is still correct English.
      const spelledOut = wanted.some(m => m.word === word);
      if (!spelledOut && !this.makesSense(word, pos)) return false;
      return wanted.some(m => matches(m, word, pos));
    }

    /* Run fn as if this word had been eaten, then put everything back. */
    tryWith(word, pos, fn) {
      const states = new Set(this.states);
      const tokens = this.tokens.slice();
      const wanted = this.wanted;
      let result = false;
      if (this.step(word, pos)) result = fn();
      this.states = states;
      this.tokens = tokens;
      this.wanted = wanted;
      return result;
    }

    /* Could the sentence still go anywhere after this word?

       Meaning rules can paint a player into a corner: pick "book" as the subject
       of a doing-to sentence and no action word can follow, because books do not
       chase anyone. The shape is legal, the meaning is not, and the player is
       stranded. So only offer a word if something can legally come after it. */
    leadsSomewhere(word, pos, depth) {
      if (depth === undefined) depth = Sentence.LOOKAHEAD;
      return this.tryWith(word, pos, () => {
        if (this.canEnd()) return true;
        // Only look at parts of speech the pattern could actually want next.
        // Scanning the whole word bank here costs 600+ checks per candidate and
        // makes a big pack crawl.
        const need = new Set();
        for (const m of this.wants()) {
          if (m.pos) { need.add(m.pos); continue; }
          // a literal like 'and' - check the actual word, do not just assume it
          const lp = posOfWord(this.pack, m.word);
          if (!lp) return true;
          if (this.fitsHere(m.word, lp) &&
              (depth <= 1 || this.leadsSomewhere(m.word, lp, depth - 1))) return true;
        }
        for (const p of need) {
          const list = this.pack.words[p];
          if (!list) continue;
          for (const w of list) {
            if (!this.fitsHere(w, p)) continue;
            if (depth <= 1 || this.leadsSomewhere(w, p, depth - 1)) return true;
          }
        }
        return false;
      });
    }

    /* Would this word be a correct pick right now? */
    fits(word, pos) {
      return this.fitsHere(word, pos) && this.leadsSomewhere(word, pos);
    }

    /* The parts of speech that would be a correct pick right now. */
    allowedPos() {
      const out = [];
      for (const m of this.wants()) {
        const pos = m.pos || posOfWord(this.pack, m.word);
        if (pos && !out.includes(pos)) out.push(pos);
      }
      return out;
    }

    /* True once the sentence stands on its own, so punctuation may finish it (Req 6). */
    canEnd() { return this.states.has(this.nfa.accept); }

    /* Which ending marks suit this sentence: questions take "?", statements "." or "!". */
    endMarks() { return this.ends.slice(); }

    isComplete() { return this.punctuation !== null; }

    /* Try to add a word. Returns true if it fit the pattern. */
    /* Move the sentence on by one word, checking shape and meaning but without
       looking ahead. Used while exploring; accept() is the real door in. */
    step(word, pos) {
      if (this.repeats(word, pos)) return false;
      if (!this.wants().some(m => m.word === word) && !this.makesSense(word, pos)) return false;
      const next = [];
      for (const id of this.states) {
        for (const e of this.nfa.nodes[id].edges) if (matches(e.m, word, pos)) next.push(e.to);
      }
      if (!next.length) return false;
      this.tokens.push({ word, pos });
      this.states = closure(this.nfa, next);
      this.wanted = null;
      return true;
    }

    accept(word, pos) {
      if (!this.fits(word, pos)) return false;
      return this.step(word, pos);
    }

    /* Req 5: a wall bonk wipes the sentence and hands the words back.
       Same pattern, fresh start - the player gets to try it again. */
    reset() {
      const lost = (this.tokens || []).slice();
      this.tokens = [];        // [{ word, pos }]
      this.states = closure(this.nfa, [this.nfa.start]);
      this.wanted = null;      // what wants() worked out for the old states
      this.punctuation = null;
      return lost;
    }

    end(mark) {
      if (!this.canEnd() || this.tokens.length === 0) return false;
      if (!this.ends.includes(mark)) return false;
      this.punctuation = mark;
      return true;
    }

    /* Build the display string: commas hug the word before them, "a" becomes "an" before a
       vowel, and the first word gets a capital letter. */
    text() {
      const words = this.tokens.map(t => t.word);
      for (let i = 0; i < words.length; i++) {
        if (words[i] !== 'a') continue;
        const next = words.slice(i + 1).find(w => w !== ',');
        if (next && VOWELS.includes(next[0].toLowerCase())) words[i] = 'an';
      }
      if (words.length === 0) return '';
      let s = '';
      words.forEach((w, i) => { s += (i === 0 || w === ',') ? w : ' ' + w; });
      s = s[0].toUpperCase() + s.slice(1);
      return s + (this.punctuation || '');
    }

    /* Shortest list of things still to eat before the sentence can end - a 0-1 search over the
       machine, where free edges cost nothing and eating a word costs one. */
    shortestRest() {
      const best = new Map();
      const deque = [];
      for (const id of this.states) { best.set(id, []); deque.push(id); }
      while (deque.length) {
        const id = deque.shift();
        const path = best.get(id);
        if (id === this.nfa.accept) return path;
        const n = this.nfa.nodes[id];
        for (const to of n.free) {
          if (!best.has(to) || best.get(to).length > path.length) { best.set(to, path); deque.unshift(to); }
        }
        for (const e of n.edges) {
          const p = path.concat([e.m]);
          if (!best.has(e.to) || best.get(e.to).length > p.length) { best.set(e.to, p); deque.push(e.to); }
        }
      }
      return [];
    }

    /* A little roadmap for the HUD: the words eaten so far, then the quickest way to finish. */
    outline() {
      const out = this.tokens.map(t => ({ pos: t.pos, word: t.word, state: 'done' }));
      if (this.isComplete()) return out;
      this.shortestRest().forEach((m, i) => {
        out.push({ pos: m.pos || posOfWord(this.pack, m.word), word: null, literal: m.word || null,
                   state: i === 0 ? 'next' : 'todo' });
      });
      return out;
    }
  }

  /* Word -> part of speech, built once per pack (a word lives in only one list). */
  const posIndex = new WeakMap();
  function posOfWord(pack, word) {
    let index = posIndex.get(pack.words);
    if (!index) {
      index = new Map();
      for (const pos of Object.keys(pack.words)) {
        for (const w of pack.words[pos]) if (!index.has(w)) index.set(w, pos);
      }
      posIndex.set(pack.words, index);
    }
    return index.get(word) || null;
  }

  /* Checks a pack and returns a list of problems (empty means all good). */
  function checkPack(pack) {
    const problems = [];
    const owner = {};
    for (const pos of Object.keys(pack.words)) {
      if (!pack.pos[pos]) problems.push('words.' + pos + ' has no entry in "pos"');
      for (const w of pack.words[pos]) {
        if (owner[w]) problems.push('"' + w + '" is listed as both ' + owner[w] + ' and ' + pos);
        owner[w] = pos;
      }
    }
    const marks = (pack.punctuation || []).map(p => p.mark);
    for (const pattern of pack.patterns) {
      let tree;
      try { tree = parse(shapeOf(pattern), pack.rules); } catch (err) { problems.push(err.message); continue; }
      const walk = n => {
        if (n.t === 'pos' && !(pack.words[n.pos] || []).length) {
          problems.push('pattern "' + pattern.id + '" needs a ' + n.pos + ' but the pack has none');
        }
        if (n.t === 'word' && !owner[n.word]) {
          problems.push('pattern "' + pattern.id + '" needs the word "' + n.word + '", which is not in any word list');
        }
        (n.items || n.opts || []).forEach(walk);
        if (n.x) walk(n.x);
      };
      walk(tree);
      for (const m of pattern.end || DEFAULT_ENDS) {
        if (!marks.includes(m)) problems.push('pattern "' + pattern.id + '" ends with "' + m + '", which is not in "punctuation"');
      }
    }
    // Every verb form must reach a frame, or the meaning checks quietly stop
    // applying to it. Scaffolding verbs (be / helper / negative) carry no
    // meaning of their own, so they are exempt.
    const SCAFFOLD = ['be', 'helper', 'negative'];
    const sem = pack.semantics;
    if (sem && sem.frames) {
      const lemma = sem.lemma || {};
      for (const pos of Object.keys(pack.pos)) {
        if (SCAFFOLD.includes(pos)) continue;
        const fam = pack.families && pack.families[pack.pos[pos].family];
        if (!fam || fam.role !== 'action') continue;
        for (const w of pack.words[pos] || []) {
          const base = lemma[w] || w;
          if (!sem.frames[base]) problems.push('no meaning rule for the verb "' + w + '"');
        }
      }
    }

    return problems;
  }

  BW.Grammar = {
    slotPos,
    slotOptional,
    parse,
    shapeOf,
    checkPack,
    posOfWord,
    newSentence(pack, rng) {

      // patterns may carry a "weight" to show up more (or less) often than the rest
      const total = pack.patterns.reduce((sum, p) => sum + (p.weight || 1), 0);
      let r = rng.int(1000000) / 1000000 * total;
      for (const p of pack.patterns) {
        r -= p.weight || 1;
        if (r < 0) return new Sentence(pack, p);
      }
      return new Sentence(pack, pack.patterns[pack.patterns.length - 1]);
    }
  };
})();
