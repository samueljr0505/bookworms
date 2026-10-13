/* The judge, from the game's side.

   Once the checker's rules (js/checker.js) have looked at a sentence, the judge gets a say
   on the two things rules cannot settle: does it sound right, and does it make sense. The
   judge itself runs on the server (tools/judge.py), because it needs a secret API key that
   must never be sent to a browser. This file only asks it.

   Answers come from three places, best first:
     1. data/verdicts.json - every sentence a judge or a teacher has already ruled on. It
        ships with the game, so these answers work with no server and no internet.
     2. this session - nothing is asked twice.
     3. the server at api/judge - if it is running, has an API key, and answers in time.
   When none of them has an answer the rules decide on their own. A missing judge is never
   an error, so this file swallows every failure and hands back null.

   No DOM in here either: tools/test.js drives it with a pretend fetch. */
window.BW = window.BW || {};

BW.Judge = (function () {
  let state = 'off';          // 'on' once the server says it can judge
  let model = null;
  let saved = {};             // sentence -> verdict, from data/verdicts.json
  const asked = new Map();    // sentence -> Promise of a verdict or null, this session
  let fetchFn = (...args) => fetch(...args);

  async function getJson(url, init) {
    const r = await fetchFn(url, init);
    if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    return r.json();
  }

  /* Read the answer key and ask whether there is a judge. Until this has run, ask() just
     hands back null and the rules decide - so the game never has to wait for it. */
  async function start(options) {
    if (options && options.fetch) fetchFn = options.fetch;
    asked.clear();
    try {
      saved = (await getJson('data/verdicts.json')).verdicts || {};
    } catch (err) {
      saved = {};
    }
    try {
      const s = await getJson('api/judge');
      state = s.available ? 'on' : 'off';
      model = s.model || null;
    } catch (err) {
      state = 'off';          // plain http.server, a static host, or no network
    }
    return status();
  }

  function status() { return { state, model, saved: Object.keys(saved).length }; }

  /* How an answer is filed: the sentence without its end mark. The mark does not change
     whether the words sound right or make sense, and the checker checks the mark itself. */
  function keyOf(sentence) { return sentence.text(''); }

  /* Resolve to null if the answer takes longer than ms. The question itself carries on, so
     a slow answer still lands in this session's memory (and the server's file) for later. */
  function within(promise, ms) {
    if (!(ms > 0) || ms === Infinity) return promise;
    return Promise.race([promise, new Promise(done => setTimeout(() => done(null), ms))]);
  }

  /* What the judge says about this sentence: { grammatical, makes_sense, feedback,
     suggestion, by } - or null when there is nobody to ask or no answer in time.
     The words are read straight away, so the sentence can carry on changing after. */
  function ask(pack, sentence, ms) {
    const key = keyOf(sentence);
    if (saved[key]) return Promise.resolve(saved[key]);
    if (asked.has(key)) return within(asked.get(key), ms);
    if (state !== 'on') return Promise.resolve(null);

    const words = sentence.tokens.map(t => t.word);
    const answer = getJson('api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: pack.id, words })
    }).then(r => r.verdict || null, () => null);
    asked.set(key, answer);
    // a failed question may be worth asking again later; a real answer is kept
    answer.then(v => { if (!v) asked.delete(key); });
    return within(answer, ms);
  }

  return { start, status, ask, keyOf };
})();
