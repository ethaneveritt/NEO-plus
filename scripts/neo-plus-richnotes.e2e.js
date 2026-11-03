// NEO+: italics, bold and bullets in the Outline and in Chapter Notes
// (neo-plus/richnotes.js), end to end inside NEO on a throwaway library.
// Made-up book. Run: npx electron scripts/neo-plus-richnotes.e2e.js
'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-plus-richnotes-${process.pid}-`));
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
const SHOT = process.env.SHOT;

// as Google Docs copies a few lines: a wrapper <b>, spans for the italics and
// bold, a flat list whose items say how deep they are
const GDOCS = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">'
  + '<p dir="ltr"><span>Mara finds the </span><span style="font-style:italic;">log</span><span>.</span></p>'
  + '<ul><li dir="ltr" aria-level="1"><p dir="ltr"><span>the lamp is out</span></p></li>'
  + '<li dir="ltr" aria-level="2"><p dir="ltr"><span>who put it out?</span></p></li>'
  + '<li dir="ltr" aria-level="1"><p dir="ltr"><span style="font-weight:700;">storm</span><span> comes in</span></p></li></ul></b>';
const GDOCS_TEXT = 'Mara finds the log.\nthe lamp is out\nwho put it out?\nstorm comes in';
const NOTE = 'Mara finds the *log*.\n- the lamp is out\n  - who put it out?\n- **storm** comes in';

