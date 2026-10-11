// NEO+: a set-apart line — "TWO WEEKS LATER", "THE NEXT MORNING" — on its own,
// centered, bold and larger, apart from the prose around it. Never takes
// the drop cap: at the top of a chapter the cap goes to the first line of
// prose after it.
//
// Right-click in a paragraph → Set-Apart Line (or Format → Set-Apart Line)
// turns it on and off. On the page it's <p class="poetry nd-banner">: NEO
// already sets a poetry paragraph apart (no indent, no drop cap, in every
// export); nd-banner makes it the centered bold line. In exports it's
// centered and bold; in the Google Docs, centered, bold and 14 pt, and it
// comes back from a Doc as a set-apart line.
(function () {
  'use strict';
  if (typeof window.parasFromHtml !== 'function' || !window.neo || !window.neo.onMenu) return;

  const CLS = 'nd-banner';

  // ---- on the page
  const css = document.createElement('style');
  css.textContent = `
    .chapter-body p.${CLS} { margin: 1.4em 0 !important; text-indent: 0; text-align: center; font-weight: 700;
      font-size: 1.3em; letter-spacing: 0.06em; font-style: normal; }
    .chapter-body p.${CLS}:first-child { margin-top: 0.2em !important; }
  `;
  document.head.appendChild(css);

  function caretPara() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let el = sel.getRangeAt(0).startContainer;
    if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
    const p = el && el.closest ? el.closest('.chapter-body > p') : null;
    return p && !p.classList.contains('scene-break') ? p : null;
  }
  const chapterOf = (p) => { const body = p.closest('.chapter-body'); return { body, chId: body && body.closest('.chapter').dataset.id }; };

  function toggle() {
    const p = caretPara();
    if (!p) { toast(t('Click into a paragraph first')); return; }
    const { body, chId } = chapterOf(p);
    if (!body || !chId) return;
    if (typeof snapshotStructure === 'function') snapshotStructure('set-apart line');
    const on = !p.classList.contains(CLS);
    if (on) {
      if (p.classList.contains('poetry') && typeof romanize === 'function') romanize(p); // (a verse's italics)
      p.classList.remove('flush');
      p.classList.add('poetry', CLS);
      p.style.removeProperty('text-align');
      if (!p.getAttribute('style')) p.removeAttribute('style');
    } else {
      p.classList.remove('poetry', CLS);
      if (!p.className) p.removeAttribute('class');
    }
    if (typeof caretIntoStart === 'function') caretIntoStart(p);
    syncChapter(body, chId);
    if (typeof resetNativeUndo === 'function') resetNativeUndo();
    if (typeof breakRun !== 'undefined') breakRun++;
  }

  // A set-apart line is always also a poetry paragraph. NEO's Enter turns
  // the next line (or an emptied one) back into prose by taking the poetry
  // off; the set-apart mark goes with it.
  function tidy(root) {
    const changed = new Set();
    for (const p of (root || document).querySelectorAll(`.chapter-body p.${CLS}:not(.poetry)`)) {
      p.classList.remove(CLS);
      if (!p.className) p.removeAttribute('class');
      changed.add(p.closest('.chapter-body'));
    }
    for (const body of changed) {
      const chId = body && body.closest('.chapter') && body.closest('.chapter').dataset.id;
      if (chId) syncChapter(body, chId);
    }
  }
  document.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') setTimeout(() => tidy(), 0); }, true);

  // ---- in exports and the Google Docs: centered and bold, flagged banner
  const ownParas = window.parasFromHtml;
  window.parasFromHtml = function (html) {
    if (typeof html !== 'string' || html.indexOf(CLS) < 0) return ownParas.apply(this, arguments);
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const flags = [];
    for (const p of holder.querySelectorAll('p')) {
      if (!p.classList.contains(CLS)) continue;
      p.style.textAlign = 'center';
      if (!(p.childNodes.length === 1 && /^(B|STRONG)$/.test(p.firstChild.nodeName))) {
        const b = document.createElement('b');
        while (p.firstChild) b.appendChild(p.firstChild);
        p.appendChild(b);
      }
    }
    const out = ownParas.call(this, holder.innerHTML);
    // which of what came back are set-apart lines: the same paragraphs, in
    // the same order, as NEO keeps them (ghosts and empty lines left out)
    holder.querySelectorAll('p.ghost[data-sec-id]').forEach((g) => {
      const brk = holder.querySelector(`p.scene-break[data-sec-brk="${g.dataset.secId}"]`);
      if (brk) brk.remove();
    });
    holder.querySelectorAll('.darling-anchor, .ph-mark, .ghost').forEach((n) => n.remove());
    for (const p of holder.querySelectorAll('p')) {
      if (p.classList.contains('scene-break') || p.textContent.replace(/ /g, ' ').trim()) flags.push(p.classList.contains(CLS));
    }
    if (flags.length === out.length) out.forEach((p, i) => { if (flags[i]) p.banner = true; });
    else out.forEach((p) => { if (p.poetry && p.align === 'center' && p.runs.length && p.runs.every((r) => r.b || r.br)) p.banner = true; });
    return out;
  };

  window.neo.onMenu((msg) => {
    if (!msg || msg.type !== 'nd-setapart') return;
    // right-clicked with nothing selected: the paragraph under the pointer
    if (!msg.sel && typeof msg.x === 'number' && document.caretRangeFromPoint) {
      const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
      const r = document.caretRangeFromPoint(msg.x / zoom, msg.y / zoom) || document.caretRangeFromPoint(msg.x, msg.y);
      const hit = r && (r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer);
      if (hit && hit.closest && hit.closest('.chapter-body')) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    }
    toggle();
  });
  window.NeoPlusSetApart = { toggle, tidy }; // for tests
})();
