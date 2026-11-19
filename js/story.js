/* Story-building. Playing on your own, a story is built one sentence at a time, each with
   its own objective (data/stories.json `goals`): introduce a character, describe the setting,
   introduce a problem, something unexpected, three that develop the story, and one that
   resolves the problem. Then the player puts the finished story in order - a Beginning, a
   Middle and an End - adds joining words (First, Then, Suddenly, Finally...) and reads it back.

   A story idea is picked for each story: a title, a line to get going, and for each objective
   a few of the topic's words that the board puts out more often (js/board.js). The character
   from the first sentence keeps coming back on the board too, so the story stays about them.

   This file is the part with no screen: the objectives and their checks, the joining words,
   how a story reads, and the shelf of saved stories. The drag-and-drop screen is
   js/story-view.js. */
window.BW = window.BW || {};

BW.Story = {
  PARTS: [
    { id: 'beginning', label: 'Beginning', ask: 'Who is in the story? Where are they?' },
    { id: 'middle', label: 'Middle', ask: 'What happens? Is there a problem?' },
    { id: 'end', label: 'End', ask: 'How does it end?' }
  ],

  /* The joining words (transitions) that suit each part of a story. A player can also type
     their own (checkJoiner). */
  JOINERS: {
    beginning: ['Once upon a time', 'One day', 'Long ago', 'One morning', 'One night', 'First', 'At first'],
    middle: ['Then', 'Next', 'After that', 'Later', 'Soon', 'Suddenly', 'All of a sudden', 'Just then',
             'Meanwhile', 'Luckily', 'Sadly', 'Before long', 'A moment later', 'The next day', 'That night'],
    end: ['Finally', 'In the end', 'At last', 'From then on', 'After that day', 'Now']
  },

  /* A joining word the player typed: one to five words, letters only, with a capital letter
     to start (the comma comes by itself). Returns { text, why } - `why` is empty when it is fine. */
  checkJoiner(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').replace(/[\s,]+$/, '').trim();
    if (!text) return { text, why: 'Type a joining word, like "Luckily" or "The next morning".' };
    if (!/^[A-Za-z][A-Za-z' ]*$/.test(text)) return { text, why: 'Use letters only - the comma comes by itself.' };
    if (text.length > 30 || text.split(' ').length > 5) return { text, why: 'Keep it short - five words at most.' };
    return { text: text.charAt(0).toUpperCase() + text.slice(1), why: '' };
  },

  /* The kinds of word a player can add to the word bank on the story screen, and the topic's
     word list each one joins - so the game's shapes decide where it can go, as for any other
     word. Only the kinds the topic has a list for are offered. */
  OWN_KINDS: [
    { pos: 'noun', label: 'Noun - a person or animal', like: 'goose' },
    { pos: 'thing', label: 'Noun - a thing', like: 'kite' },
    { pos: 'place', label: 'Noun - a place', like: 'meadow' },
    { pos: 'adjective', label: 'Adjective - describes a noun', like: 'shiny' },
    { pos: 'move', label: 'Verb - an action, in the past', like: 'waddled' },
    { pos: 'take', label: 'Verb - done to something, in the past', like: 'grabbed' },
    { pos: 'adverb', label: 'Adverb - how it happened', like: 'loudly' }
  ],

  ownKinds(pack) {
    return BW.Story.OWN_KINDS.filter(k => Array.isArray(pack.words[k.pos]));
  },

  /* A word the player typed for the word bank: one word, small letters, and not one the bank
     has already. Returns { word, why }. */
  checkOwnWord(pack, raw) {
    const word = String(raw || '').trim().toLowerCase();
    if (!word) return { word, why: 'Type a word first.' };
    if (!/^[a-z][a-z'-]{0,15}$/.test(word)) return { word, why: 'One word, letters only - like "goose".' };
    const have = Object.values(pack.words).flat().some(w => w.toLowerCase() === word);
    if (have) return { word, why: '"' + word + '" is already in the word bank - look for it there.' };
    return { word, why: '' };
  },

  /* A copy of a topic to add the player's own words to, so the game's own word bank - and the
     board - never change. */
  copyPack(pack) {
    const words = {};
    for (const [pos, list] of Object.entries(pack.words)) words[pos] = list.slice();
    return { ...pack, words };
  },

  /* The story ideas for a topic, or none. */
  startersFor(data, topicId) {
    const list = data && data.starters && data.starters[topicId];
    return Array.isArray(list) ? list : [];
  },

  /* The objectives, one per sentence of a story, or none. */
  goalsFrom(data) {
    return data && Array.isArray(data.goals) ? data.goals : [];
  },

  /* The words that come before the Verb: who or what the sentence is about. */
  subjectOf(pack, tokens) {
    const verb = tokens.findIndex(t => BW.Checker.familyId(pack, t.pos) === 'verb');
    return verb < 0 ? tokens : tokens.slice(0, verb);
  },

  /* Did a finished sentence meet its objective? Only `character` and `setting` can be told
     from the words - a person or animal as the subject, a place somewhere in it. The others
     (a problem, a surprise...) are the player's to decide, so any sentence does.
     Returns { met, why } - `why` says what to try when it is not met, with an example from
     `beat` (the story idea's words for it) if it has one - and, for a character, `hero`: the
     person or animal, for the board to bring back. */
  meets(pack, goal, tokens, beat) {
    const example = pos => (beat || []).find(w => (pack.words[pos] || []).includes(w)) || (pack.words[pos] || [])[0];
    if (goal.check === 'character') {
      const who = BW.Story.subjectOf(pack, tokens).find(t => t.pos === 'noun');
      if (who) return { met: true, hero: who.word };
      const like = example('noun');
      return { met: false, why: 'A character is a person or an animal, and the sentence is about them' +
                               (like ? ' - start with one, like "The ' + like + '..."' : '') + '.' };
    }
    if (goal.check === 'setting') {
      if (tokens.some(t => t.pos === 'place')) return { met: true };
      const like = example('place');
      return { met: false, why: 'The setting is where the story happens - use a place word' +
                               (like ? ', like "' + like + '"' : '') + '.' };
    }
    return { met: true };
  },

  /* The words to bring out on the board while an objective is up: the idea's words for it,
     plus the story's character once there is one. */
  wordsFor(starter, goal, hero) {
    const words = (starter && goal && starter.beats && starter.beats[goal.id]) || [];
    return hero ? words.concat(hero) : words.slice();
  },

  /* A joining word in front of a sentence: "Then, the dragon flew." The sentence's capital
     letter moves to the joining word - except "I", which always has one. */
  join(joiner, sentence) {
    if (!joiner) return sentence;
    const first = sentence.split(' ')[0];
    const rest = first === 'I' || /^I[,.!?]$/.test(first) ? sentence
      : sentence.charAt(0).toLowerCase() + sentence.slice(1);
    return joiner + ', ' + rest;
  },

  /* On the story screen the player's sentences stay the player's - built with the worm, word
     by word - but a determiner can be swapped: "A duck" for "The duck" once the duck is in
     the story, "the ball" for "my ball". These are the words that can be swapped: the
     positions of the topic's determiners (`dets`, lower case) in a sentence. */
  determinersIn(text, dets) {
    return text.split(' ').map((w, i) => {
      const bare = w.toLowerCase();
      return dets.has(bare) || (bare === 'an' && dets.has('a')) ? i : -1;
    }).filter(i => i >= 0);
  },

  /* The sentence with the determiner at word `i` swapped for `choice` ("the", "a", "my"),
     with a capital letter where there was one, and "an" before a vowel ("an apple"). */
  setDeterminer(text, i, choice) {
    const words = text.split(' ');
    let w = choice === 'a' && /^[aeiou]/i.test(words[i + 1] || '') ? 'an' : choice;
    if (/^[A-Z]/.test(words[i])) w = w.charAt(0).toUpperCase() + w.slice(1);
    words[i] = w;
    return words.join(' ');
  },

  /* Tips for making the story read better, for the player to act on - at most one per
     sentence. `cards` are the story's sentences in order ({ id, text, joiner }), `nouns` the
     topic's nouns. Two things make a story of separate sentences sound awkward, and both can
     be fixed on the story screen without changing the player's words:
     - meeting someone twice: "a duck" when the duck is already in the story. It is "the duck"
       now - "a" is for something new. This one comes with a fix.
     - the same joining word twice ("After that... After that...")
     Returns [{ id, kind, text, fix? }], `fix` being the sentence fixed. */
  tips(cards, nouns) {
    const out = [];
    const seen = new Set();             // nouns already in the story
    const joiners = new Set();
    const bare = w => w.replace(/[^A-Za-z'-]/g, '').toLowerCase();
    for (const card of cards) {
      const raw = card.text.split(' ');
      const words = raw.map(bare);
      let tip = null;

      // "a" or "an", then a noun the story has already met (after an adjective or two)
      for (let i = 0; i < words.length && !tip; i++) {
        if (words[i] !== 'a' && words[i] !== 'an') continue;
        const j = words.slice(i + 1, i + 4).findIndex(w => nouns.has(w));
        if (j < 0) continue;
        const noun = words[i + 1 + j];
        if (!seen.has(noun)) continue;
        const fixed = raw.slice();
        fixed[i] = raw[i].replace(/^an?/i, a => (a[0] === 'A' ? 'The' : 'the'));
        tip = { id: card.id, kind: 'the', text: 'You already met the ' + noun + ', so now it is "the ' +
                noun + '" - "' + words[i] + '" is for something new. Tap "' + raw[i] + '" to change it, or:',
                fix: fixed.join(' ') };
      }
      words.forEach(w => { if (nouns.has(w)) seen.add(w); });

      if (!tip && card.joiner && joiners.has(card.joiner)) {
        tip = { id: card.id, kind: 'joiner', text: 'You already used "' + card.joiner + '". Try a different joining word.' };
      }
      if (card.joiner) joiners.add(card.joiner);
      if (tip) out.push(tip);
    }
    return out;
  },

  /* What still has to happen before the story is whole: every part needs a sentence.
     `parts` is { beginning: [...], middle: [...], end: [...] }. Empty when it is ready. */
  missing(parts) {
    return BW.Story.PARTS.filter(p => !(parts[p.id] || []).length).map(p => p.label);
  },

  /* The story as it reads: one paragraph per part, each sentence with its joining word.
     `parts` holds { text, joiner } for each sentence, in order. */
  paragraphs(parts) {
    return BW.Story.PARTS.map(p => (parts[p.id] || [])
      .map(s => BW.Story.join(s.joiner, s.text)).join(' '));
  }
};

/* The stories a player has finished, kept in the browser like the closet (js/closet.js).
   `storage` is anything with getItem/setItem, or null when the browser will not allow it -
   then the shelf lasts as long as the page does. */
BW.StoryBook = class StoryBook {
  static KEY = 'bookworms.stories';
  static MAX = 50;          // the oldest story drops off the shelf past this many

  constructor(storage) {
    this.storage = storage || null;
    this.stories = this.read();
  }

  read() {
    try {
      const saved = JSON.parse(this.storage.getItem(BW.StoryBook.KEY));
      if (Array.isArray(saved)) {
        return saved.filter(s => s && typeof s.title === 'string' && Array.isArray(s.paragraphs));
      }
    } catch (e) { /* nothing saved yet, or no storage */ }
    return [];
  }

  write() {
    try { this.storage.setItem(BW.StoryBook.KEY, JSON.stringify(this.stories)); } catch (e) { /* not important */ }
  }

  /* Newest first. */
  add(story) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: String(story.title || 'My Story').slice(0, 60),
      emoji: story.emoji || '📖',
      topic: story.topic || '',
      paragraphs: story.paragraphs.map(String),
      at: story.at || new Date().toISOString()
    };
    this.stories.unshift(entry);
    this.stories.length = Math.min(this.stories.length, BW.StoryBook.MAX);
    this.write();
    return entry;
  }

  remove(id) {
    this.stories = this.stories.filter(s => s.id !== id);
    this.write();
  }
};

BW.storyBook = new BW.StoryBook((() => {
  try { return window.localStorage; } catch (e) { return null; }
})());