const paste = (sel, html, text) => js(`(() => {
  const el = ${sel};
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  getSelection().removeAllRanges(); getSelection().addRange(r);
  const dt = new DataTransfer();
  if (${JSON.stringify(html)}) dt.setData('text/html', ${JSON.stringify(html)});
  dt.setData('text/plain', ${JSON.stringify(text)});
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
})()`);
const key = (sel, k, mods = {}) => js(`(() => { const el = ${sel}; el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, code: ${JSON.stringify(k.length === 1 ? 'Key' + k.toUpperCase() : k)}, bubbles: true, cancelable: true, ...${JSON.stringify(mods)} })); })()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the Outline (list): a list pasted from Google Docs stays on its line, bullets, italics and bold kept', async () => {
  await js(`switchTab('outline')`);
  await tick(600);
  const ch = await js('book.chapterOrder[0]');
  const before = await js('book.chapterOrder.length');
  const line = `document.querySelector('#outline-list .ol-line.ol-chapter[data-ch-id="${ch}"] .ol-text')`;
  await paste(line, GDOCS, GDOCS_TEXT);
  await tick(200);
  await js(`${line}.blur()`);
  await tick(600);
  assert.equal(await js('book.chapterOrder.length'), before, 'no chapters made from the list');
  assert.equal(await js(`book.chapterNotes[${JSON.stringify(ch)}]`), NOTE);
  assert.equal(await js(`${line}.querySelectorAll('ul > li').length`), 3);
  assert.equal(await js(`${line}.querySelector('i').textContent`), 'log');
  assert.equal(await js(`${line}.querySelector('b').textContent`), 'storm');
  if (SHOT) fs.writeFileSync(SHOT.replace(/\.png$/, '-list.png'), (await wc.capturePage()).toPNG());
  // drawn again from what was saved
  await js('renderOutline()');
  await tick(300);
  assert.equal(await js(`${line}.querySelectorAll('ul ul > li').length`), 1);
  // and saved to disk as text that reads well anywhere
  await js('flushAllSaves && flushAllSaves()').catch(() => {});
  await tick(1500);
  const dir = fs.readdirSync(LIB).find((n) => n.startsWith('book-'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(LIB, dir, 'book.json'), 'utf8')).chapterNotes[ch], NOTE);
});

test('a note with no italics or lists, stars and all, reads and saves as it was', async () => {
  const ch = await js('book.chapterOrder[1]');
  await js(`(() => { book.chapterNotes[${JSON.stringify(ch)}] = 'Two * three, and a - dash'; renderOutline(); })()`);
  await tick(300);
  const line = `document.querySelector('#outline-list .ol-line.ol-chapter[data-ch-id="${ch}"] .ol-text')`;
  assert.equal(await js(`${line}.innerHTML`), 'Two * three, and a - dash');
  await js(`${line}.focus()`);
  await js(`${line}.blur()`);
  await tick(300);
  assert.equal(await js(`book.chapterNotes[${JSON.stringify(ch)}]`), 'Two * three, and a - dash');
});

test('Outline cards: the list stays on the one card; ⌘I sets italic; Enter in a list adds an item', async () => {
  await js(`(() => { library.moreFeatures = true; library.outlineView = 'cards'; renderOutline(); })()`);
  await tick(600);
  const ch = await js('book.chapterOrder[1]');
  const cell = `document.querySelector('#outline-board .ob-cell[data-kind="chapter"][data-ch="${ch}"]')`;
  assert.ok(await js(`!!${cell}`), 'the chapter card');
  await js(`openCard(${cell})`);
  await tick(200);
  const text = `${cell}.querySelector('.ob-text')`;
  await js(`(() => { const t = ${text}; t.focus(); const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('delete'); })()`);
  await paste(text, GDOCS, GDOCS_TEXT);
  await tick(200);
  const before = await js('book.chapterOrder.length');
  // Enter at the end of the last item: another item, not "done"
  await js(`(() => { const li = ${text}.querySelectorAll('li'); const last = li[li.length - 1]; const r = document.createRange(); r.selectNodeContents(last); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
  await key(text, 'Enter');
  await tick(100);
  assert.equal(await js('!!cardEditor'), true, 'still writing on the card');
  // the engine's own Enter (a real key press) isn't sent by a synthetic event: type the item the way it would
  await js(`(() => { if (${text}.querySelectorAll('li').length === 3) document.execCommand('insertParagraph'); document.execCommand('insertText', false, 'the keeper '); })()`);
  // ⌘I: italic, typed on
  await key(text, 'i', { ctrlKey: true, metaKey: process.platform === 'darwin' });
  await js(`document.execCommand('insertText', false, 'returns')`);
  await tick(100);
  if (SHOT) fs.writeFileSync(SHOT.replace(/\.png$/, '-card.png'), (await wc.capturePage()).toPNG());
  await key(text, 'Escape');
  await tick(500);
  assert.equal(await js('!!cardEditor'), false);
  assert.equal(await js('book.chapterOrder.length'), before, 'no cards made from the list');
  assert.equal(await js(`book.chapterNotes[${JSON.stringify(ch)}]`), NOTE + '\n- the keeper *returns*');
  // the closed card shows the list too
  assert.equal(await js(`${text}.querySelectorAll('li').length`), 4);
  await js(`(() => { library.moreFeatures = false; library.outlineView = 'list'; renderOutline(); })()`);
  await tick(300);
});

test('Chapter Notes: ⌘I and a pasted list, saved as text', async () => {
  await js(`switchTab('manuscript')`);
  await tick(500);
  const ch = await js('book.chapterOrder[0]');
  await js(`document.querySelector('.chapter[data-id="${ch}"] .chapter-body').focus()`);
  await js(`document.querySelector('#nd-dock .nd-bar button[data-m="chapter"]').click()`);
  await tick(800);
  const box = `document.querySelector('#nd-panel .nd-rich')`;
  assert.ok(await js(`!!${box}`));
  await js(`${box}.focus()`);
  await key(box, 'i', { ctrlKey: true, metaKey: process.platform === 'darwin' });
  await js(`document.execCommand('insertText', false, 'Low Tide')`);
  await key(box, 'i', { ctrlKey: true, metaKey: process.platform === 'darwin' });
  await js(`document.execCommand('insertText', false, ' is the hinge.')`);
  await paste(box, '', '• first\n\t• deeper\n• second');
  await tick(900);
  const notes = await js(`window.neo.readJSON(book.id, 'neo-drive-chapter-notes', {})`);
  assert.equal(notes[ch], '*Low Tide* is the hinge.\n- first\n  - deeper\n- second');
  if (SHOT) fs.writeFileSync(SHOT.replace(/\.png$/, '-notes.png'), (await wc.capturePage()).toPNG());
});

test('the Outline\'s words: shown on its tab, and counted in today\'s writing; words from disk are not', async () => {
  await js(`switchTab('outline')`);
  await tick(600);
  const counter = () => js(`document.getElementById('word-counter').textContent`);
  const today = () => js(`(() => { const e = book.dailyCounts[todayStr()]; return e ? e.end - e.start : 0; })()`);
  const n0 = await js('NeoPlusOutlineCount.words()');
  assert.ok(n0 > 0);
  assert.equal(await counter(), `${n0} words in the outline`);
  // a click: the book's count; another: the outline's again
  await js(`document.getElementById('word-counter').click()`);
  assert.match(await counter(), /^\d+ words$/);
  await js(`document.getElementById('word-counter').click()`);
  assert.match(await counter(), /in the outline/);
  // typing on a line: today grows as it's typed
  const d0 = await today();
  const ch = await js('book.chapterOrder[2]');
  const line = `document.querySelector('#outline-list .ol-line.ol-chapter[data-ch-id="${ch}"] .ol-text')`;
  await js(`(() => { const el = ${line}; el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('insertText', false, 'the boat comes in'); })()`);
  await tick(700);
  assert.equal(await today(), d0 + 4, 'counted while typing');
  assert.equal(await counter(), `${n0 + 4} words in the outline`);
  await js(`${line}.blur()`);
  await tick(2500);
  assert.equal(await today(), d0 + 4, 'and not again once saved');
  // cut two words: today goes down by two
  await js(`(() => { const el = ${line}; el.focus(); el.textContent = 'the boat'; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await tick(700);
  assert.equal(await today(), d0 + 2);
  await js(`${line}.blur()`);
  await tick(500);
  // an outline that changed on disk (another computer): not today's writing
  await js(`(() => { book.chapterNotes[book.chapterOrder[2]] = 'the boat came in from the other computer with five more words'; wordsFromDisk(); renderOutline(); })()`);
  await tick(2500);
  assert.equal(await today(), d0 + 2);
  await js(`switchTab('manuscript')`);
  await tick(300);
  assert.doesNotMatch(await counter(), /outline/);
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    if (process.env.CONSOLE) wc.on('console-message', (e, l, m) => { if (l >= 2) console.log('[r] ' + m); });
    while (!(await js(`typeof library !== 'undefined' && !!library && !!window.NeoPlusRich`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'The Lighthouse', chapters: [
        { title: 'Low Tide', paras: [{ text: 'The lamp was lit.' }] },
        { title: 'The Harbor Town', paras: [{ text: 'Mara slept.' }] },
        { title: 'The Crossing', paras: [{ text: 'The boat came in.' }] }
      ] }], library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
      book.chapterNotes = book.chapterNotes || {};
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
