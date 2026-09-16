/* Small helpers: random numbers and beep-boop sounds. */
window.BW = window.BW || {};

BW.rng = {
  int(n) { return Math.floor(Math.random() * n); },
  pick(arr) { return arr[this.int(arr.length)]; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
};

BW.Sound = (function () {
  let ctx = null;
  function audio() {
    if (!BW.CONFIG.sound) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gain) {
    const c = audio();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, c.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.02);
  }

  return {
    correct() { tone(660, 0, 0.12, 'triangle'); tone(880, 0.07, 0.14, 'triangle'); },
    wrong()   { tone(180, 0, 0.18, 'sawtooth', 0.08); },
    sentence() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle')); },
    bonk()    { tone(110, 0, 0.16, 'square', 0.09); },
    tick()    { tone(440, 0, 0.09, 'sine', 0.07); },
    go()      { tone(523, 0, 0.1, 'triangle'); tone(784, 0.1, 0.2, 'triangle'); }
  };
})();
