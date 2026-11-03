// NEO+: notes that keep their italics, bold and bullets.
//
// Chapter Notes (the dock and the Notes tab) and the Outline's cards and
// lines take a paste from Google Docs (or Word, or a notes app) as it looks
// there: italic stays italic, bold stays bold, a bulleted or numbered list
// stays a list on the one card. ⌘I / ⌘B (Ctrl+I / Ctrl+B) set them while
// typing, Enter in a list adds the next item (Enter on an empty one ends
// the list), and Tab / Shift+Tab move an item in or out.
//
// A note is still kept as text (NEO's outline fields, NEO+'s
// neo-drive-chapter-notes.json), a line per paragraph, its look written the
// way people type it: *italic*, **bold**, "- " for a bullet (two spaces in
// for each level), "1. " for a numbered item. A note with none of these is
// just its words, so everywhere else NEO shows a note as text it reads as
// before. NeoPlusBlocks (blocks.js) reads and writes that text, and the
// Chapter Notes Doc in Drive gets real italics and Google's own bullets.
//
// The Outline is NEO's: its cards and lines read and write their words
// through textContent. Here each card's and line's textContent is that
// text: set, it draws the note; read, it gives the note back, lists and
// all. A card's Enter-is-done handling is NEO's, and so is everything else.
(function () {
  'use strict';
  const B = window.NeoPlusBlocks;
  if (!B || !B.mdToBlock) return;
  const NATIVE = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');

  // ---------------------------------------------------------- text ↔ page
  const inlineHtml = (b) => B.toNeoHtml({ ...b, li: undefined, ind: 'flush', align: 'left' }).replace(/^<p[^>]*>|<\/p>$/g, '');
  function mdToHtml(md) {
    let html = '';
    const stack = [];
    const closeAll = () => { while (stack.length) html += '</li></' + stack.pop() + '>'; };
    for (const line of String(md == null ? '' : md).split('\n')) {
      const b = B.mdToBlock(line);
      const inner = inlineHtml(b);
      if (!b.li) { closeAll(); html += `<div>${inner}</div>`; continue; }
      const type = b.li.slice(0, 2), lvl = Number(b.li.slice(2));
      while (stack.length > lvl + 1) html += '</li></' + stack.pop() + '>';
      if (stack.length === lvl + 1 && stack[lvl] !== type) html += '</li></' + stack.pop() + '>';
      if (stack.length === lvl + 1) html += '</li><li>';
      else while (stack.length < lvl + 1) { const t2 = stack.length === lvl ? type : 'ul'; html += `<${t2}><li>`; stack.push(t2); }
      html += inner === '<br>' ? '' : inner;
    }
    closeAll();
    return html;
  }
  // has the text anything to draw beyond its words?
  const plainOnly = (md) => {
    const s = String(md == null ? '' : md);
    if (s.includes('\n')) return false;
    const b = B.mdToBlock(s);
    return !b.li && !b.marks.length && b.text === s;
  };

  // A page of HTML (a note being written, or what was pasted) as lines of
  // note text. Google Docs' own copy is understood: its wrapper <b
  // style="font-weight:normal">, its spans' font-style and font-weight, its
  // list items' aria-level, and a <br> between paragraphs for a blank line.
  const SKIP = /^(STYLE|SCRIPT|META|TITLE|HEAD|TEMPLATE|NOSCRIPT)$/;
  const BLOCK = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|LI|TABLE|TR|TD|TH|DL|DT|DD|FIGURE|HR)$/;
  function htmlToLines(root) {
    const lines = [];
    let cur = null; // { text, marks, li }
    const start = (li) => { if (!cur) cur = { text: '', marks: [], li }; };
    const flush = (blankIfNone) => {
      if (cur) lines.push(B.blockToMd(B.normalize({ k: 'p', text: cur.text.replace(/[ \t]+$/, ''), marks: cur.marks, li: cur.li })));
      else if (blankIfNone) lines.push('');
      cur = null;
    };
    const flagsOf = (el, f) => {
      let b = f.includes('b'), i = f.includes('i');
      const tag = el.tagName;
      if (tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag)) b = true;
      if (tag === 'I' || tag === 'EM' || tag === 'CITE') i = true;
      const st = el.style || {};
      const fw = String(st.fontWeight || '').toLowerCase();
      if (fw) b = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600;
      const fs = String(st.fontStyle || '').toLowerCase();
      if (fs) i = fs === 'italic' || fs === 'oblique';
      return (b ? 'b' : '') + (i ? 'i' : '');
    };
    const walk = (node, f, depth, listType) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          let t = n.data.replace(/[\r\n\t]+/g, ' ').replace(/ /g, ' ');
          if (!cur && !t.trim()) continue;
          if (!cur) t = t.replace(/^ +/, '');
          if (cur && / $/.test(cur.text)) t = t.replace(/^ +/, '');
          t = t.replace(/ {2,}/g, ' ');
          if (!t) continue;
          start(undefined);
          if (f) cur.marks.push([cur.text.length, cur.text.length + t.length, f]);
          cur.text += t;
          continue;
        }
        if (n.nodeType !== 1 || SKIP.test(n.tagName)) continue;
        const tag = n.tagName;
        if (tag === 'BR') {
          // a break ends its line; one with no line before it is a blank line
          if (cur && cur.text) flush(); else if (!cur || !cur.li) { cur = null; lines.push(''); }
          continue;
        }
        if (tag === 'UL' || tag === 'OL') {
          flush();
          // a list in a list item is a level deeper (the item counts it);
          // one set straight into a list (how ⌘] / Tab indents) too
          const inList = n.parentElement && n.parentElement !== root && /^(UL|OL)$/.test(n.parentElement.tagName);
          walk(n, f, depth + (inList ? 1 : 0), tag === 'OL' ? 'ol' : 'ul');
          continue;
        }
        if (tag === 'LI') {
          flush();
          const aria = parseInt(n.getAttribute('aria-level'), 10);
          const lvl = Math.max(0, Math.min(8, aria > 0 ? aria - 1 : depth));
          cur = { text: '', marks: [], li: (listType || 'ul') + lvl };
          walk(n, flagsOf(n, f), depth + 1, listType);
          if (cur && (cur.text || cur.li)) flush();
          continue;
        }
        if (BLOCK.test(tag)) {
          // a paragraph inside a list item is that item's words (Google Docs)
          const inItem = cur && cur.li && !cur.text && n.closest('li') && root.contains(n.closest('li'));
          if (!inItem) flush();
          const had = lines.length;
          walk(n, flagsOf(n, f), depth, listType);
          if (cur && !inItem) flush();
          else if (!inItem && lines.length === had && !n.querySelector('p, div, li, br') && !n.textContent.trim()) lines.push('');
          continue;
        }
        walk(n, flagsOf(n, f), depth, listType);
      }
    };
    walk(root, '', 0, null);
    flush();
    return lines;
  }
  const trimLines = (lines) => {
    let a = 0, b = lines.length;
    while (a < b && !lines[a].trim()) a++;
    while (b > a && !lines[b - 1].trim()) b--;
    return lines.slice(a, b);
  };
  const noteOf = (el) => trimLines(htmlToLines(el)).join('\n');

  // what was copied, as note text: its HTML when there is some, else its
  // text, where a line that starts with •, -, * or 1. is a list item (a tab
  // in front of it a level deeper)
  function pastedNote(cd) {
    const html = cd.getData('text/html');
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lines = trimLines(htmlToLines(doc.body));
      if (lines.length) return lines.join('\n');
    }
    const text = String(cd.getData('text/plain') || '').replace(/\r/g, '');
    return trimLines(text.split('\n').map((l) => {
      const m = /^([ \t]*)([•●○◦▪■\-*]|\d+[.)])[ \t]+(.*)$/.exec(l);
      if (!m) return B.blockToMd(B.normalize({ k: 'p', text: l.trim() }));
      const lvl = m[1].replace(/\t/g, '  ').length;
      return ' '.repeat(Math.floor(lvl / 2) * 2) + (/\d/.test(m[2]) ? '1. ' : '- ') + B.blockToMd(B.normalize({ k: 'p', text: m[3] })).replace(/^\\/, '');
    })).join('\n');
  }
  function pasteInto(e) {
    const md = pastedNote(e.clipboardData);
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!md) return;
    // a few words: into the line, as they are; more: as lines and lists
    if (plainOnly(md) || (!md.includes('\n') && !B.mdToBlock(md).li)) document.execCommand('insertHTML', false, inlineHtml(B.mdToBlock(md)));
    else document.execCommand('insertHTML', false, mdToHtml(md));
    e.target.dispatchEvent && e.target.closest && e.target.closest('[contenteditable="true"]')?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ------------------------------------------- writing in a rich note box
  // ⌘B / ⌘I, Enter in a list, Tab and Shift+Tab: for the boxes here, ahead
  // of NEO's own keys for the outline
  const RICH = '.nd-rich, .ob-text[contenteditable="true"], .ol-text[contenteditable="true"]';
  const inList = () => {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.getRangeAt(0).startContainer;
    if (n.nodeType === 3) n = n.parentElement;
    return n && n.closest ? n.closest('li') : null;
  };
  document.addEventListener('keydown', (e) => {
    const box = e.target && e.target.closest && e.target.closest(RICH);
    if (!box || e.isComposing) return;
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
    if (mod && (e.code === 'KeyB' || e.code === 'KeyI')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      document.execCommand(e.code === 'KeyB' ? 'bold' : 'italic');
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const li = inList();
    if (!li || !box.contains(li)) return;
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      // the next item (the engine's own); on an empty one, out of the list
      e.stopImmediatePropagation();
      if (!li.textContent.trim()) { e.preventDefault(); document.execCommand(li.closest('ol') ? 'insertOrderedList' : 'insertUnorderedList'); }
      setTimeout(() => box.dispatchEvent(new Event('input', { bubbles: true })), 0);
      return;
    }
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, true);
  // ↑ / ↓ on an Outline line: NEO goes to the line above or below. A line
  // that runs onto more than one row (a long note, a list) is walked
  // through first, row by row; only from its top row (↑) or its bottom row
  // (↓) does the arrow go on to the next line.
  const caretMid = (range) => {
    let r = range.cloneRange();
    // a caret between elements (the end of a line that ends in a list):
    // measured at the nearest letter
    if (r.startContainer.nodeType === 1) {
      const c = r.startContainer;
      const after = c.childNodes[r.startOffset], prev = c.childNodes[r.startOffset - 1];
      const walk = (n, last) => { while (n && n.nodeType === 1 && n.childNodes.length) n = last ? n.lastChild : n.firstChild; return n; };
      const t = prev ? walk(prev, true) : walk(after, false);
      if (t && t.nodeType === 3) { r = document.createRange(); r.setStart(t, prev ? t.length : 0); r.collapse(true); }
    }
    let rects = r.getClientRects();
    if (!rects.length) {
      const n = r.startContainer;
      try {
        if (n.nodeType === 3 && r.startOffset < n.length) r.setEnd(n, r.startOffset + 1);
        else if (n.nodeType === 3 && r.startOffset > 0) r.setStart(n, r.startOffset - 1);
      } catch { /* measured as it is */ }
      rects = r.getClientRects();
    }
    const rc = rects[0] || (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).getBoundingClientRect();
    return rc.top + rc.height / 2;
  };
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    const line = e.target && e.target.closest && e.target.closest('.ol-text[contenteditable="true"]');
    if (!line) return;
    const sel = getSelection();
    if (!sel.rangeCount || !sel.modify) return;
    const was = sel.getRangeAt(0).cloneRange();
    const before = caretMid(was);
    sel.modify('move', e.key === 'ArrowUp' ? 'backward' : 'forward', 'line');
    const now = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (now && line.contains(now.startContainer) && Math.abs(caretMid(now) - before) > 3) {
      // a row of its own was there: the caret is on it
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    // no row that way: back where it was, and NEO goes on to the next line
    sel.removeAllRanges();
    sel.addRange(was);
  }, true);
  document.addEventListener('paste', (e) => {
    const box = e.target && e.target.closest && e.target.closest(RICH);
    if (box) pasteInto(e);
  }, true);

  // A Chapter Notes box: the note drawn, and the note given back as it changes
  function richBox(md, onChange, placeholder) {
    const box = document.createElement('div');
    box.className = 'nd-rich';
    box.contentEditable = 'true';
    box.spellcheck = true;
    box.setAttribute('role', 'textbox');
    box.setAttribute('aria-multiline', 'true');
    if (placeholder) box.dataset.ph = placeholder;
    box.innerHTML = md ? mdToHtml(md) : '';
    const empty = () => box.classList.toggle('empty', !box.textContent.trim() && !box.querySelector('li'));
    empty();
    box.addEventListener('input', () => { empty(); onChange(noteOf(box)); });
    Object.defineProperty(box, 'value', { get: () => noteOf(box), set: (v) => { box.innerHTML = v ? mdToHtml(v) : ''; empty(); } });
    return box;
  }

  // ------------------------------------------------------- the Outline
  // Each card's and line's textContent is its note: set, drawn; read, given back
  function richText(el) {
    if (el._ndRich) return;
    el._ndRich = true;
    const was = NATIVE.get.call(el);
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get() { return el.firstElementChild ? noteOf(el) : NATIVE.get.call(el); },
      set(v) { if (plainOnly(v)) NATIVE.set.call(el, v == null ? '' : v); else el.innerHTML = mdToHtml(v); }
    });
    if (!plainOnly(was)) el.textContent = was;
  }
  const OUTLINE = '.ob-text, .ol-text';
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches(OUTLINE)) richText(root);
    for (const el of root.querySelectorAll(OUTLINE)) richText(el);
  };
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) scan(n); }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);

  // A card's note is saved by NEO with its lines run together into one;
  // the note as written (its lines, its list) is saved after it
  if (typeof window.closeCardEditor === 'function') {
    const own = window.closeCardEditor;
    window.closeCardEditor = function () {
      const ed = typeof cardEditor !== 'undefined' ? cardEditor : null;
      let note = null;
      if (ed && ed.text) { richText(ed.text); note = ed.text.textContent.trim(); }
      const sv = ed && ed.slug ? ed.slug.textContent.replace(/\s+/g, ' ').trim() : null;
      const r = own.apply(this, arguments);
      try {
        if (ed && note != null && note !== note.replace(/\s+/g, ' ').trim()) {
          const { cell } = ed;
          if (cell.dataset.kind === 'loose') saveLooseCard(cell.dataset.loose, note);
          else if (ed.slug) { if (cell.isConnected && !cell.dataset.new) saveSceneCard(cell, note, sv); }
          else if (!cell.dataset.new) saveCard(cell, note);
          if (cell.isConnected && cell.dataset.kind !== 'loose' && typeof fillCardText === 'function') fillCardText(cell, note);
        }
      } catch (err) { window.neo && window.neo.logError && window.neo.logError('NEO+ rich card: ' + err); }
      return r;
    };
  }

  const css = document.createElement('style');
  css.textContent = `
    .nd-rich { outline: none; white-space: pre-wrap; overflow-wrap: anywhere; cursor: text; }
    .nd-rich.empty::before { content: attr(data-ph); color: var(--muted, #999); opacity: .6; font-style: italic; pointer-events: none; }
    .nd-rich ul, .nd-rich ol, .ob-text ul, .ob-text ol, .ol-text ul, .ol-text ol { margin: 0.15em 0; padding-left: 1.35em; }
    .nd-rich li, .ob-text li, .ol-text li { margin: 0.1em 0; }
    .nd-rich ul ul, .ob-text ul ul, .ol-text ul ul { list-style-type: circle; }
    .nd-rich ul ul ul, .ob-text ul ul ul, .ol-text ul ul ul { list-style-type: square; }
    .nd-rich div:empty::after, .ob-text div:empty::after { content: '\\200b'; }
  `;
  document.head.appendChild(css);

  window.NeoPlusRich = { mdToHtml, htmlToLines, noteOf, pastedNote, richBox, richText };
})();
