// NEO+: Part Labels — what a book calls its parts and how it numbers them,
// end to end inside NEO on a throwaway library. Made-up book.
// Run: npx electron scripts/neo-plus-parts.e2e.js
'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-plus-parts-${process.pid}-`));
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
const PARTS = ['p-1', 'p-2', 'p-3', 'p-4'];
const names = () => js(`${JSON.stringify(PARTS)}.map((id) => chapterName(id))`);
const navLabels = () => js(`${JSON.stringify(PARTS)}.map((id) => document.querySelector('.nav-item[data-id="' + id + '"] .n-label').textContent)`);
const pageLabels = () => js(`${JSON.stringify(PARTS)}.map((id) => document.querySelector('.chapter[data-id="' + id + '"] .ch-num').textContent)`);

// Part Labels… from the part's own menu, as a person does
async function labels(partId, set) {
  await js(`(() => {
    const row = document.querySelector('.nav-item[data-id="${partId}"] .n-row');
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
  })()`);
  await tick(300);
  const clicked = await js(`(() => { const b = [...document.querySelectorAll('.pop-menu button')].find((x) => x.textContent === 'Part Labels…'); if (b) b.click(); return !!b; })()`);
  assert.ok(clicked, 'Part Labels… in the part’s menu');
  await tick(200);
  await js(`(() => {
    const bd = document.querySelector('.nd-parts').closest('.modal-backdrop');
    const s = ${JSON.stringify(set)};
    if ('word' in s) bd.querySelector('.nd-pw').value = s.word;
    if (s.numerals) bd.querySelector('input[name="nd-pn"][value="' + s.numerals + '"]').checked = true;
    if (s.mode) bd.querySelector('input[name="nd-pm"][value="' + s.mode + '"]').checked = true;
    if (s.from) bd.querySelector('.nd-pf').value = String(s.from);
    bd.dispatchEvent(new Event('change'));
  })()`);
  const preview = await js(`[...document.querySelectorAll('.nd-pv div')].map((d) => d.textContent)`);
  if (process.env.SHOT && set.mode === 'none') fs.writeFileSync(process.env.SHOT, (await wc.capturePage()).toPNG());
  await js(`document.querySelector('.nd-parts .${set.reset ? 'm-reset' : 'm-ok'}').click()`);
  await tick(1200); // NEO saves book.json 0.8 s after a change
  return preview;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('a book that chooses nothing reads as NEO has it: Part I, Part II …', async () => {
  assert.deepEqual(await names(), ['Part I', 'Part II', 'Part III', 'Part IV']);
});

test('Part Labels…: “Level” and 1, 2, 3, everywhere the parts are named', async () => {
  const preview = await labels('p-1', { word: 'Level', numerals: 'arabic' });
  assert.deepEqual(preview, ['LEVEL 1: The Crossing', 'LEVEL 2: The Shoals', 'LEVEL 3: The Harbor Town', 'LEVEL 4: The Lantern']);
  assert.deepEqual(await names(), ['Level 1', 'Level 2', 'Level 3', 'Level 4']);
  assert.deepEqual(await navLabels(), ['Level 1', 'Level 2', 'Level 3', 'Level 4']);
  assert.deepEqual(await pageLabels(), ['Level 1', 'Level 2', 'Level 3', 'Level 4']);
  const meta = JSON.parse(fs.readFileSync(path.join(LIB, await js('book.id'), 'book.json'), 'utf8'));
  assert.deepEqual(meta.ndParts, { word: 'Level', numerals: 'arabic', each: {} });
});

test('a part with no label is just its title, and the count carries on past it', async () => {
  await labels('p-3', { mode: 'none' });
  assert.deepEqual(await names(), ['Level 1', 'Level 2', 'The Harbor Town', 'Level 3']);
  const toc = await js(`bookContents().filter((e) => e.type === 'part').map((e) => e.label)`);
  assert.deepEqual(toc, ['Level 1: The Crossing', 'Level 2: The Shoals', 'The Harbor Town', 'Level 3: The Lantern']);
});

test('a starting number: the parts after it count up from there', async () => {
  await labels('p-1', { mode: 'from', from: 4 });
  assert.deepEqual(await names(), ['Level 4', 'Level 5', 'The Harbor Town', 'Level 6']);
});

test('roman numerals, and no word at all', async () => {
  await labels('p-1', { word: 'Part', numerals: 'roman' });
  assert.deepEqual(await names(), ['Part IV', 'Part V', 'The Harbor Town', 'Part VI']);
  await labels('p-1', { word: '' });
  assert.deepEqual(await names(), ['IV', 'V', 'The Harbor Town', 'VI']);
  await labels('p-1', { word: 'Level', numerals: 'arabic' });
});

test('exports: part pages and contents use the labels; a part with no label is headed by its title', async () => {
  const r = await js(`(() => { const x = exportChapters(); return { parts: x.sections.filter((s) => s.kind === 'part').map((s) => [s.heading, s.partTitle]), toc: x.toc.filter((e) => e.type === 'part').map((e) => e.label) }; })()`);
  assert.deepEqual(r.parts, [['Level 4', 'The Crossing'], ['Level 5', 'The Shoals'], ['The Harbor Town', ''], ['Level 6', 'The Lantern']]);
  assert.deepEqual(r.toc, ['Level 4: The Crossing', 'Level 5: The Shoals', 'The Harbor Town', 'Level 6: The Lantern']);
});

test('Google Docs: part folders and the Master read the same; Docs numbered by the part’s own number', async () => {
  const m = await js(`(() => { const x = NeoPlus.model(); return { parts: x.parts.map((p) => p.name), sections: x.entries.filter((e) => e.kind === 'chapter').map((e) => e.section) }; })()`);
  assert.deepEqual(m.parts, ['Level 4: The Crossing', 'Level 5: The Shoals', 'The Harbor Town', 'Level 6: The Lantern']);
  assert.deepEqual(m.sections, [4, 5, '5a', 6]);
  const heads = await js(`NeoPlus.model().master.filter((x) => x.b && x.b.k === 'h' || (x.b && x.b.sz === 20)).map((x) => x.b.text)`).catch(() => null);
  if (heads) assert.ok(!heads.some((h) => /HARBOR TOWN:/.test(h)), JSON.stringify(heads));
});

test('Back to NEO’s Part I, II, III', async () => {
  await labels('p-1', { reset: true });
  assert.deepEqual(await names(), ['Part I', 'Part II', 'Part III', 'Part IV']);
  const meta = JSON.parse(fs.readFileSync(path.join(LIB, await js('book.id'), 'book.json'), 'utf8'));
  assert.equal(meta.ndParts, undefined);
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!window.NeoPlusParts`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'The Lighthouse', chapters: [
        { title: 'Arrival', paras: [{ text: 'The boat came in.' }] },
        { title: 'Low Tide', paras: [{ text: 'Mara walked the flats.' }] },
        { title: 'The Market', paras: [{ text: 'Fish and rope.' }] },
        { title: 'The Keeper’s House', paras: [{ text: 'The lamp was lit.' }] }
      ] }], library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
      // a part before each chapter
      const titles = ['The Crossing', 'The Shoals', 'The Harbor Town', 'The Lantern'];
      const order = [];
      book.chapterKinds = book.chapterKinds || {};
      book.chapterOrder.forEach((ch, i) => {
        const id = 'p-' + (i + 1);
        book.chapterKinds[id] = 'part';
        chapterHTML[id] = '<p>' + titles[i] + '</p>';
        order.push(id, ch);
      });
      book.chapterOrder = order;
      for (let i = 1; i <= 4; i++) await persistChapter('p-' + i, chapterHTML['p-' + i]);
      await saveMeta();
      renderChapters();
      renderNav();
    })()`);
    await tick(800);
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
