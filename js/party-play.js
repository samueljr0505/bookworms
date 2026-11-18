/* A word party's build, on one player's computer: game.html?party=BCDF

   The board is made of the words the class wrote (js/party.js), and the teacher's prompt is up
   in the sidebar. The worm waits for the class clock, every sentence the game finishes is sent
   to the server (tools/party.py), and when the time is up the player picks the one sentence
   they want the class to vote on. When the teacher opens the vote this page hands back to
   party.html, where the voting happens. */
window.BW = window.BW || {};

BW.PartyPlay = (function () {
  const $ = id => document.getElementById(id);
  const POLL_MS = 1500;
  const HURRY_MS = 30000;

  class PartyPlay {
    constructor(code) {
      this.code = code;
      const inUrl = /(?:^#|&)seat=([\w-]+)/.exec(location.hash);
      const saved = BW.Class.savedSeat(code);
      this.seat = inUrl ? inUrl[1] : saved && saved.seat;
      this.view = null;
      this.game = null;
      this.outbox = [];
      this.sent = 0;
    }

    path(more) { return '/' + this.code + (more || ''); }
    me() { return '?me=' + encodeURIComponent(this.seat); }
    partyPage() { return 'party.html?code=' + this.code + '#seat=' + this.seat; }

    /* The first look, before the game loads: the topic and the class's word bank. Null when
       this is not the time to build - the player has been sent where they should be. */
    async connect() {
      if (!this.seat) return this.rejoin();
      let r;
      try {
        r = await BW.Party.call(this.path(this.me()));
      } catch (err) {
        return this.fail('Could not reach the class', 'Check your connection, then reload this page.');
      }
      if (r.data.gone) return this.fail('That class has closed', 'Ask your teacher for a new code.');
      if (!r.ok) return this.fail('Word parties need the Bookworms server', 'Start it with ./serve.sh and open this page again.');
      if (!r.data.me) return this.rejoin();
      if (r.data.phase !== 'building') { location.replace(this.partyPage()); return null; }
      this.view = r.data;
      this.sent = r.data.me.checked;
      return r.data;
    }

    rejoin() {
      location.replace('join.html?code=' + this.code);
      return null;
    }

    fail(title, text) {
      $('loading').hidden = true;
      $('race-error').hidden = false;
      $('race-error-title').textContent = title;
      $('race-error-text').textContent = text;
      return null;
    }

    attach(game) {
      this.game = game;
      game.hold();
      game.finished = this.view.me.sentences.map(s => s.text);
      game.notify();
      // the prompt and the clock go in the bar above the board, where nobody can miss them
      $('party-bar').hidden = false;
      $('party-bar-prompt').textContent = this.view.prompt;
      this.sync();
      this.ticker = setInterval(() => this.sync(), 250);
      this.timer = setTimeout(() => this.poll(), POLL_MS);
    }

    async poll() {
      clearTimeout(this.timer);
      try {
        const r = await BW.Party.call(this.path(this.me()));
        if (r.data.gone) return this.gone('closed');
        if (r.ok && !r.data.me) return this.gone('removed');
        if (r.ok && (r.data.phase !== 'building' || r.data.build !== this.view.build)) {
          // the vote is open, or the teacher started something new: off to where it happens
          if (!this.outbox.length) return location.replace(this.partyPage());
        }
        if (r.ok) { this.view = r.data; this.offline = false; }
        this.flush();
      } catch (err) {
        this.offline = true;
      }
      if (this.done) return;
      this.sync();
      this.timer = setTimeout(() => this.poll(), POLL_MS);
    }

    /* The game finished a sentence (the onSentence hook in js/game.js). */
    report(verdict, text) {
      if (verdict !== 'correct') return;
      this.outbox.push({ seat: this.seat, build: this.view.build, n: ++this.sent, text });
      this.flush();
    }

    async flush() {
      if (this.sending) return;
      this.sending = true;
      let sent = false;
      while (this.outbox.length) {
        let r;
        try {
          r = await BW.Party.call(this.path('/sentence'), this.outbox[0]);
        } catch (err) {
          break;
        }
        if (r.status >= 500) break;
        if (r.data.gone) { this.sending = false; return this.gone(r.data.gone === 'seat' ? 'removed' : 'closed'); }
        this.outbox.shift();
        sent = true;
      }
      this.sending = false;
      if (sent) this.poll();       // the new sentence is now one to pick from
    }

    async pick(n) {
      try {
        const r = await BW.Party.call(this.path('/pick'), { seat: this.seat, n });
        if (r.ok) { this.view = r.data; this.cardKey = null; this.sync(); }
      } catch (err) { /* the next look will show whatever was kept */ }
    }

    sync() {
      const v = this.view, game = this.game;
      if (!v || !game || this.done) return;
      const now = BW.Class.now();
      const over = v.over || now >= v.endsAt;
      if (!over && game.mode === 'waiting') {
        const wait = v.startsAt - now;
        game.startIn(wait >= 1000 ? wait : BW.CONFIG.startDelayMs);
      }
      if (over && !game.over) game.timeUp();

      const left = over ? 0 : Math.min(v.endsAt - now, v.minutes * 60000);
      $('party-bar-clock').textContent = BW.Class.clock(left);
      $('party-bar-clock-label').textContent = over ? 'Time\'s up!' : now < v.startsAt ? 'Get ready...' : 'Time left';
      $('party-bar-clock-box').classList.toggle('hurry', !over && left <= HURRY_MS);
      $('party-bar-note').textContent = this.offline ? 'Trying to reach your teacher\'s computer... keep playing!' : '';
      this.renderCard(over && game.mode === 'over');
    }

    /* Time's up: pick the sentence the class will vote on. */
    renderCard(show) {
      const card = $('race-card');
      card.hidden = !show;
      if (!show) return;
      const me = this.view.me;
      const key = JSON.stringify([me.sentences, me.picked]);
      if (key === this.cardKey) return;
      this.cardKey = key;
      card.className = 'report race-card correct party-card';
      $('race-card-title').textContent = 'Time\'s up!';
      const list = $('race-card-podium');
      list.textContent = '';
      list.hidden = !me.sentences.length;
      if (!me.sentences.length) {
        $('race-card-text').textContent = 'No sentences this time - but you can still vote!';
        $('race-card-more').textContent = 'Wait here for your teacher to open the vote.';
        return;
      }
      $('race-card-text').textContent = 'Pick the sentence you want the class to vote on:';
      const chosen = me.picked || me.sentences[me.sentences.length - 1].n;
      for (const s of me.sentences) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pick' + (s.n === chosen ? ' on' : '');
        b.setAttribute('aria-pressed', String(s.n === chosen));
        b.textContent = (s.n === chosen ? '⭐ ' : '') + s.text;
        b.addEventListener('click', () => this.pick(s.n));
        li.append(b);
        list.append(li);
      }
      $('race-card-more').textContent = 'Wait here for your teacher to open the vote.';
    }

    gone(why) {
      this.done = true;
      clearTimeout(this.timer);
      clearInterval(this.ticker);
      if (this.game) this.game.timeUp();
      const card = $('race-card');
      card.hidden = false;
      card.className = 'report race-card wrong';
      $('race-card-podium').hidden = true;
      $('race-card-title').textContent = why === 'closed' ? 'This class has closed' : 'You are not in this class any more';
      $('race-card-text').textContent = why === 'closed' ? 'Ask your teacher for a new code.'
        : 'Your teacher took you out of the class. You can join again with your name.';
      $('race-card-more').textContent = '';
      const link = $('race-card-go');
      link.textContent = why === 'closed' ? 'Join a class' : 'Join again';
      link.href = 'join.html' + (why === 'closed' ? '' : '?code=' + this.code);
      link.hidden = false;
    }
  }

  /* ?party=BCDF in the address makes the game a word party's build. Null otherwise. */
  function fromUrl() {
    let code = '';
    try { code = BW.Class.cleanCode(new URLSearchParams(location.search).get('party')); } catch (err) { /* no address */ }
    return code ? new PartyPlay(code) : null;
  }

  return { fromUrl };
})();
