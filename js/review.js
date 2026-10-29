/* The grammar review page: the quick check at the bottom. Each question has one right
   answer and a reason, shown as soon as an answer is tapped - right or not - so the
   check teaches rather than marks. Nothing is saved. */
(function () {
  const QUESTIONS = [
    { q: 'Which word is a Verb?', options: ['dog', 'jumped', 'happy'], answer: 1,
      why: '"jumped" tells what happens. "dog" is a Noun, and "happy" is an Adjective.' },
    { q: 'Which word is an Adjective?', options: ['quickly', 'fluffy', 'under'], answer: 1,
      why: '"fluffy" describes a noun: a fluffy cat. "quickly" is an Adverb, and "under" is a Preposition.' },
    { q: 'In "The dog ran into the barn.", which block is "into the barn"?', options: ['Subject', 'Object', 'Modifier'], answer: 2,
      why: 'It says where the dog ran, so it is a Modifier.' },
    { q: 'Which one is a complete sentence?', options: ['The happy cat.', 'The happy cat slept.', 'slept in the sun.'], answer: 1,
      why: 'It has a capital letter, a Subject (The happy cat), a Verb (slept) and an end mark.' },
    { q: 'She gave ___ a bone.', options: ['he', 'him'], answer: 1,
      why: '"him" gets the bone. "He" is for the one who does it: He gave her a bone.' },
    { q: 'Which one sounds right?', options: ['The dog big ran.', 'The big dog ran.'], answer: 1,
      why: 'An Adjective goes before the Noun it describes.' },
    { q: 'They ___ hungry.', options: ['was', 'were'], answer: 1,
      why: '"They" is more than one, so it goes with "were".' }
  ];

  const list = document.getElementById('questions');
  const score = document.getElementById('score');
  let answered = 0, right = 0;

  QUESTIONS.forEach(item => {
    const li = document.createElement('li');
    li.append(item.q);
    const answers = document.createElement('div');
    answers.className = 'answers';
    const why = document.createElement('p');
    why.className = 'why';
    why.hidden = true;
    why.setAttribute('aria-live', 'polite');

    item.options.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => {
        const ok = i === item.answer;
        for (const other of answers.children) other.disabled = true;
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) answers.children[item.answer].classList.add('right');
        why.className = 'why ' + (ok ? 'right' : 'wrong');
        why.textContent = item.why;
        why.hidden = false;
        answered++;
        if (ok) right++;
        if (answered === QUESTIONS.length) {
          score.hidden = false;
          score.textContent = right + ' out of ' + QUESTIONS.length + (right === QUESTIONS.length
            ? ' - every one! You are ready to play.' : ' - nice work! Read the reasons, then go and play.');
        }
      });
      answers.append(b);
    });
    li.append(answers, why);
    list.append(li);
  });
})();
