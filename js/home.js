/* The home page: pick a worm, remember the choice, then go and play.
   The colours live in data/worms.json, so adding a new worm needs no code.
   The choosing / remembering itself lives in js/worm-skin.js, shared with the game. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  const SEGMENTS = 7;

  let chosenWorm = null;
  let chosenTopic = null;

  /* Both choices ride in the link as well as in storage, so they survive a
     private window, blocked site data, or the game opening on another port. */
  function updatePlayLink() {
    const bits = [];
    if (chosenWorm) bits.push('worm=' + encodeURIComponent(chosenWorm));
    if (chosenTopic) bits.push('topic=' + encodeURIComponent(chosenTopic));
    $('play').href = 'game.html' + (bits.length ? '?' + bits.join('&') : '');
  }

  function buildWorm() {
    const worm = $('worm-preview');
    worm.innerHTML = '';
    // tail first, head last, each segment a beat behind the one before it
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = document.createElement('div');
      seg.className = 'seg' + (i === SEGMENTS - 1 ? ' head' : '');
      seg.style.animationDelay = (i * 0.09) + 's';
      worm.appendChild(seg);
    }
  }

  function applyWorm(worm) {
    document.documentElement.style.setProperty('--worm-body', worm.body);
    document.documentElement.style.setProperty('--worm-head', worm.head);
    $('worm-name').textContent = worm.name;
    chosenWorm = worm.id;
    updatePlayLink();
  }

  function buildSwatches(data, current) {
    const list = $('swatches');
    list.innerHTML = '';
    for (const worm of data.worms) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'swatch';
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(worm.id === current.id));
      button.setAttribute('aria-label', worm.name);
      button.title = worm.name;
      button.innerHTML = '<i style="background:' + worm.head + '"></i>';

      button.addEventListener('click', () => {
        applyWorm(worm);
        BW.saveWorm(worm.id);
        list.querySelectorAll('.swatch')
            .forEach(b => b.setAttribute('aria-checked', String(b === button)));
      });

      li.appendChild(button);
      list.appendChild(li);
    }
  }

  /* The topic decides which set of hand-written sentences the game uses. */
  function buildTopics(index, current) {
    const list = $('topics');
    list.innerHTML = '';
    for (const topic of index.topics) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'topic';
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(topic.id === current.id));
      button.innerHTML = '<span>' + (topic.emoji || '') + '</span><span>' + topic.name +
                         '<small>' + topic.sentences + ' sentences</small></span>';
      button.addEventListener('click', () => {
        BW.saveTopic(topic.id);
        chosenTopic = topic.id;
        updatePlayLink();
        list.querySelectorAll('.topic')
            .forEach(b => b.setAttribute('aria-checked', String(b === button)));
      });
      li.appendChild(button);
      list.appendChild(li);
    }
  }

  async function boot() {
    buildWorm();
    try {
      const data = await fetch('data/worms.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      const current = BW.chooseWorm(data);
      applyWorm(current);
      buildSwatches(data, current);

      const index = await fetch('data/topics.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      const topic = BW.chooseTopic(index);
      chosenTopic = topic.id;
      updatePlayLink();
      buildTopics(index, topic);
    } catch (err) {
      // the page still looks right - it just keeps the default green worm
      $('picker-error').hidden = false;
      console.error('Could not load data/worms.json:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
