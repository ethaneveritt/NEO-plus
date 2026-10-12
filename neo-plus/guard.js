// NEO+: chapters are made with "+ Chapter" and removed with Delete, never by
// accident at the keyboard.
//
// NEO makes a new chapter on the third Enter (Enter twice is a *** break,
// the third splits the chapter there), and Backspace at the start of a
// chapter takes it away: an empty chapter vanishes, and one with words
// merges into the chapter above. Here:
//   - Enter twice still makes a *** break; a third Enter does nothing more.
//   - Backspace at the very start of a chapter does nothing, and Backspace in
//     an empty chapter leaves it (it says once where Delete is).
// Backspace still removes an empty line or a *** inside a chapter, as before.
(function () {
  'use strict';
  const has = (name) => typeof window[name] === 'function';

  // the third Enter: the *** NEO took away to split the chapter goes back,
  // and the caret stays where it was, under it
  if (has('splitChapterAt')) {
    window.splitChapterAt = function (body, chId, block) {
      const brk = document.createElement('p');
      brk.className = 'scene-break';
      brk.textContent = '***';
      block.before(brk);
      if (typeof placeCaret === 'function') placeCaret(block, 0);
      syncChapter(body, chId);
      if (typeof resetNativeUndo === 'function') resetNativeUndo();
      return undefined;
    };
  }

  let told = false;
  const tell = () => {
    if (told) return;
    told = true;
    toast(t('Backspace doesn’t remove chapters in NEO+. To delete one, right-click it in the Chapters pane → Delete.'), 7000);
  };
  // Backspace in an empty chapter: the chapter stays
  if (has('emptyChapterBackspace')) {
    window.emptyChapterBackspace = function (e, body, chId) {
      if (e.key !== 'Backspace' || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (body.innerText.trim() !== '') return false;
      if (book.chapterOrder.indexOf(chId) < 0 || book.chapterOrder.length < 2) return false;
      e.preventDefault();
      tell();
      return true;
    };
  }
  // Backspace at the very start of a chapter: nothing (NEO would delete an
  // empty chapter above, or merge this one into it). Below an empty line at
  // the top, it still takes that line away (NEO's own handling).
  if (has('chapterStartBackspace')) {
    const own = window.chapterStartBackspace;
    window.chapterStartBackspace = function (e, body) {
      if (e.key !== 'Backspace' || e.metaKey || e.ctrlKey || e.altKey) return false;
      const sel = window.getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return false;
      const r = sel.getRangeAt(0);
      const pre = document.createRange();
      pre.selectNodeContents(body);
      try { pre.setEnd(r.startContainer, r.startOffset); } catch { return false; }
      if (pre.toString().length !== 0) return false;
      const el = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer;
      const block = el && el.closest ? el.closest('p') : null;
      if (block && body.contains(block) && block !== body.firstElementChild) return own.apply(this, arguments);
      e.preventDefault();
      return true;
    };
  }

  // the hints: no "three times = new chapter"
  if (has('toast')) {
    const ownToast = window.toast;
    window.toast = function (msg) {
      if (typeof KHELP !== 'undefined' && msg === t('Enter twice = section break · three times = new chapter · {key} shows everything else', { key: KHELP })) {
        arguments[0] = t('Enter twice = section break · + Chapter in the Chapters pane adds a chapter · {key} shows everything else', { key: KHELP });
      }
      return ownToast.apply(this, arguments);
    };
  }
  if (has('bookShortcutSections') && typeof tk === 'function') {
    const ownSections = window.bookShortcutSections;
    window.bookShortcutSections = function () {
      const out = ownSections.apply(this, arguments);
      const gone = tk('Start a new chapter');
      for (const s of out || []) if (Array.isArray(s.rows)) s.rows = s.rows.filter((row) => row[1] !== gone);
      return out;
    };
  }
  window.NeoPlusGuard = true;
})();
