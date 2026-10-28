/* A class race, on one player's computer: game.html?class=BCDF

   The teacher runs the race from teacher.html and the server (tools/classroom.py) keeps the
   score. This file keeps the game in step with them. It holds the worm still until the teacher
   presses Start, counts down with the rest of the class, sends every sentence the checker
   marks, keeps the mini leaderboard and the time left up to date in the sidebar, and stops the
   game when the time is up. Everyone plays on their own board; only the scores are shared. */
window.BW = window.BW || {};

BW.Race = (function () {
  const $ = id => document.getElementById(id);
  const POLL_MS = 2000;      // how often to ask for the board
  const ROWS = 5;            // how many of the top players the mini leaderboard shows
  const HURRY_MS = 30000;    // the clock turns red for the last half minute

  class Race {
    constructor(code) {
      this.code = code;
      // the seat rides after the # in the address (see js/classroom.js), or in storage
      const inUrl = /(?:^#|&)seat=([\w-]+)/.exec(location.hash);
      const saved = BW.Class.savedSeat(code);
      this.seat = inUrl ? inUrl[1] : saved && saved.seat;
      this.view = null;
      this.game = null;
      this.outbox = [];        // sentences not yet safely on the server
      this.sent = 0;           // how many sentences this player has sent this race
      this.lastTick = null;
    }

    path(more) { return '/' + this.code + (more || ''); }

    /* The first look at the class, before the game loads: which topic and mode the teacher
       picked, and whether this seat is still in it. Null when that did not work out - the
       player has been sent to join, or told what went wrong. */
    async connect() {
      if (!this.seat) return this.rejoin();
      let r;
      try {
        r = await BW.Class.call(this.path('?me=' + encodeURIComponent(this.seat)));
      } catch (err) {
        return this.fail('Could not reach the class',
                         'Check you are on the same network as your teacher, then reload this page.');
      }
      if (r.data.gone) return this.fail('That class has closed', 'Ask your teacher for a new code.');
      if (!r.ok) return this.fail('Class races need the Bookworms server',
                                  'Start it with ./serve.sh and open this page again.');
      if (!r.data.me) return this.rejoin();
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

    /* The game is loaded: hold it until the teacher says go, and start listening. */
    attach(game) {
      this.game = game;
      game.hold();
      // back after a reload: the sentences already written in this race are still yours
      game.finished = this.view.me.sentences.slice();
      game.notify();
      $('race').hidden = false;
      $('race-code').textContent = this.code;
      this.sync();
      this.ticker = setInterval(() => this.sync(), 250);
      this.timer = setTimeout(() => this.poll(), POLL_MS);
    }

    /* Ask for the board, send anything waiting in the outbox, and go round again. */
    async poll() {
      clearTimeout(this.timer);
      if (this.polling) { this.pollAgain = true; return; }
      this.polling = true;
      try {
        const r = await BW.Class.call(this.path('?me=' + encodeURIComponent(this.seat)));
        if (r.data.gone) return this.gone('closed');
        if (r.ok && !r.data.me) return this.gone('removed');
        // the teacher has started a fresh race, maybe on another topic: load it from the top
        if (r.ok && r.data.round !== this.view.round) return location.reload();
        if (r.ok) { this.view = r.data; this.offline = false; }
        this.flush();
      } catch (err) {
        this.offline = true;     // keep playing - the sentences wait in the outbox
      } finally {
        this.polling = false;
      }
      if (this.done) return;
      this.sync();
      this.timer = setTimeout(() => this.poll(), this.pollAgain ? 0 : POLL_MS);
      this.pollAgain = false;
    }

    /* The game has checked a sentence (the onSentence hook in js/game.js). */
    report(verdict, text) {
      this.outbox.push({ seat: this.seat, round: this.view.round, n: ++this.sent, verdict, text });
      this.flush();
    }

    /* Send the outbox in order. Each sentence carries its number, so one sent twice - the
       answer got lost on the way back - is only counted once. A sentence the server turns
       down (too late, or from an earlier race) is dropped; one that never got there is kept
       for the next try. */
    async flush() {
      if (this.sending) return;
      this.sending = true;
      let counted = false;
      while (this.outbox.length) {
        let r;
        try {
          r = await BW.Class.call(this.path('/sentence'), this.outbox[0]);
        } catch (err) {
          break;
        }
        if (r.status >= 500) break;
        if (r.data.gone) { this.sending = false; return this.gone(r.data.gone === 'seat' ? 'removed' : 'closed'); }
        counted = counted || (r.ok && this.outbox[0].verdict === 'correct');
        this.outbox.shift();
      }
      this.sending = false;
      if (counted) this.poll();     // show the new place on the board straight away
    }

    /* Keep the game and the panel in step with the class clock. Runs a few times a second, so
       the bell goes on time even between looks at the board. */
    sync() {
      const v = this.view, game = this.game;
      if (!v || !game || this.done) return;
      const now = BW.Class.now();
      let state = v.state;
      if (state === 'running' && now >= v.endsAt) state = 'over';

      if (state === 'running' && game.mode === 'waiting') {
        // a second or more to go: count down with everyone. Any less - joining late, or back
        // after a reload - gets the usual countdown, so nobody is thrown in without warning.
        const wait = v.startsAt - now;
        game.startIn(wait >= 1000 ? wait : BW.CONFIG.startDelayMs);
      }
      if (state === 'over' && !game.over) game.timeUp();

      // the clock: the race's length until it starts, then the time left
      const left = state === 'lobby' ? v.minutes * 60000
        : state === 'over' ? 0 : Math.min(v.endsAt - now, v.minutes * 60000);
      $('race-clock').textContent = BW.Class.clock(left);
      $('race-clock-label').textContent = state === 'lobby' ? 'Waiting to start'
        : state === 'over' ? 'Time\'s up!' : now < v.startsAt ? 'Get ready...' : 'Time left';
      $('race-clock-box').classList.toggle('hurry', state === 'running' && left <= HURRY_MS);
      const secs = Math.ceil(left / 1000);
      if (state === 'running' && now >= v.startsAt && secs <= 5 && secs > 0 && secs !== this.lastTick) {
        this.lastTick = secs;
        BW.Sound.tick();
      }

      this.renderBoard(v);
      this.renderCard(state, v);
      $('race-note').textContent = this.offline
        ? 'Trying to reach your teacher\'s computer... keep playing!' : '';
    }

    renderBoard(v) {
      const list = $('race-board');
      const rows = BW.Class.nearTop(v.board, ROWS);
      const key = JSON.stringify(rows);
      if (key === this.boardKey) return;        // nothing new: leave the list alone
      this.boardKey = key;
      list.textContent = '';
      if (!rows.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'Nobody here yet';
        list.append(li);
      }
      for (const row of rows) {
        const li = document.createElement('li');
        if (row.gap) {
          li.className = 'gap';
          li.textContent = '⋮';
        } else {
          li.className = row.you ? 'you' : '';
          const place = document.createElement('span');
          place.className = 'place';
          place.textContent = BW.Class.place(row);
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = row.you ? row.name + ' (you)' : row.name;
          const score = document.createElement('b');
          score.textContent = row.correct;
          li.append(place, name, score);
        }
        list.append(li);
      }
    }

    /* The card on the board: waiting for Start, and the result once the time is up. */
    renderCard(state, v) {
      const card = $('race-card');
      const game = this.game;
      const me = v.me;
      const show = state === 'lobby' || state === 'over' && game.mode === 'over';
      card.hidden = !show;
      if (!show) return;
      const key = state + ':' + me.correct + ':' + me.rank + ':' + v.board.length;
      if (key === this.cardKey) return;
      this.cardKey = key;
      card.className = 'report race-card ' + (state === 'over' ? 'correct' : 'unfinished');

      const others = v.board.length - 1;
      if (state === 'lobby') {
        $('race-card-title').textContent = 'You are in, ' + me.name + '!';
        $('race-card-text').textContent = 'Waiting for your teacher to press Start...';
        $('race-card-more').textContent = game.pack.emoji + ' ' + game.pack.name + ' · ' +
          (game.pack.mode === 'silly' ? '🤪 Silly' : '🌍 Real') + ' sentences · ' +
          v.minutes + (v.minutes === 1 ? ' minute' : ' minutes') + '\n' +
          (others === 0 ? 'You are the first one here.'
            : others + (others === 1 ? ' other player is' : ' other players are') + ' here.');
        $('race-card-podium').hidden = true;
        return;
      }

      $('race-card-title').textContent = 'Time\'s up!';
      const n = me.correct;
      $('race-card-text').textContent = n === 0 ? 'No correct sentences this time - you will get one next race!'
        : 'You wrote ' + n + ' correct sentence' + (n === 1 ? '' : 's') + '! ' +
          (me.rank === 1 ? 'You came 1st! 🏆' : 'You came ' + BW.Class.ordinal(me.rank) + '.');
      $('race-card-more').textContent = 'Wait here: if your teacher starts another race, you will be in it.';
      const podium = $('race-card-podium');
      podium.hidden = false;
      podium.textContent = '';
      for (const row of v.board.filter(r => r.correct > 0).slice(0, 3)) {
        const li = document.createElement('li');
        li.className = row.you ? 'you' : '';
        li.textContent = ['🥇', '🥈', '🥉'][row.rank - 1] || BW.Class.ordinal(row.rank);
        const name = document.createElement('b');
        name.textContent = ' ' + row.name + ' ';
        const score = document.createElement('span');
        score.textContent = row.correct + (row.correct === 1 ? ' sentence' : ' sentences');
        li.append(name, score);
        podium.append(li);
      }
    }

    /* The class closed (the server restarted), or the teacher took this player out of it. */
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

  /* ?class=BCDF in the address makes the game a class race. Null for an ordinary game. */
  function fromUrl() {
    let code = '';
    try { code = BW.Class.cleanCode(new URLSearchParams(location.search).get('class')); } catch (err) { /* no address */ }
    return code ? new Race(code) : null;
  }

  return { fromUrl };
})();
