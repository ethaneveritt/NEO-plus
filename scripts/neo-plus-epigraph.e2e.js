// NEO+: epigraphs (neo-plus/epigraph.js) in the page and every export, end
// to end inside NEO on a throwaway library. Made-up book.
// Run: npx electron scripts/neo-plus-epigraph.e2e.js
'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-plus-epigraph-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const LIB = path.join(tmp, 'NEO Library');
fs.mkdirSync(LIB);
fs.writeFileSync(path.join(LIB, 'library.json'), JSON.stringify({
  authorName: 'Test Writer', penNames: [], firstRunDone: true, pageTheme: 'night',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const LONG = 'The keeper rose before the gulls each morning to trim the wick and polish the brass, and in forty years he never once let the lamp go dark, not in the gale of the hard winter nor on the night his own boat failed to come home.';
const LONG2 = 'Mara Quill was the youngest of them, and the first to speak of it.';
const KICK = 'The sea keeps what it is given.';
const ATTR = '—from <i>The Tide Tables</i>, by Mara Quill';
const SHOT = process.env.SHOT;

const setEpigraph = (html) => js(`(async () => {
  const id = 'ch-epi';
  if (!book.chapterOrder.includes(id)) book.chapterOrder.push(id);
  book.chapterKinds = book.chapterKinds || {}; book.chapterKinds[id] = 'epigraph';
  chapterHTML[id] = ${JSON.stringify(html)};
  await persistChapter(id, chapterHTML[id]);
  await saveMeta();
  renderChapters();
})()`);
const longHtml = `<p>${LONG}</p><p>${LONG2}</p><p>${KICK}</p><p>${ATTR}</p>`;
// as long as a real one: two full paragraphs, empty lines between, a last line
const P1 = 'The keeper rose before the gulls each morning to trim the wick and polish the brass. He logged the wind and the swell in a hand so small the inspectors needed a glass to read it, and he logged the ships too, every hull that passed the point between the first gray light and the last, with its flag, its heading, and how near it stood to the shoals. In forty years he never once let the lamp go dark: not in the gale of the hard winter, when the spray froze on the gallery rail and the glass had to be scraped by hand each hour, nor on the night his own boat failed to come home from the harbor town.';
const P2 = 'The keeper was the youngest of the three who had first rowed out to the rock, and he outlived the others by many years. He kept their names on the first page of the log and their chairs by the stove, and when the board of lights sent word that the lamp would be run by clockwork and the keepers brought ashore, he wrote back once, in that same small hand, that the light had never wanted for a keeper and would not begin to now. The board did not write again, and the lamp burned on for as long as he did.';
const fullHtml = `<p>${P1}</p><p><br></p><p>${P2}</p><p><br></p><p>${KICK}</p><p>${ATTR}</p>`;
const shortHtml = `<p>${KICK}</p><p>${ATTR}</p>`;
// an export's html, laid out in a frame, to read what it shows
const frame = (html, code) => js(`(async () => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:1000px;border:0;z-index:99999;background:#fff';
  document.body.appendChild(f);
  f.srcdoc = ${JSON.stringify(html)};
  await new Promise((r) => { f.onload = r; });
  const doc = f.contentDocument;
  const out = (${code})(doc, f.contentWindow);
  window._frame = f;
  return out;
})()`);
const unframe = () => js(`window._frame && window._frame.remove()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('on the page: a long epigraph is a block; the title in its attribution stays italic', async () => {
  await setEpigraph(longHtml);
  await tick(1800);
  const r = await js(`(() => {
    const ch = document.querySelector('.chapter.kind-epigraph');
    const body = ch.querySelector('.chapter-body');
    const attr = body.querySelector('p[data-attr]');
    return { long: ch.classList.contains('nd-long'), align: getComputedStyle(body).textAlign, attrAlign: getComputedStyle(attr).textAlign,
      title: getComputedStyle(attr.querySelector('i')).fontStyle, attrStyle: getComputedStyle(attr).fontStyle, body: getComputedStyle(body.querySelector('p')).fontStyle };
  })()`);
  assert.deepEqual(r, { long: true, align: 'justify', attrAlign: 'right', title: 'italic', attrStyle: 'normal', body: 'italic' });
  if (SHOT) {
    await js(`document.querySelector('.chapter.kind-epigraph').scrollIntoView()`);
    await tick(300);
    fs.writeFileSync(SHOT.replace(/\.png$/, '-page.png'), (await wc.capturePage()).toPNG());
  }
});

test('the PDF: a block, justified, inset; the attribution to the right, upright, its title italic', async () => {
  const html = await js(`buildHtml(bookExportData(), {})`);
  assert.match(html, /class="page epigraph nd-long/);
  if (SHOT) fs.writeFileSync(SHOT.replace(/\.png$/, '-pdf.html'), html);
  const r = await frame(html, `(doc, w) => {
    const sec = doc.querySelector('.epigraph');
    const ps = [...sec.querySelectorAll('p')];
    const attr = sec.querySelector('p.attr');
    sec.scrollIntoView();
    return { align: w.getComputedStyle(ps[0]).textAlign, attrAlign: w.getComputedStyle(attr).textAlign, attrStyle: w.getComputedStyle(attr).fontStyle,
      spacing: w.getComputedStyle(attr).letterSpacing, title: w.getComputedStyle(attr.querySelector('i')).fontStyle };
  }`);
  assert.deepEqual(r, { align: 'justify', attrAlign: 'right', attrStyle: 'normal', spacing: 'normal', title: 'italic' });
  if (SHOT) { await tick(300); fs.writeFileSync(SHOT.replace(/\.png$/, '-pdf.png'), (await wc.capturePage()).toPNG()); }
  await unframe();
});

test('the print PDF: the same', async () => {
  const html = await js(`buildPrintHtml(bookExportData(), { trim: '6x9', fonts: '' })`).catch((e) => 'ERR ' + e.message);
  assert.match(html, /class="fm epigraph nd-long/);
  if (SHOT) fs.writeFileSync(SHOT.replace(/\.png$/, '-print.html'), html);
  assert.match(html, /\.epigraph p\.attr i, \.epigraph p\.attr em \{ font-style: italic; \}/);
});

test('the EPUB: the page is marked a block, and its stylesheet sets it', async () => {
  const entries = await js(`buildEpubEntries(bookExportData()).then((es) => es.map((e) => ({ path: e.path, content: typeof e.content === 'string' ? e.content : '' })))`);
  const page = entries.find((e) => /class="epigraph nd-long"/.test(e.content));
  assert.ok(page, 'the epigraph page');
  assert.match(page.content, /<em>The Tide Tables<\/em>/);
  const css = entries.find((e) => e.path === 'OEBPS/style.css').content;
  assert.match(css, /\.epigraph p\.attr i, \.epigraph p\.attr em \{ font-style: italic; \}/);
  assert.match(css, /\.epigraph\.nd-long p \{ text-align: justify/);
});

test('the Word file: justified and inset; the attribution right, its title in italic', async () => {
  const doc = await js(`(() => { const es = buildDocxEntries(bookExportData()); const d = es.find((e) => /document\\.xml$/.test(e.path || e.name)); return d ? String(d.content || d.data) : JSON.stringify(es.map((e) => e.path || e.name)); })()`);
  const paras = doc.split('<w:p>').filter((p) => /The keeper rose|Tide Tables/.test(p));
  assert.equal(paras.length, 2, doc.slice(0, 300));
  assert.match(paras[0], /<w:jc w:val="both"\/>/);
  assert.match(paras[0], /<w:ind w:left="720" w:right="720"\/>/);
  assert.match(paras[1], /<w:jc w:val="right"\/>/);
  const title = paras[1].split('<w:r>').find((r) => r.includes('The Tide Tables'));
  assert.match(title, /Emphasis/, 'the title is italic');
  const by = paras[1].split('<w:r>').find((r) => r.includes('by Mara Quill'));
  assert.doesNotMatch(by, /Emphasis/, 'the rest upright');
});

test('the Master: a block quote, close-set; the attribution right and upright, its title italic', async () => {
  const m = await js(`NeoPlus.model().master.map((x) => x.b).filter((b) => b && b.k === 'p' && (b.text.startsWith('The keeper') || b.text.startsWith('—from') || b.text.startsWith('The sea')))`);
  const [body, kick, attr] = [m[0], m.find((b) => b.text.startsWith('The sea')), m.find((b) => b.text.startsWith('—from'))];
  assert.equal(body.ind, 'quote');
  assert.equal(body.align, 'justify');
  assert.equal(body.ls, 115);
  assert.deepEqual(body.marks, [[0, LONG.length, 'i']]);
  assert.equal(kick.align, 'justify');
  assert.equal(attr.align, 'right');
  const t0 = attr.text.indexOf('The Tide Tables');
  assert.deepEqual(attr.marks.filter((x) => x[2].includes('i')).map((x) => [x[0], x[1]]), [[t0, t0 + 'The Tide Tables'.length]]);
  assert.ok(attr.sz < 12, 'a touch smaller');
});

test('a long epigraph with empty lines between its paragraphs fits its page in the PDF and the print PDF', async () => {
  await setEpigraph(fullHtml);
  await tick(1800);
  const html = await js(`buildHtml(bookExportData(), {})`);
  assert.match(html, /nd-gap/);
  const pages = async (h, opts) => {
    const file = path.join(tmp, 'epi-' + Date.now() + '.html');
    fs.writeFileSync(file, h);
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await loadFile.call(w, file);
      await tick(500);
      const pdf = await w.webContents.printToPDF(opts);
      if (SHOT) fs.writeFileSync(SHOT.replace(/\.png$/, `-${opts.preferCSSPageSize ? 'print' : 'pdf'}-full.pdf`), pdf);
      return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    } finally { w.destroy(); }
  };
  // the title page, the chapter, the epigraph: three pages
  assert.equal(await pages(html, { pageSize: 'Letter', margins: { top: 1, bottom: 1, left: 1, right: 1 } }), 3);
  // the print PDF: the epigraph on one page, its attribution with it
  const book6x9 = await js(`buildPrintHtml(bookExportData(), { trim: '6x9', fonts: '' })`);
  const n = await pages(book6x9, { preferCSSPageSize: true, margins: { marginType: 'none' } });
  const without = await pages(book6x9.replace(/<section class="fm epigraph[\s\S]*?<\/section>/, ''), { preferCSSPageSize: true, margins: { marginType: 'none' } });
  assert.ok(n - without <= 2, `the epigraph takes ${n - without} pages (one, and a blank before it at most)`);
});

test('a short epigraph stays centered, its attribution under it, the title italic', async () => {
  await setEpigraph(shortHtml);
  await tick(1800);
  assert.equal(await js(`document.querySelector('.chapter.kind-epigraph').classList.contains('nd-long')`), false);
  const html = await js(`buildHtml(bookExportData(), {})`);
  assert.match(html, /class="page epigraph nd-short/);
  const r = await frame(html, `(doc, w) => { const sec = doc.querySelector('.epigraph'); const attr = sec.querySelector('p.attr');
    return [w.getComputedStyle(sec.querySelector('p')).textAlign, w.getComputedStyle(attr).textAlign, w.getComputedStyle(attr.querySelector('i')).fontStyle]; }`);
  assert.deepEqual(r, ['center', 'center', 'italic']);
  await unframe();
  const m = await js(`NeoPlus.model().master.map((x) => x.b).filter((b) => b && b.k === 'p' && (b.text.startsWith('—from') || b.text.startsWith('The sea')))`);
  assert.deepEqual(m.map((b) => [b.align, b.ind]), [['center', 'flush'], ['center', 'flush']]);
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!window.NeoPlusEpigraph && !!window.NeoPlus`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'The Lighthouse', chapters: [{ title: 'Low Tide', paras: [{ text: 'The lamp was lit.' }, { text: 'Mara slept.' }] }] }], library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
    })()`);
    await tick(1000);
    win.focus();
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
