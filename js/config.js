/* Bookworms - tweakable settings.
   This is the safest file to experiment in. Change a number, reload, see what happens. */
window.BW = window.BW || {};

BW.CONFIG = {
  grid: { cols: 34, rows: 22, cell: 26 },   // board size in squares, and how big a square is

  startDelayMs: 3000,      // Req 3: countdown before the worm starts moving
  // Pace. The worm is deliberately unhurried: a player needs time to read the
  // sentence forming along its body and to spot the word they want before they
  // have to turn. Smaller numbers mean a faster worm.
  stepMs: 240,             // milliseconds between worm steps
  minStepMs: 165,          // the fastest the worm is ever allowed to get
  speedUpPerSentence: 3,   // shave this many ms off stepMs after each finished sentence

  wordsOnBoard: 9,         // how many word tiles float around at once
  minValidWords: 3,        // always keep at least this many tiles the worm would eat next

  // The worm's body spells out the sentence: one letter per body square. So eating a long
  // word makes you a lot longer. Each finished sentence leaves this many squares behind
  // as a trophy, which is the only way the worm grows permanently.
  trophyPerSentence: 1,

  // How long the crash is held on screen before the words scatter, so a player can see
  // what happened and read their sentence one last time. Steering is locked during it.
  crashDelayMs: 900,

  // Req 5: what happens on a crash. 'reset' drops the sentence you were building and
  // scatters those words back onto the board. 'wrap' lets the worm slide out one wall and
  // in the other side; 'ignore' lets the worm pass through itself.
  wallBehavior: 'reset',       // 'reset' or 'wrap'
  selfCollision: 'reset',      // 'reset' or 'ignore'

  // Req 6: a punctuation mark completes the sentence (the worm only eats one once the
  // sentence is whole). The worm stops while the sentence is read out against the checklist,
  // for at least this long.
  checkMs: 900,
  // How long to wait for the judge's note (tools/judge.py) before going on without it.
  judgeWaitMs: 7000,
  // Ask the judge as soon as the words could be a whole sentence, so its answer is usually
  // back before the worm reaches a punctuation mark. Costs a few extra questions.
  judgeEarly: true,

  // Points come when a sentence is complete: `sentence` for every one, plus `word` for each
  // word in it (0, so every sentence is worth the same - raise it to reward longer ones).
  // Sentences in a row built without a word bounced earn `streak` extra for each one after
  // the first, up to `maxStreak` in a row. A bounced word costs no points, only the streak.
  // Points are also saved up to spend in the shop (js/closet.js).
  points: { word: 0, sentence: 20, streak: 5, maxStreak: 5 },

  sound: true
};
