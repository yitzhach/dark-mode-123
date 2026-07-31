// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
/* BEGIN USAGE */
/**
 * <image-slot> — user-fillable image placeholder.
 *
 * Drop this into a deck, mockup, or page wherever a design needs an image.
 * You control the slot's shape; it sizes to its container by default. When the search_stock_photos tool
 * is available, prefill the slot by default — write the photo's URL into
 * src (with credit/credit-href); the user can still fill or replace it
 * by dragging an image file onto it (or clicking to browse). The dropped
 * image persists across reloads via a .image-slots.state.json sidecar —
 * same read-via-fetch / write-via-window.omelette pattern as
 * design_canvas.jsx, so the filled slot shows on share links, downloaded
 * zips, and PPTX export. Outside the omelette runtime the slot is read-only.
 *
 * The host bridge only allows sidecar writes at the project root, so the
 * HTML that uses this component is assumed to live at the project root too
 * (same constraint as design_canvas.jsx).
 *
 * Attributes:
 *   id           Persistence key. REQUIRED for the drop to survive reload —
 *                every slot on the page needs a distinct id.
 *   shape        'rect' | 'rounded' | 'circle' | 'pill'   (default 'rounded')
 *                'circle' applies 50% border-radius; on a non-square slot
 *                that's an ellipse — set equal width and height for a true
 *                circle.
 *   radius       Corner radius in px for 'rounded'.       (default 12)
 *   mask         Any CSS clip-path value. Overrides `shape` — use this for
 *                hexagons, blobs, arbitrary polygons.
 *   fit          Initial framing baseline: cover | contain.   (default 'cover')
 *                cover starts the image filling the frame (overflow cropped);
 *                contain starts it fully visible (letterboxed). Either way the
 *                user can always pan/scale from there — double-click, or the
 *                Edit control, enters reframe mode (drag to move, scroll or
 *                corner-handles to scale; Escape / click-out commits). The
 *                crop persists alongside the image in the sidecar.
 *   placeholder  Empty-state caption.                      (default 'Drop an image')
 *   src          Optional initial/fallback image URL. Prefill it with a real
 *                photo via search_stock_photos when that tool is available
 *                (set credit/credit-href from the result). A user drop
 *                overrides it; clearing the drop reveals src again.
 *   credit       Attribution text shown as a small overlay at the
 *                bottom-left of the filled slot. REQUIRED whenever src
 *                points at any Unsplash host (images.unsplash.com,
 *                plus.unsplash.com, …): an Unsplash src with no credit
 *                renders an error tile INSTEAD of the photo (Unsplash
 *                terms forbid showing their photos unattributed). Use the
 *                exact form 'Photo by {photographer name} on Unsplash' —
 *                the overlay then links the name to credit-href and
 *                'Unsplash' to the Unsplash homepage, and links back to
 *                unsplash.com automatically get the required utm referral
 *                params appended at render time. The credit belongs to
 *                the src image, so it only shows while src is what's
 *                displayed — a user-dropped image hides it.
 *   credit-href  Link for the photographer's name in the credit overlay
 *                (their Unsplash profile URL from the stock-photo search
 *                results). http(s) URLs only — anything else renders the
 *                name as plain text.
 *
 * Sizing: the slot fills its container by default (width/height 100%).
 * Put it in a sized wrapper — absolutely positioned, a grid cell, a fixed
 * frame — and it takes exactly that box. When the parent's height is
 * indefinite (ordinary flow), it falls back to full width at a 3:2 aspect
 * ratio instead of collapsing. In a shrink-to-fit parent (a float,
 * width:max-content, an unsized absolute wrapper), percentages have
 * nothing to resolve against — size the slot or its wrapper explicitly
 * there. For a fixed-size slot, set
 * width/height on the element itself (inline style), which overrides the
 * default. When
 * layering content above a slot (full-bleed layouts), make the overlay
 * click-through — pointer-events: none on scrims/text plates, re-enabled
 * on interactive children — so the slot's hover controls stay reachable.
 * Keep the slot's bottom-left corner visually clear as well: the credit
 * overlay renders there, and a dark fade or text plate covering it hides
 * the attribution Unsplash's terms require — end the fade above that
 * corner, or keep it nearly transparent where the credit sits.
 *
 * Usage:
 *   <div style="position:relative;width:100%;height:100%">      <!-- full-bleed: -->
 *     <image-slot id="bg" shape="rect"></image-slot>            <!-- fills the wrapper -->
 *   </div>
 *   <image-slot id="hero"   style="width:800px;height:450px" shape="rounded" radius="20"
 *               placeholder="Drop a hero image"></image-slot>
 *   <image-slot id="avatar" style="width:120px;height:120px" shape="circle"></image-slot>
 *   <image-slot id="kite"   style="width:300px;height:300px"
 *               mask="polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"></image-slot>
 */
/* END USAGE */

