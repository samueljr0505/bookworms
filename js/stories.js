/* The My stories page: every story saved in this browser (js/story.js), newest first.
   Shown with textContent - the stories are the player's own words. */
window.BW = window.BW || {};

(function () {
  const $ = id => document.getElementById(id);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    const stories = BW.storyBook.stories;
    $('shelf-empty').hidden = stories.length > 0;
    const shelf = $('shelf');
    shelf.textContent = '';
    for (const story of stories) {
      const li = el('li', 'shelf-story');
      const when = new Date(story.at);
      li.append(el('p', 'story-kicker', [story.topic, isNaN(when) ? '' : when.toLocaleDateString()]
        .filter(Boolean).join(' · ')));
      li.append(el('h2', '', story.emoji + ' ' + story.title));
      const book = el('div', 'story-book');
      for (const p of story.paragraphs) book.append(el('p', '', p));
      li.append(book);
      const remove = el('button', 'shelf-remove', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!window.confirm('Remove "' + story.title + '"? It cannot be brought back.')) return;
        BW.storyBook.remove(story.id);
        render();
      });
      li.append(remove);
      shelf.append(li);
    }
  }

  document.addEventListener('DOMContentLoaded', render);
})();
