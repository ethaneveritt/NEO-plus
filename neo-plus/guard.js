// NEO+: chapters are made with "+ Chapter" and removed with Delete, never by
// accident at the keyboard.
//
// NEO makes a new chapter on the third Enter (Enter twice is a *** break,
// the third splits the chapter there), and Backspace at the start of a
// chapter takes it away: an empty chapter vanishes, and one with words
// merges into the chapter above. Here:
//   - Enter twice is a blank line, three times a *** break (handleEnter
//     below); never a new chapter.
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

  // Enter's rhythm in a story: once, a new paragraph; twice, a blank line
  // (kept as a blank line everywhere: exports and the Google Docs too);
  // three times, the blank line becomes a *** break. (NEO: twice is ***,
  // three times a new chapter.) Mid-sentence it works the same, from the
  // second press on.
  if (has('handleEnter')) {
    const ownEnter = window.handleEnter;
    window.handleEnter = function (e, body, chId) {
      if (e.key !== 'Enter' || e.shiftKey) return ownEnter.apply(this, arguments);
      const sel = window.getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return ownEnter.apply(this, arguments);
      let el = sel.anchorNode;
      if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
      const block = el && el.closest ? el.closest('p') : null;
      if (!block || !body.contains(block) || !isStory(chId) ||
        block.classList.contains('poetry') || block.classList.contains('flush') || block.classList.contains('scene-break')) return ownEnter.apply(this, arguments);
      // only at the start of a line (an empty one, or the words a press
      // before pushed down); anywhere else Enter is NEO's own
      let atStart = block.textContent.trim() === '';
      if (!atStart) {
        const pre = document.createRange();
        pre.selectNodeContents(block);
        try { pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset); } catch { return ownEnter.apply(this, arguments); }
        atStart = pre.toString().length === 0;
      }
      if (!atStart) return ownEnter.apply(this, arguments);
      const prev = block.previousElementSibling;
      const prevBlank = !!(prev && prev.tagName === 'P' && !prev.classList.contains('scene-break') && !prev.classList.contains('ghost') &&
        !prev.classList.contains('poetry') && prev.textContent.trim() === '' && !prev.querySelector('.ph-mark'));
      const run = typeof enterRun === 'number' ? enterRun : 1;
      e.preventDefault();
      if (run >= 3 && prev && prev.classList.contains('scene-break')) return true; // a fourth: nothing more
      if (run >= 3 && prevBlank) {
        // the third Enter: the blank line above becomes ***
        snapshotStructure('section break', { rejoin: true });
        prev.removeAttribute('style');
        prev.className = 'scene-break';
        prev.textContent = '***';
        if (typeof placeCaret === 'function') placeCaret(block, 0);
        syncChapter(body, chId);
        if (typeof resetNativeUndo === 'function') resetNativeUndo();
        if (typeof typewriterEnabled !== 'undefined' && !typewriterEnabled && typeof revealCaret === 'function') revealCaret();
        if (typeof breakRun !== 'undefined') breakRun++;
        return true;
      }
      // the second Enter (or any Enter at the start of a line): a blank line
      if (block.querySelector('span:not(.ph-mark)') && typeof stripJunkSpans === 'function') {
        const caret = captureCaret();
        stripJunkSpans(block);
        restoreCaret(caret);
      }
      document.execCommand('insertParagraph');
      syncChapter(body, chId);
      return true;
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
        arguments[0] = t('Enter twice = a blank line · three times = section break · {key} shows everything else', { key: KHELP });
      }
      return ownToast.apply(this, arguments);
    };
  }
  if (has('bookShortcutSections') && typeof tk === 'function') {
    const ownSections = window.bookShortcutSections;
    window.bookShortcutSections = function () {
      const out = ownSections.apply(this, arguments);
      const gone = tk('Start a new chapter');
      const brk = tk('Insert a section break');
      for (const s of out || []) {
        if (!Array.isArray(s.rows)) continue;
        s.rows = s.rows.filter((row) => row[1] !== gone);
        const at = s.rows.findIndex((row) => row[1] === brk);
        if (at >= 0) s.rows.splice(at, 1, [tk('Enter ×2'), t('A blank line')], [tk('Enter ×3'), brk]);
      }
      return out;
    };
  }
  window.NeoPlusGuard = true;
})();