(() => {
  const STATE_FILE = 'image-slots.state.json';
  // Per-slot sidecars: image bytes live one-image-per-file so every write
  // clears the host's ~2MB write ceiling (the shared file used to hold every
  // image and silently stopped persisting new drops once it grew past it).
  // The host allowlists *.state.json basenames only, hence the naming.
  const slotFile = (id) => 'slot-' + String(id).replace(/[^\w.-]/g, '_') + '.state.json';
  // ids whose bytes are known to be on disk in their own sidecar.
  const sidecarWritten = new Set();
  const bytesOf = (v) => (typeof v === 'string' ? v : (v && v.u)) || '';
  const isData = (u) => /^data:image\//i.test(u || '');
  // Shared file keeps crop/look/flags only. A data-URL entry is reduced to
  // d:1, meaning "bytes are in slot-<id>.state.json"; short path refs
  // (images/<id>.webp) stay inline since they cost nothing.
  function strip(v) {
    if (!v) return v;
    if (typeof v === 'string') return isData(v) ? { d: 1, s: 1, x: 0, y: 0 } : { u: v, s: 1, x: 0, y: 0 };
    const out = {};
    for (const k in v) if (k !== 'u' && k !== 'd') out[k] = v[k];
    if (v.u && isData(v.u)) out.d = 1;
    else if (v.u) out.u = v.u;
    return out;
  }
  function sharedPayload() {
    const out = {};
    for (const id in slots) out[id] = strip(slots[id]);
    return out;
  }
  function writeSidecar(id, u) {
    const w = window.omelette && window.omelette.writeFile;
    if (!w || !id || !u) return Promise.resolve();
    return Promise.resolve(w(slotFile(id), JSON.stringify({ u: u })))
      .then(() => { sidecarWritten.add(id); }, () => {});
  }
  // Any in-memory image whose bytes aren't on disk yet (fresh drop, or a
  // legacy entry adopted from the old shared file).
  function pendingIds() {
    return Object.keys(slots).filter((id) => {
      const u = bytesOf(slots[id]);
      return isData(u) && !sidecarWritten.has(id);
    });
  }

  // Unsplash terms require visible attribution wherever their photos
  // display, and every link back to unsplash.com must carry utm referral
  // params. Two render-time rules enforce that here:
  //  - an Unsplash-src slot with NO credit attribute renders an error
  //    tile INSTEAD of the photo (an uncredited Unsplash photo on screen
  //    is itself the terms violation, so it never renders bare);
  //  - rendered credit links pointing at unsplash.com get the referral
  //    params appended when absent (credit-href values live in page
  //    content that can't be edited after the fact).
  // Keep the utm_source value in sync with UTM_SOURCE in
  // platform/web-agent/unsplash.ts — this file is a project-local
  // artifact and cannot import it (equality is pinned by tests).
  const UNSPLASH_HOMEPAGE_HREF =
    'https://unsplash.com/?utm_source=claude_design&utm_medium=referral';
  // Host rule mirrors the hotlink validator that admits Unsplash srcs into
  // pages in the first place (cdn$ in unsplash.ts: apex or any subdomain)
  // — Unsplash+ results serve from plus.unsplash.com, not just images.*,
  // and an admitted-but-uncredited photo must error whatever unsplash
  // host it rides on.
  // Trailing-dot FQDNs (images.unsplash.com.) are the same host to the
  // browser but would miss the regex — strip one dot so the check fails
  // CLOSED (unrecognized-but-real Unsplash srcs must error, not render).
  const isUnsplashHost = (u) => {
    try {
      return /(^|\.)unsplash\.com$/.test(
        new URL(u, document.baseURI).hostname.replace(/\.$/, '')
      );
    } catch {
      return false;
    }
  };
  // Render-time referral normalization for links back to Unsplash:
  // appends utm_source/utm_medium when absent, preserves every existing
  // query param, never overwrites an existing utm_source, and passes
  // non-Unsplash URLs through untouched. Input is an ABSOLUTE validated
  // http(s) URL (the credit render funnel resolves + validates first).
  const withReferral = (href) => {
    try {
      const u = new URL(href);
      if (!/(^|\.)unsplash\.com$/.test(u.hostname.replace(/\.$/, ''))) {
        return href;
      }
      if (!u.searchParams.has('utm_source')) {
        u.searchParams.set('utm_source', 'claude_design');
      }
      if (!u.searchParams.has('utm_medium')) {
        u.searchParams.set('utm_medium', 'referral');
      }
      return u.toString();
    } catch (e) {
      return href;
    }
  };
  // 2× a ~600px slot in a 1920-wide deck — retina-sharp without making the
  // sidecar enormous. A 1200px WebP at q=0.85 is ~150-300KB.
  const MAX_DIM = 1200;
  // Raster formats only. SVG is excluded (can carry script; createImageBitmap
  // on SVG blobs is inconsistent). GIF is excluded because the canvas
  // re-encode keeps only the first frame, so an animated GIF would silently
  // go still — better to reject than surprise.
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

  // ── Shared sidecar store ────────────────────────────────────────────────
  // One fetch + immediate write-on-change for every <image-slot> on the
  // page. Reads via fetch() so viewing works anywhere the HTML and sidecar
  // are served together; writes go through window.omelette.writeFile, which
  // the host allowlists to *.state.json basenames only.
  const subs = new Set();
  let slots = {};
  // ids explicitly cleared before the sidecar fetch resolved — otherwise
  // the merge below can't tell "never set" from "just deleted" and would
  // resurrect the sidecar's stale value.
  const tombstones = new Set();
  let loaded = false;
  let loadP = null;

  // Adopt bytes from each slot's own sidecar. Entries flagged d:1 have their
  // image there; entries the old shared file still carries inline are left
  // alone (they get migrated to a sidecar on the next save).
  function loadSidecars() {
    const ids = Object.keys(slots).filter((id) => {
      const v = slots[id];
      return v && typeof v === 'object' && v.d && !v.u;
    });
    if (!ids.length) return Promise.resolve();
    return Promise.all(ids.map((id) => fetch(slotFile(id))
      .then((r) => (r.ok ? r.json() : null))
      .then((sc) => {
        const u = sc && typeof sc === 'object' ? sc.u : null;
        if (!isData(u)) return;
        sidecarWritten.add(id);
        if (slots[id] && !slots[id].u) slots[id].u = u;
      })
      .catch(() => {})));
  }

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // Merge: sidecar loses to any in-memory change that raced ahead of
        // the fetch (drop or clear) so neither is clobbered by hydration.
        if (j && typeof j === 'object') {
          const merged = Object.assign({}, j, slots);
          // A framing-only write that raced ahead of hydration must not
          // drop a user image that's only on disk — inherit u from the
          // sidecar for any in-memory entry that lacks one.
          for (const k in slots) {
            if (merged[k] && !merged[k].u && j[k]) {
              merged[k].u = typeof j[k] === 'string' ? j[k] : j[k].u;
            }
          }
          for (const id of tombstones) delete merged[id];
          slots = merged;
        }
        tombstones.clear();
      })
      .catch(() => {})
      .then(() => loadSidecars())
      .catch(() => {})
      .then(() => { loaded = true; subs.forEach((fn) => fn()); });
    return loadP;
  }

  // Serialize writes so two near-simultaneous drops on different slots
  // can't reorder at the backend and leave the sidecar with only the
  // first. A save requested mid-flight just marks dirty and re-fires on
  // completion with the then-current slots.
  let saving = false;
  let saveDirty = false;
  // Unload-time flush: save()'s serialization defers a mid-RTT re-fire to a
  // .then that never runs in an unloading document, silently dropping a
  // pagehide commit. Post the current slots immediately instead — content
  // is a superset snapshot of any in-flight save's, the write is a
  // whole-file last-writer-wins replace, and postMessage FIFO delivers it
  // to the host after the in-flight one, so a backend-side reorder at
  // worst reproduces the dropped-commit outcome this flush improves on.
  // Guarded on the initial sidecar read: pre-hydration slots can miss
  // other slots' persisted entries, and flushing it would clobber them —
  // that narrow case stays best-effort (the in-memory merge in load()
  // cannot happen in an unloading document anyway).
  function flushNow() {
    if (!loaded) return;
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    try {
      pendingIds().forEach((id) => writeSidecar(id, bytesOf(slots[id])));
      Promise.resolve(w(STATE_FILE, JSON.stringify(sharedPayload()))).catch(() => {});
    } catch (e) {}
  }
  // Bytes first (one write per image, each well under the ceiling), then the
  // small shared file — so the shared file never claims d:1 for an image
  // that isn't on disk yet.
  function save() {
    if (saving) { saveDirty = true; return; }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    Promise.all(pendingIds().map((id) => writeSidecar(id, bytesOf(slots[id]))))
      .then(() => Promise.resolve(w(STATE_FILE, JSON.stringify(sharedPayload()))))
      .catch(() => {})
      .then(() => { saving = false; if (saveDirty) { saveDirty = false; save(); } });
  }

  const S_MAX = 5;
  // S_MIN < 1 lets an image sit SMALLER than its frame (letterboxed) — needed
  // so the edge handles can squeeze an axis, not only stretch it outward.
  const S_MIN = 0.1;
  const clampS = (s) => Math.max(S_MIN, Math.min(S_MAX, s));

  // Normalize a stored slot value. Pre-reframe sidecars stored a bare
  // data-URL string; newer ones store {u, s, x, y}. Either shape is valid.
  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? { u: v, s: 1, x: 0, y: 0 } : v;
  }

  // quiet=true applies the change in memory (all slots re-render) WITHOUT
  // writing the sidecar — used by the page-level arrange tool, which stages
  // a reorder and persists it only when the user confirms (ImageSlots.commit).
  function setSlot(id, val, quiet) {
    if (!id) return;
    // Global undo: skip quiet writes (persist:false) — those are the
    // arrange-images.js staged reorders, which already have their own
    // Save/Revert. Every other write (drop, replace, remove, reframe,
    // adjust) is a discrete user action worth one undo step.
    if (!quiet) pushUndo(id, slots[id], val || undefined);
    if (val) { slots[id] = val; tombstones.delete(id); }
    else { delete slots[id]; if (!loaded) tombstones.add(id); }
    subs.forEach((fn) => fn());
    if (quiet) return;
    // A drop is rare + high-value — write immediately so nav-away can't lose
    // it. Gate on the initial read so we don't overwrite a sidecar we haven't
    // merged yet; the merge in load() keeps this change once the read lands.
    if (loaded) save(); else load().then(save);
  }

  // ── Image downscale ─────────────────────────────────────────────────────
  // Encode through a canvas so the sidecar carries resized bytes, not the
  // raw upload. Longest side is capped at 2× the slot's rendered width
  // (retina) and at MAX_DIM. WebP keeps alpha and is ~10× smaller than PNG
  // for photos, so there's no need for per-image format picking.
  async function toDataUrl(file, targetW, capOverride, quality) {
    const bitmap = await createImageBitmap(file);
    try {
      // capOverride (used for the hi-res companion copy) pins the longest
      // side directly, bypassing the slot-width-based downscale so a full
      // resolution copy can be stored for lightbox use.
      const cap = capOverride && capOverride > 0
        ? capOverride
        : Math.min(MAX_DIM, Math.max(1, Math.round(targetW * 2)) || MAX_DIM);
      const scale = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      return canvas.toDataURL('image/webp', quality || 0.85);
    } finally {
      bitmap.close && bitmap.close();
    }
  }

  // ── Adjustments ("look") ────────────────────────────────────────────────
  // A look is a small map of integer slider values persisted alongside the
  // crop under key `a`. It renders live through ONE SVG filter per slot:
  // exact channel math (warmth is an R/B gain, which no CSS filter can
  // express) and cheap to bake later — the same numbers drive a canvas pass
  // at /deploy, after which `a` is dropped and the pixels carry the look.
  const ADJ_UI = [
    ['c', 'Contrast', -100, 100], ['b', 'Brightness', -100, 100],
    ['s', 'Saturation', -100, 100], ['w', 'Warmth', -100, 100],
    ['t', 'Tint', -100, 100],
    ['f', 'Fade', 0, 100], ['sh', 'Sharpen', 0, 100],
  ];
  const ADJ_KEYS = ADJ_UI.map((r) => r[0]).concat('bw');
  const adjClean = (a) => {
    if (!a || typeof a !== 'object') return null;
    const out = {};
    ADJ_UI.forEach(([k, , lo, hi]) => {
      const n = Math.round(Number(a[k]));
      if (Number.isFinite(n) && n) out[k] = Math.max(lo, Math.min(hi, n));
    });
    if (a.bw) out.bw = 1;
    return Object.keys(out).length ? out : null;
  };
  // Cross-slot "copy look / paste look" clipboard (session-scoped).
  let lookClip = null;
  let filterSvg = null;
  function filterHost() {
    if (filterSvg && filterSvg.isConnected) return filterSvg;
    filterSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    filterSvg.setAttribute('aria-hidden', 'true');
    filterSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.appendChild(filterSvg);
    return filterSvg;
  }
  // Build/refresh the slot's filter chain; returns a CSS filter value ('' = none).
  // Filter defs live in the LIGHT dom so url(#id) resolves for shadow-dom
  // images, page lightboxes and export captures alike.
  // Shadow-DOM images can't reach light-DOM filter defs (url(#id) resolves
  // inside the shadow tree), so each slot also keeps its own defs svg and we
  // build the chain twice: once per shadow root, once in the document for the
  // page lightbox and export captures.
  function shadowFilterHost(root) {
    let svg = root.querySelector('svg[data-look-defs]');
    if (svg) return svg;
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('data-look-defs', '');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    root.appendChild(svg);
    return svg;
  }
  function adjFilter(key, raw, root) {
    const a = adjClean(raw);
    const id = 'is-look-' + String(key || 'x').replace(/[^\w-]/g, '_');
    const old = root ? root.getElementById(id) : document.getElementById(id);
    if (!a) { if (old) old.remove(); return ''; }
    const NS = 'http://www.w3.org/2000/svg';
    const fl = old || document.createElementNS(NS, 'filter');
    fl.setAttribute('id', id);
    fl.setAttribute('color-interpolation-filters', 'sRGB');
    while (fl.firstChild) fl.removeChild(fl.firstChild);
    const add = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      fl.appendChild(el);
      return el;
    };
    if (a.bw) add('feColorMatrix', { type: 'saturate', values: '0' });
    else if (a.s) add('feColorMatrix', { type: 'saturate', values: String(1 + a.s / 100) });
    if (a.w) {
      const g = a.w / 100 * 0.22;
      add('feColorMatrix', { type: 'matrix', values: [
        1 + g, 0, 0, 0, 0, 0, 1 + g * 0.10, 0, 0, 0, 0, 0, 1 - g, 0, 0, 0, 0, 0, 1, 0,
      ].join(' ') });
    }
    // Tint runs the other colour axis: green (−) to magenta (+), i.e. green
    // gain against equal red/blue gain, so it stays independent of warmth.
    if (a.t) {
      const m = a.t / 100 * 0.16;
      add('feColorMatrix', { type: 'matrix', values: [
        1 + m * 0.6, 0, 0, 0, 0, 0, 1 - m, 0, 0, 0, 0, 0, 1 + m * 0.6, 0, 0, 0, 0, 0, 1, 0,
      ].join(' ') });
    }
    // Contrast pivots on mid-grey; brightness shifts; fade lifts the black
    // point — all three collapse into one linear transfer per channel.
    const c = 1 + (a.c || 0) / 100 * 0.8;
    let slope = c, intercept = 0.5 - 0.5 * c + (a.b || 0) / 100 * 0.25;
    if (a.f) { const L = a.f / 100 * 0.16; slope *= (1 - L); intercept = intercept * (1 - L) + L; }
    if (slope !== 1 || intercept !== 0) {
      const ct = document.createElementNS(NS, 'feComponentTransfer');
      ['feFuncR', 'feFuncG', 'feFuncB'].forEach((t) => {
        const fn = document.createElementNS(NS, t);
        fn.setAttribute('type', 'linear');
        fn.setAttribute('slope', String(slope));
        fn.setAttribute('intercept', String(intercept));
        ct.appendChild(fn);
      });
      fl.appendChild(ct);
    }
    if (a.sh) {
      const k = a.sh / 100 * 0.9;
      add('feConvolveMatrix', { order: '3', preserveAlpha: 'true',
        kernelMatrix: [0, -k, 0, -k, 1 + 4 * k, -k, 0, -k, 0].join(' ') });
    }
    if (!old) (root ? shadowFilterHost(root) : filterHost()).appendChild(fl);
    return 'url(#' + id + ')';
  }

  // ── Second-image swap driver ────────────────────────────────────────────
  // Pointer devices swap on hover; touch devices swap the slot closest to
  // the middle of the viewport, hold, and return. A slot without a second
  // image never registers, so this is inert on ordinary pages.
  const canHover = () => {
    try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
    catch (e) { return true; }
  };
  const reducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  };
  const SWAP_BAND = 0.35;   // middle 35% of the viewport reads as 'centered'
  const SWAP_FADE = 700;
  const SWAP_HOLD = 3000;
  const swapSet = new Set();
  let swapRaf = 0, swapActive = null, swapBound = false;
  function swapTick() {
    swapRaf = 0;
    const vh = window.innerHeight || 1;
    const mid = vh / 2, half = vh * SWAP_BAND / 2;
    let best = null, bestD = Infinity;
    swapSet.forEach((el) => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d <= half && d < bestD) { bestD = d; best = el; }
    });
    if (best === swapActive) return;
    swapActive = best;
    // The slot leaving the band is deliberately left alone: it holds what
    // it is showing and its own timer finishes the return, so a crossfade
    // in progress is never cut short.
    if (best) best._scrollTrigger();
  }
  const queueSwapTick = () => { if (!swapRaf) swapRaf = requestAnimationFrame(swapTick); };
  function registerSwap(el, on) {
    if (canHover()) return;
    if (!on) {
      swapSet.delete(el);
      if (swapActive === el) swapActive = null;
      return;
    }
    swapSet.add(el);
    if (!swapBound) {
      swapBound = true;
      window.addEventListener('scroll', queueSwapTick, { passive: true });
      window.addEventListener('resize', queueSwapTick);
    }
    queueSwapTick();
  }

  // ── Custom element ──────────────────────────────────────────────────────
  const stylesheet =
    // Fill the container by default: slots are usually placed inside a
    // sized wrapper (a hero frame, a grid cell, an inset:0 layer) and are
    // expected to take that box — a fixed intrinsic size would render as
    // a small tile in the corner of a full-bleed wrapper instead.
    // aspect-ratio is the companion fallback that keeps a bare slot
    // visible when the parent's height is indefinite: height:100%
    // resolves to auto there, and the ratio then derives height from
    // width instead of letting the slot collapse to zero height.
    // Explicit width/height on the element override all of this.
    ':host{display:block;position:relative;' +
    '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(0,0,0,.55);' +
    '  width:100%;height:100%;aspect-ratio:3/2}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:rgba(0,0,0,.04)}' +
    // .frame img (clipped) and .spill (unclipped ghost + handles) share the
    // same left/top/width/height in frame-%, computed by _applyView(), so the
    // inside-mask crop and the outside-mask spill stay pixel-aligned.
    '.frame img{position:absolute;max-width:none;transform:translate(-50%,-50%);' +
    // touch-action pan-x pan-y (not none): the clipped image must let touch
    // swipes reach an ancestor horizontal carousel. Reframe drag/pan happens
    // on .spill, which keeps touch-action:none.
    '  -webkit-user-drag:none;user-select:none;touch-action:pan-x pan-y}' +
    // Reframe mode (double-click): the full image spills past the mask. The
    // spill layer is sized to the IMAGE bounds so its corners are where the
    // resize handles belong. The ghost <img> inside is translucent; the real
    // clipped <img> underneath shows the opaque in-mask crop.
    // popover=manual promotes the spill to the top layer on reframe, so it is
    // not clipped by any overflow:hidden / clip-path / scroll-container
    // ancestor (a plain z-index can't escape overflow clipping). UA popover
    // defaults (inset:0;margin:auto) are reset; _applyView sets viewport px.
    '.spill{position:fixed;margin:0;inset:auto;border:0;padding:0;background:transparent;' +
    '  overflow:visible;transform:translate(-50%,-50%);z-index:1;cursor:grab;touch-action:none}' +
    ':host([data-panning]) .spill{cursor:grabbing}' +
    '.spill .ghost{position:absolute;inset:0;width:100%;height:100%;opacity:.35;' +
    '  pointer-events:none;-webkit-user-drag:none;user-select:none;' +
    '  box-shadow:0 0 0 1px rgba(0,0,0,.2),0 12px 32px rgba(0,0,0,.2)}' +
    '.spill .handle{position:absolute;width:12px;height:12px;border-radius:50%;' +
    '  background:#fff;box-shadow:0 0 0 1.5px #c96442,0 1px 3px rgba(0,0,0,.3);' +
    '  transform:translate(-50%,-50%)}' +
    '.spill .handle[data-c=nw]{left:0;top:0;cursor:nwse-resize}' +
    '.spill .handle[data-c=ne]{left:100%;top:0;cursor:nesw-resize}' +
    '.spill .handle[data-c=sw]{left:0;top:100%;cursor:nesw-resize}' +
    '.spill .handle[data-c=se]{left:100%;top:100%;cursor:nwse-resize}' +
    // Mid-edge handles stretch ONE axis (aspect distorts); slightly
    // squarer than the round corner handles so the two read as different
    // tools. Double-click any of them resets the stretch.
    '.spill .handle[data-e]{border-radius:2px;width:14px;height:8px}' +
    '.spill .handle[data-e=n]{left:50%;top:0;cursor:ns-resize}' +
    '.spill .handle[data-e=s]{left:50%;top:100%;cursor:ns-resize}' +
    '.spill .handle[data-e=w]{left:0;top:50%;cursor:ew-resize;width:8px;height:14px}' +
    '.spill .handle[data-e=e]{left:100%;top:50%;cursor:ew-resize;width:8px;height:14px}' +
    ':host([data-reframe]){z-index:10}' +
    ':host([data-reframe]) .frame{box-shadow:0 0 0 2px #c96442}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  cursor:pointer;user-select:none}' +
    '.empty svg{opacity:.45}' +
    '.empty .cap{max-width:90%;font-weight:500;letter-spacing:.01em}' +
    '.empty .sub{font-size:11px}' +
    '.empty .sub u{text-underline-offset:2px;text-decoration-color:rgba(0,0,0,.25)}' +
    '.empty:hover .sub u{color:rgba(0,0,0,.75);text-decoration-color:currentColor}' +
    ':host([data-over]) .frame{outline:2px solid #c96442;outline-offset:-2px;' +
    '  background:rgba(201,100,66,.10)}' +
    '.ring{position:absolute;inset:0;pointer-events:none;border:1.5px dashed rgba(0,0,0,.25);' +
    '  transition:border-color .12s}' +
    ':host([data-over]) .ring{border-color:#c96442}' +
    ':host([data-filled]) .ring{display:none}' +
    // Controls overlay INSIDE the frame, pinned to the top-right corner, so
    // a full-bleed slot in an overflow:hidden container still shows them
    // (the old below-mask placement got clipped). Credit sits bottom-left,
    // so top-right avoids collision. The blurred pill background keeps them
    // legible over the image.
    // The UA [popover] base rule styles the element in EVERY state (only
    // display:none is gated on :not(:popover-open), and the display:flex
    // below overrides that) — so the UA resets live HERE, like .spill's,
    // or the ordinary hover-state strip renders as a bordered Canvas box
    // centered by margin:auto. inset:auto precedes top/right (shorthand).
    '.ctl{position:absolute;inset:auto;top:8px;right:8px;margin:0;border:0;padding:0;' +
    '  background:transparent;overflow:visible;' +
    '  display:flex;gap:6px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:2;' +
    '  white-space:nowrap}' +
    // While reframing, the spill owns the top layer and would swallow every
    // click on the in-frame controls. Promoting .ctl into the top layer
    // ABOVE the spill (shown after it — later popovers stack higher) keeps
    // Edit-as-toggle and Replace clickable mid-reframe. _applyView pins it
    // to the frame's top-right in viewport px (translateX(-100%)
    // right-aligns against the computed left edge); inset:auto clears the
    // base rule's top/right so the inline left/top position it alone.
    '.ctl:popover-open{position:fixed;inset:auto;transform:translateX(-100%)}' +
    ':host([data-filled][data-editable]:hover) .ctl,:host([data-reframe]) .ctl,' +
    ':host([data-adjust]) .ctl' +
    '  {opacity:1;pointer-events:auto}' +
    '.ctl button{appearance:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;' +
    '  background:rgba(0,0,0,.65);color:#fff;font:11px/1 system-ui,-apple-system,sans-serif;' +
    '  backdrop-filter:blur(6px)}' +
    '.ctl button:hover{background:rgba(0,0,0,.8)}' +
    // Remove: an ✕ box, two-step (click arms, second click clears) so a
    // stray click can't discard a dropped image.
    // Adjust panel: floats under the frame in the top layer (no reflow of
    // the grid behind it). Same dark-glass chrome vocabulary as .ctl.
    '.adj{position:fixed;margin:0;inset:auto;border:0;padding:10px 12px 8px;z-index:12;' +
    '  width:236px;border-radius:10px;background:rgba(20,18,16,.88);backdrop-filter:blur(8px);' +
    '  color:#F5F3EE;font:11px/1.3 system-ui,-apple-system,sans-serif;' +
    '  box-shadow:0 10px 30px rgba(0,0,0,.35);display:none}' +
    '.adj:popover-open{display:block}' +
    '.adj .arow{display:grid;grid-template-columns:62px 1fr 28px;align-items:center;gap:8px;' +
    '  margin-bottom:6px}' +
    '.adj .arow span:last-child{text-align:right;font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    '  opacity:.7;font-variant-numeric:tabular-nums}' +
    '.adj input[type=range]{width:100%;accent-color:#c96442;height:14px;margin:0}' +
    '.adj .bwrow{display:flex;align-items:center;gap:8px;margin:8px 0 2px}' +
    '.adj input[type=checkbox]{accent-color:#c96442;margin:0}' +
    '.adj .abtns{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;padding-top:9px;' +
    '  border-top:1px solid rgba(255,255,255,.14)}' +
    '.adj button{appearance:none;border:0;border-radius:6px;padding:5px 9px;cursor:pointer;' +
    '  font:11px/1 system-ui,-apple-system,sans-serif;background:rgba(255,255,255,.14);color:#F5F3EE}' +
    '.adj button:hover{background:rgba(255,255,255,.26)}' +
    '.adj button[data-act="adj-done"]{margin-left:auto;background:#c96442;color:#fff}' +
    '.adj button[data-act="look-eye"]{min-width:34px}' +
    '.adj button[data-act="look-eye"][data-on]{background:rgba(255,255,255,.30);color:#fff}' +
    '.ctl button[data-act="adjust"][data-on]{background:#c96442;color:#fff}' +
    '.ctl button[data-act="reset"]{display:none}' +
    ':host([data-reframe]) .ctl button[data-act="reset"]{display:inline-block}' +
    '.ctl button[data-act="remove"]{padding:5px 8px;font-size:12px;line-height:1}' +
    '.ctl button[data-act="remove"][data-armed]{background:#a3341a;padding:5px 10px;font-size:11px}' +
    // Second image (hover / scroll swap). Same .frame img geometry math,
    // its own crop; opacity is the only animated property. Opt-in per page
    // with the `swap` attribute, per slot by actually having an image 2.
    '.frame img.b{opacity:0;transition:opacity .7s ease}' +
    ':host([data-swap-on]) .frame img.b{opacity:1}' +
    '@media (prefers-reduced-motion:reduce){.frame img.b{transition:none}}' +
    '.two{position:fixed;margin:0;inset:auto;border:0;padding:8px;z-index:12;width:196px;' +
    '  border-radius:10px;background:rgba(20,18,16,.88);backdrop-filter:blur(8px);' +
    '  color:#F5F3EE;font:11px/1.3 system-ui,-apple-system,sans-serif;' +
    '  box-shadow:0 10px 30px rgba(0,0,0,.35);display:none}' +
    '.two:popover-open{display:flex;flex-direction:column;gap:5px}' +
    '.two .hint{padding:1px 2px 4px;opacity:.55;font-size:10px}' +
    '.two button{appearance:none;border:0;border-radius:6px;padding:6px 9px;cursor:pointer;' +
    '  text-align:left;font:11px/1.25 system-ui,-apple-system,sans-serif;' +
    '  background:rgba(255,255,255,.14);color:#F5F3EE}' +
    '.two button:hover{background:rgba(255,255,255,.26)}' +
    '.two button[data-act="two-remove"]{background:rgba(163,52,26,.5)}' +
    '.ctl button[data-act="two"]{display:none}' +
    ':host([swap]) .ctl button[data-act="two"]{display:inline-block}' +
    '.ctl button[data-act="two"][data-on]{background:#c96442;color:#fff}' +
    ':host([data-two]) .ctl{opacity:1;pointer-events:auto}' +
    '.err{position:absolute;left:8px;bottom:8px;right:8px;color:#b3261e;font-size:11px;' +
    '  background:rgba(255,255,255,.85);padding:4px 6px;border-radius:5px;pointer-events:none}' +
    '.credit{position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);display:none;' +
    '  padding:3px 7px;border-radius:5px;background:rgba(0,0,0,.55);color:#fff;' +
    '  font:10px/1.2 system-ui,-apple-system,sans-serif;text-decoration:none;' +
    '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(6px)}' +
    // The credit is a SPAN holding one or two <a>s (Unsplash's prescribed
    // form links the photographer AND Unsplash) — anchors style inline so
    // the overlay reads as one line of text.
    '.credit a{color:inherit;text-decoration:none}' +
    '.credit a:hover,.credit a:focus-visible{text-decoration:underline}' +
    ':host([data-filled][data-credit]) .credit{display:block}' +
    // Exports must ship JUST the image — no hover controls, no credit chip
    // (the host marks <html data-om-exporting> for the capture window; the
    // page-level hide script can't reach shadow DOM, this rule can).
    ':host-context([data-om-exporting]) .ctl,' +
    ':host-context([data-om-exporting]) .credit{display:none !important}' +
    // Attribution error tile: REPLACES the photo when an Unsplash src has
    // no credit attribute — rendering the photo uncredited is the terms
    // violation, so the photo must not appear at all.
    // Calm and neutral on purpose (review feedback): the tile informs the
    // user; the fix instructions are machine-facing (usage docblock, tool
    // description, and the turn-end scan's bounce copy name the attributes
    // for the agent).
    '.attr-error{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' +
    '  background:#f2f1ef;color:#6e6c66;user-select:none;' +
    '  font:13px/1.45 system-ui,-apple-system,sans-serif}' +
    '.attr-error svg{opacity:.55}' +
    '.attr-error .cap{max-width:92%;font-weight:500;letter-spacing:.01em}' +
    ':host([data-attribution-error]) .attr-error{display:flex}' +
    ':host([data-attribution-error]) .ring{display:none}';

  const icon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
    '<path d="m21 15-5-5L5 21"/></svg>';

  const warnIcon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>' +
    '<path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

  class ImageSlot extends HTMLElement {
    static get observedAttributes() {
      return ['shape', 'radius', 'mask', 'fit', 'placeholder', 'src', 'id', 'credit', 'credit-href', 'loading'];
    }

    /** Duplicate-slide hook (called by deck-stage, see its
     *  _remintDuplicateIds): copy this id's stored image, if any, under a
     *  freshly minted key and return that key — so a duplicated slide's
     *  slot keeps its dropped photo instead of reverting to the
     *  placeholder. 'isFree' is the caller's uniqueness check (document
     *  ids); candidates must ALSO be unused in the sidecar, which can
     *  hold keys from other pages sharing the project root. (An EMPTY
     *  slot on another page leaves no sidecar entry, so its id is not
     *  detectable here — a minted key can collide with it and that slot
     *  would show this photo. Same blast radius as two pages reusing an
     *  id by hand, which the shared sidecar already permits.) Returns null
     *  when no id could be minted (caller strips the id, today's
     *  behavior). */
    static cloneSlot(fromId, isFree) {
      if (typeof fromId !== 'string' || !fromId) return null;
      // Pre-hydration the store can't veto candidates or source the copy
      // — degrade to the strip (today's behavior) rather than mint
      // against keys we can't see yet. Any rendered (= droppable) slot
      // means load() has already settled.
      if (!loaded) return null;
      const stem = fromId.replace(/-\d+$/, '') || fromId;
      for (let n = 2; n < 100; n++) {
        const toId = stem + '-' + n;
        if (toId === fromId) continue;
        if (slots[toId] !== undefined) {
          // Reuse a key holding this exact value (bytes AND crop) if no
          // live element here owns it — a duplicate op the host refused
          // after minting leaves such a key behind, and reusing keeps
          // refused retries from accumulating one orphaned copy per
          // attempt. Full equality (not just bytes) so a byte-identical
          // key another PAGE owns with its own crop is stepped past, not
          // adopted or rewritten. (Entries without .u never match.)
          const prev = getSlot(toId);
          const cur = getSlot(fromId);
          if (!(prev && cur && prev.u && prev.u === cur.u &&
                prev.s === cur.s && prev.x === cur.x && prev.y === cur.y &&
                (typeof isFree !== 'function' || isFree(toId)))) continue;
          return toId;
        }
        if (typeof isFree === 'function' && !isFree(toId)) continue;
        const v = getSlot(fromId);
        if (v) setSlot(toId, Object.assign({}, v));
        return toId;
      }
      return null;
    }

    constructor() {
      super();
      // clonable: rail thumbnails deep-clone slides and carry this shadow
      // along; reuse an already-cloned root so upgrade-after-clone works.
      // (Deliberately NOT serializable — a getHTML consumer would embed
      // multi-MB sidecar data-URLs into serialized page HTML.)
      const root = this.shadowRoot ||
        this.attachShadow({ mode: 'open', clonable: true });
      // .spill and .ctl sit OUTSIDE .frame so overflow:hidden + border-radius
      // on the frame (circle, pill, rounded) can't clip them.
      root.innerHTML =
        '<style>' + stylesheet + '</style>' +
        '<div class="frame" part="frame">' +
        '  <img part="image" alt="" draggable="false" loading="lazy" decoding="async" style="display:none">' +
        '  <img class="b" part="image-second" alt="" draggable="false" loading="lazy" decoding="async" style="display:none">' +
        '  <div class="empty" part="empty">' + icon +
        '    <div class="cap"></div>' +
        '    <div class="sub">or <u>browse files</u></div></div>' +
        '  <div class="attr-error" part="attribution-error">' + warnIcon +
        '    <div class="cap">This photo needs attribution</div></div>' +
        '  <div class="ring" part="ring"></div>' +
        '</div>' +
        // Outside .frame, like .spill/.ctl — the frame's overflow:hidden +
        // border-radius/clip-path would cut the credit off on circle/pill/mask.
        // A SPAN, not an <a>: the prescribed Unsplash credit holds two links
        // (photographer + Unsplash), built per-render in _render().
        '<span class="credit" part="credit"></span>' +
        '<div class="spill" popover="manual" data-dc-edit-transparent>' +
        '  <img class="ghost" alt="" draggable="false">' +
        '  <div class="handle" data-c="nw"></div><div class="handle" data-c="ne"></div>' +
        '  <div class="handle" data-c="sw"></div><div class="handle" data-c="se"></div>' +
        '  <div class="handle" data-e="n"></div><div class="handle" data-e="s"></div>' +
        '  <div class="handle" data-e="w"></div><div class="handle" data-e="e"></div>' +
        '</div>' +
        // data-dc-edit-transparent: the DC editor's edit-mode picker lets
        // clicks through for chrome marked with it (EDIT_TRANSPARENT_SEL)
        // — without it, Replace/Edit clicks in Edit mode are swallowed by
        // element selection and the controls look dead.
        '<div class="ctl" popover="manual" data-dc-edit-transparent><button data-act="replace" title="Replace image">Replace</button>' +
        '  <button data-act="edit" title="Reframe image">Edit</button>' +
        '  <button data-act="adjust" title="Adjust contrast, colour and tone">Adjust</button>' +
        '  <button data-act="two" title="Second image \u2014 shown on hover">Img 2</button>' +
        '  <button data-act="reset" title="Reset size, stretch and position">Reset</button>' +
        '  <button data-act="remove" title="Remove image">✕</button></div>' +
        '<input type="file" accept="' + ACCEPT.join(',') + '" hidden>';
      // Built here rather than in the template string so the slider rows
      // stay data-driven off ADJ_UI.
      const adj = document.createElement('div');
      adj.className = 'adj';
      adj.setAttribute('popover', 'manual');
      adj.setAttribute('data-dc-edit-transparent', '');
      adj.innerHTML = ADJ_UI.map(([k, label, lo, hi]) =>
        '<label class="arow"><span>' + label + '</span>' +
        '<input type="range" data-adj="' + k + '" min="' + lo + '" max="' + hi + '" step="1" value="0">' +
        '<span data-out="' + k + '">0</span></label>').join('') +
        '<label class="bwrow"><input type="checkbox" data-adj="bw"><span>Black &amp; white</span></label>' +
        '<div class="abtns"><button data-act="look-eye" title="Preview without adjustments">Off</button>' +
        '<button data-act="look-copy" title="Copy this look">Copy</button>' +
        '<button data-act="look-paste" title="Paste the copied look">Paste</button>' +
        '<button data-act="adj-reset" title="Clear all adjustments">Reset</button>' +
        '<button data-act="adj-done">Done</button></div>';
      root.appendChild(adj);
      // Swallow stray interactions so the page's lightbox doesn't open — but
      // let clicks on the panel's own buttons through to the data-act handler
      // on the shadow root (that handler stops propagation itself).
      ['pointerdown', 'click', 'dblclick'].forEach((t) =>
        adj.addEventListener(t, (e) => {
          const el = e.target;
          if (t === 'click' && el && el.closest && el.closest('[data-act]')) return;
          e.stopPropagation();
        }));
      this._adjPanel = adj;
      this._adj = null;
      adj.addEventListener('input', (e) => {
        const key = e.target.getAttribute && e.target.getAttribute('data-adj');
        if (!key) return;
        const next = Object.assign({}, this._adj);
        next[key] = key === 'bw' ? (e.target.checked ? 1 : 0) : Number(e.target.value);
        this._adj = adjClean(next);
        this._syncAdjUI();
        this._applyAdj();
        this._commitAdj();
      });
      // Second-image panel: the only place image 2 is set, reframed or
      // removed — the grid itself shows no indicator that one exists.
      const two = document.createElement('div');
      two.className = 'two';
      two.setAttribute('popover', 'manual');
      two.setAttribute('data-dc-edit-transparent', '');
      two.innerHTML =
        '<div class="hint"></div>' +
        '<button data-act="two-upload">Upload a photo\u2026</button>' +
        '<button data-act="two-zoom">Use a zoom of image 1</button>' +
        '<button data-act="two-reframe">Reframe image 2</button>' +
        '<button data-act="two-remove">Remove image 2</button>';
      root.appendChild(two);
      ['pointerdown', 'click', 'dblclick'].forEach((t) =>
        two.addEventListener(t, (e) => {
          const el = e.target;
          if (t === 'click' && el && el.closest && el.closest('[data-act]')) return;
          e.stopPropagation();
        }));
      this._twoPanel = two;
      this._view2 = { s: 1, r: 1, x: 0, y: 0 };
      this._t2 = false;
      this._frame = root.querySelector('.frame');
      this._ring = root.querySelector('.ring');
      this._img = root.querySelector('.frame img');
      this._imgB = root.querySelector('.frame img.b');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._sub = root.querySelector('.sub');
      this._spill = root.querySelector('.spill');
      this._ctl = root.querySelector('.ctl');
      this._rmBtn = root.querySelector('.ctl button[data-act="remove"]');
      this._credit = root.querySelector('.credit');
      this._attrError = root.querySelector('.attr-error');
      // Credit clicks open the link, not browse/reframe.
      this._credit.addEventListener('click', (e) => e.stopPropagation());
      this._credit.addEventListener('dblclick', (e) => e.stopPropagation());
      this._ghost = root.querySelector('.ghost');
      this._err = null;
      this._input = root.querySelector('input');
      this._depth = 0;
      this._gen = 0;
      this._view = { s: 1, r: 1, x: 0, y: 0 };
      this._subFn = () => this._render();
      // Shadow-DOM listeners live with the shadow DOM — bound once here so
      // disconnect/reconnect (e.g. React remount) doesn't stack handlers.
      this._empty.addEventListener('click', () => this._input.click());
      root.addEventListener('click', (e) => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        // The hidden controls are opacity-0 but still tabbable — without
        // this gate a keyboard user could drive them on a read-only share
        // link (mirrors the dblclick handler's editable gate).
        if (!this.hasAttribute('data-editable')) return;
        // These live in the shadow root, so the click would otherwise bubble
        // (composed) into the card and open the page's lightbox.
        e.preventDefault();
        e.stopPropagation();
        if (act === 'replace') {
          this._exitReframe(true);
          // Host-owned picker (Unsplash modal; it also offers local import).
          this.dispatchEvent(new CustomEvent('image-slot:pick', {
            bubbles: true, composed: true, detail: { id: this.id || null }
          }));
        }
        if (act === 'remove') {
          if (this._armed) { this._disarm(); this.removeImage(); }
          else {
            this._armed = true;
            this._rmBtn.textContent = 'Remove?';
            this._rmBtn.setAttribute('data-armed', '');
            clearTimeout(this._armT);
            this._armT = setTimeout(() => this._disarm(), 2600);
          }
          return;
        }
        if (act === 'reset') {
          this._disarm();
          this._view.s = 1; this._view.r = 1; this._view.x = 0; this._view.y = 0;
          this._applyView();
          this._commitView();
          return;
        }
        if (act === 'two' || act.indexOf('two-') === 0) {
          this._disarm();
          if (act === 'two') {
            if (this.hasAttribute('data-two')) this._closeTwo(); else this._openTwo();
            return;
          }
          if (act === 'two-upload') {
            this._ingestTo2 = true;
            this._closeTwo();
            this._input.click();
            return;
          }
          if (act === 'two-zoom') {
            const id = this._secondId();
            if (!id) return;
            // No new pixels: image 2 references image 1's bytes and keeps
            // only its own crop. Start one step tighter than image 1's
            // framing so the reframe drag begins somewhere useful.
            setSlot(id, { ref: 1, s: clampS(this._viewA.s * 1.6), r: 1,
              x: this._viewA.x, y: this._viewA.y });
            this._closeTwo();
            this._enterReframe2();
            return;
          }
          if (act === 'two-reframe') { this._closeTwo(); this._enterReframe2(); return; }
          if (act === 'two-remove') {
            const id = this._secondId();
            this._swapTo(false);
            if (id) setSlot(id, null);
            this._closeTwo();
            return;
          }
          return;
        }
        if (act === 'adjust' || act === 'adj-done' || act === 'look-copy' ||
            act === 'look-paste' || act === 'adj-reset' || act === 'look-eye') {
          this._disarm();
          if (act === 'look-eye') {
            this._adjOff = !this._adjOff;
            this._syncAdjUI(); this._applyAdj();
            return;
          }
          if (act === 'adjust') { if (this.hasAttribute('data-adjust')) this._closeAdjust(); else this._openAdjust(); }
          if (act === 'adj-done') this._closeAdjust();
          if (act === 'look-copy') lookClip = this._adj ? Object.assign({}, this._adj) : null;
          if (act === 'look-paste') {
            this._adj = adjClean(lookClip);
            this._syncAdjUI(); this._applyAdj(); this._commitAdj();
          }
          if (act === 'adj-reset') {
            this._adj = null;
            this._syncAdjUI(); this._applyAdj(); this._commitAdj();
          }
          return;
        }
        this._disarm();
        if (act === 'edit') {
          if (!this._reframes()) return;
          if (this.hasAttribute('data-reframe')) this._exitReframe(true);
          else this._enterReframe();
        }
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
      // naturalWidth/Height aren't known until load — re-apply so the cover
      // baseline is computed from real dimensions, not the 100%×100% fallback.
      this._img.addEventListener('load', () => this._applyView());
      this._imgB.addEventListener('load', () => this._applyView());
      // An author src= that fails to load (file not baked yet) must fall back
      // to the empty placeholder, not a broken-image tile.
      this._img.addEventListener('error', () => {
        const cur = this._img.getAttribute('src');
        if (cur && !/^data:/i.test(cur) && this._badSrc !== cur) { this._badSrc = cur; this._render(); }
      });
      // Gated only on editable — any filled slot can be repositioned/scaled,
      // regardless of fit. Share links (no writeFile) stay static.
      // Double-click an edge handle: undo the stretch (keep scale + pan).
      this._spill.addEventListener('dblclick', (e) => {
        if (!(e.target.getAttribute && e.target.getAttribute('data-e'))) return;
        e.preventDefault();
        e.stopPropagation();
        if (this._view.r === 1) return;
        this._view.r = 1;
        this._clampView();
        this._applyView();
        this._commitView();
      });
      this.addEventListener('dblclick', (e) => {
        if (!this.hasAttribute('data-editable') || !this._reframes()) return;
        e.preventDefault();
        if (this.hasAttribute('data-reframe')) this._exitReframe(true);
        else this._enterReframe();
      });
      // Pan + resize both originate on the spill layer. A handle pointerdown
      // drives an aspect-locked resize anchored at the opposite corner; any
      // other pointerdown on the spill pans. Offsets are frame-% so a
      // reframed slot survives responsive resize / PPTX export.
      this._spill.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !this.hasAttribute('data-reframe')) return;
        e.preventDefault();
        e.stopPropagation();
        this._spill.setPointerCapture(e.pointerId);
        const rect = this.getBoundingClientRect();
        const fw = rect.width || 1, fh = rect.height || 1;
        const corner = e.target.getAttribute && e.target.getAttribute('data-c');
        const edge = e.target.getAttribute && e.target.getAttribute('data-e');
        let move;
        if (edge) {
          // Single-axis stretch anchored at the OPPOSITE edge. Horizontal
          // drags move s (and compensate r so the height holds still);
          // vertical drags move r alone.
          const tImg = this._t2 ? this._imgB : this._img;
          const iw = tImg.naturalWidth || 1, ih = tImg.naturalHeight || 1;
          const contain = (this.getAttribute('fit') || 'cover').toLowerCase() === 'contain';
          const base = contain ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih);
          const s0 = this._view.s, r0 = this._view.r;
          const w0 = iw * base * s0, h0 = ih * base * s0 * r0;
          const cx0 = (50 + this._view.x) / 100 * fw;
          const cy0 = (50 + this._view.y) / 100 * fh;
          const horiz = edge === 'e' || edge === 'w';
          const sgn = (edge === 'e' || edge === 's') ? 1 : -1;
          const ox = horiz ? cx0 - sgn * w0 / 2 : cy0 - sgn * h0 / 2;
          const d0 = horiz ? w0 : h0;
          move = (ev) => {
            const p = horiz ? (ev.clientX - rect.left) : (ev.clientY - rect.top);
            const d = Math.max(1, sgn * (p - ox));
            if (horiz) {
              const s = clampS(s0 * d / d0);
              this._view.s = s;
              this._view.r = clampS(s0 * r0) / s;
              this._view.x = (ox + sgn * (d0 * s / s0) / 2) / fw * 100 - 50;
            } else {
              const sv = clampS(s0 * r0 * d / d0);
              this._view.r = sv / s0;
              this._view.y = (ox + sgn * (d0 * sv / (s0 * r0)) / 2) / fh * 100 - 50;
            }
            this._clampView();
            this._applyView();
          };
        } else if (corner) {
          // Resize about the OPPOSITE corner. Viewport-px throughout (rect
          // fw/fh, not clientWidth) so the math survives a transform:scale()
          // ancestor — deck_stage renders slides scaled-to-fit.
          const tImg = this._t2 ? this._imgB : this._img;
          const iw = tImg.naturalWidth || 1, ih = tImg.naturalHeight || 1;
          const contain = (this.getAttribute('fit') || 'cover').toLowerCase() === 'contain';
          const base = contain ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih);
          const sx = corner.includes('e') ? 1 : -1;
          const sy = corner.includes('s') ? 1 : -1;
          const s0 = this._view.s;
          const w0 = iw * base * s0, h0 = ih * base * s0 * this._view.r;
          const cx0 = (50 + this._view.x) / 100 * fw;
          const cy0 = (50 + this._view.y) / 100 * fh;
          const ox = cx0 - sx * w0 / 2, oy = cy0 - sy * h0 / 2;
          const diag0 = Math.hypot(w0, h0);
          const ux = sx * w0 / diag0, uy = sy * h0 / diag0;
          move = (ev) => {
            const proj = (ev.clientX - rect.left - ox) * ux +
                         (ev.clientY - rect.top - oy) * uy;
            const s = clampS(s0 * proj / diag0);
            const d = diag0 * s / s0;
            this._view.s = s;
            this._view.x = (ox + ux * d / 2) / fw * 100 - 50;
            this._view.y = (oy + uy * d / 2) / fh * 100 - 50;
            this._clampView();
            this._applyView();
          };
        } else {
          this.setAttribute('data-panning', '');
          const start = { px: e.clientX, py: e.clientY, x: this._view.x, y: this._view.y };
          move = (ev) => {
            this._view.x = start.x + (ev.clientX - start.px) / fw * 100;
            this._view.y = start.y + (ev.clientY - start.py) / fh * 100;
            this._clampView();
            this._applyView();
          };
        }
        const up = () => {
          try { this._spill.releasePointerCapture(e.pointerId); } catch {}
          this._spill.removeEventListener('pointermove', move);
          this._spill.removeEventListener('pointerup', up);
          this._spill.removeEventListener('pointercancel', up);
          this.removeAttribute('data-panning');
          this._dragUp = null;
        };
        // Stashed so _exitReframe (Escape / outside-click mid-drag) can
        // tear the capture + listeners down synchronously.
        this._dragUp = up;
        this._spill.addEventListener('pointermove', move);
        this._spill.addEventListener('pointerup', up);
        this._spill.addEventListener('pointercancel', up);
      });
      // Wheel zoom stays available inside reframe mode as a trackpad nicety —
      // zooms toward the cursor (offset' = cursor·(1-k) + offset·k).
      this.addEventListener('wheel', (e) => {
        if (!this.hasAttribute('data-reframe')) return;
        e.preventDefault();
        const r = this.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width * 100 - 50;
        const cy = (e.clientY - r.top) / r.height * 100 - 50;
        const prev = this._view.s;
        const next = clampS(prev * Math.pow(1.0015, -e.deltaY));
        if (next === prev) return;
        const k = next / prev;
        this._view.s = next;
        this._view.x = cx * (1 - k) + this._view.x * k;
        this._view.y = cy * (1 - k) + this._view.y * k;
        this._clampView();
        this._applyView();
      }, { passive: false });
    }

    connectedCallback() {
      // Warn once per page — an id-less slot works for the session but
      // cannot persist, and two id-less slots would share nothing.
      if (!this.id && !ImageSlot._warned) {
        ImageSlot._warned = true;
        console.warn('<image-slot> without an id will not persist its dropped image.');
      }
      this.addEventListener('dragenter', this);
      this.addEventListener('dragover', this);
      this.addEventListener('dragleave', this);
      this.addEventListener('drop', this);
      subs.add(this._subFn);
      // The host may inject window.omelette.writeFile AFTER the first render;
      // re-render on hover so the editable-gated controls reliably appear.
      this.addEventListener('pointerenter', this._subFn);
      // width%/height% in _applyView encode the frame aspect at call time —
      // a host resize (responsive grid, pane divider) would stretch the
      // image until the next _render. Re-render on size change: _render()
      // re-seeds _view from stored before clamp/apply, so a shrink→grow
      // cycle round-trips instead of ratcheting x/y toward the narrower
      // frame's clamp range.
      this._ro = new ResizeObserver(() => this._render());
      this._ro.observe(this);
      // Hover swap on pointer devices. swap-scope names an ancestor (the
      // whole card) so hovering the caption counts too. Hovering the
      // control strip suppresses the swap, otherwise the image fades out
      // from under the cursor on the way to Replace/Edit.
      if (canHover() && !this._hoverOn) {
        this._hoverOn = true;
        this._onSwapIn = () => this._swapTo(true);
        this._onSwapOut = () => this._swapTo(false);
        this._hoverScopeEl = this._swapScope();
        this._hoverScopeEl.addEventListener('pointerenter', this._onSwapIn);
        this._hoverScopeEl.addEventListener('pointerleave', this._onSwapOut);
        this._ctlIn = () => { this._ctlHover = true; this._swapTo(false); };
        this._ctlOut = () => {
          this._ctlHover = false;
          if (this.matches(':hover')) this._swapTo(true);
        };
        this._ctl.addEventListener('pointerenter', this._ctlIn);
        this._ctl.addEventListener('pointerleave', this._ctlOut);
      }
      load();
      this._render();
    }

    disconnectedCallback() {
      subs.delete(this._subFn);
      this.removeEventListener('pointerenter', this._subFn);
      this.removeEventListener('dragenter', this);
      this.removeEventListener('dragover', this);
      this.removeEventListener('dragleave', this);
      this.removeEventListener('drop', this);
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      clearTimeout(this._holdT);
      registerSwap(this, false);
      if (this._hoverOn) {
        this._hoverOn = false;
        this._hoverScopeEl.removeEventListener('pointerenter', this._onSwapIn);
        this._hoverScopeEl.removeEventListener('pointerleave', this._onSwapOut);
        this._ctl.removeEventListener('pointerenter', this._ctlIn);
        this._ctl.removeEventListener('pointerleave', this._ctlOut);
      }
      // commit=false: a disconnect is not a user intent — committing here
      // would persist whatever half-finished drag a React remount or DOM
      // splice happened to interrupt. Deliberate exits commit on their own
      // paths (Escape/click-out/toggle), and unloads commit via pagehide.
      this._exitReframe(false);
    }

    // The reframe machinery (pan, resize, wheel, clamp) is written against
    // this._view. Aliasing it to whichever image is being edited lets image
    // 2 reuse all of it unchanged.
    get _view() { return this._t2 ? this._view2 : this._viewA; }
    set _view(v) { if (this._t2) this._view2 = v; else this._viewA = v; }

    // Image 2 lives in the sidecar under its own key, so it persists, bakes
    // and undoes exactly like image 1.
    _secondId() { return this.id ? this.id + '-b' : null; }

    _enterReframe2() {
      if (!this.hasAttribute('data-second')) return;
      this._t2 = true;
      this.setAttribute('data-swap-on', '');   // edit what you can see
      this._enterReframe();
    }

    _swapBlocked() {
      return this.hasAttribute('data-reframe') || this.hasAttribute('data-adjust') ||
        this.hasAttribute('data-two') || !!this._ctlHover;
    }

    _swapTo(on) {
      if (!this.hasAttribute('data-second')) return;
      if (on && this._swapBlocked()) return;
      if (!on) clearTimeout(this._holdT);
      this.toggleAttribute('data-swap-on', !!on);
    }

    // Touch path: fade in, hold, fade back. Re-armed every time the slot
    // re-enters the centered band.
    _scrollTrigger() {
      if (!this.hasAttribute('data-second') || this._swapBlocked()) return;
      clearTimeout(this._holdT);
      this._swapTo(true);
      const back = reducedMotion() ? SWAP_HOLD : SWAP_FADE + SWAP_HOLD;
      this._holdT = setTimeout(() => this._swapTo(false), back);
    }

    _swapScope() {
      const sel = this.getAttribute('swap-scope');
      let el = null;
      if (sel) { try { el = this.closest(sel); } catch (e) {} }
      return el || this;
    }

    _openTwo() {
      if (!this.hasAttribute('data-filled')) return;
      this._exitReframe(true);
      this._closeAdjust();
      this.setAttribute('data-two', '');
      this._swapTo(false);
      this._syncTwoUI();
      try { this._twoPanel.showPopover(); } catch (e) {}
      try { this._ctl.showPopover(); } catch (e) {}
      this._positionPanel(this._twoPanel);
      this._twoWatch = () => {
        if (!this.hasAttribute('data-two')) return;
        this._positionPanel(this._twoPanel);
        this._twoWatchId = requestAnimationFrame(this._twoWatch);
      };
      this._twoWatchId = requestAnimationFrame(this._twoWatch);
      this._twoOutside = (e) => {
        if (e.composedPath && e.composedPath().includes(this)) return;
        this._closeTwo();
      };
      this._twoEsc = (e) => { if (e.key === 'Escape') this._closeTwo(); };
      document.addEventListener('pointerdown', this._twoOutside, true);
      document.addEventListener('keydown', this._twoEsc, true);
    }

    _closeTwo() {
      if (!this.hasAttribute('data-two')) return;
      this.removeAttribute('data-two');
      if (this._twoOutside) document.removeEventListener('pointerdown', this._twoOutside, true);
      if (this._twoEsc) document.removeEventListener('keydown', this._twoEsc, true);
      this._twoOutside = this._twoEsc = null;
      if (this._twoWatchId) { cancelAnimationFrame(this._twoWatchId); this._twoWatchId = 0; }
      try { this._twoPanel.hidePopover(); } catch (e) {}
      if (!this.hasAttribute('data-reframe')) {
        try { this._ctl.hidePopover(); } catch (e) {}
        this._ctl.style.left = ''; this._ctl.style.top = '';
      }
    }

    _syncTwoUI() {
      const p = this._twoPanel;
      if (!p) return;
      const id = this._secondId();
      const st = id ? getSlot(id) : null;
      const has = this.hasAttribute('data-second');
      const ref = !!(st && st.ref);
      p.querySelector('.hint').textContent = has
        ? (ref ? 'Image 2 \u2014 zoom of image 1' : 'Image 2 \u2014 uploaded photo')
        : 'No second image yet';
      const set = (act, show, label) => {
        const b = p.querySelector('[data-act="' + act + '"]');
        if (!b) return;
        b.style.display = show ? '' : 'none';
        if (label) b.textContent = label;
      };
      set('two-upload', true, has && !ref ? 'Replace the upload\u2026' : 'Upload a photo\u2026');
      set('two-zoom', true, ref ? 'Reset the zoom' : 'Use a zoom of image 1');
      set('two-reframe', has);
      set('two-remove', has);
      const btn = this._ctl.querySelector('button[data-act="two"]');
      if (btn) btn.toggleAttribute('data-on', has);
    }

    _renderSecond() {
      const enabled = this.hasAttribute('swap');
      const id = enabled ? this._secondId() : null;
      const st = id ? getSlot(id) : null;
      let u = '';
      if (st && !st.cleared) {
        // ref:1 = a zoomed crop of image 1, so it borrows image 1's bytes.
        if (st.ref) u = this._img.getAttribute('src') || '';
        else if (st.u && (/^data:image\//i.test(st.u) ||
          /^(?:\.\/)?images\/[\w.-]+$/i.test(st.u))) u = st.u;
      }
      const has = !!(u && this.hasAttribute('data-filled'));
      if (!(this._t2 && this.hasAttribute('data-reframe'))) {
        this._view2 = {
          s: st && Number.isFinite(st.s) ? clampS(st.s) : 1,
          r: st && Number.isFinite(st.r) && st.r > 0 ? st.r : 1,
          x: st && Number.isFinite(st.x) ? st.x : 0,
          y: st && Number.isFinite(st.y) ? st.y : 0,
        };
      }
      if (has) {
        if (this._imgB.getAttribute('src') !== u) this._imgB.src = u;
        this._imgB.style.display = 'block';
        this._imgB.style.filter = this._img.style.filter;
        this.setAttribute('data-second', '');
        this._layout(this._imgB, this._view2);
      } else {
        this._imgB.style.display = 'none';
        this._imgB.removeAttribute('src');
        this.removeAttribute('data-second');
        this.removeAttribute('data-swap-on');
      }
      registerSwap(this, has);
      if (this.hasAttribute('data-two')) this._syncTwoUI();
    }

    _enterReframe() {
      if (this.hasAttribute('data-reframe')) return;
      this.setAttribute('data-reframe', '');
      const tImg = this._t2 ? this._imgB : this._img;
      this._ghost.src = tImg.getAttribute('src') || '';
      this._ghost.style.filter = tImg.style.filter;
      this._signalReframe(true);
      // Best-effort commit when the document unloads mid-reframe (a host
      // navigation racing the enter signal, a manual reload, tab close):
      // the sidecar write rides the host bridge, which outlives this
      // document, so the crop survives even though the mode dies with the
      // DOM. Held on the instance so _exitReframe detaches exactly what
      // was attached.
      this._pagehide = () => { this._exitReframe(true); flushNow(); };
      window.addEventListener('pagehide', this._pagehide);
      // Promote spill to the top layer, then keep it pinned over the frame:
      // scroll/resize cover the common cases, and a per-frame rect check
      // catches layout shifts that fire neither (an image above finishing
      // load, streamed DOM pushing the slot down, an ancestor transform
      // change) so the overlay can't detach from the frame.
      try { this._spill.showPopover(); } catch {}
      // After the spill, so the controls stack above it in the top layer.
      try { this._ctl.showPopover(); } catch {}
      this._reposition = () => { if (this.hasAttribute('data-reframe')) this._applyView(); };
      window.addEventListener('scroll', this._reposition, true);
      window.addEventListener('resize', this._reposition);
      this._lastRect = '';
      this._watch = () => {
        if (!this.hasAttribute('data-reframe')) return;
        const r = this.getBoundingClientRect();
        const key = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
        if (key !== this._lastRect) { this._lastRect = key; this._applyView(); }
        this._watchId = requestAnimationFrame(this._watch);
      };
      this._watchId = requestAnimationFrame(this._watch);
      this._applyView();
      // Close on click outside (the spill handler stopPropagation()s so
      // in-image drags don't reach this) and on Escape. Listeners are held
      // on the instance so _exitReframe / disconnectedCallback can detach
      // exactly what was attached.
      this._outside = (e) => {
        if (e.composedPath && e.composedPath().includes(this)) return;
        this._exitReframe(true);
      };
      this._esc = (e) => { if (e.key === 'Escape') this._exitReframe(true); };
      document.addEventListener('pointerdown', this._outside, true);
      document.addEventListener('keydown', this._esc, true);
    }

    _exitReframe(commit) {
      if (!this.hasAttribute('data-reframe')) return;
      if (this._dragUp) this._dragUp();
      this.removeAttribute('data-reframe');
      this.removeAttribute('data-panning');
      if (this._outside) document.removeEventListener('pointerdown', this._outside, true);
      if (this._esc) document.removeEventListener('keydown', this._esc, true);
      this._outside = this._esc = null;
      if (this._reposition) {
        window.removeEventListener('scroll', this._reposition, true);
        window.removeEventListener('resize', this._reposition);
        this._reposition = null;
      }
      if (this._watchId) { cancelAnimationFrame(this._watchId); this._watchId = 0; }
      if (this._pagehide) {
        window.removeEventListener('pagehide', this._pagehide);
        this._pagehide = null;
      }
      try { this._spill.hidePopover(); } catch {}
      try { this._ctl.hidePopover(); } catch {}
      this._ctl.style.left = ''; this._ctl.style.top = '';
      if (commit) this._commitView();
      if (this._t2) {
        this._t2 = false;
        this.removeAttribute('data-swap-on');
        this._ghost.src = this._img.getAttribute('src') || '';
      }
      this._signalReframe(false);
    }

    // Reframe state lives only in this DOM until commit, invisible to the
    // host's dirty signals — announce enter/exit so the host can hold
    // auto-reloads for exactly the gesture (the guest bundle forwards
    // image-slot:reframe to the host as imageSlotReframe). Dispatched on
    // the element (composed, so it escapes shadow roots) while connected;
    // a disconnected exit (disconnectedCallback) falls back to document so
    // the host still hears it.
    _signalReframe(active) {
      const target = this.isConnected ? this : document;
      target.dispatchEvent(new CustomEvent('image-slot:reframe', {
        bubbles: true, composed: true,
        detail: { active: active, id: this.id || null }
      }));
    }

    // Public: host's "Import from computer" calls this to run local browse.
    openFilePicker() { this._exitReframe(true); this._input.click(); }

    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    _disarm() {
      clearTimeout(this._armT);
      if (!this._armed) return;
      this._armed = false;
      this._rmBtn.textContent = '✕';
      this._rmBtn.removeAttribute('data-armed');
    }

    /** Clear the dropped image (and its hi-res companion). The slot falls
     *  back to its author src=, or to the empty placeholder. */
    removeImage() {
      this._exitReframe(false);
      this._gen++;
      this._local = null;
      const hi = this.getAttribute('hires-target');
      if (hi) setSlot(hi, null);
      const bId = this._secondId();
      if (bId && getSlot(bId)) setSlot(bId, null);
      // With an author src= in the HTML, deleting the entry would just fall
      // back to that image — record an explicit cleared marker instead.
      const authored = (this.getAttribute('src') || '').trim();
      if (this.id) setSlot(this.id, authored ? { cleared: 1 } : null);
      else this._render();
    }

    // handleEvent — one listener object for all four drag events keeps the
    // add/remove symmetric and the depth counter correct.
    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        // Without preventDefault the browser never fires 'drop'.
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        // dragenter/leave fire for every descendant crossing — count depth
        // so hovering the icon inside the empty state doesn't flicker.
        if (--this._depth <= 0) { this._depth = 0; this.removeAttribute('data-over'); }
      } else if (e.type === 'drop') {
        e.preventDefault();
        e.stopPropagation();
        this._depth = 0;
        this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      }
    }

    async _ingest(file) {
      const to2 = !!this._ingestTo2;
      this._ingestTo2 = false;
      this._setError(null);
      if (!file || ACCEPT.indexOf(file.type) < 0) {
        this._setError('Drop a PNG, JPEG, WebP, or AVIF image.');
        return;
      }
      // toDataUrl can take hundreds of ms on a large photo. A Clear or a
      // newer drop during that window would be clobbered when this await
      // resumes — bump + capture a generation so stale encodes bail.
      const gen = ++this._gen;
      try {
        const w = this.clientWidth || this.offsetWidth || MAX_DIM;
        const url = await toDataUrl(file, w);
        if (gen !== this._gen) return;
        // Image 2 is display-only (no lightbox, no hi-res companion) and
        // must not disturb image 1 or its crop.
        if (to2) {
          const bId = this._secondId();
          if (bId) setSlot(bId, { u: url, s: 1, x: 0, y: 0 });
          return;
        }
        // Only exit reframe once the new image is in hand — a rejected type
        // or decode failure leaves the in-progress crop untouched.
        this._exitReframe(false);
        const val = { u: url, s: 1, x: 0, y: 0 };
        setSlot(this.id || '', val);
        // Keep a session-local copy for id-less slots so the drop still
        // shows, even though it cannot persist.
        if (!this.id) { this._local = val; this._render(); }
        // Option-2 companion: from the SAME dropped file, also store a
        // high-resolution copy under `hires-target`'s id so a lightbox can
        // show a much larger image than the light grid thumbnail. One user
        // drop -> two stored sizes; the grid slot stays small and fast.
        const hiresId = this.getAttribute('hires-target');
        if (hiresId) {
          const capAttr = parseInt(this.getAttribute('hires-maxdim'), 10);
          const hiCap = Number.isFinite(capAttr) && capAttr > 0 ? capAttr : 2800;
          try {
            const hiUrl = await toDataUrl(file, 0, hiCap, 0.88);
            if (gen === this._gen) setSlot(hiresId, { u: hiUrl, s: 1, x: 0, y: 0 });
          } catch (e) { /* hi-res is best-effort; thumbnail already saved */ }
        }
      } catch (err) {
        if (gen !== this._gen) return;
        this._setError('Could not read that image.');
        console.warn('<image-slot> ingest failed:', err);
      }
    }

    _setError(msg) {
      if (this._err) { this._err.remove(); this._err = null; }
      if (!msg) return;
      const d = document.createElement('div');
      d.className = 'err'; d.textContent = msg;
      this.shadowRoot.appendChild(d);
      this._err = d;
      setTimeout(() => { if (this._err === d) { d.remove(); this._err = null; } }, 3000);
    }

    // Reframing (pan/resize) is available on any filled slot — the user can
    // always reposition/scale. `fit` only sets the initial baseline (see
    // _geom): contain starts fully-visible, cover starts frame-filling.
    _reframes() {
      return this.hasAttribute('data-filled');
    }

    // Baseline geometry, shared by clamp/apply/resize. `base` is the scale at
    // view-scale s=1: cover = fill the frame (overflow on the looser axis),
    // contain = fit fully inside (letterboxed). Zooming a contain image past
    // s where it overflows naturally becomes a crop. Null until the img has
    // loaded (naturalWidth is 0 before that) or when the slot has no layout
    // box — ResizeObserver fires with a 0×0 rect under display:none, and
    // clamping against a degenerate 1×1 frame would silently pull the stored
    // pan toward zero.
    _geom(img) {
      const im = img || (this._t2 ? this._imgB : this._img);
      const iw = im.naturalWidth, ih = im.naturalHeight;
      const fw = this.clientWidth, fh = this.clientHeight;
      if (!iw || !ih || !fw || !fh) return null;
      const contain = (this.getAttribute('fit') || 'cover').toLowerCase() === 'contain';
      const base = contain
        ? Math.min(fw / iw, fh / ih)
        : Math.max(fw / iw, fh / ih);
      return { iw, ih, fw, fh, base };
    }

    _clampView() {
      // Pan range on each axis is half the overflow past the frame edge.
      const g = this._geom();
      if (!g) return;
      const mx = Math.abs(g.iw * g.base * this._view.s / g.fw - 1) * 50;
      const my = Math.abs(g.ih * g.base * this._view.s * this._view.r / g.fh - 1) * 50;
      this._view.x = Math.max(-mx, Math.min(mx, this._view.x));
      this._view.y = Math.max(-my, Math.min(my, this._view.y));
    }

    _applyView() {
      // Top-layer controls: pin to the frame's top-right in viewport px
      // (the same 8px inset as the in-frame layout; unscaled — top-layer UI
      // reads as chrome, not page content). BEFORE any geometry: placement
      // needs only the frame rect, and a not-yet-loaded or broken src must
      // not leave the promoted strip floating unpositioned. Gated on the
      // popover actually being open: without the Popover API, showPopover()
      // threw (swallowed in _enterReframe), .ctl stays in its in-frame
      // absolute layout, and viewport-px coordinates would shove it
      // off-frame — and matches(':popover-open') itself throws there
      // (unknown pseudo-class), hence the try/catch.
      if (this.hasAttribute('data-reframe')) {
        let onTop = false;
        try { onTop = this._ctl.matches(':popover-open'); } catch (e) {}
        if (onTop) {
          const r = this.getBoundingClientRect();
          this._ctl.style.left = (r.right - 8) + 'px';
          this._ctl.style.top = (r.top + 8) + 'px';
        }
      }
      this._layout(this._img, this._viewA);
      if (this._imgB && this._imgB.getAttribute('src')) this._layout(this._imgB, this._view2);
      if (!this.hasAttribute('data-reframe')) return;
      // Top-layer spill: position in viewport px over the frame. The top
      // layer escapes ancestor transforms entirely, so EVERY term must be
      // in viewport units: getBoundingClientRect gives the frame's scaled
      // origin AND size, and the rect/layout ratio rescales the ghost —
      // sizing from layout px alone renders it 1/scale too large under a
      // scaled deck slide. Inner ghost + handles stay box-relative.
      const g = this._geom();
      if (!g) return;
      const v = this._view;
      const k = g.base * v.s, ky = k * v.r;
      const r = this.getBoundingClientRect();
      const sx = g.fw ? r.width / g.fw : 1;
      const sy = g.fh ? r.height / g.fh : 1;
      this._spill.style.width = (g.iw * k * sx) + 'px';
      this._spill.style.height = (g.ih * ky * sy) + 'px';
      this._spill.style.left = (r.left + (50 + v.x) / 100 * r.width) + 'px';
      this._spill.style.top = (r.top + (50 + v.y) / 100 * r.height) + 'px';
    }

    // Place ONE image inside the frame from its own crop. Width/height and
    // left/top are all frame-% — they depend only on the frame aspect, so a
    // responsive resize keeps the same crop. Baseline (cover-fill or
    // contain-fit) × view scale.
    _layout(img, view) {
      const contain = (this.getAttribute('fit') || 'cover').toLowerCase() === 'contain';
      const g = this._geom(img);
      if (!g) {
        // Dimensions not known yet (before img load) — centered fit so there
        // is no flash of an unpositioned image before the geometry lands.
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.left = '50%';
        img.style.top = '50%';
        img.style.objectFit = contain ? 'contain' : 'cover';
        return;
      }
      const k = g.base * view.s, ky = k * view.r;
      img.style.width = (g.iw * k / g.fw * 100) + '%';
      img.style.height = (g.ih * ky / g.fh * 100) + '%';
      img.style.left = (50 + view.x) + '%';
      img.style.top = (50 + view.y) + '%';
      img.style.objectFit = '';
    }

    // ── Adjust mode ───────────────────────────────────────────────────
    _openAdjust() {
      if (!this.hasAttribute('data-filled')) return;
      this._exitReframe(true);
      this.setAttribute('data-adjust', '');
      this._syncAdjUI();
      try { this._adjPanel.showPopover(); } catch {}
      try { this._ctl.showPopover(); } catch {}
      this._positionAdj();
      this._adjWatch = () => {
        if (!this.hasAttribute('data-adjust')) return;
        this._positionAdj();
        this._adjWatchId = requestAnimationFrame(this._adjWatch);
      };
      this._adjWatchId = requestAnimationFrame(this._adjWatch);
      this._adjOutside = (e) => {
        if (e.composedPath && e.composedPath().includes(this)) return;
        this._closeAdjust();
      };
      this._adjEsc = (e) => { if (e.key === 'Escape') this._closeAdjust(); };
      document.addEventListener('pointerdown', this._adjOutside, true);
      document.addEventListener('keydown', this._adjEsc, true);
    }

    _closeAdjust() {
      if (!this.hasAttribute('data-adjust')) return;
      this.removeAttribute('data-adjust');
      // Leaving adjust mode always returns to the real, adjusted view.
      if (this._adjOff) { this._adjOff = false; this._applyAdj(); }
      if (this._adjOutside) document.removeEventListener('pointerdown', this._adjOutside, true);
      if (this._adjEsc) document.removeEventListener('keydown', this._adjEsc, true);
      this._adjOutside = this._adjEsc = null;
      if (this._adjWatchId) { cancelAnimationFrame(this._adjWatchId); this._adjWatchId = 0; }
      try { this._adjPanel.hidePopover(); } catch {}
      try { this._ctl.hidePopover(); } catch {}
      this._ctl.style.left = ''; this._ctl.style.top = '';
      this._commitAdj();
    }

    // Under the frame, nudged back inside the viewport if it would overflow.
    _positionAdj() { this._positionPanel(this._adjPanel); }

    _positionPanel(panel) {
      const r = this.getBoundingClientRect();
      const w = panel.offsetWidth || 236;
      const h = panel.offsetHeight || 220;
      let left = Math.min(r.left, window.innerWidth - w - 8);
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
      panel.style.left = Math.max(8, left) + 'px';
      panel.style.top = top + 'px';
      // Keep the hover controls pinned to the frame while the panel is open.
      this._ctl.style.left = (r.right - 8) + 'px';
      this._ctl.style.top = (r.top + 8) + 'px';
    }

    _syncAdjUI() {
      const a = this._adj || {};
      this._adjPanel.querySelectorAll('[data-adj]').forEach((el) => {
        const k = el.getAttribute('data-adj');
        if (k === 'bw') el.checked = !!a.bw;
        else {
          el.value = String(a[k] || 0);
          const out = this._adjPanel.querySelector('[data-out="' + k + '"]');
          if (out) out.textContent = String(a[k] || 0);
        }
      });
      const btn = this._ctl.querySelector('button[data-act="adjust"]');
      if (btn) btn.toggleAttribute('data-on', !!this._adj);
      // Bypass is a view state, not an edit: it never touches `a`, so the
      // sliders stay where they are and Done still saves the look.
      const eye = this._adjPanel.querySelector('button[data-act="look-eye"]');
      if (eye) {
        eye.textContent = this._adjOff ? 'Off' : 'On';
        eye.toggleAttribute('data-on', !this._adjOff);
        eye.title = this._adjOff ? 'Showing original \u2014 click to apply adjustments'
          : 'Showing adjustments \u2014 click to compare with the original';
      }
    }

    _applyAdj() {
      const key = this.id || 'anon';
      const live = this._adjOff ? null : this._adj;
      const css = adjFilter(key, live, this.shadowRoot);
      adjFilter(key, live); // light-DOM twin for lightbox / export
      this._img.style.filter = css;
      this._ghost.style.filter = css;
    }

    // Adjustments ride in the same sidecar entry as the crop, so a look
    // survives reload and follows the id into the Gallery and lightbox.
    _commitAdj() {
      clearTimeout(this._adjT);
      this._adjT = setTimeout(() => this._commitView(), 160);
    }

    _commitView() {
      if (this._t2) return this._commitSecond();
      const v = { s: this._view.s, x: this._view.x, y: this._view.y };
      if (this._view.r !== 1) v.r = this._view.r;
      if (this._adj) v.a = this._adj;
      if (this._userUrl) v.u = this._userUrl;
      // Framing-only (no u) persists too so an author-src slot remembers its
      // crop; clearing the sidecar still falls through to src=.
      if (this.id) setSlot(this.id, v);
      else { this._local = v; }
    }

    // Image 2's entry carries its own crop and either its own bytes or a
    // ref back to image 1's.
    _commitSecond() {
      const id = this._secondId();
      if (!id) return;
      const prev = getSlot(id) || {};
      const v = { s: this._view2.s, x: this._view2.x, y: this._view2.y };
      if (this._view2.r !== 1) v.r = this._view2.r;
      if (prev.ref) v.ref = 1; else if (prev.u) v.u = prev.u;
      setSlot(id, v);
    }

    _render() {
      // Shape / mask. Presets use border-radius so the dashed ring can
      // follow the rounded outline; clip-path is only applied for an
      // explicit `mask` (the ring is hidden there since a rectangle
      // dashed border chopped by an arbitrary polygon looks broken).
      const mask = this.getAttribute('mask');
      const shape = (this.getAttribute('shape') || 'rounded').toLowerCase();
      let radius = '';
      if (shape === 'circle') radius = '50%';
      else if (shape === 'pill') radius = '9999px';
      else if (shape === 'rounded') {
        const n = parseFloat(this.getAttribute('radius'));
        radius = (Number.isFinite(n) ? n : 12) + 'px';
      }
      this._frame.style.borderRadius = mask ? '' : radius;
      this._frame.style.clipPath = mask || '';
      this._ring.style.borderRadius = mask ? '' : radius;
      this._ring.style.display = mask ? 'none' : '';

      // Controls and reframe entry gate on this so share links stay read-only.
      const editable = !!(window.omelette && window.omelette.writeFile);
      this.toggleAttribute('data-editable', editable);
      this._sub.style.display = editable ? '' : 'none';

      // Content. The sidecar is also writable by the agent's write_file
      // tool, so its value isn't guaranteed canvas-originated — only accept
      // data:image/ URLs from it. The `src` attribute is author-controlled
      // (Claude wrote it into the HTML) so it passes through unchanged.
      let stored = this.id ? getSlot(this.id) : this._local;
      // Relative project paths are allowed too: the arrange tool stages a
      // reorder by moving each slot's effective image (often "images/<id>.webp")
      // through the sidecar. Absolute/remote URLs are still rejected.
      if (stored && stored.u && !/^data:image\//i.test(stored.u) &&
          !/^(?:\.\/)?images\/[\w.-]+$/i.test(stored.u)) stored = null;
      const srcAttr = this.getAttribute('src') || '';
      this._userUrl = (stored && stored.u) || null;
      const cleared = !!(stored && stored.cleared && !this._userUrl);
      const url = this._userUrl || (cleared || srcAttr === this._badSrc ? '' : srcAttr);
      // Don't clobber an in-flight reframe with a store-triggered re-render.
      if (!this.hasAttribute('data-reframe')) {
        this._view = {
          s: stored && Number.isFinite(stored.s) ? clampS(stored.s) : 1,
          r: stored && Number.isFinite(stored.r) && stored.r > 0 ? stored.r : 1,
          x: stored && Number.isFinite(stored.x) ? stored.x : 0,
          y: stored && Number.isFinite(stored.y) ? stored.y : 0,
        };
      }
      if (!this.hasAttribute('data-adjust')) {
        this._adj = adjClean(stored && stored.a);
        if (this._adjPanel) this._syncAdjUI();
      }
      this._applyAdj();
      this._cap.textContent = this.getAttribute('placeholder') || 'Drop an image';
      // Toggle via style.display — the [hidden] attribute alone loses to
      // the display:flex / display:block rules in the stylesheet above.
      // An Unsplash src with no credit attribute must NOT render — showing
      // the photo uncredited is the Unsplash-terms violation itself. The
      // error tile replaces the photo until the credit is written. A
      // user-dropped image is the user's own content and always renders.
      // Trimmed: credit is agent/user-editable content, and a whitespace-
      // only value must count as missing — otherwise it would suppress the
      // error tile AND render an empty credit box (no text, no links),
      // exactly the unattributed state this gate exists to prevent.
      const credit = (this.getAttribute('credit') || '').trim();
      const attrError = !!(
        !credit && !this._userUrl && srcAttr && isUnsplashHost(srcAttr)
      );
      this.toggleAttribute('data-attribution-error', attrError);
      if (url && !attrError) {
        if (this._img.getAttribute('src') !== url) {
          this._img.src = url;
          this._ghost.src = url;
        }
        // Above-the-fold slots opt out of lazy loading with loading="eager".
        if ((this.getAttribute('loading') || '') === 'eager') {
          this._img.loading = 'eager';
          this._img.fetchPriority = 'high';
        } else {
          this._img.loading = 'lazy';
        }
        this._img.style.display = 'block';
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
        this._clampView();
        this._applyView();
      } else {
        this._img.style.display = 'none';
        this._img.removeAttribute('src');
        this._ghost.removeAttribute('src');
        // The error tile owns the blocked-photo state; .empty stays for
        // the genuinely-empty slot.
        this._empty.style.display = attrError ? 'none' : 'flex';
        this.removeAttribute('data-filled');
      }

      this._renderSecond();

      // Credit belongs to the author src, so a user drop hides it.
      // textContent + the http(s)-only funnel keep external strings inert.
      const showCredit = !!(url && credit && !this._userUrl && !attrError);
      this._credit.textContent = '';
      if (showCredit) {
        // Validate once (resolved against the document, http(s) only),
        // then append the terms-required utm referral params to links
        // that point back at unsplash.com.
        let href = '';
        const rawHref = this.getAttribute('credit-href') || '';
        if (rawHref) {
          try {
            const u = new URL(rawHref, document.baseURI);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
              href = withReferral(u.href);
            }
          } catch {}
        }
        const mkLink = (text, linkHref) => {
          const a = document.createElement('a');
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.setAttribute('href', linkHref);
          a.textContent = text;
          return a;
        };
        // Unsplash's prescribed credit is TWO links — the photographer's
        // name to their profile (credit-href) and 'Unsplash' to the
        // homepage. Render that split whenever the text has the canonical
        // shape; other text keeps the legacy single-link rendering.
        const m = /^Photo by (.+) on Unsplash$/.exec(credit);
        if (m) {
          this._credit.appendChild(document.createTextNode('Photo by '));
          this._credit.appendChild(
            href ? mkLink(m[1], href) : document.createTextNode(m[1])
          );
          this._credit.appendChild(document.createTextNode(' on '));
          this._credit.appendChild(mkLink('Unsplash', UNSPLASH_HOMEPAGE_HREF));
        } else if (href) {
          this._credit.appendChild(mkLink(credit, href));
        } else {
          this._credit.textContent = credit;
        }
      }
      this.toggleAttribute('data-credit', showCredit);
    }
  }

  // ── Global undo / redo ───────────────────────────────────────────────
  // Photoshop-style history over the shared sidecar: every non-quiet write
  // (drop, replace, remove, reframe, adjust) records {id, prev, next}, so a
  // step can be walked backwards AND forwards. Quiet writes (persist:false)
  // are arrange-images.js's staged reorders — they keep their own Save/Revert.
  // Editor-only chrome: nothing renders on the published site.
  const undoStack = [];
  const redoStack = [];
  const HIST_MAX = 50;
  let applying = false;
  let histBar = null, bUndo = null, bRedo = null, histLabel = null;

  const cloneVal = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  const sameVal = (a, b) => JSON.stringify(a === undefined ? null : a) ===
    JSON.stringify(b === undefined ? null : b);

  // A step is a GROUP of slot changes applied together, so a rearrange that
  // moves eight images is one undo — not eight. quiet:true steps stage in
  // memory only (arrange's staged order, persisted by its own Save order).
  function pushStep(items, opts) {
    if (applying) return false;        // undo/redo application is not a new step
    const list = (items || [])
      .filter((it) => it && it.id && !sameVal(it.prev, it.next))
      .map((it) => ({ id: it.id, prev: cloneVal(it.prev), next: cloneVal(it.next) }));
    if (!list.length) return false;
    undoStack.push({ items: list, quiet: !!(opts && opts.quiet), label: (opts && opts.label) || '' });
    if (undoStack.length > HIST_MAX) undoStack.shift();
    redoStack.length = 0;              // a fresh edit forks the future
    renderHist();
    return true;
  }

  const pushUndo = (id, prevVal, nextVal) => pushStep([{ id, prev: prevVal, next: nextVal }]);

  function applyStep(step, dir) {
    applying = true;
    try {
      step.items.forEach((it) => {
        const val = dir === 'prev' ? it.prev : it.next;
        if (val !== undefined) { slots[it.id] = cloneVal(val); tombstones.delete(it.id); }
        else { delete slots[it.id]; if (!loaded) tombstones.add(it.id); }
      });
      subs.forEach((fn) => fn());
      if (!step.quiet) { if (loaded) save(); else load().then(save); }
    } finally { applying = false; }
    if (step.quiet) {
      document.dispatchEvent(new CustomEvent('image-slots:history', {
        detail: { dir, label: step.label }
      }));
    }
  }

  function undo() {
    const e = undoStack.pop();
    if (!e) return false;
    redoStack.push(e);
    applyStep(e, 'prev');
    renderHist();
    return true;
  }

  function redo() {
    const e = redoStack.pop();
    if (!e) return false;
    undoStack.push(e);
    applyStep(e, 'next');
    renderHist();
    return true;
  }

  // Host adoption: the page's own toolbar (arrange-images.js's bar) can take
  // the Undo/Redo controls in, so there is one set of controls, not two.
  let histMounted = false;
  function mountHistory(host) {
    ensureHistBar();
    if (!host || !bUndo) return false;
    histMounted = true;
    if (histBar) histBar.style.display = 'none';
    bUndo.style.borderLeft = '1px solid #D6CFC2';
    host.appendChild(bUndo);
    host.appendChild(bRedo);
    host.appendChild(histLabel);
    renderHist();
    return true;
  }

  const editableNow = () => !!(window.omelette && window.omelette.writeFile);

  function ensureHistBar() {
    if (histBar || !document.body) return;
    const bar = document.createElement('div');
    bar.setAttribute('data-image-slot-history', '');
    bar.style.cssText = 'position:fixed;left:18px;bottom:calc(18px + env(safe-area-inset-bottom));' +
      'z-index:99997;display:none;align-items:stretch;background:#EDEAE3;border:1px solid #1B1917;' +
      'box-shadow:0 12px 30px rgba(27,25,23,.22)';
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.textContent = label;
      b.style.cssText = 'appearance:none;border:0;border-left:1px solid #D6CFC2;background:transparent;' +
        "font:600 10px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;" +
        'text-transform:uppercase;padding:10px 14px;cursor:pointer;color:#1B1917;white-space:nowrap';
      b.addEventListener('mouseenter', () => { if (!b.disabled) b.style.color = '#A34A24'; });
      b.addEventListener('mouseleave', () => { if (!b.disabled) b.style.color = '#1B1917'; });
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    bUndo = mk('\u21B6 Undo', 'Undo the last image change (\u2318Z)', () => undo());
    bUndo.style.borderLeft = '0';
    bRedo = mk('\u21B7 Redo', 'Redo (\u21E7\u2318Z)', () => redo());
    histLabel = document.createElement('span');
    histLabel.style.cssText = 'display:flex;align-items:center;padding:0 13px;border-left:1px solid #D6CFC2;' +
      "font:400 10px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em;color:#5C564C;white-space:nowrap";
    bar.appendChild(histLabel);
    document.body.appendChild(bar);
    histBar = bar;
  }

  function renderHist() {
    if (!editableNow()) { if (histBar) histBar.style.display = 'none'; return; }
    ensureHistBar();
    if (!histBar) return;
    const u = undoStack.length, r = redoStack.length;
    // Always visible in the editor, even with an empty history — a bar that
    // appears and vanishes is impossible to find when you need it. Once a
    // page toolbar has adopted the controls, its own bar stays hidden.
    histBar.style.display = histMounted ? 'none' : 'flex';
    const set = (b, n) => {
      b.disabled = !n;
      b.style.opacity = n ? '1' : '.32';
      b.style.cursor = n ? 'pointer' : 'default';
      if (!n) b.style.color = '#1B1917';
    };
    set(bUndo, u);
    set(bRedo, r);
    histLabel.textContent = (u || r) ? (u + ' back \u00B7 ' + r + ' forward') : 'No image changes yet';
  }

  subs.add(renderHist);
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !editableNow()) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const t = e.target;
    // Never steal the shortcut from a text field / the editor's own text undo.
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ''))) return;
    if (!undoStack.length && !redoStack.length) return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  }, true);

  const bootHist = () => {
    ensureHistBar();
    renderHist();
    let tries = 0;
    const iv = setInterval(() => { renderHist(); if (editableNow() || ++tries > 60) clearInterval(iv); }, 400);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootHist);
  else bootHist();

  // Page-level store API. Lets a page stage changes across many slots (e.g.
  // drag-to-rearrange) in memory and persist them on an explicit user action.
  // set/replaceAll persist by default; pass {persist:false} to stage only.
  window.ImageSlots = window.ImageSlots || {
    ready: () => load(),
    get: (id) => { const v = getSlot(id); return v ? Object.assign({}, v) : null; },
    all: () => JSON.parse(JSON.stringify(slots)),
    set: (id, val, opts) => setSlot(id, val, !!(opts && opts.persist === false)),
    replaceAll: (next, opts) => {
      slots = JSON.parse(JSON.stringify(next || {}));
      subs.forEach((fn) => fn());
      if (!(opts && opts.persist === false)) save();
    },
    commit: () => save(),
    undo: () => undo(),
    redo: () => redo(),
    pushStep: (items, opts) => pushStep(items, opts),
    mountHistory: (host) => mountHistory(host),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    // CSS filter value for a slot's saved look — pages apply it to their own
    // <img> (lightbox, hero crossfade) so the look travels with the image.
    filter: (id) => { const v = getSlot(id); return adjFilter(id, v && v.a); },
  };

  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', ImageSlot);
  }
})();
