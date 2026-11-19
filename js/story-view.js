/* The story screen: the story's sentences, as cards, in a Beginning, a Middle and an End.
   Each sentence was built for an objective (introduce a character, a problem...), so it
   starts out in the part its objective belongs to, tagged with it - and the player can still
   change the order, move a card to another part, or leave it out. A card is dragged (mouse,
   finger or pen - pointer events, so a classroom iPad works too) or tapped and then put in a
   part with that part's "Put it here" button. A card in a part can take a joining word in
   front. Cards in "Left out" are not in the story.

   The words are the ones the player built with the worm, and they stay - only a determiner
   can be swapped, from a little menu on the word ("A duck" -> "The duck"). Tips under the
   cards (js/story.js) point out what makes the story sound awkward - meeting "a duck" who is
   already in it, the same joining word twice - with a fix where there is one. Then the story
   is read back, and saved.

   A story can also need a sentence the worm never made - something to get from one event to
   the next. ＋ opens a little sentence builder in that spot: the topic's words as tiles, and
   the game's own rules - a word that does not fit is refused, with the game's reason, and an
   end mark finishes it. So every sentence in the story is still built, word by word. When
   the topic's words are not enough, the player can add their own to the bank - a word and
   what kind of word it is - and it goes by the same rules. Joining words can be typed too.

   Everything here is shown with textContent - the sentences are the player's own words. */
window.BW = window.BW || {};

