/* Which worm the player picked on the home page.
   Shared by the home page and the game, so both agree on the colours. */
window.BW = window.BW || {};

BW.WORM_KEY = 'bookworms.worm';
BW.DEFAULT_WORM = { id: 'garden', name: 'Garden Green', body: '#6eb478', head: '#4f8a5b' };

/* localStorage is not always available (private windows, blocked site data),
   and both pages have to work either way - so every use is wrapped. */
BW.savedWorm = function () {
  try { return localStorage.getItem(BW.WORM_KEY); } catch (e) { return null; }
};

BW.saveWorm = function (id) {
  try { localStorage.setItem(BW.WORM_KEY, id); } catch (e) { /* not important */ }
};

/* The worm asked for in the address, as in  game.html?worm=tangerine
   The home page puts it there so the choice survives even when localStorage
   does not - a private window, blocked site data, or the game being opened
   on a different port (storage is per port, so :8000 and :8001 do not share). */
BW.urlWorm = function () {
  try {
    return new URLSearchParams(location.search).get('worm');
  } catch (e) {
    return null;
  }
};

/* Find the worm that was picked. The address wins, then the remembered
   choice, then whatever the file says is the default. */
BW.chooseWorm = function (data, id) {
  const wanted = id || BW.urlWorm() || BW.savedWorm() || data.defaultWorm;
  return data.worms.find(w => w.id === wanted) || data.worms[0] || BW.DEFAULT_WORM;
};
