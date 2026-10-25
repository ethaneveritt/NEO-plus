// NEO+: epigraphs set the way books set them, in every export and the Master.
//
// NEO centers every line of an epigraph in italic, and sets the attribution
// (a line that opens with a dash) upright, small and letter-spaced, with any
// italic in it turned upright too. That suits two lines of verse; a passage
// of prose, centered, reads as a ragged column, and a book's title in the
// attribution can't be set in italic. Here:
//   - A short epigraph (no paragraph longer than SHORT characters) stays
//     centered, in italic.
//   - A longer one is a block: inset from both margins, justified, in italic,
//     a little space between its paragraphs. A line set centered or right on
//     purpose keeps that.
//   - The attribution is upright and a touch smaller, no letter-spacing:
//     under a block, set to the right; under a short one, centered. Italic
//     in it stays italic, so "—from *The Tide Tables*, by Mara Quill" reads
//     as written (⌘I on the title, as anywhere).
// The PDF (buildHtml), the print PDF (buildPrintHtml), the EPUB
// (chapterXhtml and its style.css), the Word file (docxEntriesOf, through
// paraRuns and docxP) and the page itself; the Master is set the same in
// renderer.js (NeoPlusEpigraph.look).
(function () {
  'use strict';
  const SHORT = 160;
  const has = (name) => typeof window[name] === 'function';
  const attrOf = (p) => typeof isAttribution === 'function' ? isAttribution(p) : /^(?:[—–]|--?\s)/.test(p.text || '');
  const textOf = (p) => String(p.text || '').replace(/[ ⠀]/g, ' ').trim();
  // a block: any paragraph of its words runs past a couple of lines
  const isLong = (paras) => (paras || []).some((p) => !p.sceneBreak && !attrOf(p) && textOf(p).length > SHORT);
  const epigraphs = (d) => ((d && d.sections) || []).filter((s) => s.kind === 'epigraph');

  // each `needle` in html (one per epigraph, in order) gets ` nd-long` or
  // ` nd-short` after it
  function tagEach(html, needle, list) {
    let i = 0;
    return html.split(needle).join('\u0000').replace(/\u0000/g, () => {
      const s = list[i++];
      return needle + (s ? (isLong(s.paras) ? ' nd-long' : ' nd-short') : '');
    });
  }
  // an empty line inside an epigraph is a short gap, not a full line, so a
  // long one with its paragraphs spaced out still fits its page
  const GAP = /<p(?: class="([^"]*)")?>(?:\s|&nbsp;|&#160;|\u00a0|\u2800|<br\s*\/?>)*<\/p>/g;
  const gaps = (html, open) => html.replace(new RegExp(`(<section class="${open}[^"]*"[^>]*>)([\\s\\S]*?)(</section>)`, 'g'),
    (all, a, inner, b) => a + inner.replace(GAP, (m, cls) => `<p class="${cls ? cls + ' ' : ''}nd-gap">&nbsp;</p>`) + b);
  const withCss = (html, css) => {
    const at = html.lastIndexOf('</head>');
    return at < 0 ? html : html.slice(0, at) + `<style>${css}</style>` + html.slice(at);
  };

  const ATTR = (sel) => `
    ${sel} p.attr { font-style: normal; letter-spacing: 0; font-size: 0.9em; }
    ${sel} p.attr i, ${sel} p.attr em { font-style: italic; }
    ${sel}.nd-long { text-align: justify; }
    ${sel}.nd-long p { text-align: justify; -webkit-hyphens: auto; hyphens: auto; margin: 0 0 0.55em; }
    ${sel}.nd-long p.attr { text-align: right; -webkit-hyphens: manual; hyphens: manual; margin-top: 1.1em; }
    ${sel} p.nd-gap { height: 0.7em; line-height: 0.7em; margin: 0; overflow: hidden; font-size: 1em; }
    ${sel} p.attr { break-before: avoid; page-break-before: avoid; }
    ${sel}.nd-long { break-inside: avoid; page-break-inside: avoid; }
  `;

  // ---- the PDF
  if (has('buildHtml')) {
    const own = window.buildHtml;
    window.buildHtml = function (data) {
      const html = own.apply(this, arguments);
      const list = epigraphs(data);
      if (typeof html !== 'string' || !list.length) return html;
      return withCss(gaps(tagEach(html, 'class="page epigraph', list), 'page epigraph'), ATTR('.epigraph') + `
        .epigraph.nd-long { padding-top: 8vh; margin: 0 0.4in; font-size: 0.9em; line-height: 1.5; }`);
    };
  }
  // ---- the print PDF (a book's interior)
  if (has('buildPrintHtml')) {
    const own = window.buildPrintHtml;
    window.buildPrintHtml = function (d) {
      const html = own.apply(this, arguments);
      const list = epigraphs(d);
      if (typeof html !== 'string' || !list.length) return html;
      return withCss(gaps(tagEach(html, 'class="fm epigraph', list), 'fm epigraph'), ATTR('.epigraph') + `
        .epigraph.nd-long { padding-top: 0.6in; padding-left: 0.25in; padding-right: 0.25in; font-size: 0.94em; line-height: 1.38; }`);
    };
  }
  // ---- the EPUB: the page, and its stylesheet
  if (has('chapterXhtml')) {
    const own = window.chapterXhtml;
    window.chapterXhtml = function (ch) {
      const x = own.apply(this, arguments);
      if (!ch || ch.kind !== 'epigraph' || typeof x !== 'string') return x;
      return x.replace('class="epigraph"', `class="epigraph ${isLong(ch.paras) ? 'nd-long' : 'nd-short'}"`);
    };
  }
  if (has('buildEpubEntries')) {
    const own = window.buildEpubEntries;
    window.buildEpubEntries = async function () {
      const entries = await own.apply(this, arguments);
      const css = Array.isArray(entries) && entries.find((e) => e && e.path === 'OEBPS/style.css' && typeof e.content === 'string');
      if (css) css.content += ATTR('.epigraph') + `
.epigraph.nd-long { margin-left: 1.5em; margin-right: 1.5em; margin-top: 20%; }
.epigraph.nd-long p { text-indent: 0; }
`;
      return entries;
    };
  }
  // ---- the Word file: NEO sets an epigraph's lines through paraRuns(p.html)
  // then docxP; the lines of this export's epigraphs are known by their html
  if (has('docxEntriesOf') && has('paraRuns') && has('docxP')) {
    let roles = null;
    const ownEntries = window.docxEntriesOf;
    window.docxEntriesOf = function (data) {
      const list = epigraphs(data);
      if (!list.length) return ownEntries.apply(this, arguments);
      roles = new Map();
      for (const s of list) {
        const long = isLong(s.paras);
        for (const p of s.paras || []) {
          if (p.sceneBreak || typeof p.html !== 'string') continue;
          roles.set(p.html, attrOf(p) ? (long ? 'long-attr' : 'attr') : long && p.align !== 'center' && p.align !== 'right' ? 'long' : '');
        }
      }
      try { return ownEntries.apply(this, arguments); } finally { roles = null; }
    };
    const ownRuns = window.paraRuns;
    window.paraRuns = function (pHtml) {
      const runs = ownRuns.apply(this, arguments);
      if (roles && roles.has(pHtml) && roles.get(pHtml)) runs.ndEpi = roles.get(pHtml);
      return runs;
    };
    const ownP = window.docxP;
    window.docxP = function (runs, opts) {
      const role = runs && runs.ndEpi;
      if (!role) return ownP.apply(this, arguments);
      const o = { ...(opts || {}) };
      if (role === 'long') Object.assign(o, { align: 'both', poetry: true });
      if (role === 'long-attr') Object.assign(o, { align: 'right', poetry: true, flip: false });
      if (role === 'attr') o.flip = false;
      return ownP.call(this, runs, o);
    };
  }

  // ---- the page in NEO: the same, so it shows what it will print
  const css = document.createElement('style');
  css.textContent = `
    .chapter.kind-epigraph .chapter-body p[data-attr] { letter-spacing: 0; font-size: 0.8em; }
    .chapter.kind-epigraph .chapter-body p[data-attr] i, .chapter.kind-epigraph .chapter-body p[data-attr] em,
    .ps-paper.kind-epigraph .ps-body p[data-attr] i, .ps-paper.kind-epigraph .ps-body p[data-attr] em { font-style: italic; }
    .chapter.kind-epigraph.nd-long .chapter-body { text-align: justify; margin-left: 2em; margin-right: 2em; }
    .chapter.kind-epigraph.nd-long .chapter-body p { margin-bottom: 0.55em; }
    .chapter.kind-epigraph.nd-long .chapter-body p[data-attr] { text-align: right; margin-top: 1.1em; }
  `;
  document.head.appendChild(css);
  function tidyPage() {
    for (const ch of document.querySelectorAll('.chapter.kind-epigraph')) {
      const body = ch.querySelector('.chapter-body');
      if (!body) continue;
      const paras = [...body.querySelectorAll('p')].map((p) => ({ text: p.textContent }));
      ch.classList.toggle('nd-long', isLong(paras));
    }
  }
  setInterval(tidyPage, 1500);
  document.addEventListener('input', () => setTimeout(tidyPage, 0), true);

  // ---- the Master (renderer.js): an epigraph's blocks, set as above.
  // Italic flips inside the italic lines, as NEO's exports do, and stays
  // as written in the attribution.
  function flipItalic(text, marks) {
    const flags = Array.from({ length: text.length }, () => '');
    for (const [s, e, f] of marks || []) for (let i = Math.max(0, s); i < Math.min(text.length, e); i++) flags[i] += f;
    const out = [];
    // every flag kept as it is, italic turned the other way
    const norm = (f) => [...new Set([...f.replace(/i/g, '')])].sort().join('') + (f.includes('i') ? '' : 'i');
    for (let i = 0; i < flags.length;) {
      const f = norm(flags[i]);
      let j = i + 1;
      while (j < flags.length && norm(flags[j]) === f) j++;
      if (f) out.push([i, j, f]);
      i = j;
    }
    return out;
  }
  function look(blocks) {
    const ps = blocks.filter((b) => b.k === 'p');
    const long = ps.some((b) => !attrOf(b) && textOf(b).length > SHORT);
    return blocks.map((b) => {
      if (b.k !== 'p') return b;
      const own = b.align === 'center' || b.align === 'right';
      const base = { ...b, ls: 115, sb: 6 };
      if (!b.text.trim()) return { ...base, ind: 'flush', marks: [] };
      if (attrOf(b)) return { ...base, sz: 10.5, sa: 10, ind: long ? 'quote' : 'flush', align: own ? b.align : long ? 'right' : 'center', marks: b.marks || [] };
      return { ...base, ind: long ? 'quote' : 'flush', align: own ? b.align : long ? 'justify' : 'center', marks: flipItalic(b.text, b.marks) };
    });
  }
  window.NeoPlusEpigraph = { isLong, look, flipItalic, SHORT };
})();
