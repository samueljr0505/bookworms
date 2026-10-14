/* The worm's closet: the points saved up from playing, the things bought with them in the
   shop, and what the worm is wearing right now. Shared by the home page, the shop and the game.

   Points only ever go in from finished sentences (a wrong sentence costs points in the game's
   score, never in the closet), and only come out by buying something - so nothing a child
   bought can be taken away by a bad round. The shop's items live in data/shop.json and the
   colours in data/worms.json; this file only knows their slot, id and price. */
window.BW = window.BW || {};

BW.Closet = class Closet {
  static KEY = 'bookworms.closet';

  static blank() {
    return {
      bank: 0,          // points ready to spend
      lifetime: 0,      // every point ever earned - never goes down
      owned: [],        // "slot:id" of everything bought
      equipped: { hat: 'none', glasses: 'none', neck: 'none', pattern: 'plain', trail: 'none' }
    };
  }

  /* `storage` is anything with getItem/setItem - localStorage in the browser, a stand-in in
     the tests, or null when the browser will not allow storage (the closet then lasts as long
     as the page does). */
  constructor(storage) {
    this.storage = storage || null;
    this.state = this.read();
  }

  saved() {
    try { return JSON.parse(this.storage.getItem(BW.Closet.KEY)); } catch (e) { return null; }
  }

  read() {
    const state = BW.Closet.blank();
    try {
      const saved = this.saved();
      if (saved && typeof saved === 'object') {
        if (Number.isFinite(saved.bank)) state.bank = Math.max(0, saved.bank);
        if (Number.isFinite(saved.lifetime)) state.lifetime = Math.max(0, saved.lifetime);
        if (Array.isArray(saved.owned)) state.owned = saved.owned.filter(k => typeof k === 'string');
        Object.assign(state.equipped, saved.equipped || {});
      }
    } catch (e) { /* nothing saved yet, or no storage - start with an empty closet */ }
    return state;
  }

  write() {
    try { this.storage.setItem(BW.Closet.KEY, JSON.stringify(this.state)); } catch (e) { /* not important */ }
  }

  get bank() { return this.state.bank; }

  key(item) { return item.slot + ':' + item.id; }

  /* Free things (no price) are owned from the start. */
  owns(item) {
    return !item.price || this.state.owned.includes(this.key(item));
  }

  /* Every change starts from what is saved, so the game in one tab and the shop in another
     never undo each other's points or purchases. With no storage, the copy in memory is it. */
  fresh() {
    if (this.saved()) this.state = this.read();
  }

  earn(points) {
    if (!(points > 0)) return;
    this.fresh();
    this.state.bank += points;
    this.state.lifetime += points;
    this.write();
  }

  /* Returns { ok: true } or { ok: false, reason: 'owned' | 'short', need } */
  buy(item) {
    this.fresh();
    if (this.owns(item)) return { ok: false, reason: 'owned' };
    if (this.state.bank < item.price) {
      return { ok: false, reason: 'short', need: item.price - this.state.bank };
    }
    this.state.bank -= item.price;
    this.state.owned.push(this.key(item));
    this.write();
    return { ok: true };
  }

  /* Colours are worn through BW.saveWorm (they also ride in the game link), so this is for
     every other slot. You can only put on what you own. */
  equip(item) {
    this.fresh();
    if (!this.owns(item) || item.slot === 'color') return false;
    this.state.equipped[item.slot] = item.id;
    this.write();
    return true;
  }

  wearing(slot) { return this.state.equipped[slot]; }

  /* The cheapest thing not bought yet - something to save up for. */
  nextGoal(items) {
    return items.filter(i => !this.owns(i))
                .sort((a, b) => a.price - b.price)[0] || null;
  }
};

BW.closet = new BW.Closet((() => {
  try { return window.localStorage; } catch (e) { return null; }
})());

/* The colours in data/worms.json as shop items. The first ones have no price and are free. */
BW.colorItems = function (wormData) {
  return wormData.worms.map(w => ({ ...w, slot: 'color', price: w.price || 0 }));
};

/* Everything needed to draw the worm: its colours plus what it is wearing. */
BW.skinFor = function (worm, closet) {
  const c = closet || BW.closet;
  return { body: worm.body, head: worm.head, ...c.state.equipped };
};
