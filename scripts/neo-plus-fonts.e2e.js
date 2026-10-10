// NEO+: a book's own body font and drop cap, end to end inside NEO on a
// throwaway library. Made-up books. Run: npx electron scripts/neo-plus-fonts.e2e.js
'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-plus-fonts-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const LIB = path.join(tmp, 'NEO Library');
fs.mkdirSync(LIB);
fs.writeFileSync(path.join(LIB, 'library.json'), JSON.stringify({
  authorName: 'Test Writer', penNames: [], firstRunDone: true, pageTheme: 'night',
  fonts: { body: 'Georgia', dropcap: 'literary' },
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
const ids = [];
const format = () => Menu.getApplicationMenu().items.find((i) => i.label === 'Format').submenu;
const item = (label) => format().items.find((i) => i.label === label);
const pick = (menu, label) => item(menu).submenu.items.find((i) => i.label === label);
const bodyVar = () => js(`getComputedStyle(document.documentElement).getPropertyValue('--body-font')`);
const capVar = () => js(`getComputedStyle(document.documentElement).getPropertyValue('--dropcap-font')`);
const open = async (i) => { await js(`openBook(${JSON.stringify(ids[i])})`); await tick(2600); };
const meta = (i) => JSON.parse(fs.readFileSync(path.join(LIB, ids[i], 'book.json'), 'utf8'));
const libFonts = () => JSON.parse(fs.readFileSync(path.join(LIB, 'library.json'), 'utf8')).fonts;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Format offers “Font and Drop Cap for This Book Only”, off at first', async () => {
  await open(0);
  const own = item('Font and Drop Cap for This Book Only');
  assert.ok(own, format().items.map((i) => i.label).join(', '));
  assert.equal(own.checked, false);
  assert.equal(own.enabled, true);
});

test('turned on, the font and drop cap chosen go to this book only', async () => {
  item('Font and Drop Cap for This Book Only').click();
  await tick(2600);
  assert.equal(item('Font and Drop Cap for This Book Only').checked, true);
  pick('Body Font', 'Jost').click();
  await tick(300);
  pick('Drop Cap Style', 'Fantasy').click();
  await tick(1500);
  assert.match(await bodyVar(), /Jost/);
  assert.deepEqual(meta(0).ndFonts, { body: 'Jost', dropcap: 'fantasy' });
  assert.deepEqual(libFonts(), { body: 'Georgia', dropcap: 'literary' }, 'the library keeps its own');
  await tick(2200);
  assert.equal(pick('Body Font', 'Jost').checked, true, 'the menu ticks the book’s font');
  assert.equal(pick('Drop Cap Style', 'Fantasy').checked, true);
  // exports set the book in its font
  assert.match(await js('exportBodyFont()'), /Jost/);
});

test('another book keeps the library’s; the first gets its own back when it opens', async () => {
  const fantasyCap = await capVar();
  await js('backToShelf()'); await tick(800);
  await open(1);
  assert.doesNotMatch(await bodyVar(), /Jost/);
  assert.notEqual(await capVar(), fantasyCap);
  await tick(2200);
  assert.equal(item('Font and Drop Cap for This Book Only').checked, false);
  // NEO's own choice still changes the library (and this book with it)
  pick('Body Font', 'iA Writer Quattro').click();
  await tick(1500);
  assert.equal(libFonts().body, 'iA Writer Quattro');
  await js('backToShelf()'); await tick(800);
  await open(0);
  assert.match(await bodyVar(), /Jost/);
  assert.equal(await capVar(), fantasyCap);
});

test('turned off, the book goes back to the library’s', async () => {
  await tick(2200);
  item('Font and Drop Cap for This Book Only').click();
  await tick(1500);
  assert.equal(meta(0).ndFonts, undefined);
  assert.match(await bodyVar(), /iA Writer Quattro/);
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library && !!window.NeoPlusFonts`).catch(() => false))) await tick(50);
    await tick(300);
    ids.push(...await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([
        { name: 'The Lighthouse', chapters: [{ title: 'Low Tide', paras: [{ text: 'Mara walked the flats.' }] }] },
        { name: 'Tide Tables', chapters: [{ title: 'High Water', paras: [{ text: 'The boat came in.' }] }] }
      ], library.shelves[0]);
      return library.shelves[0].bookIds.slice(-2);
    })()`));
    await tick(500);
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
