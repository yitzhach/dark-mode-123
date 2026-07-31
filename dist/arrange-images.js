/* arrange-images.js — EDITOR-ONLY drag-to-rearrange for <image-slot> grids.
 *
 * What it does: while "Arrange" is on, every filled <image-slot> on the page
 * grows a small monospace grab handle on hover. Drag one onto another slot to
 * INSERT it there (everything between shifts along); hold SHIFT while dropping
 * to TRADE the two instead. Touch: long-press an image, then drag. Nothing is
 * written to disk until you press SAVE ORDER; REVERT restores the order this
 * page loaded with.
 *
 * It moves the IMAGES between slots, not the slots themselves — captions,
 * numbering and layout stay put. Each slot's hi-res companion (hires-target)
 * travels with it, so the lightbox stays correct.
 *
 * TO DUPLICATE ON ANOTHER PAGE: add
 *     <script src="./arrange-images.js"></script>
 * to that page's <helmet>. That's all — no config. It auto-discovers every
 * visible <image-slot id> in document order (= visual order for a grid).
 * Then add "arrange-images.js" to deploy.map.json's alsoCopy (already done).
 *
 * PUBLISHED SITE IS UNAFFECTED: every bit of chrome here is created only when
 * window.omelette.writeFile exists (i.e. inside the Claude editor). On the
 * live Netlify site this file loads and immediately does nothing.
 */
