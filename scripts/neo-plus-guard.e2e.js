// NEO+: chapters aren't made or removed by accident at the keyboard: a third
// Enter doesn't split a chapter, Backspace doesn't delete or merge one.
// Throwaway library, made-up book. Run: npx electron scripts/neo-plus-guard.e2e.js
'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-plus-guard-${process.pid}-`));
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
const count = () => js('book.chapterOrder.length');
const key = async (k) => {
  wc.sendInputEvent({ type: 'keyDown', keyCode: k });
  if (k === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: k });
  await tick(250);
};
// the caret at the start or end of chapter i's paragraph j
const caret = (i, j, end) => js(`(() => { const body = document.querySelectorAll('.chapter-body')[${i}]; body.focus(); const p = body.querySelectorAll('p')[${j}]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(${!end}); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
const texts = (i) => js(`[...document.querySelectorAll('.chapter-body')[${i}].querySelectorAll('p')].map((p) => p.textContent)`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Enter twice still makes a *** break; a third Enter doesn’t make a chapter', async () => {
  await caret(0, 0, true);
  await key('Enter'); await key('Enter');
  assert.ok((await texts(0)).includes('***'), JSON.stringify(await texts(0)));
  await key('Enter');
  assert.equal(await count(), 2);
  assert.ok((await texts(0)).includes('***'), 'the *** stays');
});

test('Backspace at the start of a chapter doesn’t merge it into the one above', async () => {
  await caret(1, 0);
  await key('Backspace');
  assert.equal(await count(), 2);
  assert.deepEqual(await texts(1), ['Mara slept.']);
});

test('Backspace in an empty chapter leaves it', async () => {
  await js(`(async () => { const ids = book.chapterOrder; document.querySelectorAll('.chapter-body')[1].innerHTML = '<p><br></p>'; syncChapter(document.querySelectorAll('.chapter-body')[1], ids[1]); })()`);
  await caret(1, 0);
  await key('Backspace'); await key('Backspace');
  assert.equal(await count(), 2);
  assert.match(await js(`document.getElementById('hint').textContent`), /Chapters pane/);
});

test('the hint under a new book no longer says three times = new chapter', async () => {
  await js(`toast(t('Enter twice = section break · three times = new chapter · {key} shows everything else', { key: KHELP }))`);
  const hint = await js(`document.getElementById('hint').textContent`);
  assert.doesNotMatch(hint, /three times/);
  assert.match(hint, /\+ Chapter/);
});

test('the help sheet no longer lists Enter three times', async () => {
  const rows = await js(`bookShortcutSections().flatMap((s) => s.rows.map((r) => r[1]))`);
  assert.ok(!rows.includes('Start a new chapter'));
  assert.ok(rows.includes('Insert a section break'));
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!window.NeoPlusGuard`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'The Lighthouse', chapters: [
        { title: 'The Keeper’s House', paras: [{ text: 'The lamp was lit.' }] },
        { title: 'Low Tide', paras: [{ text: 'Mara slept.' }] }
      ] }], library.shelves[0]);
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
