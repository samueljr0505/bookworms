/* Loads the word packs, starts the game, and keeps the panels on screen up to date. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);

  async function loadPack() {
    const index = await fetch('data/packs.json').then(r => {
      if (!r.ok) throw new Error('packs.json: HTTP ' + r.status);
      return r.json();
    });
    const entry = index.packs.find(p => p.id === index.defaultPack) || index.packs[0];
    const pack = await fetch('data/' + entry.file).then(r => {
      if (!r.ok) throw new Error(entry.file + ': HTTP ' + r.status);
      return r.json();
    });
    return pack;
  }

  function posLabel(pack, pos) {
    if (pos === 'punctuation') return 'Ending mark';
    return (pack.pos[pos] && pack.pos[pos].label) || pos;
  }

  function posColor(pack, pos) {
    if (pos === 'punctuation') return '#f5c26b';
    return (pack.pos[pos] && pack.pos[pos].color) || '#9aa7d7';
  }

  function renderLegend(pack) {
    const ul = $('legend');
    ul.innerHTML = '';
    for (const pos of Object.keys(pack.pos)) {
      const info = pack.pos[pos];
      const li = document.createElement('li');
      li.innerHTML = `<i style="background:${info.color}"></i>
                      <b>${info.label}</b><span>${info.hint}</span>`;
      ul.appendChild(li);
    }
  }

  function renderHud(game) {
    const pack = game.pack;
    const s = game.sentence;

    $('score').textContent = game.score;
    $('count').textContent = game.finished.length;

    // the sentence so far, with empty slots still to fill
    const building = $('building');
    building.innerHTML = '';
    for (const slot of s.outline()) {
      if (slot.state === 'skipped') continue;
      const el = document.createElement('span');
      el.className = 'chip ' + slot.state;
      el.style.borderColor = posColor(pack, slot.pos);
      if (slot.state === 'done') {
        el.style.background = posColor(pack, slot.pos);
        el.textContent = slot.word;
      } else {
        el.textContent = posLabel(pack, slot.pos) + (slot.optional ? '?' : '');
      }
      building.appendChild(el);
    }
    if (s.punctuation) {
      const el = document.createElement('span');
      el.className = 'chip done';
      el.style.background = '#f5c26b';
      el.style.borderColor = '#f5c26b';
      el.textContent = s.punctuation;
      building.appendChild(el);
    }

    // what to hunt for next
    const wanted = s.allowedPos().map(p => posLabel(pack, p));
    if (s.canEnd() && s.tokens.length > 0) wanted.push('a punctuation mark (. or !) to end it');
    $('next-up').innerHTML = 'Go eat: <b>' + wanted.join('</b> or <b>') + '</b>';

    $('btn-pause').innerHTML = (game.mode === 'paused' ? 'Resume' : 'Pause') + ' <kbd>P</kbd>';

    const list = $('finished');
    if (game.finished.length === 0) {
      list.innerHTML = '<li class="empty">None yet - go get a word!</li>';
    } else {
      list.innerHTML = '';
      game.finished.slice().reverse().forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
    }
  }

  let messageTimer = null;
  function showMessage(text, kind) {
    const el = $('message');
    el.textContent = text;
    el.className = 'message show ' + (kind || '');
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { el.className = 'message'; }, 2600);
  }

  async function boot() {
    let pack;
    try {
      pack = await loadPack();
    } catch (err) {
      $('loading').hidden = true;
      $('error').hidden = false;
      $('error-detail').textContent = String(err);
      return;
    }

    $('loading').hidden = true;
    $('game').hidden = false;
    renderLegend(pack);

    const game = new BW.Game(pack, $('board'), {
      onChange: renderHud,
      onMessage: showMessage
    });

    game.attachInput(window);

    $('btn-new').addEventListener('click', () => { game.newGame(); window.focus(); });
    $('btn-pause').addEventListener('click', () => {
      game.handleKey({ key: 'p', preventDefault() {} });
    });
    $('btn-hints').addEventListener('click', () => {
      game.showHints = !game.showHints;
      $('btn-hints').textContent = 'Hints: ' + (game.showHints ? 'on' : 'off');
    });

    window.BW.game = game;   // handy for poking at in the browser console
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
