/* A word party, on a student's computer (party.html?code=BCDF#seat=...).

   Everything but the building happens here: waiting for the teacher, writing words into the
   sentence frame, voting, and the results. When the teacher starts the building this page
   hands over to the game (game.html?party=BCDF, js/party-play.js), which hands back when the
   vote opens. The server is tools/party.py. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  const POLL_MS = 1500;

  let code = '', seat = '';
  let view = null;
  let drawnRound = null;     // the round the frame's boxes were made for
  let drawn = '';            // what the ballot or results were last drawn from
  let timer = null;

  function show(section) {
    for (const id of ['s-wait', 's-write', 's-vote', 's-results']) $(id).hidden = id !== section;
  }

  function wait(emoji, title, text) {
    show('s-wait');
    $('wait-emoji').textContent = emoji;
    $('wait-title').textContent = title;
    $('wait-text').textContent = text;
  }

  async function poll() {
    clearTimeout(timer);
    try {
      const r = await BW.Party.call('/' + code + '?me=' + encodeURIComponent(seat));
      if (r.data.gone) return wait('🚪', 'This class has closed', 'Ask your teacher for a new code.');
      if (r.ok && !r.data.me) { location.replace('join.html?code=' + code); return; }
      if (r.ok) {
        $('error').textContent = '';
        view = r.data;
        if (view.phase === 'building') {
          location.replace('game.html?party=' + code + '#seat=' + seat);
          return;
        }
        draw();
      } else {
        $('error').textContent = r.data.error || 'Word parties need the Bookworms server.';
      }
    } catch (err) {
      $('error').textContent = 'Trying to reach your teacher\'s computer...';
    }
    timer = setTimeout(poll, POLL_MS);
  }

  function draw() {
    const me = view.me;
    $('hello').hidden = false;
    $('hello').textContent = me.name + ' · ⭐ ' + me.score + (me.score === 1 ? ' vote' : ' votes') + ' so far';
    if (view.phase === 'lobby') {
      wait('🎉', 'You are in, ' + me.name + '!', 'Waiting for your teacher to start the first round...');
    } else if (view.phase === 'writing') drawWriting();
    else if (view.phase === 'voting') drawVoting();
    else if (view.phase === 'results') drawResults();
  }

  /* ---------- writing ---------- */

  function makeFrame() {
    const form = $('frame');
    form.textContent = '';
    for (const box of BW.Party.FRAME) {
      if (box.text) {
        const word = document.createElement('span');
        word.className = 'fixed' + (box.with ? ' with-' + box.with : '');
        word.textContent = box.text;
        form.append(word);
        continue;
      }
      const label = document.createElement('label');
      label.className = 'box' + (box.optional ? ' optional' : '');
      label.style.setProperty('--kind', box.color);
      const kind = document.createElement('small');
      kind.textContent = box.label + (box.optional ? ' (optional)' : '');
      const input = document.createElement('input');
      input.type = 'text';
      input.name = box.field;
      input.maxLength = 16;
      input.spellcheck = true;
      input.autocapitalize = 'none';
      input.setAttribute('aria-describedby', 'hint-' + box.field);
      const hint = document.createElement('small');
      hint.className = 'hint';
      hint.id = 'hint-' + box.field;
      hint.textContent = box.hint;
      input.addEventListener('input', preview);
      label.append(kind, input, hint);
      form.append(label);
    }
  }

  function typed() {
    const words = {};
    for (const f of BW.Party.FIELDS) words[f] = BW.Party.cleanWord($('frame').elements[f].value);
    return words;
  }

  function preview() {
    const words = typed();
    $('preview').textContent = BW.Party.sentenceOf(words, { blank: true });
    // "the" before the second Noun only shows when there is one
    document.querySelectorAll('.fixed.with-object').forEach(el => el.classList.toggle('off', !words.object));
  }

  function drawWriting() {
    show('s-write');
    $('write-prompt').textContent = view.prompt;
    const card = view.me.card;
    if (drawnRound !== view.round) {
      drawnRound = view.round;
      makeFrame();
      for (const f of BW.Party.FIELDS) $('frame').elements[f].value = card ? card.words[f] || '' : '';
      $('write-error').textContent = '';
      preview();
    }
    const done = card && card.status === 'approved';
    for (const f of BW.Party.FIELDS) $('frame').elements[f].disabled = done;
    $('send').hidden = done;
    $('send').textContent = card ? 'Send my new words' : 'Send to my teacher';
    const status = $('write-status');
    status.className = 'status ' + (card ? card.status : '');
    if (!card) status.textContent = '';
    else if (card.status === 'waiting') status.textContent = '📨 Sent! Your teacher is checking it. You can still change it and send it again.';
    else if (card.status === 'rejected') status.textContent = '↩️ Your teacher sent it back. Try different words and send them again.';
    else {
      const left = card.struck.map(f => '"' + card.words[f] + '"');
      status.textContent = '✅ Your teacher said yes! Your words are going into the class word bank.' +
        (left.length ? ' (Except ' + left.join(' and ') + '.)' : '') + ' Wait for the next part...';
    }
  }

  async function send() {
    const words = typed();
    for (const box of BW.Party.FRAME.filter(b => b.field)) {
      const w = words[box.field];
      if (!w && box.optional) continue;
      if (!w || !BW.Party.isWord(w)) {
        $('write-error').textContent = !w ? 'Fill in the ' + box.label + ' box.'
          : 'The ' + box.label + ' box needs one word, with letters only.';
        $('frame').elements[box.field].focus();
        return;
      }
    }
    $('write-error').textContent = '';
    $('send').disabled = true;
    try {
      const r = await BW.Party.call('/' + code + '/submit', { seat, words });
      if (r.ok) { view = r.data; draw(); }
      else {
        $('write-error').textContent = r.data.error || 'That did not send.';
        if (r.data.field) $('frame').elements[r.data.field].focus();
      }
    } catch (err) {
      $('write-error').textContent = 'Could not reach your teacher\'s computer. Try again.';
    } finally {
      $('send').disabled = false;
    }
  }

  /* ---------- voting ---------- */

  function drawVoting() {
    show('s-vote');
    $('vote-prompt').textContent = view.prompt;
    const me = view.me;
    const key = 'vote:' + view.step + ':' + me.vote;
    if (key === drawn) return;
    drawn = key;
    const list = $('ballot');
    list.textContent = '';
    for (const e of view.entries) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const mine = e.id === me.entry;
      b.className = 'entry' + (mine ? ' mine' : '') + (e.id === me.vote ? ' on' : '');
      b.disabled = mine;
      b.setAttribute('aria-pressed', String(e.id === me.vote));
      const letter = document.createElement('b');
      letter.className = 'letter';
      letter.textContent = e.id;
      const text = document.createElement('span');
      text.textContent = e.text;
      b.append(letter, text);
      if (mine) {
        const tag = document.createElement('small');
        tag.textContent = 'yours';
        b.append(tag);
      }
      b.addEventListener('click', () => vote(e.id));
      li.append(b);
      list.append(li);
    }
    $('vote-status').textContent = me.vote ? '🗳️ You voted for ' + me.vote + '. Tap another one to change your vote.'
      : 'Tap the one you like best.';
  }

  async function vote(id) {
    $('vote-error').textContent = '';
    try {
      const r = await BW.Party.call('/' + code + '/ballot', { seat, entry: id });
      if (r.ok) { view = r.data; draw(); }
      else $('vote-error').textContent = r.data.error || 'That vote did not count.';
    } catch (err) {
      $('vote-error').textContent = 'Could not reach your teacher\'s computer. Try again.';
    }
  }

  /* ---------- results ---------- */

  function drawResults() {
    show('s-results');
    $('results-prompt').textContent = view.prompt;
    const key = 'results:' + view.step;
    if (key === drawn) return;
    drawn = key;
    const list = $('results');
    list.textContent = '';
    const top = view.entries.length ? view.entries[0].votes : 0;
    for (const e of view.entries) {
      const li = document.createElement('li');
      li.className = (e.votes === top && top > 0 ? 'winner' : '') + (e.id === view.me.entry ? ' mine' : '');
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
    const mine = view.entries.find(e => e.id === view.me.entry);
    $('results-me').textContent = mine ? 'Your sentence got ' + mine.votes + (mine.votes === 1 ? ' vote' : ' votes') + '!'
      : 'You did not have a sentence this time. Next round!';
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { code = BW.Class.cleanCode(new URLSearchParams(location.search).get('code')); } catch (err) { /* no address */ }
    const inUrl = /(?:^#|&)seat=([\w-]+)/.exec(location.hash);
    const saved = code && BW.Class.savedSeat(code);
    seat = inUrl ? inUrl[1] : saved ? saved.seat : '';
    if (!code || !seat) { location.replace('join.html' + (code ? '?code=' + code : '')); return; }
    $('send').addEventListener('click', send);
    $('frame').addEventListener('submit', e => e.preventDefault());
    // Enter in any box sends (a form of several boxes and no submit button would not)
    $('frame').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    poll();
  });
})();
