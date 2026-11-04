/* Draws the class report (js/report.js) on the teacher's page (teacher.html): what stands
   out, a grid of every student's skills, and a card for each student - for the screen, and
   for printing to hand round or keep for a one-to-one. Everything a student wrote goes in as
   text, never as HTML. */
window.BW = window.BW || {};

BW.ReportView = (function () {
  const LEVELS = {
    strong: { text: 'Strong', about: 'right nearly every time' },
    okay: { text: 'Okay', about: 'right most of the time' },
    practice: { text: 'Practice', about: 'often in the wrong spot - worth practising' },
    few: { text: '–', about: 'too few tries to say' },
    noslips: { text: '✓', about: 'no slips seen - the game does not often offer this mistake' },
    unclear: { text: '?', about: 'not enough focused play to judge' }
  };
  const ENGAGED = { active: 'Active', partly: 'Partly active', quiet: 'Mostly quiet' };

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function list(items, className) {
    const ul = el('ul', className);
    for (const item of items) ul.append(el('li', '', item));
    return ul;
  }

  function engagement(s) {
    return el('span', 'engaged ' + s.engagement.level, ENGAGED[s.engagement.level]);
  }

  function minutes(ms) {
    const m = ms / 60000;
    return m >= 1 ? (Math.round(m * 10) / 10) + (m === 1 ? ' minute' : ' minutes') : Math.round(ms / 1000) + ' seconds';
  }

  /* `topic` is { emoji, name } from data/topics.json. */
  function draw(root, report, topic) {
    root.querySelector('#report-meta').textContent = topic.emoji + ' ' + topic.name + ' · ' +
      (report.mode === 'silly' ? '🤪 Silly' : '🌍 Real') + ' sentences · ' +
      minutes(report.playedMs) + ' played' + (report.round > 1 ? ' · Race ' + report.round : '') +
      ' · ' + new Date().toLocaleDateString();

    const findings = root.querySelector('#report-findings');
    findings.textContent = '';
    for (const f of report.findings) findings.append(el('li', '', f));

    drawGrid(root.querySelector('#report-grid'), report);
    const cards = root.querySelector('#report-cards');
    cards.textContent = '';
    report.students.forEach((s, i) => cards.append(card(s, i)));
  }

  function drawGrid(table, report) {
    table.textContent = '';
    const head = el('thead');
    const tr = el('tr');
    tr.append(el('th', 'who', 'Student'));
    for (const c of report.columns) tr.append(el('th', '', c.label));
    tr.append(el('th', 'num', 'Sentences'), el('th', 'num', 'Words each'));
    head.append(tr);
    table.append(head);

    const body = el('tbody');
    if (!report.students.length) {
      const row = el('tr');
      const td = el('td', 'empty', 'Nobody was in this race.');
      td.colSpan = report.columns.length + 3;
      row.append(td);
      body.append(row);
    }
    report.students.forEach((s, i) => {
      const row = el('tr');
      const who = el('th', 'who');
      who.scope = 'row';
      const a = el('a', '', s.name);
      a.href = '#student-' + i;
      who.append(a, ' ', engagement(s));
      row.append(who);
      for (const c of report.columns) {
        const k = s.skills[c.id];
        const td = el('td', 'lv ' + k.level, LEVELS[k.level].text);
        td.title = c.label + ': ' + LEVELS[k.level].about +
          (k.tries && k.level !== 'noslips' ? ' (' + k.right + ' of ' + k.tries + ' right)' : '');
        row.append(td);
      }
      const count = el('td', 'num', String(s.counted));
      if (s.repeats) count.append(el('small', 'repeats', '+' + s.repeats + ' repeat' + (s.repeats === 1 ? '' : 's')));
      row.append(count, el('td', 'num', s.counted ? s.wordsPer.toFixed(1) : '–'));
      body.append(row);
    });
    table.append(body);
  }

  function card(s, i) {
    const art = el('article', 'panel student-card');
    art.id = 'student-' + i;

    const head = el('header', 'card-head');
    head.append(el('h3', '', s.name), engagement(s),
                el('span', 'card-place', (s.correct > 0 ? BW.Class.ordinal(s.rank) + ' place · ' : '') +
                                         s.counted + ' correct sentence' + (s.counted === 1 ? '' : 's')));
    art.append(head);

    const stats = el('dl', 'stats');
    const stat = (label, value) => {
      const d = el('div');
      d.append(el('dt', '', label), el('dd', '', value));
      stats.append(d);
    };
    stat('Words per sentence', s.counted ? s.wordsPer.toFixed(1) : '–');
    stat('Pace', s.counted ? s.perMinute.toFixed(1) + ' a minute' + (s.pace ? ', ' + s.pace : '') : '–');
    stat('Words that did not fit', String(s.refused));
    stat('Repeats', String(s.repeats));
    art.append(stats);

    const cols = el('div', 'card-cols');
    const col = (title, items, empty, cls) => {
      const sec = el('section', cls);
      sec.append(el('h4', '', title));
      sec.append(items.length ? list(items) : el('p', 'quiet-note', empty));
      cols.append(sec);
    };
    col('Strengths', s.strengths, s.random ? 'Not judged from this race.' : 'Nothing to go on yet.', 'strengths');
    col('Working on', s.working, s.random ? 'Not judged from this race.' : 'Nothing that came up more than once or twice.', 'working');
    art.append(cols);

    const next = el('p', 'next');
    next.append(el('b', '', 'Next step: '), s.next);
    art.append(next);

    if (s.best) {
      const best = el('p', 'best');
      best.append(el('b', '', 'Best sentence: '), '“' + s.best.text + '”');
      art.append(best);
    }

    if (s.flags.length) {
      const look = el('div', 'attention');
      look.append(el('h4', '', 'Worth a look'), list(s.flags.map(f => f.text)));
      look.append(el('p', 'quiet-note', 'These are patterns, not proof: a quiet or random round can be a slow ' +
                                         'computer, a confusing moment or a bad day.'));
      art.append(look);
    }

    if (s.sentences.length) {
      const all = el('details', 'all-sentences');
      all.append(el('summary', '', 'Everything ' + s.name + ' wrote (' + s.sentences.length + ')'));
      const ol = el('ol');
      for (const w of s.sentences) {
        const li = el('li', w.repeat ? 'again' : w.ok ? '' : 'no', w.text);
        ol.append(li);
      }
      all.append(ol);
      art.append(all);
    }
    return art;
  }

  return { draw, LEVELS };
})();
