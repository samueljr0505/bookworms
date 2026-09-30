/* The home page: pick a worm, remember the choice, then go and play.
   The colours live in data/worms.json, so adding a new worm needs no code.
   The choosing / remembering itself lives in js/worm-skin.js, shared with the game. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  const SEGMENTS = 7;

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
    // carry the choice in the link too, so it does not rely on storage
    $('play').href = 'game.html?worm=' + encodeURIComponent(worm.id);
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
    } catch (err) {
      // the page still looks right - it just keeps the default green worm
      $('picker-error').hidden = false;
      console.error('Could not load data/worms.json:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
