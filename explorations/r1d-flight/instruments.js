/* ===========================================================================
   r1d — THE INSTRUMENT RAIL

   Replaces the four static plates that used to live in the margin. Those were
   a survey taken before take-off, pinned up and left alone, and the argument
   for them was that a page of nothing but moving background has no fixed
   reference. That argument was wrong in a specific way: the reader does not
   need a fixed reference, the reader needs to know where they are. A drawing
   that never changes cannot tell them.

   So the rail is now an instrument panel, and every part of it reads the same
   camera the terrain is rendered from. Four instruments:

     tape      the whole flight as an altitude curve, top to bottom, with the
               camera's position on it. Drag it and the page flies.
     stations  the five phases, by name, as buttons
     ahead     a cut along the bearing, with the camera plotted at its real
               height above it — the one instrument that shows clearance
     locator   a plan of the ground under the column, zooming out with
               altitude, with the bearing drawn on it

   ── what makes an instrument worth its space ──────────────────────────────
   Each one has to answer a question the frame does not already answer:

     tape      how far through the flight am I, and how far is left
     ahead     what is between me and the horizon, and how high am I over it
     locator   which way am I facing, and what is out that way

   The old `range` skyline plate is gone. It drew the horizon on the landing
   bearing, which is a picture of the thing the reader is about to be shown at
   full size — captioning the view with a smaller copy of the view.

   ── cost ──────────────────────────────────────────────────────────────────
   The plates are small on purpose: about 118 by 58, drawn at cell 2, so a
   locator is around 1,700 cells and a section is 59 columns. Together they are
   a rounding error against a 130,000-cell flight frame. The rail redraws on
   the same frames the flight does and no others — it is handed the camera by
   flight.js rather than reading it, so there is one clock.
   =========================================================================== */
