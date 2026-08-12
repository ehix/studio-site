/* ===========================================================================
   r1c/s5 — ONE DESCENDING CAMERA

   The purest form of the idea and the one I argued against building first: a
   single fixed canvas behind the whole document that is one continuous descent
   from the ridge to a single blade of grass. Here it is, so the argument can be
   had against something real instead of against a description.

   ── how it descends ──────────────────────────────────────────────────────
   Not a camera. A ladder of four *silhouette generators* — ridge, hillside,
   tussock, blade — each returning a surface height for a column, cross-faded
   on scroll depth. Two neighbouring stages are always rendered into the same
   luminance buffer with weights, which is why it reads as continuous even
   though it is staged.

   A genuinely continuous zoom would need octave cycling — fading fine octaves
   in and coarse ones out as the scale changes, so detail exists at every
   magnification. That is the right answer for an infinite zoom over one
   material. It is the wrong answer here, because the four scales are not the
   same material: a ridgeline and a grass blade do not differ by frequency,
   they differ by *what they are*. Cross-fading generators keeps each scale
   drawn the way that scale should be drawn.

   ── the honest costs ─────────────────────────────────────────────────────
   1. It is behind every word on the page for the whole page, so it lives near
      the floor of the ramp and under a scrim. Anything livelier fights the
      text, and the text wins that argument by mattering more.
   2. It renders on scroll, coalesced into a frame, plus a slow idle tick for
      the wind. Still and idle it costs almost nothing; thrown-scrolled it is
      the most expensive thing on the page.
   3. It is one more full-viewport canvas on a page that already runs the hero
      at 14ms. Read the two together before shipping it.
   =========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-descent]');
  if (!host || !window.GRASS || !GRASS.noise) return;

  var noise = GRASS.noise;
  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var RAMP = SCREEN.RAMP.dusk;

  var P = {
    top:      0.06,  /* depth at the top of the document                   */
    bottom:   0.98,  /* … and at the bottom                                */
    ease:     1.15,  /* >1 lingers in the macro end                        */
    relief:   0.62,  /* how much of the frame the surface may occupy       */
    sky:      0.62,  /* brightness of the ground the mass is seen against  */
    skyY:     0.40,
    mass:     0.94,  /* how completely the surface occludes                */
    rim:      0.55,  /* light on the surface itself                        */
    wind:     1.00,
    scrim:    1.00,  /* × the readability scrim over the whole thing       */
    cell:     4,
    labels:   1      /* the scale readout, bottom left                     */
  };

  /* ── the four scales ──────────────────────────────────────────────────────
     Each returns a surface height in 0..1 for a column u, and a second value:
     how "bladed" the stage is, which the renderer uses to decide whether the
     mass below the surface is solid ground or a thicket of stems. */
  var blades = null;

  function sowBlades() {
    var r = 1337, out = [], i;
    function rnd() { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; }
    for (i = 0; i < 260; i++) {
      out.push({ x: rnd(), h: 0.35 + rnd() * 0.62, w: 0.004 + rnd() * 0.012,
                 lean: (rnd() - 0.5) * 0.5, ph: rnd() * 30 });
    }
    blades = out;
  }
  sowBlades();

  function fbm(x, oct, gain) {
    var s = 0, a = 0.5, f = 1, n = 0;
    for (var i = 0; i < oct; i++) { s += a * noise(x * f, i * 7.3); n += a; a *= gain; f *= 2.03; }
    return s / n;
  }

  var STAGE = [
    /* 0 — the range, seen from a kilometre up. ridged, many octaves, low. */
    function (u, t) {
      var n = 1 - Math.abs(fbm(u * 1.6 + 4.1, 5, 0.52));
      return { h: 0.20 + 0.34 * n * n, blade: 0 };
    },
    /* 1 — a hillside. fewer, bigger features; the horizon has risen. */
    function (u, t) {
      var n = 1 - Math.abs(fbm(u * 0.9 + 19.4, 3, 0.48));
      return { h: 0.34 + 0.40 * n, blade: 0 };
    },
    /* 2 — tussock. lumps at roughly a metre, with the first hint of stems. */
    function (u, t) {
      var n = 0.5 + 0.5 * fbm(u * 5.2 + 51.0, 3, 0.55);
      var wob = 0.03 * noise(u * 11 + t * 0.3, t * 0.2) * P.wind;
      return { h: 0.46 + 0.30 * n + wob, blade: 0.35 };
    },
    /* 3 — stems. the same construction as the sign-off, one order of
       magnitude closer: the page ends where the footer begins. */
    function (u, t) {
      var g = noise(u * 1.8 - t * 0.30, t * 0.16) * P.wind;
      var best = 0.30, i, b, dx, cover;
      for (i = 0; i < blades.length; i++) {
        b = blades[i];
        dx = u - (b.x + (b.lean + g * 0.5) * b.h * 0.25);
        if (dx < 0) dx = -dx;
        if (dx > b.w) continue;
        cover = 1 - dx / b.w;
        var top = 0.30 + b.h * 0.66 * (0.7 + 0.3 * cover);
        if (top > best) best = top;
      }
      return { h: best, blade: 1 };
    }
  ];

  /* ── canvas ─────────────────────────────────────────────────────────────── */
  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'width:100%;height:100%;display:block';
  host.appendChild(cv);
  var ctx = cv.getContext('2d');
  var buf = document.createElement('canvas');
  var bctx = buf.getContext('2d');
  var bw = 0, bh = 0, img = null, luma = null, W = 0, H = 0;

  function size() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bw = Math.max(40, Math.ceil(w / P.cell));
    bh = Math.max(30, Math.ceil(h / P.cell));
    buf.width = bw; buf.height = bh;
    img = bctx.createImageData(bw, bh);
    luma = new Float32Array(bw * bh);
    return true;
  }

  function depthNow() {
    var doc = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    var p = Math.min(1, Math.max(0, scrollY / doc));
    return P.top + (P.bottom - P.top) * Math.pow(p, P.ease);
  }

  var label = document.querySelector('[data-descent-read]');
  var SCALES = [1250, 90, 1.6, 0.05];      /* metres across the frame, per stage */

  function render(t) {
    if (!bw) return;
    var d = depthNow();
    var s = d * (STAGE.length - 1);
    var i = Math.min(STAGE.length - 2, Math.floor(s));
    var f = s - i;
    f = f * f * (3 - 2 * f);                /* smoothstep the cross-fade */

    var a = STAGE[i], b = STAGE[i + 1];
    var x, y, o, u, v;

    /* one surface per column, blended between the two live stages */
    var surf = new Float32Array(bw), bld = new Float32Array(bw);
    for (x = 0; x < bw; x++) {
      u = (x + 0.5) / bw;
      var ra = a(u, t), rb = b(u, t);
      surf[x] = (ra.h + (rb.h - ra.h) * f) * P.relief + (1 - P.relief) * 0.42;
      bld[x] = ra.blade + (rb.blade - ra.blade) * f;
    }

    o = 0;
    for (y = 0; y < bh; y++) {
      v = (y + 0.5) / bh;
      /* the ground the mass is seen against — same construction as the
         sign-off, because it is the same idea one page earlier */
      var band = Math.pow(Math.max(0, 1 - Math.abs(v - P.skyY) / 0.55), 1.6);
      for (x = 0; x < bw; x++, o++) {
        var top = 1 - surf[x];
        var sky = band * P.sky * (0.55 + 0.45 * (0.5 + 0.5 * noise((x / bw) * 2.2 + t * 0.04, v * 1.8)));
        if (v < top) { luma[o] = sky; continue; }
        var into = (v - top) / (1 - top + 1e-4);
        /* a bladed stage stays open below its surface; a solid one does not */
        var solid = 1 - bld[x] * Math.max(0, 1 - into * 3.2) * 0.55;
        var lit = P.rim * Math.pow(Math.max(0, 1 - into * 2.6), 2) * (0.4 + 0.6 * bld[x]);
        luma[o] = sky * (1 - P.mass * solid) + lit;
      }
    }

    SCREEN.screen(luma, img, bw, bh, RAMP);
    bctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W, H);

    if (label && P.labels) {
      var m = SCALES[i] + (SCALES[i + 1] - SCALES[i]) * f;
      label.textContent = m >= 1 ? m.toFixed(m >= 100 ? 0 : 1) + 'm across'
                                 : (m * 100).toFixed(1) + 'cm across';
    }
    host.style.setProperty('--scrim', String(P.scrim));
  }

  /* ── run ────────────────────────────────────────────────────────────────
     Scroll-driven, coalesced into one frame. Plus a slow idle tick so the
     stems move when you stop — a still page with wind in it is worth 4fps. */
  var queued = false, t0 = performance.now();

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      render((performance.now() - t0) / 1000);
    });
  }

  size();
  render(0);

  if (!REDUCED) {
    addEventListener('scroll', onScroll, { passive: true });
    setInterval(function () {
      /* only when the stems are actually in play — no point animating a
         mountain range at 4fps */
      if (depthNow() > 0.55) onScroll();
    }, 250);
  }

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (size()) render((performance.now() - t0) / 1000); }, 160);
  });

  (window.TUNE_EXTRA = window.TUNE_EXTRA || []).push({
    name: 'descent',
    api: {
      params: P,
      defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
      draw: function () { render((performance.now() - t0) / 1000); },
      resize: function () { size(); this.draw(); },
      sow: function () { sowBlades(); this.draw(); },
      info: function () {
        var d = depthNow();
        return 'depth ' + d.toFixed(2) + ' · stage ' +
          (Math.min(STAGE.length - 2, Math.floor(d * (STAGE.length - 1))) + 1) +
          '→' + (Math.min(STAGE.length - 1, Math.floor(d * (STAGE.length - 1)) + 1) + 1);
      }
    },
    groups: [
      ['descent', [
        ['top',    0, 1,   0.01, 'live', 'depth at the top of the document'],
        ['bottom', 0, 1,   0.01, 'live', 'depth at the bottom'],
        ['ease', 0.4, 2.5, 0.01, 'live', '>1 lingers in the macro end'],
        ['relief',0.2, 1.0,0.01, 'live', 'how much frame the surface takes'],
        ['wind',   0, 3.0, 0.01, 'live', 'movement in the near stages']
      ]],
      ['ground', [
        ['sky',   0, 1.5, 0.01, 'live', 'the ground it is seen against'],
        ['skyY',  0, 1.0, 0.01, 'live', 'where that band sits'],
        ['mass',  0, 1.0, 0.01, 'live', 'how completely the surface occludes'],
        ['rim',   0, 1.5, 0.01, 'live', 'light on the surface'],
        ['scrim', 0, 2.0, 0.01, 'live', 'the readability wash over it all'],
        ['cell',  2,   8, 1,    'size', 'px per cell'],
        ['labels',0,   1, 1,    'live', 'the scale readout']
      ]]
    ]
  });
})();
