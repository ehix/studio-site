/* ===========================================================================
   r1b — THE SIGN-OFF FIELD

   The footer used to be `swell`: a wide low glow behind the wordmark, made the
   same way as the other five fields — a luminance function of (u,v,t). It was
   the weakest graphic on the page for exactly the reason the critique gave the
   others: nothing in it is *of* anything. A glow is not a subject.

   This replaces it with tall grass in wind, rendered as blades rather than as
   a texture. The distinction matters and it is the whole point of the file:

     - a texture is evaluated per cell and can only ever suggest grass
     - blades are objects — each has a root, a height, a thickness, a depth and
       a stiffness — and they are rasterised into the cell buffer, so the cells
       that light up are the cells a blade actually passes through

   That is what makes them countable, which is the language the rest of the
   page is already speaking.

   THE LIGHTING IS BACKLIT, NOT EMISSIVE. The five light fields glow; grass that
   glowed would be a mistake twice over. Physically, a field seen against a low
   sun is a dark mass with rimmed tips. Practically, the wordmark is near-white
   at 0.92 and sits on top of this: a bright band behind it is a contrast
   failure. So the blades *occlude* the sky glow and only their tips carry
   light, which puts the dark exactly where the type needs it.

   Two canvases, one world. Every blade lives in the same coordinate space and
   reads the same wind; the near layer draws to a second canvas above the
   wordmark so the tallest blades cross the letterforms. That canvas is screened
   with a dithered alpha, so it is grass over type rather than a black plate.

   Wind is 2D simplex — one travelling gust field shared by every blade, plus a
   per-blade flutter. Sharing the gust is what makes it read as weather instead
   of as several hundred independent wobbles.
   =========================================================================== */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── seeded rng ─────────────────────────────────────────────────────────
     mulberry32. The field must be identical across a resize — blades are
     generated once from this and only their rasterisation depends on size. */
  function rng(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ── 2D simplex ───────────────────────────────────────────────────────────
     Gustavson's construction. Chosen over the value noise in field.js and the
     Perlin in terrain.js for the reason simplex exists: no axis-aligned lattice
     artefacts. Wind sampled on a square lattice pulses in step across the field
     at the lattice period, which is visible and wrong — grass does not gust in
     columns. */
  var GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1];
  var F2 = 0.5 * (Math.sqrt(3) - 1);
  var G2 = (3 - Math.sqrt(3)) / 6;
  var PERM = new Uint8Array(512);

  (function () {
    var r = rng(9161), p = new Uint8Array(256), i, j, t;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      j = (r() * (i + 1)) | 0;
      t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();

  function simplex(xin, yin) {
    var s = (xin + yin) * F2;
    var i = Math.floor(xin + s), j = Math.floor(yin + s);
    var t = (i + j) * G2;
    var x0 = xin - (i - t), y0 = yin - (j - t);
    var i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    var ii = i & 255, jj = j & 255, n = 0, g, tt;

    tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) { g = (PERM[ii + PERM[jj]] & 7) << 1; tt *= tt; n += tt * tt * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) { g = (PERM[ii + i1 + PERM[jj + j1]] & 7) << 1; tt *= tt; n += tt * tt * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) { g = (PERM[ii + 1 + PERM[jj + 1]] & 7) << 1; tt *= tt; n += tt * tt * (GRAD[g] * x2 + GRAD[g + 1] * y2); }

    return 70 * n;   /* ~-1..1 */
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ── the layers ───────────────────────────────────────────────────────────
     Depth is not a scale factor. Each layer differs in where it is rooted, how
     far up the frame it reaches, how thick it draws and how hard it moves —
     which is what separates three distances from one distance drawn three
     times.

       far   rooted high, short, thin, stiff, and reaching *up* the frame:
             seen from slightly above the field, distant tops sit nearer the
             horizon than close ones.
       mid   the body of the mass. rooted on the bottom edge.
       near  rooted below the frame, thick, slow and heavy, drawn to the front
             canvas so it crosses the wordmark. Deliberately sparse: this is
             the layer that can cost legibility, so it is a few blades and not
             a fringe.

     density is per cell-column, so a wide viewport gets more grass rather than
     the same grass stretched. */
  var LAYER = [
    { density: 1.15, root: [0.90, 0.97], len: [0.36, 0.54], w: [0.9, 1.4],
      flex: [0.42, 0.72], lum: [0.34, 0.66], head: 0.22, front: false },
    { density: 0.66, root: [0.98, 1.05], len: [0.52, 0.76], w: [1.2, 2.0],
      flex: [0.62, 1.00], lum: [0.58, 0.95], head: 0.34, front: false },
    { density: 0.10, root: [1.05, 1.16], len: [0.40, 0.62], w: [2.6, 4.0],
      flex: [0.55, 0.85], lum: [0.72, 1.00], head: 0.55, front: true }
  ];

  function lerp(r, a) { return a[0] + r * (a[1] - a[0]); }

  /* ── the tunables ─────────────────────────────────────────────────────────
     Everything above describes the *shape* of a layer; everything here scales
     it, and every one of these is live. They are collected in one object rather
     than left inline so tune.js can drive them from a panel and so the numbers
     that were arrived at by eye are all in one place to read.

     Multipliers are 1 = as designed. Positions and thresholds are absolute
     because there is no meaningful "1" for a height in the frame. */
  var P = {
    /* field */
    fullness:  1.00,   /* × every layer's density                            */
    length:    1.00,   /* × every blade's length                             */
    thickness: 1.00,   /* × every blade's width                              */
    heads:     1.00,   /* × the chance a blade has gone to seed              */
    swell:     1.00,   /* × the undulation of the top edge (0 = flat)        */
    seed:     63.40,   /* re-sows the whole field                            */
    cell:      3,      /* px per cell — the coarseness of the dither         */

    /* wind */
    speed:     1.00,   /* × the rate the whole gust field travels            */
    strength:  1.00,   /* × how far a gust bends a blade                     */
    bias:      0.11,   /* steady lean. 0 = the field only oscillates         */
    flutter:   1.00,   /* × the per-blade chatter on top of the gust         */
    gustScale: 2.00,   /* gusts across the width. low = the field moves as one */

    /* light */
    glow:      1.00,   /* × the brightness of the band behind the field      */
    glowY:     0.42,   /* where that band sits, 0 top .. 1 bottom            */
    glowSpread:0.52,   /* how tall it is                                     */
    glowX:     0.62,   /* where the key is across the frame                  */
    tipLight:  1.00,   /* × the light the top of each blade carries          */
    fade:      0.66,   /* below here everything dies toward black — this is  */
                       /* what protects the wordmark, so it is the one to    */
                       /* move carefully                                     */

    /* the wordmark */
    frontDens: 1.00,   /* × how many blades cross the type. 0 = none         */
    frontReach:1.00,   /* × how far up the letterforms they go               */
    frontTone: 0.72,   /* their brightness. high vanishes into white type,   */
                       /* low vanishes into the dark between letters         */
    frontAlpha:0.94    /* canvas opacity of the layer in front               */
  };

  /* Cell spacing of the haze lattice. The haze is a little over two cycles
     across the whole footer; evaluating it per cell is fifty thousand simplex
     calls a frame to describe something an eight-cell grid already resolves
     exactly, so it is sampled coarse and bilinear in between. */
  var HAZE = 8;

  /* ── a sign-off ─────────────────────────────────────────────────────────── */
  function Grass(back, front, cfg) {
    this.ramp = SCREEN.RAMP[cfg.ramp] || SCREEN.RAMP.amber;
    this.drift = cfg.drift == null ? 1 : cfg.drift;
    this.visible = false;
    /* the markup seeds the tunables, and so becomes what "reset" returns to */
    if (cfg.cell) P.cell = cfg.cell;
    if (cfg.seed != null) P.seed = cfg.seed;

    this.back = this.mount(back);
    this.front = this.mount(front);
    this.blades = null;      /* built on first size(), needs bw */
    this.size();
  }

  Grass.prototype.mount = function (cv) {
    var buf = document.createElement('canvas');
    return {
      cv: cv, ctx: cv.getContext('2d'),
      buf: buf, bctx: buf.getContext('2d'),
      img: null, w: 0, h: 0
    };
  };

  /* Blades are generated against the *cell* grid so their thickness is in
     cells and a blade is never thinner than the dither can express. Rebuilt on
     a resize that changes the grid, from the same seed, so the field is stable
     rather than reshuffled under the reader. */
  Grass.prototype.sow = function () {
    var r = rng(P.seed * 1013 + 7), out = [], li, L, n, i, x0;
    for (li = 0; li < LAYER.length; li++) {
      L = LAYER[li];
      n = Math.round(L.density * P.fullness * (L.front ? P.frontDens : 1) * this.bw);
      if (L.front) { if (n < 0) n = 0; } else if (n < 8) n = 8;
      for (i = 0; i < n; i++) {
        x0 = -0.04 + r() * 1.08;
        /* Height is not independent per blade. Grass grows in swells — richer
           ground here, thinner there — and a field whose blades vary only
           randomly has a flat top edge no matter how much they vary. One low
           simplex across x gives the tops a horizon that rises and falls. */
        var swell = 1 + (0.48 * (0.5 + 0.5 * simplex(x0 * 2.6 + 17.3, 3.1)) - 0.24) * P.swell;
        out.push({
          layer: li,
          front: L.front,
          /* rooted slightly beyond both edges so the field is cut off by the
             frame rather than stopping inside it */
          x0: x0,
          root: lerp(r(), L.root),
          len: lerp(r(), L.len) * (0.82 + 0.36 * r()) * swell * P.length
               * (L.front ? P.frontReach : 1),
          w: lerp(r(), L.w) * P.thickness,
          flex: lerp(r(), L.flex),
          lum: lerp(r(), L.lum),
          /* a static lean, so the field is not uniformly vertical at rest */
          lean: (r() - 0.5) * 0.30,
          phase: r() * 40,
          /* Some of it has gone to seed. This is the detail that stops the
             field being an abstraction of grass and makes it a *kind* of
             grass — the heavy heads are also what the light catches first,
             and they weight the tips so those blades nod rather than whip. */
          head: r() < L.head * P.heads ? 0.7 + r() * 0.6 : 0
        });
      }
    }
    /* draw far layers first so nearer blades overwrite them in the coverage
       buffer rather than the other way round */
    out.sort(function (a, b) { return a.layer - b.layer; });
    this.blades = out;
  };

  Grass.prototype.size = function () {
    var cv = this.back.cv;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var bw = Math.max(32, Math.ceil(w / P.cell));
    var bh = Math.max(24, Math.ceil(h / P.cell));
    var resown = bw !== this.bw;

    this.bw = bw; this.bh = bh;

    var m, k;
    for (k = 0; k < 2; k++) {
      m = k ? this.front : this.back;
      m.w = w; m.h = h;
      m.cv.width = Math.round(w * dpr);
      m.cv.height = Math.round(h * dpr);
      m.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      m.buf.width = bw; m.buf.height = bh;
      m.img = m.bctx.createImageData(bw, bh);
    }

    var n = bw * bh;
    this.covB = new Float32Array(n);   /* silhouette, back  */
    this.litB = new Float32Array(n);   /* rim light, back   */
    this.covF = new Float32Array(n);   /* silhouette, front */
    this.litF = new Float32Array(n);
    this.luma = new Float32Array(n);
    this.alpha = new Float32Array(n);

    /* the sky is separable — see render() */
    this.rowSky = new Float32Array(bh);
    this.rowKeep = new Float32Array(bh);
    this.colSky = new Float32Array(bw);
    this.gw = Math.ceil(bw / HAZE) + 2;
    this.gh = Math.ceil(bh / HAZE) + 2;
    this.haze = new Float32Array(this.gw * this.gh);

    if (!this.blades || resown) this.sow();
    return true;
  };

  /* ── one blade ────────────────────────────────────────────────────────────
     March the stalk from root to tip depositing into two buffers: coverage,
     which is how much of the cell the blade fills, and light, which is what the
     tip catches. Three samples per cell of length — fewer and the deposit per
     row varies with where the samples happen to land, which reads as a stalk
     that flickers along its length. */
  Grass.prototype.blade = function (b, gust, cov, lit) {
    var bw = this.bw, bh = this.bh;
    var bx = b.x0 * bw;
    var by = b.root * bh;
    var len = b.len * bh;

    /* the shared gust, a per-blade flutter, and a steady bias — wind has a
       direction, and without the bias the field only ever oscillates about
       vertical, which looks like breathing rather than weather */
    var flut = simplex(b.x0 * 9 + b.phase, gust.t * 0.9);
    var bend = b.lean + (gust.at(b.x0) * 0.62 * P.strength
                       + flut * 0.15 * P.flutter + P.bias) * b.flex;
    var abend = bend < 0 ? -bend : bend;

    var steps = Math.ceil(len * 2.4);
    if (steps < 6) steps = 6;
    var inv = 1 / steps, norm = len / steps;

    var i, s, s2, fx, fy, iy, row, hw, x0f, x1f, ix, ix0, ix1, c, m, l;

    for (i = 0; i <= steps; i++) {
      s = i * inv;
      s2 = s * s;
      /* quadratic: the root stays planted and the bend accumulates toward the
         tip. Linear displacement gives a field of leaning sticks. */
      fx = bx + bend * s2 * len * 0.55;
      /* a bowed blade is shorter on the screen than a straight one */
      fy = by - s * len * (1 - 0.17 * abend * s);
      iy = Math.floor(fy);
      if (iy < 0 || iy >= bh) continue;

      hw = 0.5 * b.w * (1 - 0.58 * s);
      if (hw < 0.16) hw = 0.16;

      /* Light arrives on the top two-thirds of the stalk and nowhere below it.
         A blade lit along its whole length is a lit stick; the reason a field
         at dusk reads as depth is that the light stops partway down and the
         roots are in the mass. */
      var sl = (s - 0.32) * 1.47;
      if (sl < 0) sl = 0;
      m = norm;
      /* The gain stops short of the top of the ramp on purpose. Tips that
         saturate to entry 7 are [248,226,182] — within a hair of the wordmark's
         own colour, so the grass stopped reading as grass and started reading
         as more type. Grass tops out around entry 6 and the white in this
         footer stays the word. */
      l = b.lum * sl * sl * norm * 0.82 * P.tipLight;

      /* the seed head: thicker and a little brighter over the top sixth */
      if (b.head && s > 0.82) {
        var hd = (s - 0.82) * 5.55;
        hd = hd * (2 - hd);                 /* eases to full at the tip */
        hw += b.head * hd * 0.52;
        l += b.lum * b.head * hd * 0.20 * norm * P.tipLight;
      }

      x0f = fx - hw; x1f = fx + hw;
      ix0 = Math.floor(x0f); ix1 = Math.floor(x1f);
      row = iy * bw;
      for (ix = ix0; ix <= ix1; ix++) {
        if (ix < 0 || ix >= bw) continue;
        c = Math.min(x1f, ix + 1) - Math.max(x0f, ix);
        if (c <= 0) continue;
        cov[row + ix] += c * m;
        lit[row + ix] += c * l;
      }
    }
  };

  /* ── a frame ────────────────────────────────────────────────────────────── */
  Grass.prototype.render = function (time) {
    if (!this.back.w) return;
    var t = P.seed + time * this.drift * P.speed;
    this.t = time;
    var bw = this.bw, bh = this.bh, n = bw * bh;
    var covB = this.covB, litB = this.litB, covF = this.covF, litF = this.litF;
    var luma = this.luma, alpha = this.alpha;
    var i, x, y, u, v, o;

    covB.fill(0); litB.fill(0); covF.fill(0); litF.fill(0);

    /* one gust field for the whole footer, sampled per blade root. Travelling:
       the x term walks against t, so a gust crosses the frame left to right
       over about eight seconds. */
    var gust = {
      t: t,
      at: function (x0) { return simplex(x0 * P.gustScale - t * 0.30, t * 0.16); }
    };

    var blades = this.blades;
    for (i = 0; i < blades.length; i++) {
      if (blades[i].front) this.blade(blades[i], gust, covF, litF);
      else this.blade(blades[i], gust, covB, litB);
    }

    /* ── back: the sky the field is seen against ───────────────────────────
       Not a glow *above* the grass — a band of light *at the height the tips
       reach*, which is the only place it does any work. Grass silhouetted
       against dark is grass you cannot see; the first version of this file put
       the key up at v=0.30 and the whole field disappeared into the ground.

       Separable, and deliberately so: the vertical band depends only on v and
       the lateral falloff only on u, so each is computed once per row and once
       per column instead of once per cell. What is left in the inner loop is a
       lookup and three multiplies. */
    var rowSky = this.rowSky, colSky = this.colSky, haze = this.haze;
    var gw = this.gw, gh = this.gh, gx, gy;

    var rowKeep = this.rowKeep;
    for (y = 0; y < bh; y++) {
      v = (y + 0.5) / bh;
      rowSky[y] = Math.pow(Math.max(0, 1 - Math.abs(v - P.glowY) / P.glowSpread), 1.6);
      /* Everything dies toward the bottom of the frame — sky, blades and rim
         alike. This is the band the wordmark sits in, and it has to stay
         near-black for near-white type to hold its contrast. Applying it to
         the sky alone leaves lit tips burning through the letterforms, which
         is the one way this graphic could actually damage the page. */
      rowKeep[y] = 1 - Math.pow(clamp01((v - P.fade) / Math.max(0.04, 1 - P.fade)), 1.3) * 0.90;
    }
    for (x = 0; x < bw; x++) {
      u = (x + 0.5) / bw;
      /* up and to the right, the key the hero and the plates are lit by */
      colSky[x] = Math.pow(Math.max(0, 1 - Math.abs(u - P.glowX) * 0.95), 1.5);
    }
    for (gy = 0; gy < gh; gy++) {
      for (gx = 0; gx < gw; gx++) {
        haze[gy * gw + gx] = 0.5 + 0.5 * simplex(
          (gx * HAZE / bw) * 2.4 + t * 0.05,
          (gy * HAZE / bh) * 2.0 - t * 0.04);
      }
    }

    var ih = 1 / HAZE;
    o = 0;
    for (y = 0; y < bh; y++) {
      var fy = y * ih, gy0 = fy | 0, ty = fy - gy0;
      var r0 = gy0 * gw, r1 = r0 + gw, sy = rowSky[y], keep = rowKeep[y];
      for (x = 0; x < bw; x++, o++) {
        var fx = x * ih, gx0 = fx | 0, tx = fx - gx0;
        var h = (haze[r0 + gx0] + (haze[r0 + gx0 + 1] - haze[r0 + gx0]) * tx) * (1 - ty)
              + (haze[r1 + gx0] + (haze[r1 + gx0 + 1] - haze[r1 + gx0]) * tx) * ty;
        var sky = sy * colSky[x] * (0.40 + 0.74 * h) * 1.18 * P.glow;
        var c = covB[o]; if (c > 1) c = 1;
        luma[o] = (sky * (1 - c * 0.94) + litB[o] + 0.012) * keep;
      }
    }
    this.paint(this.back, luma, null, 0.24);

    /* ── front: blades over the type ───────────────────────────────────────
       Same construction, but coverage becomes alpha instead of an occluder, so
       what lands on the wordmark is the blade and nothing else. No bloom — a
       blurred additive pass in front of near-white type is fog. */
    for (i = 0; i < n; i++) {
      var cf = covF[i]; if (cf > 1) cf = 1;
      /* These blades have two backgrounds to hold against — near-white
         letterforms and near-black ground — so they are pinned to the middle
         of the ramp, around entries 4 and 5. Taken any brighter the tips reach
         [248,226,182] and vanish into the wordmark; taken any darker they
         disappear into the ground between the letters. */
      luma[i] = litF[i] * P.frontTone + cf * 0.035;
      /* Well past 1, deliberately. Coverage in the middle of a thin blade sits
         around 0.5, and a 1-bit alpha thresholded at 0.5 turns a stalk into a
         dashed line. Overdriving it makes the core solid and leaves the dither
         to do what it is for — the edge. */
      alpha[i] = cf * 2.1;
    }
    this.paint(this.front, luma, alpha, 0);
  };

  Grass.prototype.paint = function (m, luma, alpha, bloom) {
    SCREEN.screen(luma, m.img, this.bw, this.bh, this.ramp, alpha);
    m.bctx.putImageData(m.img, 0, 0);

    var g = m.ctx, W = m.w, H = m.h;
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.drawImage(m.buf, 0, 0, W, H);

    if (bloom) {
      g.save();
      g.imageSmoothingEnabled = true;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = bloom;
      g.filter = 'blur(' + Math.max(5, Math.round(Math.min(W, H) * 0.03)) + 'px)';
      g.drawImage(m.buf, 0, 0, W, H);
      g.restore();
    }
  };

  /* ── mount ──────────────────────────────────────────────────────────────── */
  var back = document.querySelector('canvas[data-grass="back"]');
  var front = document.querySelector('canvas[data-grass="front"]');
  if (!back || !front) return;

  var cfg;
  try { cfg = JSON.parse(back.getAttribute('data-grass-cfg')); } catch (e) { cfg = {}; }
  var field = new Grass(back, front, cfg || {});

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      field.visible = en[0].isIntersecting;
    }, { rootMargin: '15% 0px' }).observe(back);
  } else {
    field.visible = true;
  }

  var t0 = performance.now(), last = 0;

  function frame(now) {
    if (now - last > 32) {
      last = now;
      if (field.visible) field.render((now - t0) / 1000);
    }
    requestAnimationFrame(frame);
  }

  /* Size again before the first paint. The constructor measures at parse time,
     and a canvas that measured zero then would never be measured again on the
     reduced-motion path — which is a permanently empty footer for exactly the
     readers who cannot see it fill in later. */
  field.size();

  if (REDUCED) {
    /* one frame. the bias in the bend means the field is still leaning — a
       still of grass in wind, rather than grass standing to attention. */
    field.visible = true;
    field.render(0);
  } else {
    requestAnimationFrame(frame);
  }

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (field.size() && REDUCED) field.render(0);
    }, 160);
  });

  /* ── the tuning surface ───────────────────────────────────────────────────
     Published for tune.js and for the console. Nothing on the page reads it,
     and if tune.js is not loaded this is simply an object nobody asked for —
     which is the arrangement that lets the panel be a separate file that ships
     nowhere near the real site.

     Redrawing on demand matters more than it looks: at 30fps a slider dragged
     quickly would otherwise show its result up to a frame late, and under
     reduced motion it would never show it at all. */
  window.GRASS = {
    params: P,
    defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
    field: field,
    /* re-generate the blades: anything that changes what grows, not how it is
       lit or how it moves */
    sow: function () { field.sow(); this.draw(); },
    /* re-allocate the buffers: cell size only */
    resize: function () { field.size(); this.draw(); },
    draw: function () { field.visible = true; field.render(field.t || 0); },
    blades: function () { return field.blades ? field.blades.length : 0; },
    front: front,
    /* The gust field, published. If anything else on the page ever wants to
       move with the wind, it should move with *this* wind — two independent
       noise fields at similar frequencies read as two weathers in one place,
       which is worse than no weather at all. */
    noise: simplex
  };
})();
