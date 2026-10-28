/* The join page: type the class code and your first name, then wait in the game for the
   teacher to press Start. The server hands back a seat - this player's place in the class -
   which goes with them into the game (see js/classroom.js). */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);

  function say(text) { $('error').textContent = text; }

  async function join(event) {
    event.preventDefault();
    const code = BW.Class.cleanCode($('code').value);
    const name = $('name').value.trim();
    if (code.length !== 4) { say('The class code is four letters.'); $('code').focus(); return; }
    if (!name) { say('Type your first name.'); $('name').focus(); return; }

    say('');
    $('go').disabled = true;
    $('go').textContent = 'Joining...';
    try {
      // already in this class on this computer (a reload, a wrong turn)? Then it is the same
      // seat - as long as it is the same name, so a classmate never ends up in it
      const before = BW.Class.savedSeat(code);
      const r = await BW.Class.call('/' + code + '/join', { name, seat: before && before.seat });
      if (r.ok) {
        BW.Class.saveSeat({ code, seat: r.data.seat, name: r.data.name });
        location.href = 'game.html?class=' + code + '#seat=' + r.data.seat;
        return;
      }
      say(r.data.gone ? 'There is no class with the code ' + code + '. Check the letters with your teacher.'
        : r.data.error || 'Class races need the Bookworms server. Start it with ./serve.sh.');
    } catch (err) {
      say('Could not reach your teacher\'s computer. Is this the address your teacher gave you?');
    }
    $('go').disabled = false;
    $('go').textContent = 'Join';
  }

  document.addEventListener('DOMContentLoaded', () => {
    let code = '';
    try { code = BW.Class.cleanCode(new URLSearchParams(location.search).get('code')); } catch (err) { /* no address */ }
    $('code').value = code;
    const saved = code && BW.Class.savedSeat(code);
    if (saved) $('name').value = saved.name;
    $('code').addEventListener('input', () => { $('code').value = BW.Class.cleanCode($('code').value); });
    $('join').addEventListener('submit', join);
    (code ? $('name') : $('code')).focus();
  });
})();
