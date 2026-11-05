/* The settings page (setup.html): one question at a time - the topic, Real or Silly, how
   fast - and then Play. Picking an answer moves on to the next question; the steps along the
   top, Back, and the browser's own Back button all go back to change one. Each step has its
   own address (setup.html#mode), so Back works the way a child expects.

   Every choice is remembered (js/worm-skin.js) and also rides in the Play link, so it
   survives a private window, blocked site data, or the game opening on another port. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  const STEPS = ['topic', 'mode', 'speed'];
  const MOVE_ON_MS = 250;       // long enough to see the answer light up before the next question

  let topics = [];
  const choice = { topic: null, mode: BW.chooseMode(), speed: BW.chooseSpeed() };
  // the worm picked on the start page, passed along to the game
  let worm = null;
  try { worm = new URLSearchParams(location.search).get('worm'); } catch (err) { /* no address */ }

  /* ---------- which question is showing ---------- */

  function stepNow() {
    const step = location.hash.slice(1);
    return STEPS.includes(step) ? step : STEPS[0];
  }

  function goTo(step) {
    if (step === stepNow()) return;
    location.hash = step;                   // a new history entry: the browser's Back comes back here
  }

  function show(moved) {
    const step = stepNow();
    const at = STEPS.indexOf(step);
    document.querySelectorAll('.step').forEach(s => { s.hidden = s.dataset.step !== step; });
    document.querySelectorAll('.steps button').forEach(b => {
      const i = STEPS.indexOf(b.dataset.goto);
      b.parentElement.className = i < at ? 'done' : i === at ? 'now' : '';
      if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    $('prev').innerHTML = at === 0 ? '&larr; Home' : '&larr; Back';
    $('next').hidden = at === STEPS.length - 1;
    drawSummary();
    // after moving on, the new question is where the keyboard and a screen reader carry on from
    if (moved) {
      const q = document.querySelector('.step[data-step="' + step + '"] .question');
      q.tabIndex = -1;
      q.focus({ preventScroll: true });
    }
  }

  function prev() {
    const at = STEPS.indexOf(stepNow());
    if (at === 0) location.href = 'index.html';
    else goTo(STEPS[at - 1]);
  }

  function next() {
    const at = STEPS.indexOf(stepNow());
    if (at < STEPS.length - 1) goTo(STEPS[at + 1]);
  }

  /* ---------- the answers ---------- */

  /* Mark the chosen answer in a group of radio buttons. */
  function mark(buttons, isOn) {
    buttons.forEach(b => b.setAttribute('aria-checked', String(isOn(b))));
  }

  /* An answer was picked: remember it, and on all but the last question, move on. */
  function picked(step) {
    updatePlayLink();
    drawSummary();
    if (step !== STEPS[STEPS.length - 1]) setTimeout(() => { if (stepNow() === step) next(); }, MOVE_ON_MS);
  }

  function buildTopics() {
    const list = $('topics');
    list.textContent = '';
    for (const topic of topics) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';
      b.setAttribute('role', 'radio');
      b.dataset.topic = topic.id;
      const icon = document.createElement('span');
      icon.className = 'option-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = topic.emoji || '';
      const name = document.createElement('b');
      name.textContent = topic.name;
      b.append(icon, name);
      b.addEventListener('click', () => {
        choice.topic = topic.id;
        BW.saveTopic(topic.id);
        mark(list.querySelectorAll('.option'), x => x === b);
        picked('topic');
      });
      li.append(b);
      list.append(li);
    }
    mark(list.querySelectorAll('.option'), x => x.dataset.topic === choice.topic);
  }

  function buildChoice(attr, save, step) {
    const buttons = document.querySelectorAll('[data-' + attr + ']');
    mark(buttons, b => b.dataset[attr] === choice[step]);
    buttons.forEach(b => b.addEventListener('click', () => {
      choice[step] = b.dataset[attr];
      save(choice[step]);
      mark(buttons, x => x === b);
      picked(step);
    }));
  }

  /* What is about to be played, in a line above Play. */
  function drawSummary() {
    const topic = topics.find(t => t.id === choice.topic);
    const button = (attr, value) => document.querySelector('[data-' + attr + '="' + value + '"]');
    const label = b => b ? b.querySelector('.option-icon').textContent + ' ' + b.querySelector('b').textContent : '';
    $('summary').textContent = [topic ? (topic.emoji ? topic.emoji + ' ' : '') + topic.name : '',
                                label(button('mode', choice.mode)), label(button('speed', choice.speed))]
      .filter(Boolean).join('  ·  ');
  }

  function updatePlayLink() {
    const bits = [];
    if (worm) bits.push('worm=' + encodeURIComponent(worm));
    if (choice.topic) bits.push('topic=' + encodeURIComponent(choice.topic));
    bits.push('mode=' + choice.mode, 'speed=' + choice.speed);
    $('play').href = 'game.html?' + bits.join('&');
  }

  /* ---------- start up ---------- */

  async function boot() {
    $('bank-points').textContent = BW.closet.bank.toLocaleString();
    buildChoice('mode', BW.saveMode, 'mode');
    buildChoice('speed', BW.saveSpeed, 'speed');
    $('prev').addEventListener('click', prev);
    $('next').addEventListener('click', next);
    document.querySelectorAll('.steps button').forEach(b => b.addEventListener('click', () => goTo(b.dataset.goto)));
    window.addEventListener('hashchange', () => show(true));
    updatePlayLink();
    show(false);
    try {
      const index = await fetch('data/topics.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      topics = index.topics;
      choice.topic = BW.chooseTopic(index).id;
      buildTopics();
      updatePlayLink();
      drawSummary();
    } catch (err) {
      // the other questions still work, and the game falls back to its own default topic
      $('setup-error').hidden = false;
      console.error('Could not load data/topics.json:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
