/* ===========================================================================
   r1c/s1 — THE SAME PLACE, SURVEYED

   The middle of the page is a survey of the terrain the hero is flying over.
   Not terrain-like imagery: the actual heightmap, read out of TERRAIN.world,
   drawn twice —

     plan     a contour map, with the camera's current position on it
     section  an elevation profile cut along the flight line

   Why this and not another light field: a contour map of *this* terrain cannot
   also be a coffee roaster's, which was the exact charge against the four
   fields it replaces. It is also almost free, because the expensive part —
   885k Perlin evaluations — was already paid by the hero at load.

   ── keeping the lines an even width ──────────────────────────────────────
   The naive test, "draw where height is near a multiple of the interval",
   gives lines that are hairlines on cliffs and blobs on plains, because the
   same height window covers a different distance depending on the slope. So
   the distance to the nearest contour is measured in *cells* by dividing by
   the local gradient, and the line has a constant screen width. That single
   division is the difference between a map and a Rorschach.
   =========================================================================== */
(function () {
  'use strict';

  var W = window.TERRAIN && window.TERRAIN.world;
  if (!W) return;

  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var RAMP = SCREEN.RAMP.dusk;

  var P = {
    interval:  7.0,   /* world units between contours                       */
    index:     5,     /* every nth contour is an index line                 */
    weight:    0.85,  /* line width, in cells                               */
    indexBoost:1.9,   /* how much heavier an index line is                  */
    fill:      0.30,  /* hillshade between the lines. 0 is a pure line map  */
    ink:       0.92,  /* line brightness                                    */
    span:      190,   /* world units across the plan view                   */
    lead:      120,   /* how far ahead of the camera the section reaches    */
    relief:    1.30,  /* vertical exaggeration of the section               */
    cell:      3,
    follow:    1      /* 1 = the map tracks the hero's camera               */
  };

  /* ── a surveyed plate ───────────────────────────────────────────────────── */
  function Plate(cv, mode) {
    this.cv = cv;
    this.mode = mode;                 /* 'plan' | 'section' */
    this.ctx = cv.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.visible = false;
    this.tick = 0;
    this.size();
  }

  Plate.prototype.size = function () {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bw = Math.max(32, Math.ceil(w / P.cell));
    this.bh = Math.max(24, Math.ceil(h / P.cell));
    this.buf.width = this.bw; this.buf.height = this.bh;
    this.img = this.bctx.createImageData(this.bw, this.bh);
    this.luma = new Float32Array(this.bw * this.bh);
    return true;
  };

  /* distance to the nearest contour, in cells — see the header */
  function lineAt(wx, wz, per) {
    var h = W.heightAt(wx, wz);
    var t = h / P.interval;
    var f = t - Math.floor(t);
    var d = f < 0.5 ? f : 1 - f;                 /* 0..0.5 intervals away   */
    /* local gradient in interval-units per cell */
    var gx = (W.heightAt(wx + per, wz) - W.heightAt(wx - per, wz)) / (2 * P.interval);
    var gz = (W.heightAt(wx, wz + per) - W.heightAt(wx, wz - per)) / (2 * P.interval);
    var g = Math.sqrt(gx * gx + gz * gz);
    if (g < 1e-4) g = 1e-4;
    var cells = d / g;                            /* cells to the line      */
    var isIndex = Math.abs(Math.round(t) % P.index) === 0;
    var wgt = P.weight * (isIndex ? P.indexBoost : 1);
    var v = 1 - cells / wgt;
    return { line: v < 0 ? 0 : v, index: isIndex, h: h };
  }

  Plate.prototype.plan = function (t) {
    var bw = this.bw, bh = this.bh, luma = this.luma;
    var cam = W.camera();
    var span = P.span, per = span / bw;
    /* north-up, centred on the camera when following; a slow drift otherwise
       so the plate is never quite still */
    var cx = P.follow ? cam.x : 3000 + Math.sin(t * 0.03) * 90;
    var cz = P.follow ? cam.z : 3000 + t * 1.4;
    var aspect = bh / bw;
    var x, y, o = 0, wx, wz, L;

    for (y = 0; y < bh; y++) {
      wz = cz + ((y + 0.5) / bh - 0.5) * span * aspect;
      for (x = 0; x < bw; x++, o++) {
        wx = cx + ((x + 0.5) / bw - 0.5) * span;
        L = lineAt(wx, wz, per);
        /* the ground between the lines: a dim hillshade so the map reads as
           relief and not as a maze */
        var base = P.fill * (0.12 + 0.88 * W.shadeAt(wx, wz)) * (0.25 + 0.75 * L.h / 110);
        luma[o] = base + L.line * P.ink * (L.index ? 1 : 0.72);
      }
    }
    this.paint();
    this.overlayPlan(cam, cx, cz, span);
  };

  /* The camera's position and heading, drawn in vector on top of the screened
     buffer. Deliberately not dithered: it is instrumentation, not terrain, and
     the page should be able to tell you which is which. */
  Plate.prototype.overlayPlan = function (cam, cx, cz, span) {
    var g = this.ctx, Wd = this.w, H = this.h;
    var px = (0.5 + (cam.x - cx) / span) * Wd;
    var py = (0.5 + (cam.z - cz) / (span * (H / Wd))) * H;
    g.save();
    g.strokeStyle = 'rgba(224,151,92,0.9)';
    g.fillStyle = 'rgba(224,151,92,0.9)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px - 9, py); g.lineTo(px - 3, py);
    g.moveTo(px + 3, py); g.lineTo(px + 9, py);
    g.moveTo(px, py - 9); g.lineTo(px, py - 3);
    g.moveTo(px, py + 3); g.lineTo(px, py + 9);
    g.stroke();
    g.beginPath(); g.arc(px, py, 1.6, 0, 6.2832); g.fill();
    g.font = '10px ui-monospace,monospace';
    g.fillText(Math.round(cam.y) + 'm', px + 12, py - 10);
    g.restore();
  };

  /* the elevation profile: the ground under the flight line, ahead to behind */
  Plate.prototype.section = function () {
    var bw = this.bw, bh = this.bh, luma = this.luma;
    var cam = W.camera();
    var dirX = Math.sin(cam.yaw), dirZ = Math.cos(cam.yaw);
    var span = P.lead * 2;
    var x, y, o, i;

    luma.fill(0);

    /* one height per column, then fill down from it */
    var prof = new Float32Array(bw), hi = 1;
    for (x = 0; x < bw; x++) {
      var d = ((x + 0.5) / bw - 0.5) * span;
      prof[x] = W.heightAt(cam.x + dirX * d, cam.z + dirZ * d);
      if (prof[x] > hi) hi = prof[x];
    }
    var top = hi * 1.28 / P.relief;

    for (x = 0; x < bw; x++) {
      var surf = bh - (prof[x] / top) * bh;
      for (y = 0; y < bh; y++) {
        o = y * bw + x;
        if (y < surf - 1) continue;
        if (y < surf + 0.6) { luma[o] = 0.95; continue; }   /* the ground line */
        /* hatched below: a screen-door fill, which is how a section is drawn
           and which the dither happens to render perfectly */
        var depth = (y - surf) / bh;
        luma[o] = (((x + y) & 3) === 0 ? 0.34 : 0.05) * (1 - depth * 0.55) + 0.03;
      }
    }

    /* datum rules every interval, so the profile can be read as heights */
    var rules = Math.floor(top / (P.interval * 4));
    for (i = 1; i <= rules; i++) {
      y = Math.round(bh - (i * P.interval * 4 / top) * bh);
      if (y < 0 || y >= bh) continue;
      for (x = 0; x < bw; x += 2) luma[y * bw + x] = Math.max(luma[y * bw + x], 0.30);
    }

    this.paint();
  };

  Plate.prototype.paint = function () {
    SCREEN.screen(this.luma, this.img, this.bw, this.bh, RAMP);
    this.bctx.putImageData(this.img, 0, 0);
    var g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.buf, 0, 0, this.w, this.h);
  };

  Plate.prototype.render = function (t) {
    if (!this.w) return;
    if (this.mode === 'plan') this.plan(t); else this.section();
  };

  /* ── run ────────────────────────────────────────────────────────────────
     The map tracks a camera moving at 3.4 world units a second across a 190
     unit span — it crosses the plate in about a minute. Ten frames a second is
     four times more than that needs, and it keeps three heightAt lookups per
     cell off the main thread's back. */
  var plates = [].slice.call(document.querySelectorAll('canvas[data-survey]'))
    .map(function (cv) { return new Plate(cv, cv.getAttribute('data-survey')); });
  if (!plates.length) return;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        plates.forEach(function (p) { if (p.cv === e.target) p.visible = e.isIntersecting; });
      });
    }, { rootMargin: '20% 0px' });
    plates.forEach(function (p) { io.observe(p.cv); });
  } else {
    plates.forEach(function (p) { p.visible = true; });
  }

  function all(t) { plates.forEach(function (p) { p.visible = true; p.render(t); }); }

  var t0 = performance.now(), last = 0;
  function frame(now) {
    if (now - last > 100) {
      last = now;
      var t = (now - t0) / 1000;
      for (var i = 0; i < plates.length; i++) if (plates[i].visible) plates[i].render(t);
    }
    requestAnimationFrame(frame);
  }

  /* the hero builds its heightmap synchronously before this file runs, so
     there is nothing to wait for */
  if (REDUCED) all(0); else requestAnimationFrame(frame);

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      plates.forEach(function (p) { p.size(); });
      if (REDUCED) all(0);
    }, 160);
  });

  /* a tab on the shared panel */
  (window.TUNE_EXTRA = window.TUNE_EXTRA || []).push({
    name: 'survey',
    api: {
      params: P,
      defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
      draw: function () { all(performance.now() / 1000); },
      resize: function () { plates.forEach(function (p) { p.size(); }); this.draw(); },
      sow: function () { this.draw(); },
      info: function () { return plates.length + ' plates · ' + plates[0].bw + '×' + plates[0].bh; }
    },
    groups: [
      ['contours', [
        ['interval',   1,  30, 0.5,  'live', 'world units between lines'],
        ['index',      2,  10, 1,    'live', 'every nth line is heavier'],
        ['weight',   0.2, 3.0, 0.05, 'live', 'line width in cells'],
        ['indexBoost', 1, 4.0, 0.05, 'live', 'how much heavier'],
        ['ink',        0, 1.5, 0.01, 'live', 'line brightness'],
        ['fill',       0, 1.2, 0.01, 'live', 'hillshade between the lines']
      ]],
      ['framing', [
        ['span',      40, 600, 5,    'live', 'world units across the map'],
        ['follow',     0,   1, 1,    'live', "1 = track the hero's camera"],
        ['lead',      30, 400, 5,    'live', 'reach of the section'],
        ['relief',   0.4, 3.0, 0.05, 'live', 'vertical exaggeration'],
        ['cell',       2,   8, 1,    'size', 'px per cell']
      ]]
    ]
  });
})();
