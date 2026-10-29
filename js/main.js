/* Loads the word packs, starts the game, and keeps the panels on screen up to date. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);

  /* Load the topic the player picked on the home page - or, in a class race, the one the
     teacher picked. Each topic is a set of sentences written out by hand, so everything it
     can produce has been read by a person first. */
  async function loadPack(topicId, mode) {
    const index = await fetch('data/topics.json').then(r => {
      if (!r.ok) throw new Error('topics.json: HTTP ' + r.status);
      return r.json();
    });
    const topic = BW.chooseTopic(index, topicId);
    const pack = await fetch('data/' + topic.file).then(r => {
      if (!r.ok) throw new Error(topic.file + ': HTTP ' + r.status);
      return r.json();
    });
    // Real (it has to make sense) or Silly (it only has to sound right), from the home page
    return BW.Grammar.forMode(pack, mode || BW.chooseMode());
  }

  /* Players only ever see the family a part of speech belongs to. The fine-grained
     tags (transitive, baseVerb, subordinator...) are for the grammar engine; showing
     a 3rd grader seventeen of them is noise, not teaching. */
  function family(pack, pos) {
    const info = pack.pos[pos];
    return (info && pack.families && pack.families[info.family]) || null;
  }

  function posLabel(pack, pos) {
    if (pos === 'punctuation') return 'Ending mark';
    const fam = family(pack, pos);
    if (fam) return fam.label;
    return (pack.pos[pos] && pack.pos[pos].label) || pos;
  }

  function posColor(pack, pos) {
    if (pos === 'punctuation') return '#f5c26b';
    const fam = family(pack, pos);
    return (fam && fam.color) || (pack.pos[pos] && pack.pos[pos].color) || '#9aa7d7';
  }

  const article = w => (/^[AEIOU]/i.test(w) ? 'an' : 'a');

  /* One row per family, not one per part of speech - a short list a child can learn. */
  function renderLegend(pack) {
    const ul = $('legend');
    ul.innerHTML = '';
    const groups = pack.families || pack.pos;
    for (const id of Object.keys(groups)) {
      const info = groups[id];
      const li = document.createElement('li');
      li.innerHTML = `<i style="background:${info.color}"></i>
                      <b>${info.label}</b><span>${info.hint}</span>`;
      ul.appendChild(li);
    }
  }

  /* What each building block of a sentence answers - shown in an empty block, and on hover. */
  const ASKS = {
    Subject: 'who or what?', Verb: 'what happens?', Object: 'who or what gets it?',
    Complement: 'what is it like?', Modifier: 'how? where?'
  };

  function chip(pack, text, pos, state) {
    const el = document.createElement('span');
    el.className = 'chip ' + state;
    if (pos) el.style.borderColor = posColor(pack, pos);
    if (pos && state === 'done') el.style.background = posColor(pack, pos);
    el.textContent = text;
    return el;
  }

  function renderHud(game) {
    const pack = game.pack;
    const s = game.sentence;
    const guide = s.guide();

    $('score').textContent = game.score;
    $('count').textContent = game.finished.length;
    $('streak').textContent = game.streak;
    $('streak-box').classList.toggle('hot', game.streak >= 2);

    // the shape being built: the recipe the player was handed, or the one their words
    // have turned into instead - any shape the topic knows is a fine sentence
    const name = guide && guide.pattern.name;
    $('building-label').textContent = !guide ? 'Your sentence'
      : guide.pattern === s.pattern ? 'Build ' + article(name) + ' ' + name
      : 'Now it is ' + article(name) + ' ' + name;

    // The sentence, block by block: Subject, Verb, then an Object, a Complement or a
    // Modifier, each holding its words. A block still to come shows the kinds of word it
    // is made of; the block the next word goes in shows every kind that would fit there.
    const wanted = s.wants();
    const nextBlock = new Map(wanted.map(m => [m, s.blockOfNext(m)]));
    const kindsOf = ms => [...new Set(ms.map(m => posLabel(pack, m.pos || BW.Grammar.posOfWord(pack, m.word))))].join(' or ');
    const segments = s.segments();
    const building = $('building');
    building.textContent = '';
    let nextFound = segments.some(seg => seg.state === 'next');
    for (const seg of segments) {
      const fits = wanted.filter(m => nextBlock.get(m) === seg.block);
      // with nothing left that must be added, an optional block the next word fits is next
      const state = seg.state === 'todo' && !nextFound && fits.length ? 'next' : seg.state;
      if (state === 'next') nextFound = true;
      const box = document.createElement('div');
      box.className = 'seg ' + state + (seg.optional ? ' optional' : '');
      box.title = seg.block + ': ' + ASKS[seg.block];
      const head = document.createElement('small');
      head.textContent = seg.block + (seg.optional ? ' (optional)' : '');
      const row = document.createElement('div');
      row.className = 'seg-words';
      let asked = false;     // the first slot to fill shows every kind that fits: "Adjective or Noun"
      for (const slot of seg.slots) {
        if (slot.state === 'done') row.append(chip(pack, slot.word, slot.pos, 'done'));
        else if (slot.state === 'next' && fits.length) {
          if (!asked) row.append(chip(pack, kindsOf(fits), slot.pos, 'next'));
          asked = true;
        } else row.append(chip(pack, posLabel(pack, slot.pos), slot.pos, slot.state));
      }
      if (!seg.slots.length) {
        row.append(state === 'next' ? chip(pack, kindsOf(fits), null, 'next')
                                    : chip(pack, ASKS[seg.block], null, 'todo ask'));
      }
      box.append(head, row);
      building.append(box);
    }
    // the ending mark is the last piece of every sentence
    const end = document.createElement('div');
    end.className = 'seg end ' + (s.canEnd() ? 'next' : 'todo');
    end.title = 'Punctuation ends the sentence';
    const endHead = document.createElement('small');
    endHead.textContent = 'End';
    const endRow = document.createElement('div');
    endRow.className = 'seg-words';
    endRow.append(chip(pack, s.endMarks().join(' '), 'punctuation', s.canEnd() ? 'next' : 'todo'));
    end.append(endHead, endRow);
    building.append(end);

    // what to hunt for next: grouped by kind, and a kind where only certain words fit says
    // so ("an Adjective that goes with tasted"), since not every Adjective will do
    const marks = '<b>' + s.endMarks().join('</b> or <b>') + '</b>';
    const kinds = new Map();
    for (const m of wanted) {
      const label = posLabel(pack, m.pos || BW.Grammar.posOfWord(pack, m.word));
      kinds.set(label, (kinds.get(label) !== false) && !!m.word);
    }
    const last = s.tokens.length ? s.tokens[s.tokens.length - 1].word : null;
    const parts = [...kinds].map(([label, onlySome]) => article(label) + ' <b>' + label + '</b>' +
      (onlySome && last ? ' that goes with "' + last + '"' : ''));
    if (s.canEnd()) parts.push('a punctuation mark (' + marks + ') to finish');
    $('next-up').innerHTML = 'Find ' + parts.join(' or ');

    // the word the worm just bumped into and would not eat, and why
    const no = $('refusal');
    no.hidden = !game.refusal;
    no.textContent = game.refusal ? game.refusal.reason : '';

    $('btn-pause').innerHTML = (game.mode === 'paused' ? 'Resume' : 'Pause') + ' <kbd>P</kbd>';

    const list = $('finished');
    if (game.finished.length === 0) {
      list.innerHTML = '<li class="empty">None yet - go get a word!</li>';
    } else {
      list.innerHTML = '';
      game.finished.slice().reverse().forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
    }
  }

  /* ---------- the sentence check card ---------- */

  const CHEERS = ['Great sentence!', 'You did it!', 'Super sentence!', 'Nice work!'];
  const BY = {
    rules: 'Checked by the game\'s rules.',
    judge: 'Checked by the game\'s rules and the AI judge.',
    teacher: 'Checked by the game\'s rules and your teacher\'s answer key.'
  };
  const ICONS = { ok: '✓', bad: '✗', skip: '–', wait: '•' };

  /* Everything in the card is set with textContent - the judge's words come from an AI
     and are shown as plain text, never as HTML. */
  function renderReport(game, report) {
    const card = $('report');
    if (!report) { card.hidden = true; return; }
    const checking = report.phase === 'checking';
    card.hidden = false;
    card.className = 'report ' + (checking ? 'checking' : report.verdict);

    $('report-title').textContent = checking ? 'Checking your sentence...'
      : CHEERS[game.finished.length % CHEERS.length];

    const line = $('report-sentence');
    line.textContent = '';
    report.words.forEach((w, i) => {
      if (i > 0 && w !== ',') line.append(' ');
      const span = document.createElement('span');
      span.textContent = w;
      line.append(span);
    });
    line.append(report.mark);

    const items = $('report-items');
    items.textContent = '';
    report.items.forEach((item, i) => {
      const state = checking ? 'wait' : item.ok === true ? 'ok' : item.ok === false ? 'bad' : 'skip';
      const li = document.createElement('li');
      li.className = state;
      li.style.setProperty('--i', i);
      const icon = document.createElement('i');
      icon.textContent = ICONS[state];
      const title = document.createElement('b');
      title.textContent = item.title;
      const note = document.createElement('span');
      // the headline says the main problem in full, so it is not repeated in the list
      note.textContent = checking || item.note === report.headline ? '' : item.note;
      li.append(icon, title, note);
      items.append(li);
    });

    const judging = BW.Judge.status().state === 'on';
    $('report-headline').textContent = checking ? (judging ? 'The judge is reading it...' : '')
                                                : report.headline;
    // the judge's tip, when it thinks the sentence could sound better
    const tip = $('report-tip');
    tip.hidden = checking || !report.tip;
    tip.textContent = report.tip ? '💡 ' + report.tip + (report.suggestion ? ' Try: ' + report.suggestion : '') : '';

    const streak = $('report-streak');
    streak.hidden = checking || !(report.streak >= 2);
    if (!streak.hidden) {
      streak.textContent = '🔥 ' + report.streak + ' in a row! +' + report.bonus + ' streak bonus';
    }
    $('report-after').textContent = checking ? ''
      : '+' + report.points + ' points - it is on your list, and saved for the shop!';
    $('report-go').hidden = checking;
    $('report-by').textContent = checking ? '' : BY[report.by] || '';
  }

  function renderJudge(status) {
    const silly = BW.game && BW.game.pack.mode === 'silly';
    $('checker-status').textContent = (status.state === 'on'
      ? 'Sentences are checked by the game\'s rules and an AI judge.'
      : 'Sentences are checked by the game\'s rules.' +
        (status.saved ? ' ' + status.saved + ' saved answers from the judge are used too.' : '')) +
      (silly ? ' Silly mode: a sentence only has to sound right, not make sense.' : '');
  }

  let messageTimer = null;
  function showMessage(text, kind) {
    const el = $('message');
    el.textContent = text;
    el.className = 'message show ' + (kind || '');
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { el.className = 'message'; }, 2600);
  }

  /* The worm picked on the home page, and the shop's list of things to save up for.
     If these fail the game still runs, with the default green worm and no goal. */
  async function loadWardrobe() {
    const get = file => fetch(file).then(r => {
      if (!r.ok) throw new Error(file + ': HTTP ' + r.status);
      return r.json();
    });
    let worm = BW.DEFAULT_WORM, items = [];
    try {
      const worms = await get('data/worms.json');
      worm = BW.chooseWorm(worms);
      items = BW.colorItems(worms);
      const shop = await get('data/shop.json');
      items = items.concat(shop.items);
    } catch (err) {
      console.warn('Could not load the worm closet:', err);
    }
    return { worm, items };
  }

  /* ---------- the points bank and the thing being saved up for ---------- */

  let shopItems = [];
  let goal = null;

  function renderBank(bump) {
    $('bank-points').textContent = BW.closet.bank.toLocaleString();
    if (bump) {
      const bank = $('bank');
      bank.classList.remove('bump');
      void bank.offsetWidth;            // restart the animation
      bank.classList.add('bump');
    }
    goal = BW.closet.nextGoal(shopItems.filter(i => i.price));
    const box = $('goal');
    box.hidden = !goal;
    if (!goal) return;
    const ready = BW.closet.bank >= goal.price;
    box.classList.toggle('ready', ready);
    $('goal-label').textContent = ready ? 'You can buy it now!' : 'Saving up for';
    $('goal-name').textContent = goal.name;
    $('goal-fill').style.width = Math.min(100, 100 * BW.closet.bank / goal.price) + '%';
    $('goal-left').textContent = ready ? 'Visit the shop when you are ready'
      : (goal.price - BW.closet.bank) + ' more points';
  }

  /* What the goal worm wears: everything it has on now, plus the thing being saved up for. */
  function goalSkin(base) {
    if (!goal) return base;
    if (goal.slot === 'color') return { ...base, body: goal.body, head: goal.head };
    return { ...base, [goal.slot]: goal.id };
  }

  function earned(points) {
    const before = goal && BW.closet.bank < goal.price ? goal : null;
    BW.closet.earn(points);
    setTimeout(() => BW.Sound.coin(), 450);
    renderBank(true);
    if (before && BW.closet.bank >= before.price) {
      setTimeout(() => showMessage('🎉 You have enough points for the ' + before.name +
                                   '! Visit the shop to get it.', 'good'), 300);
    }
  }

  async function boot() {
    // game.html?class=BCDF is a class race (js/race.js): the teacher picked the topic
    const race = BW.Race.fromUrl();
    const room = race && await race.connect();
    if (race && !room) return;            // sent off to join, or told what went wrong

    let pack;
    try {
      pack = await loadPack(room && room.topic, room && room.mode);
    } catch (err) {
      $('loading').hidden = true;
      $('error').hidden = false;
      $('error-detail').textContent = String(err);
      return;
    }

    const problems = BW.Grammar.checkPack(pack);
    if (problems.length) console.warn('Word pack problems:\n  ' + problems.join('\n  '));

    $('loading').hidden = true;
    $('game').hidden = false;
    renderLegend(pack);
    document.title = 'Bookworms - ' + pack.name;
    // what is being played, in a word or two: the topic, and Real or Silly
    $('now-playing').textContent = pack.emoji + ' ' + pack.name +
      (pack.mode === 'silly' ? ' \u00b7 🤪 Silly' : ' \u00b7 🌍 Real');
    $('now-playing').hidden = false;

    const wardrobe = await loadWardrobe();
    shopItems = wardrobe.items;
    BW.CONFIG.worm = wardrobe.worm;
    BW.CONFIG.skin = BW.skinFor(wardrobe.worm);
    document.documentElement.style.setProperty('--worm-body', BW.CONFIG.worm.body);
    document.documentElement.style.setProperty('--worm-head', BW.CONFIG.worm.head);
    BW.WormArt.mount($('brand-worm'), () => BW.CONFIG.skin, { segments: 3 });
    BW.WormArt.mount($('goal-worm'), () => goalSkin(BW.CONFIG.skin), { segments: 3 });
    renderBank(false);

    // the game does not wait for this - until it answers, the rules check on their own
    renderJudge(BW.Judge.status());
    BW.Judge.start().then(renderJudge);

    let game = null;
    game = new BW.Game(pack, $('board'), {
      onChange: renderHud,
      onMessage: showMessage,
      onEarn: earned,
      onReport: report => renderReport(game, report),
      onSentence: race ? (verdict, text) => race.report(verdict, text) : null
    }, { race: !!race });

    game.attachInput(window);
    if (race) {
      // the class shares one clock: no pausing it, and no starting over
      $('btn-new').hidden = true;
      $('btn-pause').hidden = true;
      race.attach(game);
    }

    $('btn-new').addEventListener('click', () => { game.newGame(); window.focus(); });
    $('btn-pause').addEventListener('click', () => {
      game.handleKey({ key: 'p', preventDefault() {} });
    });
    $('btn-hints').addEventListener('click', () => {
      game.showHints = !game.showHints;
      $('btn-hints').textContent = 'Hints: ' + (game.showHints ? 'on' : 'off');
    });
    $('report-go').addEventListener('click', () => { game.carryOn(null); $('report-go').blur(); });

    window.BW.game = game;   // handy for poking at in the browser console
    renderJudge(BW.Judge.status());
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
