/* ===========================================================================
   r1b — THE HERO LANDSCAPE

   A terrain generated from Perlin noise at load, flown over slowly, and
   dithered to an indexed palette. Every load is a different landscape.

   ── why voxel-space and not a shader ──────────────────────────────────────
   The alternatives were layered ridgeline silhouettes (cheap, but 2.5D — you
   can pan past it, never over it) and a raymarched SDF in GLSL (beautiful, but
   dithering it cleanly means fighting the interpolation, and it is a lot of
   machinery for one hero).

   Heightfield raycasting — the Comanche / Voxel Space method — fits. For each
   screen column it marches forward from the camera, samples the terrain
   height, projects it, and paints the run of pixels it newly occludes. Real
   ridgelines, real occlusion, real aerial perspective; it renders into a
   coarse buffer so the pixels are countable by construction; and panning is
   just moving the camera.

   ── why the heightmap is precomputed ──────────────────────────────────────
   Six octaves of Perlin at every march step would be ~200k noise evaluations a
   frame. So the noise is baked once into a 384x384 height and shade map and
   the march does bilinear lookups instead.

   The map is a seamless torus: each octave's Perlin lattice wraps at its own
   period, so the camera can fly forever and never meet an edge. It repeats
   after roughly nine minutes, which nobody will sit still for.

   ── the seed ──────────────────────────────────────────────────────────────
   A random 32-bit seed per load shuffles the permutation table, so the terrain
   is different every time. Append ?seed=12345 to reproduce a given one. The
   seed is deliberately not printed anywhere on the page.
   =========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-terrain]');
  if (!host) return;

  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── seed ─────────────────────────────────────────────────────────────── */
  var SEED = parseInt(new URLSearchParams(location.search).get('seed'), 10);
  if (!isFinite(SEED)) SEED = (Math.random() * 0xffffffff) >>> 0;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(SEED);

  /* Drawn before the permutation shuffle so the sun can be placed relative to
     the camera's opening heading. Left to chance, the sun's azimuth was
     independent of the camera's, so roughly half of all loads opened with the
     sun behind the viewer and no glow anywhere in frame — a huge swing in
     quality for something that is supposed to be reliable. */
  var camX = rnd() * 6000, camZ = rnd() * 6000;
  var yaw0 = rnd() * 6.283;

  /* ── Perlin ───────────────────────────────────────────────────────────────
     Improved Perlin noise, with the lattice wrapped at a per-octave period so
     each octave tiles and the whole map is seamless on a torus. */
  var perm = new Uint8Array(512);
  (function () {
    var a = new Uint8Array(256), i, j, t;
    for (i = 0; i < 256; i++) a[i] = i;
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = a[i]; a[i] = a[j]; a[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = a[i & 255];
  })();

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function grad2(h, x, y) {
    switch (h & 7) {
      case 0: return  x + y; case 1: return  x - y;
      case 2: return -x + y; case 3: return -x - y;
      case 4: return  x;     case 5: return -x;
      case 6: return  y;     default: return -y;
    }
  }
  function perlin(x, y, period) {
    var X = Math.floor(x), Y = Math.floor(y);
    var xf = x - X, yf = y - Y;
    var x0 = ((X % period) + period) % period, x1 = (x0 + 1) % period;
    var y0 = ((Y % period) + period) % period, y1 = (y0 + 1) % period;
    var u = fade(xf), v = fade(yf);
    var aa = perm[perm[x0] + y0], ab = perm[perm[x0] + y1];
    var ba = perm[perm[x1] + y0], bb = perm[perm[x1] + y1];
    var g00 = grad2(aa, xf, yf),     g10 = grad2(ba, xf - 1, yf);
    var g01 = grad2(ab, xf, yf - 1), g11 = grad2(bb, xf - 1, yf - 1);
    var nx0 = g00 + u * (g10 - g00);
    var nx1 = g01 + u * (g11 - g01);
    return nx0 + v * (nx1 - nx0);
  }

  /* ── the world ────────────────────────────────────────────────────────── */
  var N = 384;                     /* heightmap resolution */
  var CELL_WORLD = 2.9;            /* world units per map cell */
  var H_AMP = 96;                  /* valley floor to peak, in world units */

  var HEIGHT = new Float32Array(N * N);
  var SHADE  = new Float32Array(N * N);

  /* the sun: low, ahead, and to the left. One vector, used by both the baked
     shading and the sky glow, so the rim light and the glow always agree. */
  var SUN = (function () {
    /* ahead of the camera and off to the RIGHT: the headline occupies the
       left third, so the sun goes opposite it — the same composition r1 uses,
       hot key on one side, near-black type bed on the other */
    var az = yaw0 + 0.36;
    var x = Math.sin(az), z = Math.cos(az), y = 0.44;
    var l = Math.sqrt(x * x + y * y + z * z);
    return { x: x / l, y: y / l, z: z / l };
  })();
  var SUN_H = (function () {
    var l = Math.sqrt(SUN.x * SUN.x + SUN.z * SUN.z);
    return { x: SUN.x / l, z: SUN.z / l };
  })();

  function build() {
    var i, j, u, v, k, f, amp, norm, n, r, h, mask;
    var BASE = 4, OCT = 6;
    for (j = 0; j < N; j++) {
      v = j / N;
      for (i = 0; i < N; i++) {
        u = i / N;
        /* ridged multifractal: 1-|n| creases the noise at every zero crossing,
           which is what produces ridgelines instead of rolling blobs */
        h = 0; amp = 1; norm = 0; f = BASE;
        for (k = 0; k < OCT; k++) {
          n = perlin(u * f, v * f, f);
          r = 1 - Math.abs(n); r *= r;
          h += amp * r; norm += amp;
          amp *= 0.5; f *= 2;
        }
        h = Math.pow(h / norm, 1.7);       /* deepen valleys, keep peaks */
        /* a broad mask, so the world has plains and ranges rather than one
           uniform field of mountains */
        mask = 0.5 + 0.5 * perlin(u * 2, v * 2, 2);
        HEIGHT[j * N + i] = h * (0.26 + 0.94 * mask) * H_AMP;
      }
    }

    for (j = 0; j < N; j++) {
      for (i = 0; i < N; i++) {
        var hL = HEIGHT[j * N + ((i - 1 + N) % N)];
        var hR = HEIGHT[j * N + ((i + 1) % N)];
        var hD = HEIGHT[((j - 1 + N) % N) * N + i];
        var hU = HEIGHT[((j + 1) % N) * N + i];
        var nx = hL - hR, nz = hD - hU, ny = 2 * CELL_WORLD;
        var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var d = (nx * SUN.x + ny * SUN.y + nz * SUN.z) / l;
        SHADE[j * N + i] = d < 0 ? 0 : d;
      }
    }
  }

  function heightAt(wx, wz) {
    var fx = wx / CELL_WORLD, fz = wz / CELL_WORLD;
    var xi = Math.floor(fx), zi = Math.floor(fz);
    var tx = fx - xi, tz = fz - zi;
    var x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N;
    var z0 = ((zi % N) + N) % N, z1 = (z0 + 1) % N;
    var a = HEIGHT[z0 * N + x0], b = HEIGHT[z0 * N + x1];
    var c = HEIGHT[z1 * N + x0], d = HEIGHT[z1 * N + x1];
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  }
  function shadeAt(wx, wz) {
    var x0 = ((Math.floor(wx / CELL_WORLD) % N) + N) % N;
    var z0 = ((Math.floor(wz / CELL_WORLD) % N) + N) % N;
    return SHADE[z0 * N + x0];
  }

  /* ── palette ──────────────────────────────────────────────────────────────
     Eight entries, warm dusk, weighted so the colour arrives late — the same
     shape of ramp as the rest of the page, anchored near #EC4E02 at step 5.
     Eight is also about what an ordered dither carries without banding. */
  var RAMP = [
    [9, 8, 10], [22, 17, 19], [44, 27, 25], [78, 40, 27],
    [124, 58, 26], [180, 88, 26], [228, 134, 46], [252, 210, 148]
  ];
  var STEPS = RAMP.length - 1;
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* ── canvas ───────────────────────────────────────────────────────────── */
  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';
  host.appendChild(cv);
  var ctx = cv.getContext('2d');
  var buf = document.createElement('canvas');
  var bctx = buf.getContext('2d');

  var CELL = 7;                  /* CSS px per rendered cell */
  var bw = 0, bh = 0, img = null, data = null, W = 0, H = 0;

  function size() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bw = Math.max(48, Math.ceil(w / CELL));
    bh = Math.max(32, Math.ceil(h / CELL));
    buf.width = bw; buf.height = bh;
    img = bctx.createImageData(bw, bh);
    data = img.data;
    return true;
  }

  /* ── camera ───────────────────────────────────────────────────────────── */
  var camY = 0, camYset = false;

  var FOV = 0.92;
  /* The horizon sits high in the frame, so the sun's glow — the brightest
     thing the renderer can produce — lives in the upper third and the headline
     band below it stays terrain. Measured before this change: the glow ran
     straight through the h1 box on every seed tested, at 1.04:1. */
  var HORIZON = 0.32;
  var ZFAR = 470, ZNEAR = 1.4;
  var CLEAR = 52;                /* how far above the ground the camera flies */
  var SPEED = 3.4;               /* world units per second */

  /* sky: a vertical ramp plus the sun's glow, placed by the ray's actual world
     direction rather than by screen position, so the glow stays put as the
     camera's yaw drifts */
  function skyLum(y, sunDot) {
    var t = y / bh;
    var base = 0.09 + 0.30 * Math.pow(Math.max(0, 1 - Math.abs(t - HORIZON) / 0.66), 2.4);
    var toSun = Math.max(0, sunDot);
    var glow = Math.pow(Math.max(0, 1 - Math.abs(t - HORIZON) / 0.29), 2.4)
             * Math.pow(toSun, 3.2);
    var v = base + glow * 0.88;
    return v > 1 ? 1 : v;
  }

  function put(o, lum, x, y) {
    var q = Math.round(lum * STEPS + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.469));
    if (q < 0) q = 0; else if (q > STEPS) q = STEPS;
    var c = RAMP[q];
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }

  function render(time) {
    if (!bw) return;

    var yaw = yaw0 + Math.sin(time * 0.041) * 0.20;   /* a slow lazy drift */
    var sinY = Math.sin(yaw), cosY = Math.cos(yaw);

    var ground = heightAt(camX, camZ);
    if (!camYset) { camY = ground + CLEAR; camYset = true; }
    else camY += ((ground + CLEAR) - camY) * 0.02;    /* ease over the ridges */

    var horizonPx = HORIZON * bh;
    var scaleY = bh * 1.05;
    var x, y, z, dz;

    for (x = 0; x < bw; x++) {
      var rx = ((x + 0.5) / bw * 2 - 1) * FOV;
      var dirX = rx * cosY + sinY;
      var dirZ = -rx * sinY + cosY;
      var inv = 1 / Math.sqrt(dirX * dirX + dirZ * dirZ);
      dirX *= inv; dirZ *= inv;
      var sunDot = dirX * SUN_H.x + dirZ * SUN_H.z;

      z = ZNEAR; dz = 0.55;
      var yb = bh;
      while (z < ZFAR && yb > 0) {
        var wx = camX + dirX * z, wz = camZ + dirZ * z;
        var projY = (camY - heightAt(wx, wz)) / z * scaleY + horizonPx;
        var top = projY | 0;
        if (top < yb) {
          if (top < 0) top = 0;
          /* baked sun term, a rim on the sun-facing side, then aerial
             perspective mixing toward the sky as distance grows */
          var sh = shadeAt(wx, wz);
          var lit = 0.05 + 0.70 * sh + 0.26 * Math.pow(sh, 6);
          /* the tops catch more light than the flanks — cheap, and it is what
             makes a ridgeline read as a ridge rather than as a shade boundary */
          var alt = (heightAt(wx, wz) / H_AMP - 0.52) / 0.48;
          if (alt > 0) lit += 0.15 * (alt > 1 ? 1 : alt);
          var haze = 1 - Math.exp(-z * 0.0072);
          haze *= haze;
          for (y = top; y < yb; y++) {
            var lum = lit + (skyLum(y, sunDot) - lit) * haze;
            put((y * bw + x) * 4, lum < 0 ? 0 : lum > 1 ? 1 : lum, x, y);
          }
          yb = top;
        }
        z += dz; dz *= 1.0135;
      }
      /* whatever the terrain never reached is sky */
      for (y = 0; y < yb; y++) put((y * bw + x) * 4, skyLum(y, sunDot), x, y);
    }

    bctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W, H);

    /* bloom: the sun spilling past its own edge, the same move the rest of the
       page makes — it is most of the difference between "lit" and "coloured" */
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.24;
    ctx.filter = 'blur(' + Math.max(6, Math.round(Math.min(W, H) * 0.030)) + 'px)';
    ctx.drawImage(buf, 0, 0, W, H);
    ctx.restore();
  }

  /* ── run ──────────────────────────────────────────────────────────────── */
  build();
  size();

  if (REDUCED) {
    render(0);
  } else {
    var t0 = performance.now(), last = 0, prev = t0, visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; },
        { rootMargin: '10% 0px' }).observe(host);
    }
    (function frame(now) {
      if (now - last > 32) {
        var dt = Math.min(0.1, (now - prev) / 1000);
        prev = now; last = now;
        if (visible) {
          camZ += SPEED * dt;
          camX += SPEED * 0.22 * dt;
          render((now - t0) / 1000);
        }
      }
      requestAnimationFrame(frame);
    })(t0);
  }

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (size() && REDUCED) render(0); }, 160);
  });
})();
