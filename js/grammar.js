/* Grammar engine.
   A pattern is a list of "slots" like ["determiner", "adjective?", "noun", "verb"].
   A slot ending in "?" is optional - the player may fill it or skip right past it.
   Because the player can only ever eat a word that fits the next slot, every finished
   sentence is grammatically correct by construction (Req 4). */
window.BW = window.BW || {};

(function () {
  const VOWELS = ['a', 'e', 'i', 'o', 'u'];

  function slotPos(slot) { return slot.endsWith('?') ? slot.slice(0, -1) : slot; }
  function slotOptional(slot) { return slot.endsWith('?'); }

  class Sentence {
    constructor(pack, pattern) {
      this.pack = pack;
      this.pattern = pattern;
      this.slotIndex = 0;
      this.tokens = [];        // [{ word, pos }]
      this.punctuation = null;
    }

    /* Which parts of speech would be a correct pick right now?
       That is the next required slot, plus any optional slots sitting in front of it. */
    allowedPos() {
      const out = [];
      for (let i = this.slotIndex; i < this.pattern.slots.length; i++) {
        const slot = this.pattern.slots[i];
        const pos = slotPos(slot);
        if (!out.includes(pos)) out.push(pos);
        if (!slotOptional(slot)) break;
      }
      return out;
    }

    /* True once every slot that is still left is optional - the sentence stands on its own,
       so punctuation is allowed to show up and finish it (Req 6). */
    canEnd() {
      for (let i = this.slotIndex; i < this.pattern.slots.length; i++) {
        if (!slotOptional(this.pattern.slots[i])) return false;
      }
      return true;
    }

    isComplete() { return this.punctuation !== null; }

    /* Try to add a word. Returns true if it fit the pattern. */
    accept(word, pos) {
      for (let i = this.slotIndex; i < this.pattern.slots.length; i++) {
        const slot = this.pattern.slots[i];
        if (slotPos(slot) === pos) {
          this.tokens.push({ word, pos });
          this.slotIndex = i + 1;
          return true;
        }
        if (!slotOptional(slot)) return false;  // hit a required slot that does not match
      }
      return false;
    }

    /* Req 5: a wall bonk wipes the sentence and hands the words back.
       Same pattern, fresh start - the player gets to try it again. */
    reset() {
      const lost = this.tokens.slice();
      this.tokens = [];
      this.slotIndex = 0;
      this.punctuation = null;
      return lost;
    }

    end(mark) {
      if (!this.canEnd()) return false;
      this.punctuation = mark;
      return true;
    }

    /* Build the display string, fixing "a" -> "an" and capitalising the first word. */
    text() {
      const words = this.tokens.map(t => t.word);
      for (let i = 0; i < words.length; i++) {
        if (words[i] === 'a' && words[i + 1] && VOWELS.includes(words[i + 1][0].toLowerCase())) {
          words[i] = 'an';
        }
      }
      if (words.length === 0) return '';
      let s = words.join(' ');
      s = s[0].toUpperCase() + s.slice(1);
      return s + (this.punctuation || '');
    }

    /* A little roadmap for the HUD: every slot, and what is in it so far. */
    outline() {
      const filled = this.tokens.slice();
      const out = [];
      let ti = 0;
      for (let i = 0; i < this.pattern.slots.length; i++) {
        const slot = this.pattern.slots[i];
        const pos = slotPos(slot);
        if (i < this.slotIndex) {
          const tok = filled[ti];
          if (tok && tok.pos === pos) { out.push({ pos, word: tok.word, state: 'done' }); ti++; }
          else out.push({ pos, word: null, state: 'skipped' });
        } else {
          out.push({ pos, word: null, state: i === this.slotIndex ? 'next' : 'todo',
                     optional: slotOptional(slot) });
        }
      }
      return out;
    }
  }

  BW.Grammar = {
    slotPos,
    slotOptional,
    newSentence(pack, rng) {
      const pattern = rng.pick(pack.patterns);
      return new Sentence(pack, pattern);
    }
  };
})();
