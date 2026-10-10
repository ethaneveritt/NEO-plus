// NEO+: a book's own body font and drop cap.
//
// NEO keeps one Body Font and one Drop Cap Style for the whole library.
// Format → "Font and Drop Cap for This Book Only" gives the open book its
// own: from then on, Format → Body Font and Drop Cap Style change that book
// (neo-plus/main.js sends those choices here instead of to NEO), and the
// book shows them whenever it's open: on the page and in its exports.
// Untick it and the book goes back to the library's.
//
// Kept in the book's book.json as ndFonts: { body, dropcap }. NEO reads
// library.fonts as it lays out the page or an export; while a book with its
// own fonts is open, those readings see the book's.
(function () {
  'use strict';
  if (typeof window.applyFonts !== 'function' || !window.neo || !window.neo.onMenu) return;

  const ownFonts = () => (typeof book !== 'undefined' && book && book.ndFonts && typeof book.ndFonts === 'object' ? book.ndFonts : null);
  const hasLibrary = () => typeof library !== 'undefined' && library;

  // NEO, reading library.fonts, sees the book's while it's open
  function withBookFonts(fn, self, args) {
    const mine = ownFonts();
    if (!mine || !hasLibrary()) return fn.apply(self, args);
    const saved = library.fonts;
    library.fonts = { ...(saved || {}), ...mine };
    try { return fn.apply(self, args); } finally { library.fonts = saved; }
  }
  const own = {};
  for (const name of ['applyFonts', 'reportViewState', 'buildPrintHtml', 'exportFontFaces', 'buildHtml']) {
    const fn = window[name];
    if (typeof fn !== 'function') continue;
    own[name] = fn;
    window[name] = function () { return withBookFonts(fn, this, arguments); };
  }
  // NEO's applyFonts sets a font only when one is chosen; leaving a book
  // with its own for one without, the page must not keep the old one
  const applyNow = window.applyFonts;
  window.applyFonts = function () {
    const f = hasLibrary() ? { ...(library.fonts || {}), ...(ownFonts() || {}) } : {};
    const root = document.documentElement.style;
    if (!f.body) root.removeProperty('--body-font');
    if (!f.dropcap) root.removeProperty('--dropcap-font');
    return applyNow.apply(this, arguments);
  };

  // tell the menu whether a book is open, and whether it has its own
  let told = '';
  function tellMenu() {
    const st = { open: typeof book !== 'undefined' && !!book, own: !!ownFonts() };
    const key = JSON.stringify(st);
    if (key === told || !window.neo.neoPlus) return;
    told = key;
    window.neo.neoPlus({ op: 'fontState', ...st }).catch(() => {});
  }
  // a book opening or closing brings its fonts (or the library's) to the page
  for (const name of ['openBook', 'backToShelf']) {
    const fn = window[name];
    if (typeof fn !== 'function') continue;
    window[name] = async function () {
      const r = await fn.apply(this, arguments);
      try { window.applyFonts(); } catch { /* the page is changing */ }
      tellMenu();
      return r;
    };
  }
  setInterval(tellMenu, 2000);

  window.neo.onMenu(async (msg) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'nd-font-own') {
      if (typeof book === 'undefined' || !book) return;
      if (msg.on) {
        const lib = (hasLibrary() && library.fonts) || {};
        book.ndFonts = { body: lib.body || '', dropcap: lib.dropcap || 'literary' };
        toast(t('This book now keeps its own font and drop cap. Choose them in Format.'), 6000);
      } else {
        delete book.ndFonts;
        toast(t('This book uses your library’s font and drop cap again.'));
      }
      scheduleMetaSave();
      window.applyFonts();
      tellMenu();
    }
    if (msg.type === 'nd-font') {
      const mine = ownFonts();
      if (!mine) return;
      if (msg.pick) {
        const name = typeof pickLocalFont === 'function' ? await pickLocalFont() : null;
        if (!name) { window.applyFonts(); return; }
        mine.body = name;
      } else if (msg.key === 'body' && typeof msg.value === 'string') mine.body = msg.value;
      else if (msg.key === 'dropcap' && typeof msg.value === 'string') mine.dropcap = msg.value;
      scheduleMetaSave();
      window.applyFonts();
    }
  });
  window.NeoPlusFonts = { own: ownFonts, tell: tellMenu }; // for tests
})();
