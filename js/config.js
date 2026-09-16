/* Bookworms - tweakable settings.
   This is the safest file to experiment in. Change a number, reload, see what happens. */
window.BW = window.BW || {};

BW.CONFIG = {
  grid: { cols: 34, rows: 22, cell: 26 },   // board size in squares, and how big a square is

  startDelayMs: 3000,      // Req 3: countdown before the worm starts moving
  stepMs: 170,             // how many milliseconds between worm steps (smaller = faster)
  minStepMs: 110,          // the fastest the worm is ever allowed to go
  speedUpPerSentence: 4,   // shave this many ms off stepMs after each finished sentence

  wordsOnBoard: 7,         // how many word tiles float around at once
  minValidWords: 2,        // always keep at least this many tiles that would be a correct pick

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

  points: { correct: 10, wrong: -5, sentence: 50 },

  sound: true
};
