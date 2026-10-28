/* The home page: pick a worm, remember the choice, then go and play.
   The colours live in data/worms.json, so adding a new worm needs no code.
   The choosing / remembering itself lives in js/worm-skin.js, shared with the game.
   Colours with a price are bought in the shop (shop.html) before they show up here. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  let chosenWorm = null;
  let skin = BW.skinFor(BW.DEFAULT_WORM);
  let chosenTopic = null;
  let chosenMode = BW.chooseMode();

  /* Both choices ride in the link as well as in storage, so they survive a
     private window, blocked site data, or the game opening on another port. */
  function updatePlayLink() {
    const bits = [];
    if (chosenWorm) bits.push('worm=' + encodeURIComponent(chosenWorm));
    if (chosenTopic) bits.push('topic=' + encodeURIComponent(chosenTopic));
    bits.push('mode=' + chosenMode);
    $('play').href = 'game.html' + (bits.length ? '?' + bits.join('&') : '');
  }

  function buildWorm() {
    BW.WormArt.mount($('worm-preview'), () => skin, { segments: 7, followPointer: true });   // it watches you
    $('bank-points').textContent = BW.closet.bank.toLocaleString();
  }

  function applyWorm(worm) {
    document.documentElement.style.setProperty('--worm-body', worm.body);
    document.documentElement.style.setProperty('--worm-head', worm.head);
    $('worm-name').textContent = worm.name;
    skin = BW.skinFor(worm);
    chosenWorm = worm.id;
    updatePlayLink();
  }

  function buildSwatches(data, current) {
    const list = $('swatches');
    list.innerHTML = '';
    // only the colours you own; the rest wait in the shop
    const owned = BW.colorItems(data).filter(w => BW.closet.owns(w));
    for (const worm of owned) {
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
        list.querySelectorAll('.swatch:not(.more)')
            .forEach(b => b.setAttribute('aria-checked', String(b === button)));
      });

      li.appendChild(button);
      list.appendChild(li);
    }
    const locked = data.worms.length - owned.length;
    if (locked > 0) {
      const li = document.createElement('li');
      li.innerHTML = '<a class="swatch more" href="shop.html?slot=color" title="More colors in the shop">' +
                     '<i>+' + locked + '</i></a>';
      list.appendChild(li);
    }
  }

  /* The topic decides which word lists the game uses. */
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
      button.textContent = (topic.emoji ? topic.emoji + ' ' : '') + topic.name;
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

  /* Real or Silly: whether a sentence has to make sense, or only sound right. Only the chosen
     one is explained, in one line under the switch. */
  function buildModes() {
    const buttons = document.querySelectorAll('#modes [data-mode]');
    const show = () => buttons.forEach(b => {
      const on = b.dataset.mode === chosenMode;
      b.setAttribute('aria-checked', String(on));
      if (on) $('mode-note').textContent = b.dataset.note;
    });
    buttons.forEach(b => b.addEventListener('click', () => {
      chosenMode = b.dataset.mode;
      BW.saveMode(chosenMode);
      show();
      updatePlayLink();
    }));
    show();
  }

  async function boot() {
    buildWorm();
    buildModes();
    updatePlayLink();
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
