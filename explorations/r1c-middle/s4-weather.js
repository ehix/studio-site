/* ===========================================================================
   r1c/s4 — ONE WEATHER SYSTEM

   Nothing new appears on the page. There is already wind in the grass and haze
   in the hero, and they know nothing about each other — two independent noise
   fields at similar frequencies, which reads as two weathers in one place.
   This makes them one.

   A single clock and a single gust field. The grass leans on it, the hero's
   haze and glow breathe with it, and a band in the middle of the page carries
   it across the gap between them. When a gust arrives it arrives everywhere,
   a little later further away — so the page becomes one afternoon rather than
   three animations.

   ── it drives the published parameters, it does not patch anything ────────
   Everything here works through TERRAIN.params and GRASS.params, which exist
   for the tuning panel. No function is replaced and no file is edited: this is
   a script that turns the same knobs a person would, sixty times a second.
   That is also why it composes — the panel still works while it runs, and the
   sliders show the weather moving them.

   The noise is GRASS.noise, deliberately. Sharing the parameter but not the
   noise field would have produced gusts that agree in strength and disagree in
   shape, which is the uncanny version of this idea.
   =========================================================================== */
(function () {
  'use strict';

  if (!window.GRASS || !GRASS.noise) return;

  var noise = GRASS.noise;
  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var RAMP = SCREEN.RAMP.amber;

  var P = {
    rate:     0.30,   /* how fast the weather crosses the page              */
    scale:    1.60,   /* gusts across the width of the world                */
    swell:    1.00,   /* × the whole system's amplitude                     */
    squall:   0.55,   /* a slow second layer — the front behind the gust    */
    lag:      0.55,   /* how much later a gust reaches the bottom of the page */
    toGrass:  1.00,   /* how hard the weather drives the grass              */
    toHero:   1.00,   /* … and the hero's haze and glow                     */
    hazeBand: 1.00,   /* the mid-page band's response                       */
    cell:     4
  };

  /* ── the shared field ───────────────────────────────────────────────────
     One function. `depth` is where down the page you are asking from, which is
     what gives a gust somewhere to travel to. */
  var t0 = performance.now();
  function clock() { return (performance.now() - t0) / 1000; }

  function gust(depth, t) {
    var d = depth * P.lag;
    var a = noise(d * P.scale - t * P.rate, t * 0.16);
    var b = noise(d * P.scale * 0.37 - t * P.rate * 0.41 + 31.7, t * 0.06);
    return (a + b * P.squall) / (1 + P.squall) * P.swell;
  }

  /* ── the band ───────────────────────────────────────────────────────────
     Haze crossing the middle of the page on the same signal. Deliberately near
     the floor of the ramp: this is atmosphere behind a line of type, and the
     moment it becomes a picture it stops being weather. */
  function Band(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.visible = false;
    this.size();
  }

  Band.prototype.size = function () {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bw = Math.max(24, Math.ceil(w / P.cell));
    this.bh = Math.max(16, Math.ceil(h / P.cell));
    this.buf.width = this.bw; this.buf.height = this.bh;
    this.img = this.bctx.createImageData(this.bw, this.bh);
    this.luma = new Float32Array(this.bw * this.bh);
    return true;
  };

  Band.prototype.render = function (t) {
    if (!this.w) return;
    var bw = this.bw, bh = this.bh, luma = this.luma;
    var g0 = gust(0.5, t);
    /* the gust shears the haze rather than only brightening it — wind you can
       see is wind that moves something sideways */
    var shear = g0 * 0.30 * P.hazeBand;
    var x, y, o = 0, u, v;

    for (y = 0; y < bh; y++) {
      v = (y + 0.5) / bh;
      var band = Math.pow(Math.max(0, 1 - Math.abs(v - 0.52) / 0.60), 1.7);
      for (x = 0; x < bw; x++, o++) {
        u = (x + 0.5) / bw;
        var n = 0.5 + 0.5 * noise(u * 2.6 - t * P.rate * 1.6 + shear * 3, v * 1.7 + t * 0.05);
        var n2 = 0.5 + 0.5 * noise(u * 6.1 - t * P.rate * 2.4, v * 3.4 - t * 0.09);
        luma[o] = band * (0.10 + 0.40 * n + 0.16 * n2) * (0.55 + 0.75 * (0.5 + 0.5 * g0));
      }
    }

    SCREEN.screen(luma, this.img, bw, bh, RAMP);
    this.bctx.putImageData(this.img, 0, 0);
    var g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.buf, 0, 0, this.w, this.h);
  };

  /* ── the gauge ──────────────────────────────────────────────────────────
     The signal, drawn. Without it this showcase is a claim you have to take on
     faith; with it you can watch a gust cross the trace and then watch the
     same gust arrive in the grass. */
  function Gauge(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.hist = new Float32Array(160);
    this.n = 0;
    this.size();
  }
  Gauge.prototype.size = function () {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  Gauge.prototype.push = function (v) {
    this.hist[this.n % this.hist.length] = v;
    this.n++;
  };
  Gauge.prototype.render = function () {
    var g = this.ctx, W = this.w, H = this.h, L = this.hist.length, i, v, x, y;
    if (!W) return;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90,84,76,0.8)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = 'rgba(224,151,92,0.95)';
    g.beginPath();
    for (i = 0; i < L; i++) {
      v = this.hist[(this.n + i) % L];
      x = i / (L - 1) * W;
      y = H / 2 - v * H * 0.42;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  };

  /* ── run ────────────────────────────────────────────────────────────────── */
  var bandCv = document.querySelector('canvas[data-weather=band]');
  var gaugeCv = document.querySelector('canvas[data-weather=gauge]');
  var band = bandCv ? new Band(bandCv) : null;
  var gauge = gaugeCv ? new Gauge(gaugeCv) : null;
  var readout = document.querySelector('[data-weather-read]');

  if (band && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { band.visible = e[0].isIntersecting; },
      { rootMargin: '20% 0px' }).observe(bandCv);
  } else if (band) {
    band.visible = true;
  }

  /* the grass and the hero sit at known depths — the top and the bottom of the
     descent — so a gust reaches them at different times */
  var GRASS_DEPTH = 1.0, HERO_DEPTH = 0.0;

  var gBase = window.GRASS ? { strength: GRASS.params.strength, bias: GRASS.params.bias } : null;
  var tBase = window.TERRAIN ? { haze: TERRAIN.params.haze, glow: TERRAIN.params.glow } : null;

  function drive(t) {
    if (gBase && P.toGrass) {
      var gw = gust(GRASS_DEPTH, t);
      GRASS.params.strength = gBase.strength * (1 + gw * 0.55 * P.toGrass);
      GRASS.params.bias = gBase.bias + gw * 0.14 * P.toGrass;
    }
    if (tBase && P.toHero) {
      var hw = gust(HERO_DEPTH, t);
      /* small numbers on purpose: the hero is a kilometre up, and weather at
         that distance is a change in the air, not a change in the mountain */
      TERRAIN.params.haze = tBase.haze * (1 + hw * 0.16 * P.toHero);
      TERRAIN.params.glow = tBase.glow * (1 + hw * 0.10 * P.toHero);
    }
  }

  var last = 0;
  function frame(now) {
    var t = clock();
    drive(t);
    if (now - last > 50) {
      last = now;
      if (band && band.visible) band.render(t);
      if (gauge) {
        gauge.push(gust(0.5, t));
        gauge.render();
        if (readout) {
          var v = gust(0.5, t);
          readout.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        }
      }
    }
    requestAnimationFrame(frame);
  }

  if (REDUCED) {
    /* one frame of a still afternoon. The parameters are left exactly where
       the page set them — a reader who asked for no motion should not have
       their grass permanently leaning because of a gust that never blows. */
    if (band) { band.visible = true; band.render(0); }
    if (gauge) { for (var i = 0; i < gauge.hist.length; i++) gauge.push(gust(0.5, i * 0.4)); gauge.render(); }
  } else {
    requestAnimationFrame(frame);
  }

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (band && band.size() && REDUCED) band.render(0);
      if (gauge) { gauge.size(); gauge.render(); }
    }, 160);
  });

  (window.TUNE_EXTRA = window.TUNE_EXTRA || []).push({
    name: 'weather',
    api: {
      params: P,
      defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
      draw: function () { if (band) { band.visible = true; band.render(clock()); } },
      resize: function () { if (band) band.size(); this.draw(); },
      sow: function () { this.draw(); },
      info: function () { return 'gust ' + gust(0.5, clock()).toFixed(2) + ' · one field, three consumers'; }
    },
    groups: [
      ['the system', [
        ['rate',   0,   1.2, 0.01, 'live', 'how fast weather crosses the page'],
        ['scale',  0.2, 6.0, 0.05, 'live', 'gusts across the world'],
        ['swell',  0,   2.5, 0.01, 'live', 'overall amplitude'],
        ['squall', 0,   2.0, 0.01, 'live', 'the slow front behind the gust'],
        ['lag',    0,   3.0, 0.01, 'live', 'how much later it reaches the grass']
      ]],
      ['what it drives', [
        ['toGrass',  0, 3.0, 0.01, 'live', 'the sign-off wind'],
        ['toHero',   0, 3.0, 0.01, 'live', "the hero's haze and glow"],
        ['hazeBand', 0, 3.0, 0.01, 'live', 'the mid-page haze'],
        ['cell',     2,   8, 1,    'size', 'px per cell']
      ]]
    ]
  });
})();
