/* Grammar engine.
   A pattern describes a sentence shape in a tiny language, for example

       "adverb , <subject> verb ( preposition <thing> )?"

   - a word like `noun` or `verb` is a part of speech from the pack - eat any word of that kind
   - `,` is a comma the player has to eat, just like a word
   - `'and'` in quotes means that exact word (use double quotes for a word with an apostrophe: "can't")
   - `<subject>` pulls in a reusable phrase from the pack's `rules`
   - `( ... )` groups things, and `a | b` inside a group means "either a or b"
   - after a part or a group: `?` optional, `*` any number of times, `+` one or more times

   Each shape is turned into a little state machine. A sentence runs every shape in the topic
   side by side while the player eats: any word goes onto the worm, and each machine says
   whether the words so far could still become a sentence of its shape. The strip, the hints
   and the checker (js/checker.js) are all built on that. Nothing here decides whether a
   finished sentence is right - the checker does, when punctuation is eaten (Req 4, Req 6).
   The old list form, ["determiner", "adjective?", "noun"], still works too. */
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

  /* A shape that is just a row of parts, some optional - "determiner adjective? noun verb" -
     can be shown to a player slot by slot. Anything fancier returns null and is shown by
     its quickest route instead. */
  function slotsOf(tree) {
    const items = tree.t === 'seq' ? tree.items : [tree];
    const out = [];
    for (const n of items) {
      const optional = n.t === 'opt';
      const x = optional ? n.x : n;
      if (x.t === 'pos') out.push({ pos: x.pos, optional });
      else if (x.t === 'word') out.push({ word: x.word, optional });
      else return null;
    }
    return out;
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

  /* Move a machine on by one word. An empty set means the word does not fit. */
  function advance(nfa, states, word, pos) {
    const next = [];
    for (const id of states) {
      for (const e of nfa.nodes[id].edges) if (matches(e.m, word, pos)) next.push(e.to);
    }
    return closure(nfa, next);
  }

  /* Shortest list of things still to eat before a machine can stop - a 0-1 search, where
     free edges cost nothing and eating a word costs one. */
  function shortestRest(nfa, states) {
    const best = new Map();
    const deque = [];
    for (const id of states) { best.set(id, []); deque.push(id); }
    while (deque.length) {
      const id = deque.shift();
      const path = best.get(id);
      if (id === nfa.accept) return path;
      const n = nfa.nodes[id];
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

  const compiled = new WeakMap();
  function machineFor(pack, pattern) {
    let entry = compiled.get(pattern);
    if (!entry) {
      const tree = parse(shapeOf(pattern), pack.rules);
      entry = compile(tree);
      entry.slots = slotsOf(tree);
      compiled.set(pattern, entry);
    }
    return entry;
  }

  /* One track per shape in the topic: the shape, its machine, and the states it is in. */
  function freshTracks(pack) {
    return pack.patterns.map(pattern => {
      const nfa = machineFor(pack, pattern);
      return { pattern, nfa, states: closure(nfa, [nfa.start]) };
    });
  }

  /* Every kind of tile the given tracks could take next, as { pos } or { word }. An exact
     word is dropped when its whole part of speech is already wanted - "a Verb" already
     covers "is", so the hints do not list it twice. */
  function wantedBy(pack, tracks) {
    const out = [];
    for (const t of tracks) {
      for (const id of t.states) {
        for (const e of t.nfa.nodes[id].edges) {
          if (!out.some(m => sameMatcher(m, e.m))) out.push(e.m);
        }
      }
    }
    return out.filter(m => !m.word || !out.some(o => o.pos && o.pos === posOfWord(pack, m.word)));
  }

  /* A family's label is for the player and can be renamed at will. Its ROLE (naming, action,
     describing) is what the rules key off, so renaming "Noun" cannot switch them off. */
  function roleOf(pack, pos) {
    const info = pack.pos && pack.pos[pos];
    const fam = info && pack.families && pack.families[info.family];
    return (fam && fam.role) || (info && info.family);
  }

  class Sentence {
    /* Verbs that carry no meaning of their own - they prop up a real verb. */
    static SCAFFOLD = ['be', 'helper', 'negative'];

    constructor(pack, pattern) {
      this.pack = pack;
      this.pattern = pattern;    // the shape on the strip: the recipe the player was handed
      this.reset();
    }

    /* Req 5: a wall bonk wipes the sentence and hands the words back. Same recipe, fresh
       start - the player gets to try it again. */
    reset() {
      const lost = (this.tokens || []).slice();
      this.tokens = [];          // [{ word, pos }] - everything eaten, whether it fits or not
      this.tracks = freshTracks(this.pack);
      this.wanted = null;        // what wants() worked out for the current states
      this.punctuation = null;
      return lost;
    }

    /* Free building: every word goes onto the worm. A shape the words no longer fit drops
       out quietly; whether the sentence is right is decided when it is checked. */
    add(word, pos) {
      this.tokens.push({ word, pos });
      for (const t of this.tracks) t.states = advance(t.nfa, t.states, word, pos);
      this.wanted = null;
    }

    /* Guided building, for the tests: add the word only if it keeps the sentence on track. */
    accept(word, pos) {
      if (!this.fits(word, pos)) return false;
      this.add(word, pos);
      return true;
    }

    /* The shapes the words so far could still turn into. */
    live() { return this.tracks.filter(t => t.states.size > 0); }

    onTrack() { return this.live().length > 0; }

    /* The shape to steer the player by: the recipe they were handed while the words still
       fit it, otherwise whichever other shape the words have turned into. */
    guide() {
      const live = this.live();
      return live.find(t => t.pattern === this.pattern) || live[0] || null;
    }

    /* The shapes the words already make a whole sentence of, the recipe first. */
    complete() {
      return this.tracks
        .filter(t => t.states.has(t.nfa.accept))
        .sort((a, b) => (b.pattern === this.pattern) - (a.pattern === this.pattern));
    }

    /* True once the words stand on their own as a sentence of some shape (Req 6). */
    canEnd() { return this.tokens.length > 0 && this.complete().length > 0; }

    /* Which ending marks suit this sentence: questions take "?", statements "." or "!". */
    endMarks() {
      const t = this.complete()[0] || this.guide();
      return ((t && t.pattern.end) || DEFAULT_ENDS).slice();
    }

    isComplete() { return this.punctuation !== null; }

    /* Every kind of tile that would keep the sentence on track right now. */
    wants() {
      if (!this.wanted) {
        const g = this.guide();
        this.wanted = wantedBy(this.pack, this.live().sort((a, b) => (b === g) - (a === g)));
      }
      return this.wanted;
    }

    /* The parts of speech that would keep the sentence on track right now. */
    allowedPos() {
      const out = [];
      for (const m of this.wants()) {
        const pos = m.pos || posOfWord(this.pack, m.word);
        if (pos && !out.includes(pos)) out.push(pos);
      }
      return out;
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
      return role === 'action' && !Sentence.SCAFFOLD.includes(pos);
    }

    /* A word the topic says cannot share a sentence with one already in it - "tall" after
       "small", "quickly" after "waited". The pack lists them as [word, word, reason]. */
    clashWith(word) {
      for (const c of this.pack.clashes || []) {
        const i = c.indexOf(word);
        if (i !== 0 && i !== 1) continue;
        if (this.tokens.some(t => t.word === c[1 - i])) return { other: c[1 - i], why: c[2] || '' };
      }
      return null;
    }

    /* A capital letter starts a sentence, and a small one goes in the middle - so "The"
       and "the" are both tiles, and only one of them is right at any point. A name, or "I",
       keeps its capital anywhere (mark a name's list "proper" in the pack). */
    capitalFits(word, pos, at) {
      const capital = word[0] !== word[0].toLowerCase();
      if (at === 0) return capital;
      return !capital || word === 'I' || !!(this.pack.pos[pos] && this.pack.pos[pos].proper);
    }

    /* Would eating this word keep the sentence on track? That is what the hints outline. */
    fits(word, pos) {
      if (this.repeats(word, pos) || this.clashWith(word)) return false;
      if (!this.capitalFits(word, pos, this.tokens.length)) return false;
      return this.leadsOn(word, pos);
    }

    /* After this word, is there still a way on? Words that clash can paint a sentence into a
       corner - "A goalie swam across a muddy..." can only end at a pool, and a pool is never
       muddy - so the hints look one word ahead. Cheap: it only checks the next word's rules
       (repeats, clashes, capitals), not where that word would lead. */
    leadsOn(word, pos) {
      const after = this.live()
        .map(t => ({ pattern: t.pattern, nfa: t.nfa, states: advance(t.nfa, t.states, word, pos) }))
        .filter(t => t.states.size > 0);
      if (!after.length) return false;
      if (after.some(t => t.states.has(t.nfa.accept))) return true;
      this.tokens.push({ word, pos });
      try {
        for (const m of wantedBy(this.pack, after)) {
          const p = m.pos || posOfWord(this.pack, m.word);
          for (const w of m.word ? [m.word] : (this.pack.words[m.pos] || [])) {
            if (!this.repeats(w, p) && !this.clashWith(w) && this.capitalFits(w, p, this.tokens.length)) return true;
          }
        }
        return false;
      } finally {
        this.tokens.pop();
      }
    }

    /* Replay the words from the start and find the first one no shape could take.
       `at` is its index (-1 when every word fits), `wanted` is what the shapes could have
       taken there instead, and `finished` says the words before it were already a whole
       sentence - the player just kept eating. The checker builds its explanation on this. */
    trace() {
      let tracks = freshTracks(this.pack);
      for (let i = 0; i < this.tokens.length; i++) {
        const { word, pos } = this.tokens[i];
        const next = tracks
          .map(t => ({ pattern: t.pattern, nfa: t.nfa, states: advance(t.nfa, t.states, word, pos) }))
          .filter(t => t.states.size > 0);
        if (!next.length) {
          return { at: i, wanted: wantedBy(this.pack, tracks),
                   finished: i > 0 && tracks.some(t => t.states.has(t.nfa.accept)) };
        }
        tracks = next;
      }
      return { at: -1, wanted: wantedBy(this.pack, tracks), finished: false };
    }

    /* Finish the sentence with a mark. Called once the checker has said it is right. */
    end(mark) {
      if (this.tokens.length === 0) return false;
      this.punctuation = mark;
      return true;
    }

    /* The words as they read: "a" becomes "an" before a vowel. Capital letters are left
       exactly as the tiles have them - a sentence that starts with a small letter is
       something for the checker to point out, not something to quietly fix. */
    displayWords() {
      const words = this.tokens.map(t => t.word);
      // Determiners are capitalised in the word lists because they open the sentence,
      // so "A" has to be handled as well as "a".
      for (let i = 0; i < words.length; i++) {
        if (words[i] !== 'a' && words[i] !== 'A') continue;
        const next = words.slice(i + 1).find(w => w !== ',');
        if (next && VOWELS.includes(next[0].toLowerCase())) {
          words[i] = words[i] === 'A' ? 'An' : 'an';
        }
      }
      return words;
    }

    /* The display string: commas hug the word before them, then the ending mark. With no
       mark given, the one the sentence was finished with (if any). */
    text(mark) {
      let s = '';
      this.displayWords().forEach((w, i) => { s += (i === 0 || w === ',') ? w : ' ' + w; });
      return s + (mark === undefined ? (this.punctuation || '') : mark);
    }

    /* A little roadmap for the HUD: the words eaten so far, then what the guide shape
       still has room for. A shape that is a plain row of slots shows every slot left,
       optional ones included, so the player can see where an Adjective could still go;
       a fancier shape shows its quickest way to the end. Off track, just the words. */
    outline() {
      const out = this.tokens.map(t => ({ pos: t.pos, word: t.word, state: 'done' }));
      const g = this.guide();
      if (this.isComplete() || !g) return out;

      const slot = (m, optional) => ({ pos: m.pos || posOfWord(this.pack, m.word), word: null,
                                       literal: m.word || null, optional });
      const rest = g.nfa.slots ? this.slotsLeft(g.nfa.slots).map(s => slot(s, s.optional))
                               : shortestRest(g.nfa, g.states).map(m => slot(m, false));
      // everything up to and including the first slot that must be filled could come next
      let next = true;
      for (const r of rest) {
        out.push({ ...r, state: next ? 'next' : 'todo' });
        if (!r.optional) next = false;
      }
      return out;
    }

    /* Line the words up against a plain row of slots and return the slots still ahead.
       Only called while the words fit the shape, so every word finds its slot. */
    slotsLeft(slots) {
      let k = 0;
      for (const t of this.tokens) {
        while (k < slots.length && !matches(slots[k], t.word, t.pos)) k++;
        k++;
      }
      return slots.slice(Math.min(k, slots.length));
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
    for (const c of pack.clashes || []) {
      for (const w of c.slice(0, 2)) {
        if (!owner[w]) problems.push('clash "' + c[0] + '" / "' + c[1] + '" names "' + w + '", which is not in any word list');
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
      // The checker wants a capital letter on the first word, and it only has the tiles to
      // go on - so a shape that can open with a lower-case tile could never be right.
      const nfa = compile(tree);
      const firsts = [];
      for (const id of closure(nfa, [nfa.start])) {
        for (const e of nfa.nodes[id].edges) firsts.push(...(e.m.word ? [e.m.word] : (pack.words[e.m.pos] || [])));
      }
      if (!firsts.some(w => w[0] !== w[0].toLowerCase())) {
        problems.push('pattern "' + pattern.id + '" can only start with a word that has no capital letter, ' +
                      'so the checker would never pass it');
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
    roleOf,
    isScaffold: pos => Sentence.SCAFFOLD.includes(pos),
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
