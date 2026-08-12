/* ===========================================================================
   r1c/s3 — THE GRAIN RESOLVES

   No new imagery at all. The one thing every graphic on this page already has
   in common is that it is screened through a Bayer dither at some cell size,
   and cell size is a scale cue that nobody has spent yet.

   So the cell size becomes the ladder: coarse at the top of the page, fine at
   the bottom. The material resolves as you descend, the way anything does when
   you get closer to it. It costs one number per graphic and no artwork.

   Two versions here, because they answer different questions:

     the strip   the same subject at every step of the ladder at once, so the
                 effect can be judged in isolation rather than across 5,000px
     the band    cell size driven by the band's own scroll progress, so the
                 dither literally resolves as it comes up the viewport

   The band is the one that answers "something subtle in the background that
   develops as we scroll", and it is close to free: the buffer gets smaller as
   you approach, not bigger.

   The subject is a hillshade of the hero's terrain, for the same reason as s1
   — this page should be one place, not a gallery.
   =========================================================================== */
(function () {
  'use strict';

  var W = window.TERRAIN && window.TERRAIN.world;
  if (!W) return;

  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var RAMP = SCREEN.RAMP.dusk;

  var P = {
    coarse: 9,      /* cells at the top of the page   */
    fine:   2,      /* cells at the bottom            */
    curve:  1.5,    /* >1 spends more of the ladder coarse */
    span:   340,    /* world units across the subject */
    lift:   0.55,   /* brightness of the hillshade    */
    drive:  1,      /* 1 = the band tracks its scroll position */
    page:   1       /* 1 = the hero and the grass sit at the ends of the ladder */
  };

  function ease(t) { return Math.pow(t < 0 ? 0 : t > 1 ? 1 : t, P.curve); }
  function cellFor(depth) {
    return Math.max(1, Math.round(P.coarse + (P.fine - P.coarse) * ease(depth)));
  }

  /* ── a screened plate of the same hillside ─────────────────────────────── */
  function Plate(cv, depth) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.depth = depth;               /* fixed, or null to read from scroll */
    this.cell = 0;
    this.visible = false;
  }

  Plate.prototype.size = function (cell) {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    if (cell === this.cell && w === this.w && h === this.h) return true;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h; this.cell = cell;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bw = Math.max(16, Math.ceil(w / cell));
    this.bh = Math.max(12, Math.ceil(h / cell));
    this.buf.width = this.bw; this.buf.height = this.bh;
    this.img = this.bctx.createImageData(this.bw, this.bh);
    this.luma = new Float32Array(this.bw * this.bh);
    return true;
  };

  Plate.prototype.render = function (t) {
    var depth = this.depth;
    if (depth === null) {
      if (!P.drive) {
        depth = 0.5;                  /* parked mid-ladder, for comparison */
      } else {
        /* the band reads its own position: 0 as it enters from the bottom,
           1 when its centre reaches the middle of the viewport */
        var r = this.cv.getBoundingClientRect();
        var mid = r.top + r.height / 2;
        depth = 1 - Math.max(0, Math.min(1, (mid - innerHeight * 0.5) / (innerHeight * 0.55)));
      }
    }
    if (!this.size(cellFor(depth))) return;

    var bw = this.bw, bh = this.bh, luma = this.luma;
    /* the same hillside every time, drifting slowly, so the strip compares
       cell sizes rather than compositions */
    var cx = 2400 + t * 1.1, cz = 2400;
    var span = P.span, aspect = bh / bw;
    var x, y, o = 0, wx, wz;

    for (y = 0; y < bh; y++) {
      wz = cz + ((y + 0.5) / bh - 0.5) * span * aspect;
      for (x = 0; x < bw; x++, o++) {
        wx = cx + ((x + 0.5) / bw - 0.5) * span;
        var sh = W.shadeAt(wx, wz);
        var h = W.heightAt(wx, wz) / 110;
        luma[o] = P.lift * (0.10 + 0.90 * sh) * (0.30 + 0.80 * h) + 0.02;
      }
    }

    SCREEN.screen(luma, this.img, bw, bh, RAMP);
    this.bctx.putImageData(this.img, 0, 0);
    var g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.buf, 0, 0, this.w, this.h);

    var tag = this.cv.parentNode.querySelector('[data-cell]');
    if (tag) tag.textContent = this.cell + 'px';
  };

  /* ── collect ────────────────────────────────────────────────────────────── */
  var plates = [];

  [].forEach.call(document.querySelectorAll('canvas[data-grain]'), function (cv) {
    var v = cv.getAttribute('data-grain');
    plates.push(new Plate(cv, v === 'scroll' ? null : parseFloat(v)));
  });
  if (!plates.length) return;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        plates.forEach(function (p) { if (p.cv === e.target) p.visible = e.isIntersecting; });
      });
    }, { rootMargin: '25% 0px' });
    plates.forEach(function (p) { io.observe(p.cv); });
  } else {
    plates.forEach(function (p) { p.visible = true; });
  }

  /* ── the page ends of the ladder ────────────────────────────────────────
     The hero is the top of the descent and the grass is the bottom, so they
     take the coarse and fine ends. This is the part of the idea that costs
     literally one number each. */
  function applyPage() {
    if (!P.page) return;
    if (window.TERRAIN) {
      TERRAIN.params.cell = cellFor(0.06);
      TERRAIN.resize();
    }
    if (window.GRASS) {
      GRASS.params.cell = cellFor(0.97);
      GRASS.resize();
    }
  }

  function all(t) { plates.forEach(function (p) { p.visible = true; p.render(t); }); }

  var t0 = performance.now(), last = 0;
  function frame(now) {
    if (now - last > 66) {
      last = now;
      var t = (now - t0) / 1000;
      for (var i = 0; i < plates.length; i++) if (plates[i].visible) plates[i].render(t);
    }
    requestAnimationFrame(frame);
  }

  applyPage();
  if (REDUCED) all(0); else requestAnimationFrame(frame);

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      plates.forEach(function (p) { p.cell = 0; });
      if (REDUCED) all(0);
    }, 160);
  });

  (window.TUNE_EXTRA = window.TUNE_EXTRA || []).push({
    name: 'grain',
    api: {
      params: P,
      defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
      draw: function () { all(performance.now() / 1000); },
      resize: function () {
        plates.forEach(function (p) { p.cell = 0; });
        applyPage();
        this.draw();
      },
      sow: function () { this.resize(); },
      info: function () {
        return 'ladder ' + cellFor(0) + 'px → ' + cellFor(1) + 'px · ' + plates.length + ' plates';
      }
    },
    groups: [
      ['ladder', [
        ['coarse', 2, 14,  1,    'size', 'cells at the top of the page'],
        ['fine',   1, 10,  1,    'size', 'cells at the bottom'],
        ['curve',0.3, 3.0, 0.05, 'size', '>1 stays coarse for longer'],
        ['page',   0,  1,  1,    'size', 'drive the hero and the grass too']
      ]],
      ['subject', [
        ['span',  60, 900, 10,   'live', 'world units across the plate'],
        ['lift', 0.1, 1.4, 0.01, 'live', 'brightness of the hillshade'],
        ['drive',  0,   1, 1,    'live', 'band tracks its scroll position']
      ]]
    ]
  });
})();
