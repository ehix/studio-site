/* ===========================================================================
   r1 — THE LIGHT FIELD

   The critique's hardest finding was not a bug. It was this:

     "The four canvas fields are one drawing repeated with the light nudged;
      they would suit a coffee roaster or a hotel equally."  — specificity 4/10

   A smooth radial gradient is nobody's design language. This file replaces it
   with the one the taste library actually documents: a light field rendered at
   a coarse cell size, ordered-dithered, and quantised to an indexed palette —
   `ordered dither`, `quantised ground`, `indexed palette`, `countable cell`
   from the pixel family. Cinematic atmosphere, arrived at by screening rather
   than by blurring.

   Two consequences that matter:

   1. It moves. The buffer is ~180x110 cells, so a full re-render costs almost
      nothing and can run every frame instead of being painted once and left to
      sit there. Static light is the single biggest reason a dark page reads as
      a mockup.

   2. Each slot is a different *scene*, not the same scene relit — a horizon, a
      shaft, a rake, a column, a floor glow. That is what the critique was
      asking for and it cannot be faked by moving a gradient stop.

   Cost control: only fields intersecting the viewport tick, and everything
   stops at one frame under prefers-reduced-motion.
   =========================================================================== */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── value noise ──────────────────────────────────────────────────────────
     A lookup table, not sin() hashing. Same result, roughly 8x cheaper, which
     is what buys us a per-frame re-render.

     fbm() rotates the sample space between octaves. Skipping that rotation is
     what produced the rectangular flaking in the earlier plaster shaders:
     value noise breaks along its own grid, so anything it perturbs staircases
     on the axes unless the grid is turned between octaves. */
  var NS = 128, NT = new Float32Array(NS * NS);
  for (var i = 0; i < NS * NS; i++) NT[i] = Math.random();

  function nz(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    var x0 = ((xi % NS) + NS) % NS, x1 = (x0 + 1) % NS;
    var y0 = ((yi % NS) + NS) % NS, y1 = (y0 + 1) % NS;
    var a = NT[y0 * NS + x0], b = NT[y0 * NS + x1];
    var c = NT[y1 * NS + x0], d = NT[y1 * NS + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }

  function fbm(x, y) {
    var s = 0, amp = 0.5, f = 1, X = x, Y = y, nx, ny;
    for (var o = 0; o < 3; o++) {
      s += amp * nz(X * f, Y * f);
      nx = X * 0.8 - Y * 0.6; ny = X * 0.6 + Y * 0.8;
      X = nx; Y = ny; f *= 2.07; amp *= 0.5;
    }
    return s / 0.875;
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function sstep(a, b, x) {
    var t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function bar(u, c, w) { return Math.pow(Math.max(0, 1 - Math.abs(u - c) / w), 1.8); }

  /* ── scenes ───────────────────────────────────────────────────────────────
     Five different things happening to light, not five positions of one lamp.
     Every one returns luminance 0..1 for a cell at (u,v). */
  var SCENE = {

    /* the hero. a lit sky above an undulating dark mass, with the ground
       catching a little bounce right at the break. */
    horizon: function (u, v, t, F) {
      var gx = 0.70 + 0.045 * Math.sin(t * 0.31) + F.px * 0.07;
      var gy = 0.26 + 0.035 * Math.cos(t * 0.23) + F.py * 0.05;
      var dx = (u - gx), dy = (v - gy) * 1.15;
      var sky = Math.pow(Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.06), 2.20);
      var haze = fbm(u * 2.4 + t * 0.10, v * 3.0 - t * 0.06);
      sky *= 0.56 + 0.64 * haze;

      /* a weak second source low on the left. Single-source lighting is what
         makes a render read as a render: without it the left third of the
         frame is dead black and the composition is a lamp in a corner. Kept
         deliberately faint — the headline stands on this side and needs the
         ground under it to stay near-black. */
      var fx = (u - 0.02), fy = (v - 0.58) * 0.85;
      sky += Math.pow(Math.max(0, 1 - Math.sqrt(fx * fx + fy * fy) * 1.70), 2.8)
             * (0.13 + 0.20 * haze);

      /* the horizon sits low, so the mass is a band the type stands on rather
         than a third of the frame */
      var hz = 0.745 + 0.048 * fbm(u * 1.5 + t * 0.05, 0.37)
                     + 0.016 * Math.sin(u * 6.4 + t * 0.19);
      var below = sstep(hz - 0.008, hz + 0.022, v);
      var bounce = Math.pow(Math.max(0, 1 - (v - hz) * 5.2), 3) * 0.62;
      return clamp01(sky * (1 - below * 0.94) + bounce * below * (0.35 + 0.65 * haze) + 0.016);
    },

    /* the interstitial band. light through three vertical gaps, dust drifting
       across the beams. brightest at the top, falls to nothing at the floor. */
    shaft: function (u, v, t) {
      var l = bar(u, 0.28 + 0.018 * Math.sin(t * 0.20), 0.085) * 0.92
            + bar(u, 0.515 + 0.012 * Math.sin(t * 0.27 + 1.7), 0.034) * 1.00
            + bar(u, 0.755 + 0.020 * Math.cos(t * 0.17), 0.062) * 0.72;
      l *= Math.pow(Math.max(0, 1 - v * 0.72), 1.35);
      var haze = fbm(u * 3.1 - t * 0.08, v * 1.5 + t * 0.13);
      l *= 0.56 + 1.15 * haze;
      l += Math.pow(fbm(u * 8.5 + t * 0.30, v * 8.5 - t * 0.22), 6) * 0.55 * l;
      return clamp01(l + 0.014);
    },

    /* first plate. a hard diagonal rake across the frame, mass in the corner. */
    rake: function (u, v, t) {
      var d = Math.abs(v - (0.16 + 0.58 * u + 0.03 * Math.sin(u * 4.1 + t * 0.22)));
      var band = Math.pow(Math.max(0, 1 - d * 2.5), 2.3);
      var haze = fbm(u * 2.0 + t * 0.09, v * 2.6 + t * 0.05);
      var l = band * (0.50 + 0.85 * haze);
      l *= sstep(0.02, 0.42, u * 0.55 + v * 0.95);
      return clamp01(l + 0.020);
    },

    /* second plate. a cold column standing in a dark room, near-symmetric. */
    column: function (u, v, t) {
      var cx = 0.5 + 0.028 * Math.sin(t * 0.19);
      var col = Math.pow(Math.max(0, 1 - Math.abs(u - cx) * 2.35), 2.4);
      var vert = Math.pow(Math.max(0, 1 - Math.abs(v - 0.40) * 1.12), 1.6);
      var haze = fbm(u * 3.3 - t * 0.07, v * 2.1 + t * 0.11);
      return clamp01(col * vert * (0.62 + 1.25 * haze) + 0.020);
    },

    /* third plate. everything dark except a glow off the floor at the bottom
       edge — the frame is mostly what you cannot see. */
    floor: function (u, v, t) {
      /* deliberately short of the top palette step: once a region saturates to
         entry 7 it stops being a dither and becomes a flat white shape, which
         is exactly the blown-out dome this was doing at 1.25. */
      var g = Math.pow(Math.max(0, (v - 0.34) / 0.66), 2.15);
      var lat = Math.pow(Math.max(0, 1 - Math.abs(u - (0.44 + 0.05 * Math.sin(t * 0.21))) * 1.10), 1.7);
      var haze = fbm(u * 2.5 + t * 0.08, v * 1.9 - t * 0.05);
      return clamp01(g * lat * (0.46 + 0.86 * haze) + 0.016);
    }

    /* There was a sixth scene here, `swell` — a low wide glow behind the
       wordmark. The sign-off is grass now (grass.js) and nothing referenced it,
       so it is gone rather than left sitting under a comment claiming to be the
       footer. It is in the history if the glow is ever wanted back. */
  };

  /* ── screening ────────────────────────────────────────────────────────────
     The palettes and the Bayer table live in screen.js, because the sign-off
     grass screens through them too and "the same dither" has to mean the same
     code. The loop below still quantises inline rather than calling
     SCREEN.screen(): these scenes produce luminance one cell at a time and
     have nothing to gain from a buffer between the two steps. */
  var RAMP = SCREEN.RAMP;
  var BAYER = SCREEN.BAYER;

  /* ── a field ──────────────────────────────────────────────────────────── */
  function Field(cv, cfg) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.scene = SCENE[cfg.scene] || SCENE.horizon;
    this.ramp = RAMP[cfg.ramp] || RAMP.amber;
    this.cell = cfg.cell || 7;
    this.drift = cfg.drift == null ? 0.5 : cfg.drift;
    this.streak = !!cfg.streak;
    this.seed = cfg.seed || 0;
    this.px = 0; this.py = 0;   /* pointer influence, hero only */
    this.tpx = 0; this.tpy = 0;
    this.visible = false;
    this.size();
  }

  Field.prototype.size = function () {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bw = Math.max(24, Math.ceil(w / this.cell));
    this.bh = Math.max(16, Math.ceil(h / this.cell));
    this.buf.width = this.bw;
    this.buf.height = this.bh;
    this.img = this.bctx.createImageData(this.bw, this.bh);
    return true;
  };

  Field.prototype.render = function (time) {
    if (!this.w) return;
    var t = this.seed + time * this.drift;
    var bw = this.bw, bh = this.bh, ramp = this.ramp, n = ramp.length - 1;
    var d = this.img.data, scene = this.scene, o = 0, x, y, u, v, l, q, c;

    /* pointer eases toward the cursor rather than snapping to it */
    this.px += (this.tpx - this.px) * 0.045;
    this.py += (this.tpy - this.py) * 0.045;

    for (y = 0; y < bh; y++) {
      v = (y + 0.5) / bh;
      for (x = 0; x < bw; x++) {
        u = (x + 0.5) / bw;
        l = scene(u, v, t, this);
        /* dither, then quantise. the offset is centred on the step so the
           threshold pattern reads as texture rather than as a bias. */
        q = Math.round(l * n + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.469));
        if (q < 0) q = 0; else if (q > n) q = n;
        c = ramp[q];
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        o += 4;
      }
    }
    this.bctx.putImageData(this.img, 0, 0);

    var g = this.ctx, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);

    /* the cells stay countable: no smoothing on the primary draw */
    g.imageSmoothingEnabled = false;
    g.drawImage(this.buf, 0, 0, W, H);

    /* bloom — the same buffer again, blurred and added. light spilling past
       its own edge is most of what separates "lit" from "coloured". */
    g.save();
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.30;
    g.filter = 'blur(' + Math.max(6, Math.round(Math.min(W, H) * 0.035)) + 'px)';
    g.drawImage(this.buf, 0, 0, W, H);
    g.restore();

    /* one anamorphic streak on the hero only. earned: it is the single cue
       that says the light has a source and a lens, not a gradient stop. */
    if (this.streak) {
      var sx = W * (0.70 + 0.045 * Math.sin(t * 0.31) + this.px * 0.07);
      var sy = H * (0.22 + 0.035 * Math.cos(t * 0.23) + this.py * 0.05);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(sx, sy);
      g.scale(1, 0.055);
      var r = W * 0.62;
      var rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, 'rgba(255,214,152,0.50)');
      rg.addColorStop(0.30, 'rgba(206,132,62,0.14)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill();
      g.restore();
    }
  };

  /* ── one loop for every field ─────────────────────────────────────────── */
  var fields = [];
  var nodes = [].slice.call(document.querySelectorAll('canvas[data-field]'));

  nodes.forEach(function (cv) {
    var cfg;
    try { cfg = JSON.parse(cv.getAttribute('data-field')); } catch (e) { cfg = {}; }
    var f = new Field(cv, cfg);
    fields.push(f);
  });

  /* visibility gate — an offscreen field keeps its last frame and costs zero */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        for (var i = 0; i < fields.length; i++) {
          if (fields[i].cv === en.target) { fields[i].visible = en.isIntersecting; break; }
        }
      });
    }, { rootMargin: '15% 0px' });
    fields.forEach(function (f) { io.observe(f.cv); });
  } else {
    fields.forEach(function (f) { f.visible = true; });
  }

  /* the hero leans its key light toward the pointer. small, continuous, and
     the reason the frame feels occupied rather than printed. */
  var hero = fields.filter(function (f) { return f.streak; })[0];
  if (hero && !REDUCED && matchMedia('(pointer:fine)').matches) {
    addEventListener('pointermove', function (e) {
      var r = hero.cv.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      hero.tpx = (e.clientX - r.left) / r.width * 2 - 1;
      hero.tpy = (e.clientY - r.top) / r.height * 2 - 1;
    }, { passive: true });
  }

  var t0 = performance.now(), last = 0;

  function frame(now) {
    /* 30fps is plenty for light this slow, and halves the cost */
    if (now - last > 32) {
      last = now;
      var time = (now - t0) / 1000;
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].visible) fields[i].render(time);
      }
    }
    requestAnimationFrame(frame);
  }

  function start() {
    fields.forEach(function (f) { f.size(); });
    if (REDUCED) {
      /* one frame, then nothing. the page is complete without motion. */
      fields.forEach(function (f) { f.visible = true; f.render(0); });
      return;
    }
    requestAnimationFrame(frame);
  }

  start();

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      fields.forEach(function (f) {
        if (f.size() && REDUCED) f.render(0);
      });
    }, 160);
  });
})();
