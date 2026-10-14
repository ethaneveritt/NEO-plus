// NEO+: a blank line between paragraphs stays a blank line — in exports and
// in the Google Docs, not just on the page. (A letter: "Dear Tom," then a
// blank line, then the letter.) Enter twice makes one (neo-plus/guard.js);
// Enter three times turns it into a *** break.
//
// NEO's own reading of a chapter for exports (parasFromHtml) leaves empty
// paragraphs out. Here an empty paragraph between words comes through as a
// paragraph holding one no-break space, which every export sets as a blank
// line; none at the start or end of a chapter, none beside a ***, and one
// where there were several (the same rule the Docs use, NeoPlusBlocks.tidyBlanks).
(function () {
  'use strict';
  if (typeof window.parasFromHtml !== 'function') return;

  const MARK = '⠀'; // a stand-in NEO's reading keeps (it isn't white space)
  // an empty paragraph of the writer's: not a ***, not an outline's ghost
  function isBlank(p) {
    return p.tagName === 'P' && !p.classList.contains('scene-break') && !p.classList.contains('ghost') && !p.classList.contains('poetry') &&
      p.textContent.replace(/[\s ​]/g, '') === '' && !p.querySelector('.ph-mark, img');
  }

  const own = window.parasFromHtml;
  window.parasFromHtml = function (html) {
    if (typeof html !== 'string' || html.indexOf('<p') < 0) return own.apply(this, arguments);
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const ps = [...holder.querySelectorAll('p')].filter(isBlank);
    if (!ps.length) return own.apply(this, arguments);
    for (const p of ps) { p.removeAttribute('style'); p.textContent = MARK; }
    const out = own.call(this, holder.innerHTML).map((p) => (p.text === MARK
      ? { ...p, blank: true, text: '', poetry: false, flush: false, align: '', runs: [{ text: ' ' }], html: '<p>&nbsp;</p>' }
      : p));
    const blocks = window.NeoPlusBlocks;
    return blocks && blocks.tidyBlanks
      ? blocks.tidyBlanks(out, (p) => (p.blank ? { k: 'p', text: '' } : p.sceneBreak ? { k: 'brk' } : { k: 'p', text: 'x' }))
      : out.filter((p) => !p.blank);
  };

  window.NeoPlusBlanks = { isBlank };
})();
