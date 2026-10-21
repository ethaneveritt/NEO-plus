// NEO+: the book's name over your own cover image.
//
// NEO shows a writer's own cover art as it is — right for a finished cover
// that already carries its lettering. For a picture chosen just to inspire,
// the ↻ on its tile now offers "Add the title, subtitle and author": NEO's own
// cover type (the same templates its abstract covers use) set over the image,
// with "A different title style" to try another, and "Just the image" to take
// it away again. The image itself is never changed.
//
// Kept in the book's own meta: ndType (on/off) and ndTypeSeed (the style);
// "Adjust the title…" adds ndTypeScale, ndTypeAnchor and ndTypeShift.
(function () {
  'use strict';
  if (typeof window.dressTile !== 'function' || typeof window.refreshCover !== 'function' || typeof NeoCovers === 'undefined') return;

  const own = { dressTile: window.dressTile, refreshCover: window.refreshCover, exportCover: window.exportCover };
  const art = new Map(); // book id + image file → { url, canvas } fitted to a tile
  const wantsType = (meta) => !!(meta && meta.ndType && meta.coverImage && coverMode(meta) === 'image' && !isScript(meta));
  const styled = (meta) => ({ ...meta, coverSeed: meta.ndTypeSeed || meta.coverSeed || meta.id });

  async function imageArt(meta) {
    const key = meta.id + '/' + meta.coverImage;
    if (art.has(key)) return art.get(key);
    const c = await window.neo.readCover(meta.id, meta.coverImage);
    if (!c) return null;
    const entry = await NeoCovers.fitImage('nd-type:' + key, `data:${c.mime};base64,${c.base64}`);
    if (entry) art.set(key, entry);
    return entry;
  }

  // the subtitle, small, under the title (NEO's tiles carry title and author)
  function addSubtitle(el, meta) {
    const box = el.querySelector('.b-title');
    if (!box || !meta.subtitle) return;
    const sizes = [...box.querySelectorAll('.b-line:not(.b-small)')].map((s) => parseFloat(s.style.fontSize) || 0);
    const big = Math.max(10, ...sizes);
    const span = document.createElement('span');
    span.className = 'b-line b-small b-ital nd-subtitle';
    span.style.fontSize = Math.max(7, Math.min(11, big * 0.36)).toFixed(1) + 'px';
    span.style.marginTop = '3px';
    span.textContent = meta.subtitle;
    box.appendChild(span);
  }

  // The title's own size and place, as chosen in "Adjust the title…":
  // ndTypeScale (0.5–1.3), ndTypeAnchor ('top' | 'center' | 'bottom'),
  // ndTypeShift (tile px, up −, down +). Exports read the same (covers.js).
  const ANCHORS = ['top', 'center', 'bottom'];
  function adjust(el, meta) {
    el.classList.remove('nd-at-top', 'nd-at-center', 'nd-at-bottom', 'nd-shifted');
    el.style.removeProperty('--nd-shift');
    const sc = Number(meta.ndTypeScale);
    if (sc && sc !== 1) {
      for (const span of el.querySelectorAll('.b-title .b-line')) {
        const px = parseFloat(span.style.fontSize);
        if (px) span.style.fontSize = (px * sc).toFixed(1) + 'px';
      }
    }
    if (ANCHORS.includes(meta.ndTypeAnchor)) el.classList.add('nd-at-' + meta.ndTypeAnchor);
    const shift = Number(meta.ndTypeShift) || 0;
    if (shift) { el.classList.add('nd-shifted'); el.style.setProperty('--nd-shift', shift + 'px'); }
    const anchor = ANCHORS.includes(meta.ndTypeAnchor) ? meta.ndTypeAnchor : null;
    el.classList.toggle('nd-shift-title', !!shift && (anchor ? anchor === 'top' : /\bcv-(stack|oswald)\b/.test(el.className)));
  }

  window.dressTile = function (el, meta) {
    if (el && el.classList) {
      el.classList.remove('nd-au-free', 'nd-at-top', 'nd-at-center', 'nd-at-bottom', 'nd-shifted', 'nd-shift-title');
      el.style.removeProperty('--nd-shift');
    }
    if (!wantsType(meta)) return own.dressTile.apply(this, arguments);
    el.classList.remove('has-cover');
    const token = (el._dressToken = (el._dressToken || 0) + 1);
    // the image as it is until it's been read, then the type over it
    el.style.background = `#1d1d1d url("${coverUrl(meta)}") center / cover no-repeat`;
    imageArt(meta).then((a) => {
      if (el._dressToken !== token) return;
      if (!a) { own.dressTile(el, meta); return; }
      NeoCovers.dress(el, NeoCovers.plan(styled(meta), a));
      // no box behind the author's name: a soft shadow keeps it readable
      el.classList.remove('cv-au-scrim');
      el.classList.add('nd-au-free');
      adjust(el, meta);
      addSubtitle(el, meta);
    });
    return undefined;
  };

  // ↻ on a tile showing your own image: the type choices first
  window.refreshCover = async function (meta, el) {
    if (!meta || !meta.coverImage || coverMode(meta) !== 'image' || isScript(meta)) return own.refreshCover.apply(this, arguments);
    const options = meta.ndType
      ? [
          { label: t('Adjust the title…'), desc: t('Its lettering, its size, and where it sits on the cover.'), value: 'adjust' },
          { label: t('A different title style'), desc: t('Sets the title, subtitle and author in another style over your image.'), value: 'restyle' },
          { label: t('Just the image'), desc: t('Takes the title, subtitle and author off again.'), value: 'off' }
        ]
      : [{ label: t('Add the title, subtitle and author'), desc: t('Sets the book’s name over your image, in one of NEO’s cover styles. Your image stays as it is.'), value: 'on' }];
    options.push({ label: t('Other cover choices…'), desc: t('NEO’s abstract cover, its painting, new colours.'), value: 'more' });
    const choice = await optionModal(t('Cover for “{title}”', { title: escHtml(meta.title || t('Untitled')) }), null, options);
    if (!choice) return undefined;
    if (choice === 'more') return own.refreshCover.call(this, meta, el);
    const live = (book && book.id === meta.id) ? book : meta;
    if (choice === 'adjust') return openAdjust(meta, live, el);
    if (choice === 'on') { live.ndType = true; if (!live.ndTypeSeed) live.ndTypeSeed = live.id + ':type'; }
    if (choice === 'off') live.ndType = false;
    if (choice === 'restyle') {
      // a style that differs from the one showing
      const before = NeoCovers.plan(styled(live), { url: '', canvas: blank() }).template;
      for (let i = 0; i < 12; i++) {
        live.ndTypeSeed = live.id + ':type:' + Date.now().toString(36) + i;
        if (NeoCovers.plan(styled(live), { url: '', canvas: blank() }).template !== before) break;
      }
    }
    if (live !== meta) Object.assign(meta, { ndType: live.ndType, ndTypeSeed: live.ndTypeSeed });
    if (live === book) scheduleMetaSave(); else await writeBookMeta(meta.id, live);
    window.dressTile(el, live);
    return undefined;
  };
  let blankCanvas = null;
  function blank() {
    if (!blankCanvas) { blankCanvas = document.createElement('canvas'); blankCanvas.width = 208; blankCanvas.height = 300; }
    return blankCanvas;
  }

  // Exports (EPUB, PDF): your image with the title and author set over it
  // the same way, when the type is on.
  if (typeof own.exportCover === 'function') {
    window.exportCover = async function (d) {
      if (!d || !d.coverImage) return own.exportCover.apply(this, arguments);
      let meta = book && book.id === d.id ? book : null;
      if (!meta) { try { meta = await window.neo.readBookMeta(d.id); } catch { meta = null; } }
      if (!(meta && meta.ndType && meta.coverImage === d.coverImage)) return own.exportCover.apply(this, arguments);
      try {
        const c = await window.neo.readCover(d.id, d.coverImage);
        if (!c) return own.exportCover.apply(this, arguments);
        const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = `data:${c.mime};base64,${c.base64}`; });
        await NeoCovers.ready;
        const url = NeoCovers.renderFull(styled({ ...d, title: meta.title || d.title, author: meta.author || d.author, ndTypeSeed: meta.ndTypeSeed, ndTypeScale: meta.ndTypeScale, ndTypeAnchor: meta.ndTypeAnchor, ndTypeShift: meta.ndTypeShift, noAuthorPlate: true }), { image: img }).toDataURL('image/jpeg', 0.92);
        return { base64: url.split(',')[1], mime: 'image/jpeg', ext: 'jpg' };
      } catch (err) {
        window.neo.logError('NEO+ cover type: ' + err);
        return own.exportCover.apply(this, arguments);
      }
    };
  }

  // ---- Adjust the title…: lettering, size, place; the tile behind and a
  // copy in the window show each change as it's made
  const FACES = [
    ['stack', 'Anton', 'NEO Anton', 400], ['bebas', 'Bebas Neue', 'NEO Bebas', 400], ['oswald', 'Oswald', 'NEO Oswald', 700],
    ['black', 'Playfair', 'NEO Playfair', 900], ['fat', 'Abril Fatface', 'NEO Abril', 400], ['cinzel', 'Cinzel', 'NEO Cinzel', 900],
    ['band', 'Jost on a band', 'NEO Josefin', 700]
  ];
  const templateOf = (meta) => NeoCovers.plan(styled(meta), { url: '', canvas: blank() }).template;
  // NEO chooses a lettering from the style's seed: the first seed that gives this one
  function seedFor(meta, face) {
    for (let k = 0; k < 500; k++) {
      const seed = `${meta.id}:type:${face}:${k}`;
      if (templateOf({ ...meta, ndTypeSeed: seed }) === face) return seed;
    }
    return meta.ndTypeSeed;
  }
  function openAdjust(meta, live, el) {
    if (document.querySelector('.nd-adjust')) return undefined;
    const keys = ['ndTypeSeed', 'ndTypeScale', 'ndTypeAnchor', 'ndTypeShift'];
    const before = Object.fromEntries(keys.map((k) => [k, live[k]]));
    const draft = { ...live };
    const face0 = templateOf(draft);
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `
      <div class="modal nd-adjust">
        <h2>${t('Adjust the title')}</h2>
        <div class="nd-adj-body">
          <div class="nd-adj-preview"></div>
          <div class="nd-adj-controls">
            <div class="nd-adj-label">${t('Lettering')}</div>
            <div class="nd-adj-faces">${FACES.map(([id, name, fam, w]) => `<button class="nd-face" data-face="${id}" style="font-family:'${fam}';font-weight:${w}">${name}</button>`).join('')}</div>
            <div class="nd-adj-label">${t('Size')} <span class="nd-adj-val nd-sz-val"></span></div>
            <input class="nd-sz" type="range" min="50" max="130" step="5">
            <div class="nd-adj-label">${t('Where it sits')}</div>
            <div class="nd-adj-anchors">
              <button data-anchor="">${t('Its own place')}</button><button data-anchor="top">${t('Top')}</button><button data-anchor="center">${t('Middle')}</button><button data-anchor="bottom">${t('Bottom')}</button>
            </div>
            <div class="nd-adj-label">${t('Higher or lower')} <span class="nd-adj-val nd-sh-val"></span></div>
            <input class="nd-sh" type="range" min="-50" max="50" step="1">
          </div>
        </div>
        <div class="nd-adj-foot">
          <button class="m-reset btn-quiet">${t('Back to as it was set')}</button>
          <span><button class="m-cancel btn-quiet">${t('Cancel')}</button><button class="m-ok btn-gold">${t('Save')}</button></span>
        </div>
      </div>`;
    document.body.appendChild(bd);
    const $q = (sel) => bd.querySelector(sel);
    const preview = document.createElement('div');
    preview.className = el.className;
    preview.innerHTML = el.innerHTML;
    preview.querySelectorAll('.b-refresh, button').forEach((b) => b.remove());
    $q('.nd-adj-preview').appendChild(preview);
    const show = () => {
      const face = templateOf(draft);
      bd.querySelectorAll('.nd-face').forEach((b) => b.classList.toggle('sel', b.dataset.face === face));
      bd.querySelectorAll('[data-anchor]').forEach((b) => b.classList.toggle('sel', (b.dataset.anchor || '') === (draft.ndTypeAnchor || '')));
      const sc = Math.round((Number(draft.ndTypeScale) || 1) * 100);
      $q('.nd-sz').value = sc; $q('.nd-sz-val').textContent = sc + '%';
      const sh = Number(draft.ndTypeShift) || 0;
      $q('.nd-sh').value = sh; $q('.nd-sh-val').textContent = sh ? (sh < 0 ? t('{n} up', { n: -sh }) : t('{n} down', { n: sh })) : '';
      window.dressTile(preview, draft);
      window.dressTile(el, draft);
    };
    bd.querySelectorAll('.nd-face').forEach((b) => { b.onclick = () => { if (templateOf(draft) !== b.dataset.face) draft.ndTypeSeed = seedFor(draft, b.dataset.face); show(); }; });
    bd.querySelectorAll('[data-anchor]').forEach((b) => { b.onclick = () => { draft.ndTypeAnchor = b.dataset.anchor || undefined; show(); }; });
    $q('.nd-sz').oninput = (e) => { const v = Number(e.target.value) / 100; draft.ndTypeScale = v === 1 ? undefined : v; show(); };
    $q('.nd-sh').oninput = (e) => { const v = Number(e.target.value); draft.ndTypeShift = v || undefined; show(); };
    const close = () => bd.remove();
    $q('.m-cancel').onclick = () => { window.dressTile(el, live); close(); };
    $q('.m-reset').onclick = () => { draft.ndTypeScale = undefined; draft.ndTypeAnchor = undefined; draft.ndTypeShift = undefined; if (templateOf(draft) !== face0) draft.ndTypeSeed = before.ndTypeSeed; show(); };
    $q('.m-ok').onclick = async () => {
      for (const k of keys) { if (draft[k] === undefined) delete live[k]; else live[k] = draft[k]; }
      if (live !== meta) for (const k of keys) { if (live[k] === undefined) delete meta[k]; else meta[k] = live[k]; }
      if (live === book) scheduleMetaSave(); else await writeBookMeta(meta.id, live);
      window.dressTile(el, live);
      close();
    };
    bd.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); $q('.m-cancel').click(); } });
    show();
    return undefined;
  }

  const css = document.createElement('style');
  css.textContent = `
    .book.nd-at-top .b-text { top: 10px !important; bottom: 9px !important; justify-content: space-between !important; transform: none !important; }
    .book.nd-at-center .b-text { top: 12px !important; bottom: 12px !important; justify-content: center !important; transform: none !important; }
    .book.nd-at-bottom .b-text { top: auto !important; bottom: 10px !important; justify-content: flex-end !important; transform: none !important; }
    .book.cv-band.nd-at-top .b-text { top: 10px !important; bottom: auto !important; }
    .book.cv-band.nd-at-center .b-text { top: 50% !important; bottom: auto !important; transform: translateY(-50%) !important; }
    .book.cv-band.nd-at-bottom .b-text { top: auto !important; bottom: 10px !important; }
    .book.nd-shifted:not(.nd-shift-title) .b-text { margin-top: var(--nd-shift); margin-bottom: calc(-1 * var(--nd-shift)); }
    .book.nd-shifted.nd-shift-title .b-title { transform: translateY(var(--nd-shift)); }
    .nd-adjust { width: 600px; max-height: 90vh; overflow: auto; }
    .nd-adjust .nd-adj-body { display: flex; gap: 26px; align-items: flex-start; }
    .nd-adjust .nd-adj-preview { flex: none; transform: scale(1.6); transform-origin: top left; width: 104px; height: 150px; margin: 4px 66px 90px 0; }
    .nd-adjust .nd-adj-preview .book { position: relative; width: 104px; height: 150px; margin: 0; border-radius: 3px; overflow: hidden; }
    .nd-adjust .nd-adj-controls { flex: 1; min-width: 0; }
    .nd-adjust .nd-adj-label { font-size: 12px; color: var(--muted, #888); margin: 14px 0 6px; }
    .nd-adjust .nd-adj-label:first-child { margin-top: 0; }
    .nd-adjust .nd-adj-val { color: var(--ink, #ddd); margin-left: 6px; }
    .nd-adjust .nd-adj-faces, .nd-adjust .nd-adj-anchors { display: flex; flex-wrap: wrap; gap: 6px; }
    .nd-adjust .nd-adj-faces button, .nd-adjust .nd-adj-anchors button { font-size: 13px; padding: 5px 9px; border-radius: 6px; border: 1px solid #3a3a3a;
      background: transparent; color: inherit; cursor: pointer; }
    .nd-adjust .nd-adj-anchors button { font-family: inherit; font-size: 12px; }
    .nd-adjust button.sel { border-color: var(--accent); color: var(--accent); }
    .nd-adjust input[type=range] { display: block; width: 100%; margin: 0; padding: 0; border: 0; background: none; accent-color: var(--accent); }
    .nd-adjust .nd-adj-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; }
    .nd-adjust .nd-adj-foot .btn-gold { margin-left: 10px; }

    .book.nd-au-free .b-author { background: none !important; padding: 0; }
    .book.nd-au-free.cv-au-light .b-author { text-shadow: 0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.6); }
    .book.nd-au-free.cv-au-dark .b-author { text-shadow: 0 1px 2px rgba(255,255,255,0.8), 0 0 8px rgba(255,255,255,0.5); }
  `;
  document.head.appendChild(css);

  window.NeoPlusCovers = { wantsType, adjust: openAdjust, templateOf };
})();