(function () {
  'use strict';

  var F = window.FLIGHT;
  var rail = document.querySelector('[data-rail]');
  if (!F || !rail) return;

  var W = F.world;
  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var RAMP = SCREEN.RAMP.dusk;
  var CELL = 2;

  var css = getComputedStyle(document.documentElement);
  function tok(n, fallback) { return (css.getPropertyValue(n) || '').trim() || fallback; }
  var INK = tok('--ink', '#f4f2ee'), ACCENT = tok('--accent', '#e0a25c');
  var EDGE = tok('--edge', '#3a3632'), DIM = tok('--gap-ink', '#9b9186');

  /* ── the readouts ────────────────────────────────────────────────────────
     Five numbers, and every one of them is something the picture does not
     say. Altitude, because a landscape gives no scale. Ground elevation,
     because altitude alone does not tell you whether you are over a peak or a
     valley. Bearing, because a generated terrain has no landmarks to orient
     against. Pitch, because during the survey the reader genuinely cannot
     tell whether they are looking down or looking at a very flat plain. And
     relief, because it is the one number that says whether the flight is
     going to end somewhere worth landing. */
  var out = {};
  ['alt', 'gnd', 'brg', 'pitch', 'relief'].forEach(function (k) {
    out[k] = rail.querySelector('[data-r=' + k + ']');
  });

  var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  function metres(m) {
    return m >= 100 ? Math.round(m) + 'm'
      : m >= 10 ? m.toFixed(1) + 'm'
      : m >= 1 ? m.toFixed(2) + 'm'
      : (m * 100).toFixed(m >= 0.1 ? 0 : 1) + 'cm';
  }

  function readouts(cam, aim) {
    if (out.alt) out.alt.textContent = metres(cam.alt);
    if (out.gnd) out.gnd.textContent = Math.round(cam.ground) + 'm';
    if (out.brg) {
      var deg = (cam.yaw * 57.2958) % 360; if (deg < 0) deg += 360;
      out.brg.textContent = (deg < 10 ? '00' : deg < 100 ? '0' : '') +
        Math.round(deg) + '° ' + COMPASS[Math.round(deg / 45) & 7];
    }
    if (out.pitch) out.pitch.textContent = (cam.pitch * 57.2958).toFixed(0) + '°';
    /* signed, and it matters. Clamped at zero this read "0m" on every column
       that happens to sit on high ground, which is a dead instrument — a
       negative relief is the useful reading, not the absent one: it says the
       landing will look out over a valley rather than up at a range. */
    if (out.relief) {
      var r = Math.round(aim.relief);
      out.relief.textContent = (r > 0 ? '+' : '') + r + 'm';
    }
  }

  /* ── canvas plumbing ─────────────────────────────────────────────────────
     Every canvas here is sized in CSS and backed at device resolution. The
     plates go through the same screening stage as the terrain — they are
     pictures of the world, and a picture of the world on this page is
     dithered. The tape does not: it is an instrument face, not a view, and it
     is drawn in clean strokes for the same reason a rule under a heading is
     not dithered either. */
  function fit(cv) {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /* a screened plate: draw luminance into a small buffer, dither, blit */
  function plate(cv, draw) {
    var f = fit(cv); if (!f) return;
    var bw = Math.max(20, Math.ceil(f.w / CELL));
    var bh = Math.max(14, Math.ceil(f.h / CELL));
    var st = cv.__buf;
    if (!st || st.bw !== bw || st.bh !== bh) {
      var b = document.createElement('canvas');
      b.width = bw; b.height = bh;
      st = cv.__buf = { bw: bw, bh: bh, cv: b, ctx: b.getContext('2d'),
                        img: b.getContext('2d').createImageData(bw, bh),
                        luma: new Float32Array(bw * bh) };
    }
    draw(st.luma, bw, bh);
    SCREEN.screen(st.luma, st.img, bw, bh, RAMP);
    st.ctx.putImageData(st.img, 0, 0);
    f.ctx.imageSmoothingEnabled = false;
    f.ctx.drawImage(st.cv, 0, 0, f.w, f.h);
    return f;
  }

  /* ── the tape ────────────────────────────────────────────────────────────
     The flight's altitude against scroll progress, progress running down the
     page because that is the direction the reader scrolls. Altitude is on a
     log axis: the flight covers 52 to 900 to 5 units, and on a linear axis
     the entire landing — the part with the wordmark in it — is a single pixel
     against the floor.

     The curve is sampled from the same keyframe table the camera flies, not
     from a copy of it, so the drawing cannot drift out of agreement with the
     flight. Sampled at load and on resize; the shape only changes if somebody
     is moving sliders in the tuning panel. */
  var tapeCv = rail.querySelector('[data-tape]');
  var curve = null, tapeBox = null;
  var ALT_LO = 3;

  function altOf(p) {
    var KF = F.keyframes, i = 0;
    while (i < KF.length - 2 && KF[i + 1].p < p) i++;
    var a = KF[i], b = KF[i + 1];
    var t = Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p || 1)));
    t = t * t * (3 - 2 * t);
    function v(x) {
      return x === 'start' ? F.params.startAlt
        : x === 'survey' ? F.params.surveyAlt
        : x === 'land' ? F.params.landAlt : x;
    }
    var la = Math.log(v(a.alt)), lb = Math.log(v(b.alt));
    return Math.exp(la + (lb - la) * t);
  }

  function buildCurve(w, h) {
    var hi = Math.max(F.params.surveyAlt * 1.12, 60);
    var lo = Math.min(ALT_LO, F.params.landAlt * 0.7);
    var span = Math.log(hi) - Math.log(lo);
    var pts = [], i, n = 160;
    for (i = 0; i <= n; i++) {
      var p = i / n;
      var x = (Math.log(altOf(p)) - Math.log(lo)) / span;
      pts.push([Math.max(0, Math.min(1, x)), p]);
    }
    curve = { pts: pts, lo: lo, hi: hi, span: span, w: w, h: h };
  }

  function tapeX(alt) {
    return (Math.log(Math.max(curve.lo, alt)) - Math.log(curve.lo)) / curve.span;
  }

  function drawTape(cam) {
    var f = fit(tapeCv); if (!f) return;
    if (!curve || curve.w !== f.w || curve.h !== f.h) buildCurve(f.w, f.h);
    tapeBox = f;
    var ctx = f.ctx, w = f.w, h = f.h, i;
    var PADX = 13;                       /* room for the altitude labels */
    var iw = w - PADX;

    /* the decade rules, and only the ones that fit */
    ctx.font = '8px ' + tok('--mono', 'monospace');
    ctx.textBaseline = 'middle';
    [10, 100, 1000].forEach(function (a) {
      if (a > curve.hi) return;
      var x = PADX + tapeX(a) * iw;
      ctx.strokeStyle = EDGE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
      ctx.fillStyle = EDGE;
      ctx.save(); ctx.translate(x - 3, h - 14); ctx.rotate(-Math.PI / 2);
      ctx.fillText(a >= 1000 ? '1k' : String(a), 0, 0); ctx.restore();
    });

    /* the flight, and the part of it already flown */
    var path = new Path2D();
    for (i = 0; i < curve.pts.length; i++) {
      var px = PADX + curve.pts[i][0] * iw, py = curve.pts[i][1] * h;
      if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.stroke(path);

    var flown = new Path2D();
    flown.moveTo(PADX, 0);
    for (i = 0; i < curve.pts.length && curve.pts[i][1] <= cam.p; i++) {
      flown.lineTo(PADX + curve.pts[i][0] * iw, curve.pts[i][1] * h);
    }
    flown.lineTo(PADX, Math.min(1, cam.p) * h);
    flown.closePath();
    ctx.fillStyle = ACCENT; ctx.globalAlpha = 0.13; ctx.fill(flown);
    ctx.globalAlpha = 1;

    /* where the camera actually is — from the camera, not from the curve, so
       that during the lag the index sits where the aeroplane is rather than
       where the scrollbar is */
    var y = Math.min(1, Math.max(0, cam.p)) * h;
    var x = PADX + tapeX(cam.alt) * iw;
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
  }

  /* dragging the tape flies the page. pointer capture, so a drag that leaves
     the 118px rail — which every drag does — keeps controlling it */
  if (tapeCv && !REDUCED) {
    var dragging = false;
    function fly(e) {
      var r = tapeCv.getBoundingClientRect();
      F.goTo((e.clientY - r.top) / Math.max(1, r.height));
    }
    tapeCv.addEventListener('pointerdown', function (e) {
      dragging = true; tapeCv.setPointerCapture(e.pointerId);
      tapeCv.parentElement.classList.add('is-held'); fly(e); e.preventDefault();
    });
    tapeCv.addEventListener('pointermove', function (e) { if (dragging) fly(e); });
    function release(e) {
      if (!dragging) return;
      dragging = false; tapeCv.parentElement.classList.remove('is-held');
      try { tapeCv.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    tapeCv.addEventListener('pointerup', release);
    tapeCv.addEventListener('pointercancel', release);
  }

  /* ── the stations ───────────────────────────────────────────────────────
     The five phases as buttons. This is the plainest possible reading of
     "tied into the controls": the flight has named parts, and the reader can
     go to one. They are real buttons rather than canvas hit regions because
     they are the only part of the rail a keyboard can reach, and the rail
     should not be mouse-only. */
  var stations = [].slice.call(rail.querySelectorAll('[data-station]'));
  stations.forEach(function (b) {
    b.addEventListener('click', function () { F.goTo(parseFloat(b.dataset.station)); });
  });

  function markStation(p) {
    var best = -1, bestD = 1e9;
    stations.forEach(function (b, i) {
      var d = Math.abs(parseFloat(b.dataset.station) - p);
      if (d < bestD) { bestD = d; best = i; }
    });
    stations.forEach(function (b, i) {
      b.classList.toggle('is-at', i === best);
    });
  }

  /* ── ahead ───────────────────────────────────────────────────────────────
     A cut along the bearing, from the column outward, with the camera plotted
     on it. The vertical scale takes in both the terrain and the camera, so
     during the survey the ground compresses to a crust at the bottom and the
     camera sits alone at the top — which is exactly what nine hundred units
     of altitude means and is not otherwise visible anywhere on the page.

     The horizontal span opens with altitude: at five units up you want to see
     the next two hundred, at nine hundred you want the whole range. */
  function ahead(luma, bw, bh, cam, aim) {
    var span = Math.max(260, Math.min(1800, cam.alt * 2.2 + 240));
    var dx = Math.sin(aim.yaw), dz = Math.cos(aim.yaw);
    var sea = F.sea();
    var prof = new Float32Array(bw), x, y, hi = 1;
    for (x = 0; x < bw; x++) {
      prof[x] = W.heightAt(cam.x + dx * ((x + 0.5) / bw) * span,
                           cam.z + dz * ((x + 0.5) / bw) * span);
      if (prof[x] > hi) hi = prof[x];
    }
    var top = Math.max(hi * 1.25, cam.y * 1.12);
    var seaRow = bh - (sea / top) * bh;
    for (x = 0; x < bw; x++) {
      var sur = bh - (prof[x] / top) * bh;
      /* A section is the one drawing where water is genuinely informative
         rather than decorative: it is a level, and a level in a cut is a
         horizontal line with the ground crossing it. Drawn flat and bright
         where it stands above the terrain, so the lakes read as the gaps in
         the profile that they are. */
      var wet = prof[x] < sea;
      for (y = 0; y < bh; y++) {
        var o = y * bw + x;
        if (wet && y >= seaRow - 0.5 && y < sur) {
          luma[o] = y < seaRow + 0.7 ? 0.98 : 0.42;      /* surface, then body */
        } else if (y < sur - 0.5) luma[o] = 0.05;
        else if (y < sur + 0.7) luma[o] = 0.90;
        else luma[o] = (((x + y) & 3) === 0 ? 0.30 : 0.04);
      }
    }
    /* the camera, and the line down to the ground under it */
    var cy = Math.round(bh - (cam.y / top) * bh);
    if (cy >= 0 && cy < bh) {
      for (x = 0; x < 5 && x < bw; x++) luma[cy * bw + x] = 1;
      var gy = Math.round(bh - (cam.ground / top) * bh);
      for (y = cy; y < Math.min(bh, gy); y += 2) luma[y * bw + 1] = 0.62;
    }
  }

  /* ── locator ─────────────────────────────────────────────────────────────
     A shaded plan of the ground under the column, north up, spanning wider
     the higher the camera gets — so it reads as a zoom out rather than as a
     map that happens to be there. The bearing is drawn as a ray, because the
     bearing is the thing the whole descent is aiming at and it is otherwise
     a number in a table. */
  function locator(luma, bw, bh, cam, aim) {
    var span = Math.max(280, Math.min(2600, cam.alt * 2.6 + 300));
    var sea = F.sea();
    var aspect = bh / bw, x, y, o = 0;
    for (y = 0; y < bh; y++) {
      var wz = cam.z + ((y + 0.5) / bh - 0.5) * span * aspect;
      for (x = 0; x < bw; x++, o++) {
        var wx = cam.x + ((x + 0.5) / bw - 0.5) * span;
        var h = W.heightAt(wx, wz);
        /* Water flat and dark on the plan. This is a map, not a render, so it
           gets an even tone rather than a shaded one — and an even tone is
           what makes the lakes legible as shapes at fifty pixels across. */
        luma[o] = h < sea ? 0.13
          : 0.06 + 0.62 * W.shadeAt(wx, wz) * (0.35 + 0.75 * h / 110);
      }
    }
    /* World units per cell come out the same on both axes — the span is
       scaled by the aspect before it is divided by the row count — so the
       bearing is a straight line at its true angle and needs no correction. */
    var cx = bw >> 1, cy = bh >> 1, i;
    var bx = Math.sin(aim.yaw), bz = Math.cos(aim.yaw);
    var reach = Math.min(bw, bh) * 0.5;
    for (i = 3; i < reach; i++) {
      var px = Math.round(cx + bx * i), py = Math.round(cy - bz * i);
      if (px < 0 || px >= bw || py < 0 || py >= bh) break;
      if (i % 3) luma[py * bw + px] = 0.98;
    }
    /* the column */
    for (i = -3; i <= 3; i++) {
      if (Math.abs(i) < 2) continue;
      if (cx + i >= 0 && cx + i < bw) luma[cy * bw + cx + i] = 1;
      if (cy + i >= 0 && cy + i < bh) luma[(cy + i) * bw + cx] = 1;
    }
  }

  /* Clicking the locator moves the column. At the top of the page that is the
     opening pan drifting on to fresh ground; anywhere else it would be the
     world sliding sideways under a camera that is supposed to be over one
     spot, so it is only offered while the flight is still on the deck. */
  var locCv = rail.querySelector('[data-panel=locator]');
  if (locCv && !REDUCED) {
    locCv.addEventListener('click', function () {
      if (F.cam.p > 0.02) F.goTo(0);      /* come back down to it first */
      else F.moveColumn();
    });
  }

  /* ── the frame ───────────────────────────────────────────────────────────
     flight.js calls this with the camera it has just rendered from. The
     plates are throttled: the flight redraws at up to 60fps during a gesture
     and the instruments do not need to, but they must never lag far enough
     behind to disagree with the frame the reader is looking at. Six a second
     is the point where a small drawing stops reading as animated and starts
     reading as stale. */
  var lastPlates = 0;

  /* `aim` is the column while the flight is still on the deck and the chosen
     clearing once one has been found. The instruments do not care which — they
     want the place the flight is pointed at, and that is one object with one
     bearing on it either way. */
  F.onFrame(function (cam, aim) {
    readouts(cam, aim);
    markStation(cam.p);
    drawTape(cam);

    var now = performance.now();
    if (now - lastPlates < 90) return;
    lastPlates = now;
    var a = rail.querySelector('[data-panel=ahead]');
    if (a) plate(a, function (l, w, h) { ahead(l, w, h, cam, aim); });
    if (locCv) plate(locCv, function (l, w, h) { locator(l, w, h, cam, aim); });
  });

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { curve = null; }, 200);
  });
})();
