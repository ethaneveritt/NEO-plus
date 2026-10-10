// NEO+: what a book calls its parts, and how it numbers them.
//
// NEO names every part "Part I", "Part II" … This lets a book choose:
//   - the word: Part, Level, Book, Act … (or none, just the number)
//   - the numbers: I, II, III or 1, 2, 3
// and, part by part:
//   - counted on from the part before (the usual)
//   - numbered from a given number, counting up from there (a second
//     volume that starts at Part IV)
//   - no label at all: the part is just its title ("The Harbor Town"), and
//     the count carries on past it
// A book that never chooses anything stays exactly as NEO has it.
//
// Kept in the book's own book.json as ndParts:
//   { word: 'Level', numerals: 'arabic', each: { [partId]: { from: 4 } | { none: true } } }
// Shown everywhere NEO names a part: the page, the Chapters pane, the
// outline and board, the contents, every export, and the Google Docs.
// (NEO's own partLabel(n) asks here: the one hook line in app.js.)
(function () {
  'use strict';
  if (typeof window.chapterName !== 'function' || typeof window.chapterKind !== 'function') return;

  const SENT = '⁣'; // an unlabeled part, while an export is being put together
  let ctx; // the book a part number belongs to, while NEO counts parts (undefined: the open book)

  const settingsOf = (meta) => (meta && meta.ndParts && typeof meta.ndParts === 'object' ? meta.ndParts : null);
  const metaNow = () => (ctx !== undefined ? ctx : (typeof book !== 'undefined' ? book : null));
  const roman = (n) => {
    const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of r) while (n >= v) { out += s; n -= v; }
    return out || String(n);
  };
  const numeral = (n, s) => (s && s.numerals === 'arabic' ? String(n) : roman(n));
  const word = (s) => (s && typeof s.word === 'string' ? s.word.trim() : 'Part');

  // every part of a book, in order, with its number (null: no label)
  function numbering(meta) {
    const s = settingsOf(meta) || {};
    const each = s.each || {};
    const out = [];
    let next = 1;
    for (const chId of (meta && meta.chapterOrder) || []) {
      if (chapterKind(chId, meta) !== 'part') continue;
      const e = each[chId] || {};
      if (e.none) { out.push({ chId, num: null }); continue; }
      if (Number.isInteger(e.from) && e.from > 0) next = e.from;
      out.push({ chId, num: next });
      next += 1;
    }
    return out;
  }
  function info(chId, meta) {
    return numbering(meta).find((p) => p.chId === chId) || null;
  }
  // "Level 1", "Part IV", "IV" (no word); '' for a part with no label
  function labelOf(chId, meta) {
    const s = settingsOf(meta);
    const p = info(chId, meta);
    if (!p) return null;
    if (p.num === null) return '';
    const w = word(s);
    return (w ? w + ' ' : '') + numeral(p.num, s);
  }
  function titleOf(chId, meta) {
    if (meta === (typeof book !== 'undefined' ? book : null) && typeof partTitleOf === 'function') return partTitleOf(chId);
    return '';
  }

  // NEO's partLabel(n): the n-th part of the book being counted
  function label(n) {
    const meta = metaNow();
    if (meta && settingsOf(meta)) {
      const p = numbering(meta)[n - 1];
      if (p) {
        const l = labelOf(p.chId, meta);
        return l === '' ? SENT : l;
      }
    }
    return t('Part {n}', { n: roman(n) });
  }

  // ---- NEO's own names for a part, where it names one
  const own = {};
  for (const name of ['chapterName', 'chapterMark', 'bookContents', 'outlinePartLine', 'boardPartRow', 'exportChapters', 'shelfBookData', 'chapterMenu', 'popMenu']) {
    own[name] = window[name];
  }
  window.chapterName = function (chId, meta = book) {
    if (settingsOf(meta) && chapterKind(chId, meta) === 'part') {
      const l = labelOf(chId, meta);
      if (l !== null) return l || titleOf(chId, meta) || t('Untitled');
    }
    return own.chapterName.apply(this, arguments);
  };
  window.chapterMark = function (chId, meta = book) {
    if (settingsOf(meta) && chapterKind(chId, meta) === 'part') {
      const p = info(chId, meta);
      if (p) return p.num === null ? '❦' : numeral(p.num, settingsOf(meta));
    }
    return own.chapterMark.apply(this, arguments);
  };
  const unlabeled = (chId, meta = book) => { const p = settingsOf(meta) && info(chId, meta); return !!(p && p.num === null); };
  if (own.bookContents) {
    window.bookContents = function (meta = book) {
      const out = own.bookContents.apply(this, arguments);
      for (const e of out) if (e.type === 'part' && unlabeled(e.chId, meta)) e.label = titleOf(e.chId, meta) || e.label;
      return out;
    };
  }
  // the outline's and board's part lines read "Part I: Title": an unlabeled
  // part, just its title
  for (const name of ['outlinePartLine', 'boardPartRow']) {
    if (!own[name]) continue;
    window[name] = function (chId) {
      const el = own[name].apply(this, arguments);
      if (unlabeled(chId) && el) {
        const t0 = titleOf(chId, book);
        const target = el.querySelector('.ol-part-name') || el.querySelector('span');
        if (target && t0) target.textContent = t0;
      }
      return el;
    };
  }
  // exports: an unlabeled part's page is headed by its title alone
  function tidySections(res) {
    if (!res || !Array.isArray(res.sections)) return res;
    for (const s of res.sections) {
      if (s.kind === 'part' && typeof s.heading === 'string' && s.heading.startsWith(SENT)) {
        s.heading = s.partTitle || '';
        s.partTitle = '';
      }
    }
    for (const e of res.toc || []) {
      if (typeof e.label === 'string' && e.label.startsWith(SENT)) e.label = e.label.slice(SENT.length).replace(/^: /, '');
    }
    return res;
  }
  if (own.exportChapters) {
    window.exportChapters = function () {
      ctx = typeof book !== 'undefined' ? book : null;
      try { return tidySections(own.exportChapters.apply(this, arguments)); } finally { ctx = undefined; }
    };
  }
  // a shelf exported as one book counts its own parts: NEO's names there
  if (own.shelfBookData) {
    window.shelfBookData = async function () {
      ctx = null;
      try { return await own.shelfBookData.apply(this, arguments); } finally { ctx = undefined; }
    };
  }

  // ---- the part's menu (right-click in the Chapters pane): Part Labels…
  let menuPart = null; // { chId, at }: the part whose menu is about to open
  if (own.chapterMenu && own.popMenu) {
    window.chapterMenu = function (chId) {
      menuPart = chapterKind(chId) === 'part' ? { chId, at: Date.now() } : null;
      return own.chapterMenu.apply(this, arguments);
    };
    window.popMenu = function (x, y, items, opts) {
      const ch = menuPart && Date.now() - menuPart.at < 3000 ? menuPart.chId : null;
      menuPart = null;
      if (!ch || !Array.isArray(items)) return own.popMenu.apply(this, arguments);
      const list = [...items];
      const at = list.findIndex((i) => i && i.value === 'restart');
      const mine = [{ label: t('Part Labels…'), value: 'nd-part-labels' }];
      if (at > 0) list.splice(at, 0, ...mine); else list.splice(Math.max(0, list.length - 2), 0, '-', ...mine);
      return own.popMenu.call(this, x, y, list, opts).then((choice) => {
        if (choice === 'nd-part-labels') { openLabels(ch); return null; }
        return choice;
      });
    };
  }

  // ---- the window: the book's word and numbers, and this part's own way
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function openLabels(chId) {
    if (!book || document.querySelector('.nd-parts')) return;
    const s = settingsOf(book) || {};
    const draft = { word: word(s), numerals: s.numerals === 'arabic' ? 'arabic' : 'roman', each: JSON.parse(JSON.stringify(s.each || {})) };
    const mine = draft.each[chId] || {};
    const mode = mine.none ? 'none' : Number.isInteger(mine.from) ? 'from' : 'auto';
    const before = numbering(book).find((p) => p.chId === chId);
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal nd-parts">
        <h2>${t('Part Labels')}</h2>
        <div class="nd-ps">${t('For every part in this book')}</div>
        <label class="nd-row">${t('Call them')}
          <input class="nd-pw" type="text" maxlength="30" value="${esc(draft.word)}" placeholder="${t('(no word, just the number)')}" list="nd-part-words">
        </label>
        <datalist id="nd-part-words"><option value="Part"><option value="Level"><option value="Book"><option value="Act"><option value="Volume"></datalist>
        <div class="nd-row">${t('Numbers')}
          <label class="nd-r"><input type="radio" name="nd-pn" value="roman" ${draft.numerals === 'roman' ? 'checked' : ''}>I, II, III</label>
          <label class="nd-r"><input type="radio" name="nd-pn" value="arabic" ${draft.numerals === 'arabic' ? 'checked' : ''}>1, 2, 3</label>
        </div>
        <div class="nd-ps">${t('This part')}</div>
        <label class="nd-r"><input type="radio" name="nd-pm" value="auto" ${mode === 'auto' ? 'checked' : ''}>${t('Numbered in order, counting on from the part before')}</label>
        <label class="nd-r"><input type="radio" name="nd-pm" value="from" ${mode === 'from' ? 'checked' : ''}>${t('Numbered from')}
          <input class="nd-pf" type="number" min="1" max="999" value="${mode === 'from' ? mine.from : (before && before.num) || 1}"><span class="nd-hint">${t('and the parts after it count on')}</span></label>
        <label class="nd-r"><input type="radio" name="nd-pm" value="none" ${mode === 'none' ? 'checked' : ''}>${t('No label: just its title')}</label>
        <div class="nd-ps">${t('How the parts will read')}</div>
        <div class="nd-pv"></div>
        <div class="nd-foot">
          <button class="m-reset btn-quiet">${t('Back to Part I, II, III')}</button>
          <span><button class="m-cancel btn-quiet">${t('Cancel')}</button><button class="m-ok btn-gold">${t('Save')}</button></span>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const $q = (sel) => bd.querySelector(sel);
    const read = () => {
      draft.word = $q('.nd-pw').value.trim();
      draft.numerals = bd.querySelector('input[name="nd-pn"]:checked').value;
      const m = bd.querySelector('input[name="nd-pm"]:checked').value;
      const from = Math.max(1, Math.min(999, parseInt($q('.nd-pf').value, 10) || 1));
      if (m === 'auto') delete draft.each[chId];
      else draft.each[chId] = m === 'none' ? { none: true } : { from };
    };
    const preview = () => {
      read();
      const meta = { ...book, ndParts: draft };
      $q('.nd-pv').innerHTML = numbering(meta).map((p) => {
        const l = labelOf(p.chId, meta);
        const title = partTitleOf(p.chId);
        const text = l ? (title ? `${l.toUpperCase()}: ${title}` : l.toUpperCase()) : (title || t('(an untitled part)'));
        return `<div${p.chId === chId ? ' style="font-weight:600"' : ''}>${esc(text)}</div>`;
      }).join('');
    };
    bd.addEventListener('input', preview);
    bd.addEventListener('change', preview);
    $q('.nd-pf').addEventListener('focus', () => { bd.querySelector('input[name="nd-pm"][value="from"]').checked = true; preview(); });
    preview();
    const close = () => bd.remove();
    $q('.m-cancel').onclick = close;
    $q('.m-reset').onclick = () => { delete book.ndParts; afterChange(); close(); };
    $q('.m-ok').onclick = () => {
      read();
      const clean = { word: draft.word, numerals: draft.numerals, each: draft.each };
      const plain = clean.word === 'Part' && clean.numerals === 'roman' && !Object.keys(clean.each).length;
      if (plain) delete book.ndParts; else book.ndParts = clean;
      afterChange();
      close();
    };
    bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    $q('.nd-pw').focus();
  }
  const css = document.createElement('style');
  css.textContent = `
    .nd-parts { width: 500px; }
    .nd-parts .nd-ps { font-size: 12px; color: var(--muted, #888); margin: 18px 0 8px; }
    .nd-parts .nd-ps:first-of-type { margin-top: 4px; }
    .nd-parts .nd-row { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; font-size: 13px; }
    .nd-parts .nd-row > input { flex: 1; margin: 0; }
    .nd-parts label.nd-r { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; cursor: pointer; }
    .nd-parts .nd-row label.nd-r { margin: 0; }
    .nd-parts input[type=radio] { display: inline-block; width: auto; margin: 0; accent-color: var(--accent); }
    .nd-parts input.nd-pf { display: inline-block; width: 64px; margin: 0; padding: 4px 8px; }
    .nd-parts .nd-hint { color: var(--muted, #888); }
    .nd-parts .nd-pv { font-size: 13px; line-height: 1.7; padding: 10px 14px; border-radius: 8px; background: var(--bg, #111); }
    .nd-parts .nd-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
    .nd-parts .nd-foot .btn-gold { margin-left: 10px; }
  `;
  document.head.appendChild(css);

  function afterChange() {
    scheduleMetaSave();
    const caret = typeof captureCaret === 'function' ? captureCaret() : null;
    const scroller = document.getElementById('paper-scroll');
    const keep = scroller ? scroller.scrollTop : 0;
    if (typeof renderChapters === 'function') renderChapters();
    if (scroller) scroller.scrollTop = keep;
    if (caret && typeof restoreCaret === 'function') restoreCaret(caret);
    if (typeof renderNav === 'function') renderNav();
    if (typeof renderContentsLists === 'function') renderContentsLists();
    if (typeof currentTab !== 'undefined' && currentTab === 'outline' && typeof renderOutline === 'function') renderOutline();
  }

  // for the Google Docs (renderer.js) and tests
  window.NeoPlusParts = {
    label,
    labelOf: (chId, meta = book) => (settingsOf(meta) ? labelOf(chId, meta) : null),
    number: (chId, meta = book) => { const p = info(chId, meta); return p ? p.num : null; },
    unlabeled,
    numbering: (meta = book) => numbering(meta),
    open: openLabels
  };
})();
