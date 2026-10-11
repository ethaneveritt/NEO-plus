// NEO+: set-apart lines ("TWO WEEKS LATER"), end to end inside NEO on a
// throwaway library. Made-up book. Run: npx electron scripts/neo-plus-setapart.e2e.js
'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-plus-setapart-${process.pid}-`));
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
const P = (i) => `document.querySelectorAll('.chapter-body')[0].querySelectorAll('p')[${i}]`;
const caretIn = (i, end = false) => js(`(() => { const p = ${P(i)}; p.closest('.chapter-body').focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(!${end}); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
const disk = () => {
  const dir = fs.readdirSync(LIB).find((n) => n.startsWith('book-'));
  const ch = fs.readdirSync(path.join(LIB, dir, 'chapters'));
  return ch.map((f) => fs.readFileSync(path.join(LIB, dir, 'chapters', f), 'utf8')).join('');
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Format and the right-click menu offer a set-apart line', async () => {
  const format = Menu.getApplicationMenu().items.find((i) => i.label === 'Format').submenu.items.map((i) => i.label);
  assert.ok(format.includes('Set-Apart Line (like “TWO WEEKS LATER”)'), format.join(', '));
});

test('a set-apart line: centered, bold, larger; the drop cap goes to the prose after it', async () => {
  await caretIn(0);
  wc.send('menu', { type: 'nd-setapart' });
  await tick(400);
  const st = await js(`(() => { const p = ${P(0)}, q = ${P(1)}, a = getComputedStyle(p), b = getComputedStyle(q);
    return { cls: p.className, align: a.textAlign, weight: a.fontWeight, big: parseFloat(a.fontSize) > parseFloat(b.fontSize) * 1.15, firstHere: p.hasAttribute('data-first'), firstNext: q.hasAttribute('data-first') }; })()`);
  assert.deepEqual(st, { cls: 'poetry nd-banner', align: 'center', weight: '700', big: true, firstHere: false, firstNext: true });
  if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, (await wc.capturePage()).toPNG());
  await js('flushAllSaves()'); await tick(500);
  assert.match(disk(), /<p class="poetry nd-banner">THE NEXT MORNING<\/p>/);
});

test('Enter after it starts an ordinary paragraph', async () => {
  await caretIn(0, true);
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  wc.sendInputEvent({ type: 'char', keyCode: '\r' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await tick(400);
  assert.equal(await js(`${P(0)}.className`), 'poetry nd-banner');
  assert.equal(await js(`${P(1)}.className`), '');
  await js(`(() => { const p = ${P(1)}; if (!p.textContent.trim()) p.remove(); })()`);
  await js(`syncChapter(document.querySelector('.chapter-body'), document.querySelector('.chapter').dataset.id)`);
});

test('exports: its own centered bold line, and the drop cap on the prose', async () => {
  const r = await js(`(() => { const x = exportChapters(); const ch = x.sections.find((s) => s.kind === 'chapter'); return ch.paras.map((p) => ({ t: p.text, poetry: p.poetry, align: p.align, bold: p.runs.every((x) => x.b), banner: !!p.banner })); })()`);
  assert.deepEqual(r[0], { t: 'THE NEXT MORNING', poetry: true, align: 'center', bold: true, banner: true });
  assert.equal(r[1].banner, false);
  assert.equal(r[1].poetry, false);
});

test('Google Docs: centered, bold, 14 pt', async () => {
  const b = await js(`NeoPlus.model().entries.find((e) => e.kind === 'chapter').blocks[0]`);
  assert.deepEqual([b.text, b.align, b.sz, b.marks], ['THE NEXT MORNING', 'center', 14, [[0, 16, 'b']]]);
});

test('turned off, it is an ordinary paragraph again', async () => {
  await caretIn(0);
  wc.send('menu', { type: 'nd-setapart' });
  await tick(300);
  assert.equal(await js(`${P(0)}.className`), '');
  assert.equal(await js(`${P(0)}.hasAttribute('data-first')`), true);
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!window.NeoPlusSetApart`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'The Lighthouse', chapters: [{ title: 'Low Tide', paras: [{ text: 'THE NEXT MORNING' }, { text: 'The lamp was lit.' }, { text: 'Mara slept.' }] }] }], library.shelves[0]);
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
