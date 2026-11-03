// NEO+: the Outline's words — shown, and counted in the day's writing.
//
// On the Outline tab the word counter at the foot of the window says how
// many words the outline holds (every chapter's line or card, its sections,
// a script's scene notes, the loose cards). Click it for the book's count
// and back.
//
// Words written in the outline count toward today, the way words written on
// the page do: today's tally (book.dailyCounts, NEO's own) grows as you
// type on a card or a line, and goes down if you cut. Words that arrive
// from disk (the book opening, another computer's changes) are not today's
// writing and are not counted, as NEO does for the page. NEO keeps a day as
// { start, end } of the story's count; the outline's words written today
// are added by setting the day's start back by that many, so NEO's goal,
// its history and its stats all see them.
(function () {
  'use strict';
  if (typeof window.updateBookCounters !== 'function' || typeof window.wordsFromDisk !== 'function') return;
  const B = window.NeoPlusBlocks;

  // a note's words: its italics and bullets are marks, not words
  const noteWords = (s) => {
    if (!s) return 0;
    const text = B && B.mdToBlock ? String(s).split('\n').map((l) => B.mdToBlock(l).text).join('\n') : String(s);
    return countWords(text);
  };
  function storedWords() {
    if (!book) return 0;
    const order = new Set(book.chapterOrder || []);
    let n = 0;
    for (const [chId, v] of Object.entries(book.chapterNotes || {})) if (order.has(chId)) n += noteWords(v);
    for (const [chId, list] of Object.entries(book.sectionNotes || {})) if (order.has(chId) && Array.isArray(list)) for (const s of list) n += noteWords(s && s.text);
    for (const v of Object.values(book.sceneNotes || {})) n += noteWords(v);
    for (const c of Array.isArray(book.looseCards) ? book.looseCards : []) n += noteWords(c && c.text);
    return n;
  }
  // what's being typed and isn't saved yet: the open card, or the line
  // the caret is in, against what it held
  function typingDelta() {
    try {
      if (typeof cardEditor !== 'undefined' && cardEditor && cardEditor.text && cardEditor.cell) {
        return noteWords(cardEditor.text.textContent) - noteWords(cardNoteOf(cardEditor.cell));
      }
      const el = document.activeElement;
      const txt = el && el.closest && el.closest('#outline-list .ol-text');
      if (!txt) return 0;
      const line = txt.closest('.ol-line');
      const chId = line && line.dataset.chId;
      if (!chId) return 0;
      const secId = line.dataset.secId;
      const stored = secId ? ((book.sectionNotes || {})[chId] || []).find((s) => s.id === secId)?.text : (book.chapterNotes || {})[chId];
      return noteWords(txt.textContent) - noteWords(stored);
    } catch { return 0; }
  }
  const outlineWords = () => Math.max(0, storedWords() + typingDelta());

  // ---- today
  let seen = null; // { bookId, n }: the outline's count when last looked at
  function look() {
    if (!book) { seen = null; return; }
    const n = outlineWords();
    if (!seen || seen.bookId !== book.id) { seen = { bookId: book.id, n }; return; }
    const d = n - seen.n;
    if (!d) return;
    seen.n = n;
    credit(d);
  }
  function credit(d) {
    const today = todayStr();
    book.dailyCounts = book.dailyCounts || {};
    const total = bookWordCount();
    const e = book.dailyCounts[today] && Number.isFinite(book.dailyCounts[today].end) ? book.dailyCounts[today] : { start: total, end: total };
    const words = Math.max(0, dayWords(e) + d);
    book.dailyCounts[today] = { start: e.end - words, end: e.end };
    scheduleMetaSave();
    updateCounters();
  }
  // what came from disk is not today's writing: the outline's count starts over from it
  const ownDisk = window.wordsFromDisk;
  window.wordsFromDisk = function () {
    const r = ownDisk.apply(this, arguments);
    try { seen = book ? { bookId: book.id, n: outlineWords() } : null; } catch { /* no book */ }
    return r;
  };
  let timer = 0;
  document.addEventListener('input', (e) => {
    if (!book || currentTab !== 'outline' && !(e.target && e.target.closest && e.target.closest('.ob-text, .ol-text'))) return;
    clearTimeout(timer);
    timer = setTimeout(look, 250);
  }, true);
  setInterval(look, 2000);

  // ---- the counter, on the Outline tab
  let showOutline = true;
  const ownCounters = window.updateBookCounters;
  window.updateBookCounters = function (total, wc) {
    const r = ownCounters.apply(this, arguments);
    if (book && currentTab === 'outline' && showOutline && wc) {
      const n = outlineWords();
      setText(wc, n === 1 ? t('1 word in the outline') : t('{n} words in the outline', { n: fmtNum(n) }));
      wc.title = t('Click for the book’s count');
    } else if (wc && wc.title === t('Click for the book’s count')) wc.title = '';
    return r;
  };
  const wc = document.getElementById('word-counter');
  if (wc) {
    const ownClick = wc.onclick;
    wc.onclick = function () {
      if (book && currentTab === 'outline') { showOutline = !showOutline; updateCounters(); return undefined; }
      return ownClick && ownClick.apply(this, arguments);
    };
  }
  // the counter follows the tab, and the typing on the outline
  if (typeof window.switchTab === 'function') {
    const own = window.switchTab;
    window.switchTab = function () {
      const r = own.apply(this, arguments);
      try { if (book) { look(); updateCounters(); } } catch { /* the page is changing */ }
      return r;
    };
  }
  document.addEventListener('input', () => {
    if (book && currentTab === 'outline' && showOutline) {
      clearTimeout(document._ndOlCount);
      document._ndOlCount = setTimeout(() => { try { updateCounters(); } catch { /* */ } }, 150);
    }
  }, true);

  window.NeoPlusOutlineCount = { words: outlineWords, look };
})();
