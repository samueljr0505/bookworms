/* The teacher's page for a word party (party-teacher.html).

   Pick a topic and the server (tools/party.py) opens a class with a four-letter code; students
   join with it (join.html). Then each round: put up a prompt and the students write words for
   it, approve their answers (or send them back), chop the words into the word bank and put up a
   prompt to build with, then open the vote and show the results. The class's key is kept in
   this browser, so a reload carries on. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  const POLL_MS = 1500;
  const MINUTES = [2, 3, 5];
  const HURRY_MS = 30000;
  const SAVED = 'bookworms.partyTeacher';

  let topics = [];
  let topic = null;
  let minutes = 3;
  let mine = null;             // { code, teacher }
  let view = null;
  let link = { state: 'off', url: null, canControl: false };
  const strikes = new Map();   // seat -> the boxes struck on a card not yet approved
  let drawn = {};              // what each part was last drawn from
  let lastStep = null;
  let timer = null;

  function load() { try { return JSON.parse(localStorage.getItem(SAVED)) || null; } catch (err) { return null; } }
  function save(v) {
    try { if (v) localStorage.setItem(SAVED, JSON.stringify(v)); else localStorage.removeItem(SAVED); } catch (err) { /* not important */ }
  }

  /* Press once to ask, again to do it (as on the race page - some browsers never show confirm()). */
  function twoStep(button, ask, action) {
    let label = null, t = null;
    const reset = () => { clearTimeout(t); if (label !== null) button.textContent = label; label = null; button.classList.remove('sure'); };
    button.addEventListener('click', () => {
      if (label !== null || button.dataset.ask === 'no') { reset(); action(); return; }
      label = button.textContent;
      button.textContent = ask;
      button.classList.add('sure');
      t = setTimeout(reset, 4000);
    });
  }

  function choices(list, items, isOn, pick) {
    list.textContent = '';
    for (const item of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'choice';
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(isOn(item)));
      b.innerHTML = item.html;
      b.addEventListener('click', () => { pick(item); choices(list, items, isOn, pick); });
      li.append(b);
      list.append(li);
    }
  }

  /* Prompt ideas under a prompt box: click one to put it in the box. */
  function ideas(list, input, prompts) {
    list.textContent = '';
    for (const text of prompts) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'idea';
      b.textContent = text;
      b.addEventListener('click', () => { input.value = text; input.focus(); });
      li.append(b);
      list.append(li);
    }
  }

  function pickOne(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---------- setup ---------- */

  function showSetup(message) {
    $('room').hidden = true;
    $('setup').hidden = false;
    $('setup-error').textContent = message || '';
    choices($('topics'), topics.map(t => ({ id: t.id, html: '<span>' + t.emoji + '</span><span>' + t.name + '</span>' })),
            t => t.id === topic, t => { topic = t.id; });
  }

  async function make() {
    $('setup-error').textContent = '';
    $('make').disabled = true;
    try {
      const r = await BW.Party.call('', { topic });
      if (!r.ok) {
        $('setup-error').textContent = r.data.error || 'Word parties need the Bookworms server. Start it with ./serve.sh.';
        return;
      }
      mine = { code: r.data.code, teacher: r.data.teacher };
      save(mine);
      await poll();
    } catch (err) {
      $('setup-error').textContent = 'Could not reach the Bookworms server. Is ./serve.sh still running?';
    } finally {
      $('make').disabled = false;
    }
  }

  /* ---------- the class ---------- */

  async function poll() {
    clearTimeout(timer);
    if (!mine) return;
    try {
      const r = await BW.Party.call('/' + mine.code + '?teacher=' + encodeURIComponent(mine.teacher));
      if (r.status === 403 || r.data.gone) {
        forget();
        showSetup('That class has closed. Open a new one.');
        return;
      }
      if (r.ok) {
        view = r.data;
        $('room-error').textContent = '';
        if (link.canControl && link.state === 'off' && !link.why) refreshLink({ open: true });
        else refreshLink();
        $('setup').hidden = true;
        $('room').hidden = false;
        draw();
      }
    } catch (err) {
      const text = 'Lost touch with the Bookworms server. Trying again...';
      if (view) $('room-error').textContent = text;
      else showSetup(text);
    }
    timer = setTimeout(poll, POLL_MS);
  }

  function forget() {
    mine = null;
    view = null;
    save(null);
  }

  async function act(action, body) {
    $('room-error').textContent = '';
    try {
      const r = await BW.Party.call('/' + mine.code + '/' + action, { teacher: mine.teacher, ...body });
      if (!r.ok) $('room-error').textContent = r.data.error || 'That did not work.';
      return r.ok;
    } catch (err) {
      $('room-error').textContent = 'Could not reach the Bookworms server.';
      return false;
    } finally {
      await poll();
    }
  }

  /* ---------- the class link (the same as on the race page, js/teacher.js) ---------- */

  async function refreshLink(body) {
    try {
      const r = await fetch('api/link', body && {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (r.ok) link = await r.json();
    } catch (err) { /* the room's own error line says the server is out of reach */ }
    if (view) drawLink();
  }

  function drawLink() {
    const address = $('address');
    const host = link.url ? link.url.replace(/^https:\/\//, '') : '';
    const dot = host.indexOf('.');
    if (address.dataset.host !== host) {
      address.dataset.host = host;
      address.textContent = '';
      const words = document.createElement('span');
      const rest = document.createElement('span');
      words.textContent = host ? host.slice(0, dot) : '...';
      rest.textContent = host ? host.slice(dot) : '';
      address.append(words, rest);
    }
    address.classList.toggle('waiting', !host);
    const note = link.url || !link.canControl ? '' : link.why || {
      starting: 'Making your class link - this takes a few seconds...',
      unavailable: 'Students join through a link made by a free program, cloudflared. ' +
                   'Install it on this computer with  brew install cloudflared  then press Try again.'
    }[link.state] || '';
    $('link-row').hidden = !note;
    $('link-note').textContent = note;
    $('link-btn').hidden = !(link.why || link.state === 'unavailable');
  }

  /* ---------- drawing ---------- */

  function over() { return view.phase === 'building' && (view.over || BW.Class.now() >= view.endsAt); }

  function draw() {
    const phase = view.phase;
    const t = topics.find(x => x.id === view.topic) || { emoji: '', name: view.topic };
    $('code').textContent = view.code;
    drawLink();
    $('joinbox').classList.toggle('small', phase !== 'lobby');
    $('settings').textContent = t.emoji + ' ' + t.name + (view.round ? ' · Round ' + view.round : '') +
      ' · ' + view.players.length + (view.players.length === 1 ? ' student' : ' students');
    document.querySelectorAll('#phases li').forEach(li => {
      const order = ['writing', 'building', 'voting', 'results'];
      const at = order.indexOf(phase), me = order.indexOf(li.dataset.phase);
      li.className = me < at ? 'done' : me === at ? 'now' : '';
    });
    $('phases').hidden = phase === 'lobby';

    // a new phase: fresh prompt ideas in the boxes that are about to show
    if (view.step !== lastStep) {
      lastStep = view.step;
      drawn = {};
      if (phase === 'lobby' || phase === 'results') $('write-prompt').value = pickOne(BW.Party.WRITE_PROMPTS);
      if (phase === 'writing' || phase === 'results') $('build-prompt').value = pickOne(BW.Party.BUILD_PROMPTS);
      if (phase !== 'writing') strikes.clear();
    }

    $('p-lobby').hidden = phase !== 'lobby';
    $('next-write').hidden = phase !== 'lobby' && phase !== 'results';
    $('p-writing').hidden = phase !== 'writing';
    $('next-build').hidden = phase !== 'writing' && phase !== 'results';
    $('p-building').hidden = phase !== 'building';
    $('p-voting').hidden = phase !== 'voting';
    $('p-results').hidden = phase !== 'results';
    $('start-write').disabled = !view.players.length;
    $('start-write').textContent = phase === 'results' ? 'New round: write new words' : 'Start writing';
    $('next-build-title').textContent = phase === 'results' ? 'Or build again with the same words:'
      : 'Next: what should they build with these words?';
    $('start-build').textContent = phase === 'results' ? 'Build again' : 'Chop up the words and build';

    if (phase === 'lobby') drawNames();
    if (phase === 'writing') drawWriting();
    if (phase === 'building') drawBuilding();
    if (phase === 'voting') drawVoting();
    if (phase === 'results') drawResults();
  }

  function once(part, key) {
    if (drawn[part] === key) return false;
    drawn[part] = key;
    return true;
  }

  function drawNames() {
    $('count').textContent = view.players.length;
    if (!once('names', view.players.map(p => p.seat).join())) return;
    const list = $('names');
    list.textContent = '';
    if (!view.players.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nobody yet - their names pop up here as they join.';
      list.append(li);
    }
    for (const p of view.players) list.append(nameChip(p));
  }

  function nameChip(p) {
    const li = document.createElement('li');
    li.append(p.name);
    const x = document.createElement('button');
    x.className = 'remove';
    x.type = 'button';
    x.textContent = '✕';
    x.title = 'Take ' + p.name + ' out of the class';
    x.setAttribute('aria-label', x.title);
    twoStep(x, 'Remove?', () => act('remove', { seat: p.seat }));
    li.append(x);
    return li;
  }

  /* ---------- writing: the answers to approve ---------- */

  function drawWriting() {
    $('writing-prompt').textContent = view.prompt;
    const sent = view.players.filter(p => p.card);
    const yes = sent.filter(p => p.card.status === 'approved');
    $('writing-tally').textContent = sent.length + ' of ' + view.players.length + ' have sent their words · ' +
      yes.length + ' approved';
    $('start-build').disabled = !yes.length;
    const key = JSON.stringify(view.players.map(p => [p.seat, p.card])) + JSON.stringify([...strikes]);
    if (!once('cards', key)) return;

    const list = $('cards');
    list.textContent = '';
    const waiting = view.players.filter(p => !p.card);
    // answers waiting for a look first, then the ones already decided
    const order = { waiting: 0, rejected: 1, approved: 2 };
    for (const p of sent.sort((a, b) => order[a.card.status] - order[b.card.status])) list.append(card(p));
    if (waiting.length) {
      const li = document.createElement('li');
      li.className = 'card still';
      li.textContent = 'Still writing: ' + waiting.map(p => p.name).join(', ');
      list.append(li);
    }
  }

  function card(p) {
    const c = p.card;
    const struck = c.status === 'approved' ? new Set(c.struck) : strikes.get(p.seat) || new Set();
    const li = document.createElement('li');
    li.className = 'card ' + c.status;
    const head = document.createElement('div');
    head.className = 'card-top';
    const name = document.createElement('b');
    name.textContent = p.name;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = { waiting: 'New', approved: '✓ In the bank', rejected: '↩ Sent back' }[c.status];
    head.append(name, badge);

    const words = document.createElement('p');
    words.className = 'words';
    for (const box of BW.Party.FRAME) {
      if (box.text) {
        if (!box.with || c.words[box.with]) words.append(Object.assign(document.createElement('span'), { className: 'fixed', textContent: box.text }));
        continue;
      }
      const w = c.words[box.field];
      if (!w) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'word' + (struck.has(box.field) ? ' struck' : '');
      b.style.setProperty('--kind', box.color);
      b.textContent = w;
      b.title = box.label + (struck.has(box.field) ? ' - struck out. Click to put it back.' : ' - click to strike it out');
      b.setAttribute('aria-label', w + ', ' + b.title);
      b.disabled = c.status === 'rejected';
      b.addEventListener('click', () => {
        const next = new Set(struck);
        if (next.has(box.field)) next.delete(box.field); else next.add(box.field);
        if (c.status === 'approved') act('review', { seat: p.seat, ok: true, struck: [...next] });
        else { strikes.set(p.seat, next); drawn.cards = null; drawWriting(); }
      });
      words.append(b);
    }
    words.append('.');

    const buttons = document.createElement('div');
    buttons.className = 'card-actions';
    if (c.status !== 'approved') {
      const yes = document.createElement('button');
      yes.type = 'button';
      yes.className = 'btn small yes';
      yes.textContent = '✓ Yes';
      yes.addEventListener('click', () => act('review', { seat: p.seat, ok: true, struck: [...struck] }));
      buttons.append(yes);
    }
    if (c.status !== 'rejected') {
      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'btn small no';
      no.textContent = '↩ Send back';
      no.addEventListener('click', () => { strikes.delete(p.seat); act('review', { seat: p.seat, ok: false }); });
      buttons.append(no);
    }
    li.append(head, words, buttons);
    return li;
  }

  /* ---------- building ---------- */

  const BANK_NAMES = [['noun', 'Nouns'], ['adjective', 'Adjectives'], ['move', 'Verbs (on their own)'],
                      ['take', 'Verbs (to something)'], ['adverb', 'Adverbs']];
  const BANK_COLORS = { noun: 'noun', adjective: 'adjective', move: 'verb', take: 'verb', adverb: 'adverb' };

  function drawBank(target) {
    target.textContent = '';
    let i = 0;
    for (const [list, label] of BANK_NAMES) {
      const words = (view.bank && view.bank[list]) || [];
      if (!words.length) continue;
      const row = document.createElement('div');
      row.className = 'bank-row';
      const h = document.createElement('small');
      h.textContent = label;
      row.append(h);
      for (const w of words) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.setProperty('--kind', BW.Party.COLORS[BANK_COLORS[list]]);
        chip.style.setProperty('--i', i++);
        chip.textContent = w;
        row.append(chip);
      }
      target.append(row);
    }
  }

  function drawBuilding() {
    $('building-prompt').textContent = view.prompt;
    const done = over();
    const now = BW.Class.now();
    const left = done ? 0 : Math.min(view.endsAt - now, view.minutes * 60000);
    $('clock').textContent = BW.Class.clock(left);
    $('clock-label').textContent = done ? 'Time\'s up! Open the vote when you are ready.'
      : now < view.startsAt ? 'Get ready... ' + Math.ceil((view.startsAt - now) / 1000) : 'Time left';
    $('clock-box').classList.toggle('hurry', !done && left <= HURRY_MS);
    $('end-build').hidden = done;
    // while they are still building, opening the vote asks first: it stops everyone
    $('open-vote').dataset.ask = done ? 'no' : 'yes';
    if (once('bank', view.step)) drawBank($('bank'));
    if (!once('builders', JSON.stringify(view.players.map(p => [p.name, p.sentences])))) return;
    const list = $('builders');
    list.textContent = '';
    for (const p of view.players) {
      const li = document.createElement('li');
      li.className = p.sentences ? 'some' : '';
      li.textContent = p.name + ' ';
      const n = document.createElement('b');
      n.textContent = p.sentences;
      li.append(n);
      list.append(li);
    }
  }

  /* ---------- voting and results ---------- */

  function drawVoting() {
    $('voting-prompt').textContent = view.prompt;
    $('voting-tally').textContent = view.voted + ' of ' + view.players.length + ' have voted';
    if (!once('entries', view.step)) return;
    const list = $('entries');
    list.textContent = '';
    for (const e of view.entries) {
      const li = document.createElement('li');
      const letter = document.createElement('b');
      letter.className = 'letter';
      letter.textContent = e.id;
      const text = document.createElement('span');
      text.textContent = e.text;
      li.append(letter, text);
      list.append(li);
    }
  }

  function drawResults() {
    $('results-prompt').textContent = view.prompt;
    if (!once('results', view.step)) return;
    const list = $('results');
    list.textContent = '';
    const top = view.entries.length ? view.entries[0].votes : 0;
    for (const e of view.entries) {
      const li = document.createElement('li');
      li.className = e.votes === top && top > 0 ? 'winner' : '';
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = (e.votes === top && top > 0 ? '🏆 ' : '') + e.text;
      const who = document.createElement('small');
      who.textContent = 'by ' + e.name;
      const votes = document.createElement('b');
      votes.textContent = e.votes + (e.votes === 1 ? ' vote' : ' votes');
      li.append(text, who, votes);
      list.append(li);
    }
    const scores = $('scores');
    scores.textContent = '';
    for (const p of view.players) {
      const li = document.createElement('li');
      li.textContent = p.name + ' ';
      const b = document.createElement('b');
      b.textContent = p.score;
      li.append(b);
      scores.append(li);
    }
  }

  /* ---------- start up ---------- */

  async function boot() {
    try {
      const index = await fetch('data/topics.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      topics = index.topics;
      topic = BW.chooseTopic(index).id;
    } catch (err) {
      showSetup('Could not load the topics. Start the server with ./serve.sh and reload this page.');
      return;
    }
    await refreshLink();

    ideas($('write-ideas'), $('write-prompt'), BW.Party.WRITE_PROMPTS.slice(0, 4));
    ideas($('build-ideas'), $('build-prompt'), BW.Party.BUILD_PROMPTS.slice(0, 4));
    const drawTimes = () => choices($('times'), MINUTES.map(m => ({ m, html: '<span>⏱️</span><span>' + m + ' minutes</span>' })),
                                    t => t.m === minutes, t => { minutes = t.m; });
    drawTimes();

    $('make').addEventListener('click', make);
    $('start-write').addEventListener('click', () => act('write', { prompt: $('write-prompt').value }));
    $('start-build').addEventListener('click', () => act('build', { prompt: $('build-prompt').value, minutes }));
    twoStep($('end-build'), 'Sure? Press again to stop everyone', () => act('end'));
    twoStep($('open-vote'), 'Sure? This stops everyone building', () => act('vote'));
    $('reveal').addEventListener('click', () => act('reveal'));
    $('link-btn').addEventListener('click', () => refreshLink({ open: true }));
    twoStep($('new-class'), 'Sure? Everyone in it stops playing', () => {
      clearTimeout(timer);
      forget();
      refreshLink({ open: false });
      showSetup();
    });
    setInterval(() => { if (view && view.phase === 'building' && !$('room').hidden) drawBuilding(); }, 250);

    mine = load();
    if (mine) await poll();
    else showSetup();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
