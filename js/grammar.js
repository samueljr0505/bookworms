/* Grammar engine.
   A pattern describes a sentence shape in a tiny language, for example

       "adverb , <subject> verb ( preposition <thing> )?"

   - a word like `noun` or `verb` is a part of speech from the pack - eat any word of that kind
   - `,` is a comma the player has to eat, just like a word
   - `'and'` in quotes means that exact word
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
    const re = /\s*(?:(<[\w-]+>)|'([^']+)'|([A-Za-z][\w-]*)|([(),|?*+]))/y;
    let m;
    re.lastIndex = 0;
    while (re.lastIndex < src.length) {
      const at = re.lastIndex;
      if (/^\s*$/.test(src.slice(at))) break;
      m = re.exec(src);
      if (!m) throw new Error('Pattern "' + src + '": do not understand "' + src.slice(at).trim() + '"');
      if (m[1]) out.push({ t: 'rule', v: m[1].slice(1, -1) });
      else if (m[2]) out.push({ t: 'word', v: m[2] });
      else if (m[3]) out.push({ t: 'pos', v: m[3] });
      else out.push({ t: m[4] });
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

  class Sentence {
    constructor(pack, pattern) {
      this.pack = pack;
      this.pattern = pattern;
      this.nfa = machineFor(pack, pattern);
      this.ends = pattern.end || DEFAULT_ENDS;
      this.reset();
    }

    /* Every kind of tile that would be a correct pick right now, as { pos } or { word }. */
    wants() {
      const out = [];
      for (const id of this.states) {
        for (const e of this.nfa.nodes[id].edges) {
          if (!out.some(m => sameMatcher(m, e.m))) out.push(e.m);
        }
      }
      return out;
    }

    /* Would this word be a correct pick right now? */
    fits(word, pos) { return this.wants().some(m => matches(m, word, pos)); }

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
    accept(word, pos) {
      const next = [];
      for (const id of this.states) {
        for (const e of this.nfa.nodes[id].edges) if (matches(e.m, word, pos)) next.push(e.to);
      }
      if (!next.length) return false;
      this.tokens.push({ word, pos });
      this.states = closure(this.nfa, next);
      return true;
    }

    /* Req 5: a wall bonk wipes the sentence and hands the words back.
       Same pattern, fresh start - the player gets to try it again. */
    reset() {
      const lost = (this.tokens || []).slice();
      this.tokens = [];        // [{ word, pos }]
      this.states = closure(this.nfa, [this.nfa.start]);
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

  function posOfWord(pack, word) {
    for (const pos of Object.keys(pack.words)) if (pack.words[pos].includes(word)) return pos;
    return null;
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
