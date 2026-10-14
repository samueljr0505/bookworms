/* The shop: spend the points saved up from playing on colours, hats, glasses and more.
   What there is to buy lives in data/shop.json (and the colours in data/worms.json); the
   saving and spending lives in js/closet.js; the drawing lives in js/worm-art.js. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);

  let worms = null;        // data/worms.json
  let slots = [];
  let items = [];          // every item in every slot, colours included
  let slot = 'hat';        // the tab being looked at
  let trying = null;       // the item being tried on in the dressing room
  let confirming = null;   // the item whose Buy button has been pressed once
  const stageFx = new BW.WormArt.Particles();

  const wornColor = () => BW.chooseWorm(worms);

  /* Is this item the one being worn right now? */
  function wearing(item) {
    if (item.slot === 'color') return wornColor().id === item.id;
    return BW.closet.wearing(item.slot) === item.id;
  }

  /* The worm as it is now, with `item` put on top. */
  function skinWith(item) {
    const skin = BW.skinFor(wornColor());
    if (!item) return skin;
    if (item.slot === 'color') return { ...skin, body: item.body, head: item.head };
    return { ...skin, [item.slot]: item.id };
  }

  function renderBank() {
    $('bank-points').textContent = BW.closet.bank.toLocaleString();
  }

  function renderStage() {
    $('stage-name').textContent = trying ? trying.name : wornColor().name + ' worm';
    const note = $('stage-note');
    if (!trying) note.textContent = 'Tap anything below to try it on.';
    else if (wearing(trying)) note.textContent = 'You are wearing this.';
    else if (BW.closet.owns(trying)) note.textContent = 'You own this. Tap Wear to put it on.';
    else note.textContent = 'Trying it on. It costs ' + trying.price + ' points.';
  }

  function renderSlots() {
    const nav = $('slots');
    nav.innerHTML = '';
    for (const s of slots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(s.id === slot));
      b.innerHTML = '<span class="slot-emoji">' + s.emoji + '</span>';
      b.append(s.name);
      b.addEventListener('click', () => {
        slot = s.id;
        trying = null;
        confirming = null;
        renderSlots();
        renderItems();
        renderStage();
      });
      nav.appendChild(b);
    }
  }

  function renderItems() {
    const list = $('items');
    list.innerHTML = '';
    for (const item of items.filter(i => i.slot === slot)) {
      const owned = BW.closet.owns(item);
      const worn = wearing(item);
      const li = document.createElement('li');
      li.className = 'item' + (worn ? ' worn' : '') + (owned ? ' owned' : ' locked') +
                     (trying === item ? ' trying' : '');

      const look = document.createElement('button');
      look.type = 'button';
      look.className = 'item-look';
      look.setAttribute('aria-label', 'Try on ' + item.name);
      const canvas = document.createElement('canvas');
      canvas.className = 'item-worm';
      look.appendChild(canvas);
      look.addEventListener('click', () => tryOn(item));
      BW.WormArt.mount(canvas, () => skinWith(item), { segments: 3 });

      const name = document.createElement('b');
      name.className = 'item-name';
      name.textContent = item.name;

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'item-action';
      if (worn) {
        action.textContent = 'Wearing ✓';
        action.disabled = true;
      } else if (owned) {
        action.textContent = 'Wear';
        action.classList.add('wear');
        action.addEventListener('click', () => wear(item));
      } else if (BW.closet.bank >= item.price) {
        // two taps to buy, so nothing is bought by accident
        action.textContent = confirming === item ? 'Sure? Buy it!' : '⭐ ' + item.price;
        action.classList.add(confirming === item ? 'confirm' : 'buy');
        action.addEventListener('click', () => buy(item));
      } else {
        action.innerHTML = '🔒 ' + item.price;
        action.title = 'You need ' + (item.price - BW.closet.bank) + ' more points';
        action.classList.add('short');
        action.addEventListener('click', () => tryOn(item));
      }

      if (!owned && BW.closet.bank < item.price) {
        const need = document.createElement('small');
        need.className = 'item-need';
        need.textContent = (item.price - BW.closet.bank) + ' more to go';
        li.append(look, name, action, need);
      } else {
        li.append(look, name, action);
      }
      list.appendChild(li);
    }
  }

  function tryOn(item) {
    trying = item;
    if (confirming !== item) confirming = null;
    renderItems();
    renderStage();
  }

  function wear(item) {
    if (item.slot === 'color') BW.saveWorm(item.id);
    else BW.closet.equip(item);
    trying = null;
    confirming = null;
    BW.Sound.tick();
    renderItems();
    renderStage();
    updatePlayLink();
  }

  function buy(item) {
    if (confirming !== item) {
      confirming = item;
      trying = item;
      renderItems();
      renderStage();
      return;
    }
    const result = BW.closet.buy(item);
    confirming = null;
    if (!result.ok) { renderItems(); return; }
    BW.Sound.buy();
    celebrate();
    renderBank();
    wear(item);
    $('stage-note').textContent = 'It is yours! Your worm is wearing it now.';
  }

  /* Confetti over the dressing room. */
  function celebrate() {
    const c = $('stage-worm');
    for (let k = 0; k < 3; k++) {
      stageFx.emit('confetti', c.clientWidth * (0.25 + 0.25 * k), c.clientHeight * 0.5, 30,
                   { speed: 160, life: 1500, size: 9 });
    }
  }

  /* The play link carries the worm colour, the same way the home page's does. */
  function updatePlayLink() {
    if (worms) $('play').href = 'game.html?worm=' + encodeURIComponent(wornColor().id);
  }

  async function boot() {
    renderBank();
    try {
      const get = f => fetch(f).then(r => { if (!r.ok) throw new Error(f + ': HTTP ' + r.status); return r.json(); });
      const [w, shop] = await Promise.all([get('data/worms.json'), get('data/shop.json')]);
      worms = w;
      slots = shop.slots;
      items = BW.colorItems(worms).concat(shop.items);
      const asked = new URLSearchParams(location.search).get('slot');
      if (slots.some(s => s.id === asked)) slot = asked;
    } catch (err) {
      $('shop-error').hidden = false;
      console.error('Could not load the shop:', err);
      return;
    }

    const stage = BW.WormArt.mount($('stage-worm'), () => skinWith(trying), { segments: 6, letters: 'WORM' });
    stage.fx = stageFx;     // celebrate() throws its confetti into the stage's own particles

    renderSlots();
    renderItems();
    renderStage();
    updatePlayLink();

    // points earned in another tab show up when you come back to this one
    window.addEventListener('focus', () => { BW.closet.fresh(); renderBank(); renderItems(); });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
