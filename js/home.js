/* The start page: your worm, wiggling in everything it is wearing, and Start. The game's
   settings are picked on the next page (setup.html, js/setup.js); the worm's colour, hats
   and the rest in the shop (shop.html). The colours live in data/worms.json, and the
   choosing / remembering itself lives in js/worm-skin.js, shared with the game. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);
  let skin = BW.skinFor(BW.DEFAULT_WORM);

  function applyWorm(worm) {
    document.documentElement.style.setProperty('--worm-body', worm.body);
    document.documentElement.style.setProperty('--worm-head', worm.head);
    $('worm-name').textContent = worm.name;
    skin = BW.skinFor(worm);
    // the worm rides along in the address as well as in storage, so it survives a private
    // window, blocked site data, or the game opening on another port
    $('start').href = 'setup.html?worm=' + encodeURIComponent(worm.id);
  }

  async function boot() {
    BW.WormArt.mount($('worm-preview'), () => skin, { segments: 7, followPointer: true });   // it watches you
    $('bank-points').textContent = BW.closet.bank.toLocaleString();
    try {
      const data = await fetch('data/worms.json').then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      applyWorm(BW.chooseWorm(data));
    } catch (err) {
      // the page still works - it just keeps the default green worm
      $('picker-error').hidden = false;
      console.error('Could not load data/worms.json:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