BW.StoryView = (function () {
  const $ = id => document.getElementById(id);
  const AREAS = ['tray', 'beginning', 'middle', 'end'];

  let st = null;          // the story being made: cards, where they are, what is picked
  let drag = null;        // a card being dragged

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function areaOf(id) { return AREAS.find(a => st.places[a].includes(id)); }

  /* The story so far, for js/story.js: each part's sentences with their joining words. */
  function parts() {
    const out = {};
    for (const p of BW.Story.PARTS) out[p.id] = st.places[p.id].map(id => st.cards[id]);
    return out;
  }

  /* Move a card to an area, at a position among the cards already there. A joining word
     that does not suit its new part is dropped ("Finally" does not start a story). */
  function move(id, area, index) {
    for (const a of AREAS) st.places[a] = st.places[a].filter(x => x !== id);
    const list = st.places[area];
    list.splice(index === undefined ? list.length : Math.max(0, Math.min(index, list.length)), 0, id);
    const card = st.cards[id];
    // a joining word the player typed goes wherever the card goes
    if (area === 'tray' || (!card.ownJoiner && !BW.Story.JOINERS[area].includes(card.joiner))) card.joiner = '';
    st.picked = null;
    render();
  }

  /* The sentence as it reads on its card - with a joining word in front it carries on in
     small letters - and every determiner a little menu of the topic's determiners. The other
     words are the worm's, and stay as they are. */
  function sentenceEl(card) {
    const line = el('span', 'story-line');
    const words = card.text.split(' ');
    const spots = new Set(BW.Story.determinersIn(card.text, st.dets));
    words.forEach((word, i) => {
      if (i > 0) line.append(' ');
      const small = i === 0 && card.joiner && word !== 'I';
      const shown = small ? word.charAt(0).toLowerCase() + word.slice(1) : word;
      if (!spots.has(i)) { line.append(shown); return; }
      const sel = el('select', 'story-det');
      sel.setAttribute('aria-label', 'Change "' + shown + '"');
      sel.title = 'Change this word';
      const capital = /^[A-Z]/.test(shown);
      const vowel = /^[aeiou]/i.test(words[i + 1] || '');
      for (const d of st.dets) {
        const label = d === 'a' && vowel ? 'an' : d;
        sel.append(Object.assign(el('option', '', capital ? label.charAt(0).toUpperCase() + label.slice(1) : label),
                                 { value: d }));
      }
      sel.value = word.toLowerCase() === 'an' ? 'a' : word.toLowerCase();
      sel.addEventListener('change', () => {
        card.text = BW.Story.setDeterminer(card.text, i, sel.value);
        render();
      });
      line.append(sel);
    });
    return line;
  }

  /* ---------- building a new sentence ---------- */

  /* The builder sits after a card (`after`), or at the top of its part - so it moves along if
     cards are dragged about while it is open. */
  function openBuilder(area, after) {
    st.builder = { area, after, sentence: BW.Grammar.newSentence(st.pack, BW.rng), no: '', hints: false,
                   ownOpen: false, ownWord: '', ownPos: 'noun', ownWhy: '' };
    st.picked = null;
    render();
    const box = document.querySelector('.story-builder');
    if (box) { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); box.focus(); }
  }

  /* A tile was tapped: in it goes if it fits where the sentence is up to - the same check the
     worm makes - and an end mark finishes the sentence, which joins the story right there. */
  function tap(word, pos) {
    const b = st.builder;
    const no = BW.Checker.refuse(st.pack, b.sentence, word, pos);
    if (no) { b.no = no.reason; BW.Sound.hmm(); render(); return; }
    b.no = '';
    if (pos !== 'punctuation') {
      b.sentence.add(word, pos);
      BW.Sound.eat();
      render();
      return;
    }
    const report = BW.Checker.check(st.pack, b.sentence, word);
    if (report.verdict !== 'correct') { b.no = report.headline; render(); return; }
    b.sentence.end(word);
    const id = 'n' + (++st.made);
    const text = b.sentence.text();
    st.cards[id] = { id, text, original: text, goal: '', added: true, joiner: '' };
    const spot = builderSpot();
    st.places[spot.area].splice(spot.index, 0, id);
    st.builder = null;
    BW.Sound.sentence();
    render();
  }

  /* A word of the player's own joins the bank - this story's copy of it - in the list for its
     kind, so it fits wherever that kind of word fits. */
  function addOwnWord() {
    const b = st.builder;
    const { word, why } = BW.Story.checkOwnWord(st.pack, b.ownWord);
    b.ownWhy = why;
    if (!why) {
      st.pack.words[b.ownPos].push(word);
      st.own.add(word);
      if (familyOf(b.ownPos) === 'noun') st.nouns.add(word);
      b.ownOpen = false;
      b.ownWord = '';
      b.no = '';
    }
    render();
    if (why) { const box = document.querySelector('.story-own input'); if (box) box.focus(); }
  }

  /* The little form for a word of the player's own: the word, and what kind of word it is. */
  function ownWordEl() {
    const b = st.builder;
    const kinds = BW.Story.ownKinds(st.pack);
    if (!kinds.some(k => k.pos === b.ownPos)) b.ownPos = kinds[0].pos;
    const kind = kinds.find(k => k.pos === b.ownPos);
    const form = el('div', 'story-own');
    form.append(el('b', '', 'Add your own word'));
    const box = el('input');
    box.maxLength = 16;
    box.autocomplete = 'off';
    box.placeholder = 'like "' + kind.like + '"';
    box.value = b.ownWord;
    box.setAttribute('aria-label', 'Your word');
    box.addEventListener('input', () => { b.ownWord = box.value; });
    box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOwnWord(); } });
    const sel = el('select');
    sel.setAttribute('aria-label', 'What kind of word is it?');
    for (const k of kinds) sel.append(Object.assign(el('option', '', k.label), { value: k.pos }));
    sel.value = b.ownPos;
    sel.addEventListener('change', () => { b.ownPos = sel.value; render(); });
    const add = el('button', 'primary', 'Add it');
    add.type = 'button';
    add.addEventListener('click', addOwnWord);
    form.append(box, sel, add);
    if (b.ownWhy) form.append(el('span', 'story-builder-no', b.ownWhy));
    return form;
  }

  /* Take the last word back out. */
  function untap() {
    const b = st.builder;
    const keep = b.sentence.tokens.slice(0, -1);
    b.sentence = BW.Grammar.newSentence(st.pack, BW.rng);
    for (const t of keep) b.sentence.add(t.word, t.pos);
    b.no = '';
    render();
  }

  function builderSpot() {
    const b = st.builder;
    const area = b.after && areaOf(b.after) !== 'tray' ? areaOf(b.after) : b.area;
    return { area, index: b.after && area === areaOf(b.after) ? st.places[area].indexOf(b.after) + 1 : 0 };
  }

  const familyOf = pos => (st.pack.pos[pos] && st.pack.pos[pos].family) || pos;
  const labelOf = fam => (st.pack.families && st.pack.families[fam] && st.pack.families[fam].label) || fam;
  const colorOf = fam => fam === 'punctuation' ? '#f5c26b'
    : (st.pack.families && st.pack.families[fam] && st.pack.families[fam].color) || '#9aa7d7';

  /* The builder: the sentence so far, what comes next, why a word was refused, and every word
     of the topic, grouped by kind in the game's colours. */
  function builderEl() {
    const b = st.builder;
    const s = b.sentence;
    const li = el('li', 'story-builder');
    li.tabIndex = -1;
    const head = el('header', 'story-part-head');
    head.append(el('h3', '', '✨ Build a new sentence'), el('small', '', 'Tap the words in order, then an end mark.'));
    li.append(head);

    const line = el('p', 'story-builder-line');
    if (!s.tokens.length) line.append(el('span', 'story-builder-empty', 'Tap a word to start...'));
    for (const t of s.tokens) {
      const w = el('span', 'story-tile done', t.word);
      w.style.background = colorOf(familyOf(t.pos));
      line.append(w);
    }
    li.append(line);

    // what to look for next, in the game's words
    const kinds = [...new Set(s.wants().map(m => labelOf(familyOf(m.pos || BW.Grammar.posOfWord(st.pack, m.word)))))];
    const next = kinds.map(k => (/^[AEIOU]/.test(k) ? 'an ' : 'a ') + k);
    if (s.canEnd()) next.push('an end mark (' + s.endMarks().join(' ') + ') to finish');
    li.append(el('p', 'story-builder-next', next.length ? 'Next: ' + next.join(' or ') : ''));
    if (b.no) li.append(el('p', 'story-builder-no', b.no));

    const bank = el('div', 'story-bank');
    const groups = new Map();
    for (const pos of Object.keys(st.pack.words)) {
      const fam = familyOf(pos);
      if (!groups.has(fam)) groups.set(fam, []);
      for (const word of st.pack.words[pos]) groups.get(fam).push({ word, pos });
    }
    groups.set('punctuation', st.pack.punctuation.map(p => ({ word: p.mark, pos: 'punctuation' })));
    for (const [fam, items] of groups) {
      const row = el('div', 'story-bank-row');
      row.append(el('small', '', fam === 'punctuation' ? 'End mark' : labelOf(fam)));
      for (const { word, pos } of items) {
        const fits = pos === 'punctuation' ? s.canEnd() && s.endMarks().includes(word) : s.fits(word, pos);
        const tile = el('button', 'story-tile' + (b.hints && fits ? ' fits' : '') + (st.own.has(word) ? ' own' : ''),
                        (st.own.has(word) ? '✨ ' : '') + word);
        tile.setAttribute('aria-label', word);
        tile.type = 'button';
        tile.style.borderColor = colorOf(fam);
        tile.addEventListener('click', () => tap(word, pos));
        row.append(tile);
      }
      bank.append(row);
    }
    li.append(bank);
    if (b.ownOpen) li.append(ownWordEl());

    const foot = el('div', 'story-builder-buttons');
    const back = el('button', '', '⌫ Take back a word');
    back.type = 'button';
    back.disabled = !s.tokens.length;
    back.addEventListener('click', untap);
    const hints = el('button', '', b.hints ? 'Hints: on' : 'Hints: off');
    hints.type = 'button';
    hints.title = 'Outline the words that fit next';
    hints.addEventListener('click', () => { b.hints = !b.hints; render(); });
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { st.builder = null; render(); });
    const own = el('button', '', b.ownOpen ? 'Close my own word' : '＋ My own word');
    own.type = 'button';
    own.title = 'Not in the word bank? Add your own word';
    own.addEventListener('click', () => {
      b.ownOpen = !b.ownOpen;
      b.ownWhy = '';
      render();
      const box = document.querySelector('.story-own input');
      if (box) box.focus();
    });
    foot.append(back, own, hints, cancel);
    li.append(foot);
    return li;
  }

  const OWN = '\u0000own';     // the "My own..." choice in a joining-word menu

  /* Typing a joining word of the player's own, in place of the menu. */
  function joinerBoxEl(card) {
    const wrap = el('span', 'story-joiner-box');
    const box = el('input');
    box.maxLength = 30;
    box.autocomplete = 'off';
    box.placeholder = 'e.g. Luckily';
    box.value = card.joinerDraft;
    box.setAttribute('aria-label', 'Your own joining word');
    const done = () => {
      const { text, why } = BW.Story.checkJoiner(card.joinerDraft);
      card.joinerWhy = why;
      if (!why) { card.joiner = text; card.ownJoiner = true; card.typingJoiner = false; }
      render();
      if (why) { const again = document.querySelector('.story-card[data-id="' + card.id + '"] .story-joiner-box input'); if (again) again.focus(); }
    };
    box.addEventListener('input', () => { card.joinerDraft = box.value; });
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); done(); }
      if (e.key === 'Escape') { e.preventDefault(); card.typingJoiner = false; render(); }
    });
    const ok = el('button', '', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', done);
    wrap.append(box, ok);
    if (card.joinerWhy) wrap.append(el('span', 'story-edit-why', card.joinerWhy));
    return wrap;
  }

  /* ---------- drawing ---------- */

  function cardEl(id, area) {
    const card = st.cards[id];
    const li = el('li', 'story-card' + (st.picked === id ? ' picked' : ''));
    li.dataset.id = id;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-pressed', st.picked === id ? 'true' : 'false');
    li.setAttribute('aria-label', card.text + (area === 'tray' ? '' : ' (in the ' + area + ')') +
                    '. Press Enter to pick it up.');
    li.append(el('span', 'story-grip', '⠿'));

    if (area !== 'tray' && card.typingJoiner) li.append(joinerBoxEl(card));
    else if (area !== 'tray') {
      const sel = el('select', 'story-joiner');
      sel.setAttribute('aria-label', 'Joining word');
      sel.append(Object.assign(el('option', '', '+ joining word'), { value: '' }));
      const list = BW.Story.JOINERS[area].slice();
      if (card.ownJoiner && card.joiner && !list.includes(card.joiner)) list.unshift(card.joiner);
      for (const j of list) sel.append(Object.assign(el('option', '', j + ','), { value: j }));
      sel.append(Object.assign(el('option', '', '✏️ My own...'), { value: OWN }));
      sel.value = card.joiner;
      sel.addEventListener('change', () => {
        if (sel.value === OWN) { card.typingJoiner = true; card.joinerDraft = ''; card.joinerWhy = ''; }
        else {
          // picking the typed one again keeps it the player's own; anything else is from the list
          card.ownJoiner = card.ownJoiner && sel.value !== '' && !BW.Story.JOINERS[area].includes(sel.value);
          card.joiner = sel.value;
        }
        render();
        const box = document.querySelector('.story-card[data-id="' + id + '"] .story-joiner-box input');
        if (box) box.focus();
      });
      li.append(sel);
    } else card.joiner = '';
    const body = el('span', 'story-text');
    if (card.goal || card.added) body.append(el('small', 'story-tag', card.added ? '✨ Your own sentence' : card.goal));
    body.append(sentenceEl(card));
    const tip = st.tips.get(id);
    if (tip) {
      const note = el('span', 'story-tip', '💡 ' + tip.text);
      if (tip.fix) {
        const fix = el('button', 'story-fix', 'Fix it');
        fix.type = 'button';
        fix.addEventListener('click', () => { card.text = tip.fix; render(); });
        note.append(' ', fix);
      }
      body.append(note);
    }
    li.append(body);
    // a changed determiner can go back to the worm's word
    if (card.text !== card.original) {
      const undo = el('button', 'story-undo', '↺');
      undo.type = 'button';
      undo.title = 'Back to the worm\'s sentence';
      undo.setAttribute('aria-label', 'Back to the worm\'s sentence');
      undo.addEventListener('click', () => { card.text = card.original; render(); });
      li.append(undo);
    }
    if (area !== 'tray') {
      const add = el('button', 'story-add', '＋');
      add.type = 'button';
      add.title = 'Add a sentence after this one';
      add.setAttribute('aria-label', 'Add a sentence after this one');
      add.addEventListener('click', () => openBuilder(area, id));
      li.append(add);
      const out = el('button', 'story-out', '✕');
      out.type = 'button';
      out.title = 'Take it out of the story';
      out.setAttribute('aria-label', 'Take it out of the story');
      out.addEventListener('click', () => move(id, 'tray'));
      li.append(out);
    }
    return li;
  }

  function render() {
    // the tips read the story in order, Beginning to End
    const order = BW.Story.PARTS.flatMap(p => st.places[p.id].map(id => st.cards[id]));
    st.tips = new Map(BW.Story.tips(order, st.nouns).map(t => [t.id, t]));

    const tray = $('story-tray');
    tray.textContent = '';
    for (const id of st.places.tray) tray.append(cardEl(id, 'tray'));
    if (!st.places.tray.length) tray.append(el('li', 'story-empty', 'Every sentence is in your story! Drag one here to leave it out.'));

    const box = $('story-parts');
    box.textContent = '';
    for (const p of BW.Story.PARTS) {
      const sec = el('section', 'story-part story-part-' + p.id);
      const head = el('header', 'story-part-head');
      head.append(el('h3', '', p.label), el('small', '', p.ask));
      const list = el('ol', 'story-drop');
      list.dataset.area = p.id;
      const spot = st.builder ? builderSpot() : null;
      st.places[p.id].forEach((id, i) => {
        if (spot && spot.area === p.id && spot.index === i) list.append(builderEl());
        list.append(cardEl(id, p.id));
      });
      if (spot && spot.area === p.id && spot.index >= st.places[p.id].length) list.append(builderEl());
      sec.append(head, list);
      if (!spot || spot.area !== p.id) {
        const add = el('button', 'story-add-part', '＋ Add a sentence');
        add.type = 'button';
        add.addEventListener('click', () => openBuilder(p.id, st.places[p.id][st.places[p.id].length - 1] || null));
        sec.append(add);
      }
      // with a card picked up, every other part can take it
      if (st.picked && areaOf(st.picked) !== p.id) {
        const put = el('button', 'story-put', 'Put it here ↓');
        put.type = 'button';
        put.addEventListener('click', () => move(st.picked, p.id));
        sec.append(put);
      }
      box.append(sec);
    }
    // ...and the tray can take it back
    $('story-tray-put').hidden = !(st.picked && areaOf(st.picked) !== 'tray');

    const missing = BW.Story.missing(parts());
    $('story-finish').disabled = missing.length > 0;
    $('story-missing').textContent = missing.length ? 'Put a sentence in the ' + and(missing) + '.'
      : st.tips.size ? 'Your story has a beginning, a middle and an end! Look at the 💡 tips to make it even better.'
      : 'Your story has a beginning, a middle and an end!';
    $('story-missing').classList.toggle('ready', !missing.length);
  }

  // "Middle", "Middle and End", "Beginning, Middle and End"
  const and = words => words.length < 2 ? words.join('')
    : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];

  /* ---------- picking up a card: drag it, or tap it and then tap where it goes ---------- */

  function pick(id) {
    st.picked = st.picked === id ? null : id;
    render();
    const again = document.querySelector('.story-card[data-id="' + id + '"]');
    if (again) again.focus();
  }

  function onDown(e) {
    const card = e.target.closest('.story-card');
    if (!card || e.button > 0 || e.target.closest('select, button, input')) return;
    drag = { id: card.dataset.id, card, x: e.clientX, y: e.clientY, moving: false };
    card.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moving = true;
      const r = drag.card.getBoundingClientRect();
      drag.dx = drag.x - r.left;
      drag.dy = drag.y - r.top;
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.className = 'story-card story-ghost';
      drag.ghost.style.width = r.width + 'px';
      document.body.append(drag.ghost);
      drag.card.classList.add('lifted');
      drag.slot = el('li', 'story-slot');
      $('story').classList.add('dragging');
    }
    e.preventDefault();
    drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
    drag.ghost.style.top = (e.clientY - drag.dy) + 'px';

    // where it would land: the area under the pointer, before the first card lower down
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const zone = under && under.closest('.story-drop');
    drag.zone = zone;
    drag.index = undefined;
    if (!zone) { drag.slot.remove(); return; }
    const cards = [...zone.querySelectorAll('.story-card:not(.lifted)')];
    const before = cards.findIndex(c => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    drag.index = before < 0 ? cards.length : before;
    if (before < 0) zone.append(drag.slot);
    else zone.insertBefore(drag.slot, cards[before]);
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moving) { pick(d.id); return; }
    d.ghost.remove();
    d.slot.remove();
    $('story').classList.remove('dragging');
    if (d.zone && d.index !== undefined) move(d.id, d.zone.dataset.area, d.index);
    else render();
  }

  function onKey(e) {
    const card = e.target.closest && e.target.closest('.story-card');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) {
      e.preventDefault();
      pick(card.dataset.id);
    }
  }

  /* ---------- the story read back ---------- */

  function title() { return $('story-title').value.trim() || 'My Story'; }

  function showRead() {
    const read = $('story-read-text');
    read.textContent = '';
    for (const p of BW.Story.paragraphs(parts())) read.append(el('p', '', p));
    $('story-read-title').textContent = title();
    $('story-read-points').textContent = 'Save it to your stories for +' + st.points + ' points!';
    $('story-edit').hidden = true;
    $('story-read').hidden = false;
    $('story-sheet').scrollTop = 0;
    $('story-save').focus();
  }

  function showEdit() {
    $('story-read').hidden = true;
    $('story-edit').hidden = false;
  }

  function close() {
    $('story').hidden = true;
    document.body.classList.remove('story-open');
    st = null;
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    const sheet = $('story');
    sheet.addEventListener('pointerdown', onDown);
    sheet.addEventListener('pointermove', onMove);
    sheet.addEventListener('pointerup', onUp);
    sheet.addEventListener('pointercancel', onUp);
    sheet.addEventListener('keydown', onKey);
    $('story-tray-put').addEventListener('click', () => move(st.picked, 'tray'));
    $('story-finish').addEventListener('click', showRead);
    $('story-back').addEventListener('click', showEdit);
    $('story-skip').addEventListener('click', () => { const done = st.onSkip; close(); done(); });
    $('story-save').addEventListener('click', () => {
      const story = { title: title(), emoji: st.starter ? st.starter.emoji : '📖',
                      paragraphs: BW.Story.paragraphs(parts()) };
      const done = st.onSave;
      close();
      done(story);
    });
  }

  /* sentences: the story's { goal, text }, in order - each goes in its objective's part.
     starter: the story idea, or null. onSave(story) when it is saved, onSkip() when the
     player would rather keep playing. */
  function open({ sentences, starter, pack, nouns, dets, points, onSave, onSkip }) {
    wire();
    st = { cards: {}, places: { tray: [], beginning: [], middle: [], end: [] }, picked: null, starter,
           pack: pack ? BW.Story.copyPack(pack) : null,      // the player's own words go in this copy
           own: new Set(), nouns: new Set(nouns || []), dets: dets || new Set(), tips: new Map(),
           builder: null, made: 0, points, onSave, onSkip };
    sentences.forEach((s, i) => {
      const id = 's' + i;
      const part = s.goal && st.places[s.goal.part] ? s.goal.part : 'tray';
      st.cards[id] = { id, text: s.text, original: s.text, goal: s.goal ? s.goal.label : '', joiner: '' };
      st.places[part].push(id);
    });
    $('story-title').value = starter ? starter.title : '';
    $('story-idea-line').textContent = starter ? starter.emoji + ' ' + starter.idea : '';
    $('story-idea-line').hidden = !starter;
    showEdit();
    render();
    $('story').hidden = false;
    document.body.classList.add('story-open');
    $('story-sheet').scrollTop = 0;
    $('story-heading').focus();
  }

  return { open };
})();