(() => {
  if (window.__arrangeImages) return;
  window.__arrangeImages = true;

  const ACCENT = '#A34A24', INK = '#1B1917', PAPER = '#EDEAE3', LIGHT = '#F5F3EE', LINE = '#D6CFC2', MUTED = '#5C564C';
  const MONO = "500 10px 'IBM Plex Mono',monospace";

  const store = () => window.ImageSlots;
  const editable = () => !!(window.omelette && window.omelette.writeFile) && !!store();

  let on = false, dirty = false, base = null, drag = null;
  let bar, bArrange, bSave, bRevert, hint;

  const visibleSlots = () => Array.from(document.querySelectorAll('image-slot[id]'))
    .filter((el) => el.offsetWidth > 4 && el.offsetHeight > 4);

  // The effective image of a slot is its sidecar entry when that carries a
  // URL, otherwise the author src= baked into the HTML. Arrange has to move
  // that effective image, not just the sidecar entry, or baked slots look
  // unchanged after a drop.
  const eff = (el) => {
    const st = store().get(el.id);
    if (st && st.u) return st;
    if (st && st.cleared) return null;
    const src = el.getAttribute && el.getAttribute('src');
    if (!src) return null;
    return Object.assign({}, st || {}, { u: src });
  };

  const readAll = (els) => els.map((el) => {
    const h = el.getAttribute('hires-target');
    const hEl = h ? document.getElementById(h) || document.querySelector('image-slot[id="' + h + '"]') : null;
    return { main: eff(el), hi: h ? (hEl ? eff(hEl) : store().get(h)) : undefined };
  });

  const writeAll = (els, vals) => els.forEach((el, i) => {
    // An emptied slot that still has an author src= needs the cleared marker,
    // otherwise it falls back to its baked image and the move looks like a copy.
    const authored = (el.getAttribute('src') || '').trim();
    store().set(el.id, vals[i].main || (authored ? { cleared: 1 } : null), { persist: false });
    const h = el.getAttribute('hires-target');
    if (h && vals[i].hi !== undefined) store().set(h, vals[i].hi, { persist: false });
  });

  const slotImg = (el) => {
    const img = el.shadowRoot && el.shadowRoot.querySelector('.frame img');
    return img && img.getAttribute('src') ? img.src : null;
  };

  /* ---------- chrome ---------- */

  function styles() {
    const s = document.createElement('style');
    s.textContent = [
      '.ai-handle{position:absolute;top:8px;left:8px;z-index:6;display:none;align-items:center;gap:6px;',
      '  padding:5px 8px;background:rgba(27,25,23,.74);color:' + LIGHT + ';font:' + MONO + ';',
      '  letter-spacing:.1em;text-transform:uppercase;cursor:grab;user-select:none;',
      '  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .14s ease}',
      'html[data-arranging] .ai-handle{display:inline-flex}',
      // Sit beside the editor-only ⤢ fullscreen box when that page has one.
      'html[data-arranging] .xi-btn ~ .ai-handle{left:46px}',
      'html[data-arranging] .ai-wrap:hover .ai-handle{opacity:1}',
      'html[data-arranging] .ai-wrap:hover .xi-btn{opacity:1}',
      'html[data-arranging] .ai-handle[data-touch]{opacity:1}',
      'html[data-arranging] image-slot{touch-action:none}',
      'html[data-arranging] .ai-wrap{outline:1px dashed rgba(163,74,36,.35);outline-offset:-1px}',
      '.ai-wrap[data-ai-src]{opacity:.3}',
      '.ai-wrap[data-ai-target]{outline:2px solid ' + ACCENT + ' !important;outline-offset:-2px}',
      '.ai-ghost{position:fixed;z-index:9999;pointer-events:none;width:132px;',
      '  box-shadow:0 22px 50px rgba(27,25,23,.4);border:1px solid ' + INK + ';background:' + LIGHT + '}',
      '.ai-ghost img{display:block;width:100%;height:100%;object-fit:cover}',
      '.ai-ghost span{position:absolute;left:0;bottom:-22px;font:' + MONO + ';letter-spacing:.12em;',
      '  text-transform:uppercase;background:' + INK + ';color:' + LIGHT + ';padding:3px 6px;white-space:nowrap}',
      '.ai-line{position:fixed;z-index:9998;width:3px;background:' + ACCENT + ';pointer-events:none}',
    ].join('');
    document.head.appendChild(s);
  }

  function buildBar() {
    bar = document.createElement('div');
    bar.setAttribute('data-ai-bar', '');
    bar.style.cssText = 'position:fixed;z-index:9997;left:50%;transform:translateX(-50%);' +
      'bottom:calc(18px + env(safe-area-inset-bottom));display:flex;align-items:stretch;gap:0;' +
      'background:' + PAPER + ';border:1px solid ' + INK + ';box-shadow:0 16px 40px rgba(27,25,23,.22)';

    const mk = (label, accent) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'appearance:none;border:0;border-left:1px solid ' + LINE + ';background:transparent;' +
        'font:600 10px \'IBM Plex Mono\',monospace;letter-spacing:.12em;text-transform:uppercase;' +
        'padding:11px 15px;cursor:pointer;color:' + (accent ? ACCENT : INK) + ';white-space:nowrap';
      bar.appendChild(b);
      return b;
    };

    bArrange = mk('Arrange images');
    bArrange.style.borderLeft = '0';
    bSave = mk('Save order', true);
    bRevert = mk('Revert');
    hint = document.createElement('span');
    hint.style.cssText = 'display:flex;align-items:center;padding:0 14px;border-left:1px solid ' + LINE +
      ';font:400 10px \'IBM Plex Mono\',monospace;letter-spacing:.06em;color:' + MUTED + ';white-space:nowrap';
    bar.appendChild(hint);

    bArrange.addEventListener('click', () => setOn(!on));
    bSave.addEventListener('click', () => {
      store().commit();
      base = store().all();
      dirty = false;
      flash('Order saved');
      render();
    });
    bRevert.addEventListener('click', () => {
      if (base) store().replaceAll(base, { persist: false });
      dirty = false;
      flash('Reverted');
      render();
    });
    document.body.appendChild(bar);
  }

  let flashT = null;
  function flash(msg) {
    hint.textContent = msg;
    clearTimeout(flashT);
    flashT = setTimeout(render, 2200);
  }

  function render() {
    bArrange.textContent = on ? 'Done arranging' : 'Arrange images';
    bArrange.style.color = on ? ACCENT : INK;
    bSave.style.display = dirty ? '' : 'none';
    bRevert.style.display = dirty ? '' : 'none';
    hint.textContent = dirty
      ? 'Unsaved order'
      : (on ? 'Drag a handle to move · hold Shift to trade' : '');
    hint.style.display = hint.textContent ? 'flex' : 'none';
  }

  /* ---------- handles ---------- */

  function mountHandles() {
    visibleSlots().forEach((el) => {
      const wrap = el.parentElement;
      if (!wrap) return;
      wrap.classList.add('ai-wrap');
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      if (wrap.querySelector(':scope > .ai-handle')) return;
      const h = document.createElement('div');
      h.className = 'ai-handle';
      h.title = 'Drag to move this image';
      h.textContent = '⠿ Move';
      h.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        startDrag(el, e);
      });
      h.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      wrap.appendChild(h);
    });
  }

  function setOn(next) {
    on = next;
    document.documentElement.toggleAttribute('data-arranging', on);
    if (on) {
      if (!base) base = store().all();
      mountHandles();
    } else {
      endDrag(true);
    }
    render();
  }

  /* ---------- drag ---------- */

  function startDrag(el, e) {
    if (drag) return;
    const els = visibleSlots();
    const from = els.indexOf(el);
    if (from < 0) return;
    const vals = readAll(els);
    if (!vals[from].main) { flash('That slot is empty'); return; }

    const ghost = document.createElement('div');
    ghost.className = 'ai-ghost';
    const r = el.getBoundingClientRect();
    ghost.style.height = Math.round(132 * (r.height / (r.width || 1))) + 'px';
    const src = slotImg(el);
    if (src) { const i = document.createElement('img'); i.src = src; ghost.appendChild(i); }
    const tag = document.createElement('span');
    tag.textContent = 'Insert here';
    ghost.appendChild(tag);
    document.body.appendChild(ghost);

    const line = document.createElement('div');
    line.className = 'ai-line';
    line.style.display = 'none';
    document.body.appendChild(line);

    el.parentElement.setAttribute('data-ai-src', '');
    drag = { els, vals, from, to: from, ghost, tag, line, pid: e.pointerId, swap: false, el };
    moveDrag(e);
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', dropDrag);
    window.addEventListener('pointercancel', () => endDrag(true));
    window.addEventListener('keydown', onKey);
  }

  function moveDrag(e) {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.pid)) return;
    if (e.cancelable) e.preventDefault();
    drag.ghost.style.left = (e.clientX + 14) + 'px';
    drag.ghost.style.top = (e.clientY + 14) + 'px';
    drag.swap = !!e.shiftKey;
    drag.tag.textContent = drag.swap ? 'Trade places' : 'Insert here';

    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const target = hit && hit.closest && hit.closest('image-slot');
    const to = target ? drag.els.indexOf(target) : -1;
    drag.els.forEach((s) => s.parentElement && s.parentElement.removeAttribute('data-ai-target'));
    drag.line.style.display = 'none';
    if (to < 0) { drag.to = drag.from; return; }
    drag.to = to;
    if (drag.swap || to === drag.from) {
      if (to !== drag.from) target.parentElement.setAttribute('data-ai-target', '');
      return;
    }
    const tr = target.getBoundingClientRect();
    const after = to > drag.from;
    drag.line.style.display = '';
    drag.line.style.left = ((after ? tr.right : tr.left) - 1) + 'px';
    drag.line.style.top = tr.top + 'px';
    drag.line.style.height = tr.height + 'px';
  }

  function dropDrag(e) {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.pid)) return;
    const { els, vals, from, to, swap } = drag;
    endDrag(false);
    if (to === from || to < 0) return;
    if (swap) { const t = vals[to]; vals[to] = vals[from]; vals[from] = t; }
    else { vals.splice(to, 0, vals.splice(from, 1)[0]); }
    writeAll(els, vals);
    dirty = true;
    flash(swap ? 'Traded — press Save order' : 'Moved — press Save order');
    render();
  }

  function onKey(e) {
    if (e.key === 'Escape' && drag) { e.preventDefault(); endDrag(true); }
  }

  function endDrag() {
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', dropDrag);
    window.removeEventListener('keydown', onKey);
    if (!drag) return;
    drag.ghost.remove();
    drag.line.remove();
    drag.els.forEach((s) => {
      if (!s.parentElement) return;
      s.parentElement.removeAttribute('data-ai-target');
      s.parentElement.removeAttribute('data-ai-src');
    });
    drag = null;
  }

  /* ---------- touch long-press ---------- */

  function touchPress() {
    let t = null, sx = 0, sy = 0, el = null, pid = null;
    const clear = () => { clearTimeout(t); t = null; el = null; };
    document.addEventListener('pointerdown', (e) => {
      if (!on || drag || e.pointerType !== 'touch') return;
      const s = e.target && e.target.closest && e.target.closest('image-slot');
      if (!s) return;
      el = s; pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      t = setTimeout(() => {
        if (!el) return;
        const held = el;
        clear();
        startDrag(held, { pointerId: pid, clientX: sx, clientY: sy, shiftKey: false, cancelable: false });
      }, 380);
    }, { passive: true });
    document.addEventListener('pointermove', (e) => {
      if (!t) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear();
    }, { passive: true });
    ['pointerup', 'pointercancel', 'scroll'].forEach((n) =>
      document.addEventListener(n, clear, { passive: true }));
  }

  /* ---------- boot ---------- */

  function boot() {
    if (!editable()) return false;
    styles();
    buildBar();
    render();
    touchPress();
    new MutationObserver(() => { if (on) mountHandles(); })
      .observe(document.body, { childList: true, subtree: true });
    window.addEventListener('beforeunload', (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
    return true;
  }

  const start = () => {
    if (boot()) return;
    let tries = 0;
    const iv = setInterval(() => { if (boot() || ++tries > 60) clearInterval(iv); }, 500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
