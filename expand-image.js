/* Editor-only "open fullscreen" affordance.
 *
 * Why: clicking a work opens the fullscreen lightbox, which fights with the
 * image-slot Edit (reframe) mode — the overlay covers the very image you're
 * repositioning. The pages now ignore card clicks while any slot is in
 * reframe, and this script adds a small ⤢ box in the top-right of each image
 * that opens the lightbox on demand. Top-LEFT, clear of the slot's own
 * Replace / Edit / ✕ strip in the top-right.
 *
 * Self-gates on the editor bridge, exactly like arrange-images.js, so the
 * published site is untouched. Enable on a page by adding
 *   <script src="./expand-image.js"></script>
 * to its helmet — no config.
 */
(function () {
  if (typeof window === 'undefined') return;
  var isEditor = !!(window.omelette && typeof window.omelette.writeFile === 'function');
  if (!isEditor) return;

  var STYLE_ID = 'expand-image-style';
  if (!document.getElementById(STYLE_ID)) {
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.xi-anchor{position:relative}' +
      '.xi-btn{position:absolute;top:8px;left:8px;z-index:6;width:30px;height:30px;' +
      '  display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;' +
      '  background:rgba(237,234,227,.94);border:1px solid #1B1917;color:#1B1917;' +
      '  font:400 15px/1 "IBM Plex Mono",monospace;opacity:0;transition:opacity .2s ease,background .2s ease}' +
      '.xi-anchor:hover .xi-btn,.xi-btn:focus-visible{opacity:1}' +
      '.xi-btn:hover{background:#1B1917;color:#EDEAE3}' +
      '@media (prefers-reduced-motion:reduce){.xi-btn{transition:none}}';
    document.head.appendChild(s);
  }

  function cardFor(anchor) {
    var el = anchor;
    while (el && el !== document.body) {
      if (el.hasAttribute('data-i') || (el.parentElement && el.parentElement.classList.contains('m-grid-3'))) return el;
      el = el.parentElement;
    }
    return anchor.parentElement;
  }

  function open(anchor) {
    var card = cardFor(anchor);
    if (!card) return;
    window.__forceLightbox = true;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    setTimeout(function () { window.__forceLightbox = false; }, 0);
  }

  function mount() {
    var slots = document.querySelectorAll('image-slot');
    for (var i = 0; i < slots.length; i++) {
      var anchor = slots[i].parentElement;
      if (!anchor || !anchor.classList.contains('m-card-img')) continue;
      if (anchor.querySelector(':scope > .xi-btn')) continue;
      anchor.classList.add('xi-anchor');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'xi-btn';
      b.title = 'Open fullscreen';
      b.setAttribute('aria-label', 'Open fullscreen');
      b.textContent = '⤢';
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        open(this.parentElement);
      });
      anchor.appendChild(b);
    }
  }

  var pending = 0;
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = 0; mount(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();
