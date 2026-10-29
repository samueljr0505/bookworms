/* The teacher's page for a class race (teacher.html).

   Pick a topic, Real or Silly, and how long the race lasts, and the server (tools/classroom.py)
   makes a class with a four-letter code. Students join with it on their own computers
   (join.html). This page then shows who is here, starts the race, shows the leaderboard and the
   time left while it runs, and at the end the winners - and every sentence the class wrote,
   ready to print. The class's key is kept in this browser, so a reload carries on. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  const POLL_MS = 2000;
  const MINUTES = [2, 3, 5, 10];
  const HURRY_MS = 30000;

  let topics = [];             // from data/topics.json
  let choice = { topic: null, mode: 'real', minutes: 5 };
  let mine = null;             // { code, teacher } - the class this page runs
  let view = null;             // the latest look at it
  let link = { state: 'off', url: null, canControl: false };   // the class link (tools/serve.py)
  let changing = false;        // the setup panel is changing the open class, not making one
  const opened = new Set();    // students whose sentences are showing
  let drawn = '';              // what the board was last drawn from
  let timer = null;

  /* Anything that cannot be undone asks first - on the button itself, the way the shop's Buy
     button does. Not with confirm(): some browsers never show that box and just answer "no",
     which left these buttons doing nothing at all. The first press asks, the second does it,
     and if the second does not come the button goes back to normal. */
  function twoStep(button, ask, action) {
    let label = null, timer = null;
    const reset = () => {
      clearTimeout(timer);
      if (label !== null) button.textContent = label;
      label = null;
      button.classList.remove('sure');
    };
    button.addEventListener('click', () => {
      if (label !== null) { reset(); action(); return; }
      label = button.textContent;
      button.textContent = ask;
      button.classList.add('sure');
      timer = setTimeout(reset, 4000);
    });
  }

  /* ---------- 1. setup ---------- */

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
      b.addEventListener('click', () => { pick(item); drawSetup(); });
      li.append(b);
      list.append(li);
    }
  }

  function drawSetup() {
    choices($('topics'), topics.map(t => ({ id: t.id, html: '<span>' + t.emoji + '</span><span>' + t.name + '</span>' })),
            t => t.id === choice.topic, t => { choice.topic = t.id; });
    document.querySelectorAll('#modes [data-mode]').forEach(b =>
      b.setAttribute('aria-checked', String(b.dataset.mode === choice.mode)));
    choices($('times'), MINUTES.map(m => ({ m, html: '<span>⏱️</span><span>' + m + ' minutes</span>' })),
            t => t.m === choice.minutes, t => { choice.minutes = t.m; });
    $('make').textContent = changing ? 'Save' : 'Open the class';
    $('cancel').hidden = !changing;
  }

  function showSetup(message) {
    $('room').hidden = true;
    $('setup').hidden = false;
    $('setup-error').textContent = message || '';
    drawSetup();
  }

  async function make() {
    $('setup-error').textContent = '';
    $('make').disabled = true;
    try {
      const r = changing
        ? await BW.Class.call('/' + mine.code + '/again', { teacher: mine.teacher, ...choice })
        : await BW.Class.call('', choice);
      if (!r.ok) {
        $('setup-error').textContent = r.data.error || 'Class races need the Bookworms server. Start it with ./serve.sh.';
        return;
      }
      if (!changing) {
        mine = { code: r.data.code, teacher: r.data.teacher };
        BW.Class.saveTeacher(mine);
      }
      changing = false;
      opened.clear();
      await poll();
    } catch (err) {
      $('setup-error').textContent = 'Could not reach the Bookworms server. Is ./serve.sh still running?';
    } finally {
      $('make').disabled = false;
    }
  }

  /* ---------- 2. the class ---------- */

  /* Look at the class, draw it, and go round again. */
  async function poll() {
    clearTimeout(timer);
    if (!mine) return;
    try {
      const r = await BW.Class.call('/' + mine.code + '?teacher=' + encodeURIComponent(mine.teacher));
      if (r.status === 403 || r.data.gone) {
        // the server was restarted, or this browser's key is for an old class
        forget();
        showSetup('That class has closed. Make a new one.');
        return;
      }
      if (r.ok) {
        view = r.data;
        $('room-error').textContent = '';
        // an open class needs its link: open it (a new class), or see whether it is ready
        if (link.canControl && link.state === 'off' && !link.why) refreshLink({ open: true });
        else refreshLink();
        if (!changing) { $('setup').hidden = true; $('room').hidden = false; }
        draw();
      }
    } catch (err) {
      const text = 'Lost touch with the Bookworms server. Trying again...';
      if (view) $('room-error').textContent = text;
      else showSetup(text);          // never got a first look: show something, keep trying
    }
    timer = setTimeout(poll, POLL_MS);
  }

  function forget() {
    mine = null;
    view = null;
    BW.Class.saveTeacher(null);
  }

  async function act(action, body) {
    $('room-error').textContent = '';
    try {
      const r = await BW.Class.call('/' + mine.code + '/' + action, { teacher: mine.teacher, ...body });
      if (!r.ok) $('room-error').textContent = r.data.error || 'That did not work.';
    } catch (err) {
      $('room-error').textContent = 'Could not reach the Bookworms server.';
    }
    await poll();
  }

  /* The state right now, by this computer's copy of the server's clock - so the bell rings
     here on time, not up to a couple of seconds late at the next look. */
  function stateNow() {
    if (view.state === 'running' && BW.Class.now() >= view.endsAt) return 'over';
    return view.state;
  }

  /* ---------- the class link ---------- */

  /* Students reach the class through a link, so it works whatever network they are on - school
     Wi-Fi often will not let one computer reach another. It opens when the class does, it is
     new and random every time, and it closes when the class is closed or the server stops.
     The link on its own opens the join page, so it is all the teacher has to give out. */
  async function refreshLink(body) {
    try {
      const r = await fetch('api/link', body && {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (r.ok) link = await r.json();
    } catch (err) { /* the room's own error line says the server is out of reach */ }
    if (view) draw();
  }

  const LINK_NOTES = {
    starting: 'Making your class link - this takes a few seconds...',
    unavailable: 'Students join through a link made by a free program, cloudflared. ' +
                 'Install it on this computer with  brew install cloudflared  then press Try again.'
  };

  /* The link without its https:// - shorter to read off the board, and browsers add it. The
     random words and the rest are kept apart, so a narrow screen breaks the line between them
     rather than in the middle of a word. */
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
    const note = link.url || !link.canControl ? '' : link.why || LINK_NOTES[link.state] || '';
    $('link-row').hidden = !note;
    $('link-note').textContent = note;
    $('link-btn').hidden = !(link.why || link.state === 'unavailable');
    $('link-btn').textContent = 'Try again';
  }

  function draw() {
    const state = stateNow();
    const topic = topics.find(t => t.id === view.topic) || { emoji: '', name: view.topic };

    $('code').textContent = view.code;
    drawLink();
    $('joinbox').classList.toggle('small', state !== 'lobby');
    $('settings').textContent = topic.emoji + ' ' + topic.name + ' · ' +
      (view.mode === 'silly' ? '🤪 Silly' : '🌍 Real') + ' sentences · ' +
      view.minutes + ' minutes' + (view.round > 1 ? ' · Race ' + view.round : '');

    $('lobby').hidden = state !== 'lobby';
    $('race').hidden = state === 'lobby';
    $('end').hidden = state !== 'running';
    $('open-hint').hidden = state === 'lobby';
    $('again').hidden = $('change-after').hidden = $('print').hidden = state !== 'over';

    if (state === 'lobby') drawNames();
    else drawClock(state);
    drawBoard(state);
  }

  function drawNames() {
    const list = $('names');
    $('count').textContent = view.board.length;
    $('start').disabled = view.board.length === 0;
    const key = 'names:' + view.board.map(r => r.seat).join();
    if (key === drawn) return;
    drawn = key;
    list.textContent = '';
    if (!view.board.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nobody yet - their names pop up here as they join.';
      list.append(li);
    }
    for (const row of view.board) {
      const li = document.createElement('li');
      li.append(row.name);
      const x = document.createElement('button');
      x.className = 'remove';
      x.type = 'button';
      x.textContent = '✕';
      x.title = 'Take ' + row.name + ' out of the class';
      x.setAttribute('aria-label', x.title);
      twoStep(x, 'Remove?', () => act('remove', { seat: row.seat }));
      li.append(x);
      list.append(li);
    }
  }

  function drawClock(state) {
    const now = BW.Class.now();
    const left = state === 'over' ? 0 : Math.min(view.endsAt - now, view.minutes * 60000);
    $('clock').textContent = BW.Class.clock(left);
    $('clock-label').textContent = state === 'over' ? 'Time\'s up!'
      : now < view.startsAt ? 'Get ready... ' + Math.ceil((view.startsAt - now) / 1000) : 'Time left';
    $('clock-box').classList.toggle('hurry', state === 'running' && left <= HURRY_MS);
  }

  function drawBoard(state) {
    if (state === 'lobby') return;
    const key = state + ':' + JSON.stringify(view.board) + [...opened].join();
    if (key === drawn) return;
    drawn = key;

    const most = Math.max(1, ...view.board.map(r => r.correct));
    const list = $('board');
    list.textContent = '';
    if (!view.board.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nobody is in this class.';
      list.append(li);
    }
    for (const row of view.board) {
      const li = document.createElement('li');
      if (row.rank === 1 && row.correct > 0) li.className = 'first';
      const b = document.createElement('button');
      b.className = 'row';
      b.type = 'button';
      b.setAttribute('aria-expanded', String(opened.has(row.seat)));
      b.innerHTML = '<span class="place"></span><span class="name"></span>' +
                    '<span class="bar"><i></i></span><span class="score"></span>';
      b.querySelector('.place').textContent = BW.Class.place(row);
      b.querySelector('.name').textContent = row.name;
      b.querySelector('.bar i').style.width = (100 * row.correct / most) + '%';
      b.querySelector('.score').textContent = row.correct;
      b.addEventListener('click', () => {
        if (opened.has(row.seat)) opened.delete(row.seat); else opened.add(row.seat);
        drawBoard(stateNow());
      });
      li.append(b);
      if (opened.has(row.seat)) li.append(sentencesOf(row));
      list.append(li);
    }

    drawPodium(state);
    drawPrintout();
  }

  /* A student's sentences, right and not quite, in the order they wrote them. */
  function sentencesOf(row) {
    const ul = document.createElement('ul');
    ul.className = 'mine';
    for (const s of row.sentences) {
      const li = document.createElement('li');
      li.className = s.ok ? '' : 'no';
      li.textContent = s.text;
      ul.append(li);
    }
    const tally = document.createElement('li');
    tally.className = 'tally';
    tally.textContent = row.correct + ' correct' + (row.wrong ? ', ' + row.wrong + ' not quite right' : '');
    ul.append(tally);
    return ul;
  }

  /* The top three on steps, the winner in the middle. Tied children stand on the same height. */
  function drawPodium(state) {
    const podium = $('podium');
    const top = view.board.filter(r => r.correct > 0).slice(0, 3);
    podium.hidden = state !== 'over' || !top.length;
    if (podium.hidden) return;
    podium.textContent = '';
    for (const row of [top[1], top[0], top[2]]) {
      if (!row) continue;
      const li = document.createElement('li');
      li.className = 'p' + Math.min(row.rank, 3);
      li.innerHTML = '<div class="who"></div><div class="how-many"></div><div class="step"></div>';
      li.querySelector('.who').textContent = row.name;
      li.querySelector('.how-many').textContent = row.correct + (row.correct === 1 ? ' sentence' : ' sentences');
      li.querySelector('.step').textContent = row.rank;
      podium.append(li);
    }
  }

  /* What the class wrote, for the printer (see @media print in css/class.css). */
  function drawPrintout() {
    const out = $('printout');
    const topic = topics.find(t => t.id === view.topic) || { name: view.topic };
    out.textContent = '';
    const h1 = document.createElement('h1');
    h1.textContent = 'What the class wrote';
    const when = document.createElement('p');
    when.className = 'when';
    when.textContent = topic.name + ', ' + (view.mode === 'silly' ? 'Silly' : 'Real') + ' sentences, ' +
      view.minutes + ' minutes - ' + new Date().toLocaleDateString();
    out.append(h1, when);
    for (const row of view.board) {
      const sec = document.createElement('section');
      const h2 = document.createElement('h2');
      h2.textContent = row.name + ' - ' + row.correct + ' correct';
      const ol = document.createElement('ol');
      for (const s of row.sentences) {
        const li = document.createElement('li');
        li.className = s.ok ? '' : 'no';
        li.textContent = s.text;
        ol.append(li);
      }
      sec.append(h2, ol);
      out.append(sec);
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
      choice.topic = BW.chooseTopic(index).id;
      choice.mode = BW.chooseMode();
    } catch (err) {
      showSetup('Could not load the topics. Start the server with ./serve.sh and reload this page.');
      return;
    }
    await refreshLink();

    document.querySelectorAll('#modes [data-mode]').forEach(b =>
      b.addEventListener('click', () => { choice.mode = b.dataset.mode; drawSetup(); }));
    $('make').addEventListener('click', make);
    $('cancel').addEventListener('click', () => { changing = false; $('setup').hidden = true; $('room').hidden = false; });
    $('start').addEventListener('click', () => act('start'));
    twoStep($('end'), 'Sure? Press again to end it', () => act('end'));
    $('again').addEventListener('click', () => { opened.clear(); act('again'); });
    const change = () => {
      changing = true;
      choice = { topic: view.topic, mode: view.mode, minutes: view.minutes };
      showSetup();
    };
    $('change').addEventListener('click', change);
    $('change-after').addEventListener('click', change);
    $('print').addEventListener('click', () => window.print());
    $('link-btn').addEventListener('click', () => refreshLink({ open: true }));
    // closing the class closes its link, so everyone in it stops - it asks first
    twoStep($('new-class'), 'Sure? Everyone in it stops playing', () => {
      clearTimeout(timer);
      forget();
      refreshLink({ open: false });
      showSetup();
    });
    setInterval(() => { if (view && !$('room').hidden) draw(); }, 250);

    mine = BW.Class.savedTeacher();
    if (mine) await poll();
    else showSetup();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
