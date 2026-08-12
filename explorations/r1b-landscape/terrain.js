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
  var rnd, camX, camZ, yaw0;

  /* Drawn before the permutation shuffle so the sun can be placed relative to
     the camera's opening heading. Left to chance, the sun's azimuth was
     independent of the camera's, so roughly half of all loads opened with the
     sun behind the viewer and no glow anywhere in frame — a huge swing in
     quality for something that is supposed to be reliable. */
  function reseed(seed) {
    SEED = seed >>> 0;
    rnd = mulberry32(SEED);
    camX = rnd() * 6000; camZ = rnd() * 6000;
    yaw0 = rnd() * 6.283;
    camYset = false;
    shuffle();
  }

  /* ── the tunables ─────────────────────────────────────────────────────────
     Every number in the hero that was arrived at by eye, in one place. Grouped
     by what changing it costs, because that is the thing that decides how the
     panel commits them:

       shape   re-bakes the 384² heightmap — 41ms, so it applies on release
       sun     re-bakes only the shading pass — 1ms, live
       rest    read by the renderer each frame — free

     tune.js is the only thing that writes to this. */
  var P = {
    /* shape */
    amp:        96,     /* valley floor to peak, world units                 */
    ridge:      1.7,    /* >1 deepens valleys and keeps the peaks            */
    octaves:    8,      /* two more than the grid used to hold — see N above */
    baseFreq:   4,      /* how many ranges across the map                    */
    roughness:  0.5,    /* amplitude falloff per octave                      */
    mask:       0.94,   /* plains-to-ranges variation. 0 = mountains everywhere */

    /* ── erosion ──────────────────────────────────────────────────────────
       Ridged multifractal gives creased ridgelines, which is most of why this
       map reads better than plain fBm. What it does not give is *drainage*.
       Every valley in it is a shape noise happened to make, and no water has
       ever been down any of them — so the valleys have no floors, the slopes
       have no concavity, and the ridges wander off on their own instead of
       joining into a network. That is the tell, and no amount of octaves
       fixes it, because it is not a matter of detail.

       So the water is actually run. Fifty thousand droplets are dropped on
       the map, each one picking its way downhill, taking material where it
       is moving fast and dropping it where it slows — the standard particle
       method. What comes out is what water leaves behind: dendritic channel
       networks, V-shaped upper valleys, flats where the sediment settled,
       and ridges that connect because the channels between them do.

       Off by default. This file is shared with r1b, whose look is settled and
       should not move because r1d wanted geology — the same arrangement the
       cast shadow above lives under. r1d turns it on for itself. */
    erode:      0,      /* 0 = none (r1b's original), 1 = a full pass        */
    erodeDrops: 50000,  /* how many droplets. cost is linear in this        */
    erodeLife:  30,     /* steps each one gets before it is abandoned       */
    erodeRadius: 2.4,   /* cells the removal is spread over                 */
    erodeRate:  0.30,   /* how greedily it takes material                   */
    depositRate: 0.30,  /* and how readily it puts it back                  */
    erodeCap:   3.2,    /* how much a fast droplet can carry                */
    erodeInertia: 0.05, /* 0 = follows the gradient exactly, 1 = ignores it */
    evaporate:  0.02,   /* water lost per step. ends the droplet            */
    minSlope:   0.012,  /* stops flat ground giving zero capacity           */

    /* sun */
    sunAz:      0.36,   /* radians off the camera's opening heading          */
    sunY:       0.44,   /* elevation. low is a long rake, high flattens it   */
    /* ── cast shadow ──────────────────────────────────────────────────────
       How much light a point loses when something stands between it and the
       sun. Zero — the default — is the behaviour this file has always had,
       which is no cast shadow at all: `shade` is a clamped normal·sun and
       nothing tests for occlusion, so a slope facing the sun in the lee of a
       peak is lit as though the peak were not there.

       Measured against the current sun, 30.8% of the map should be in shadow
       and none of it is. At 23.8° of elevation a shadow runs 2.27× the height
       of whatever throws it, so a forty-unit ridge should be laying ninety
       units of shade across the valley behind it.

       Left off by default because this file is shared: r1b's look is settled
       and should not move because r1d wanted something. r1d turns it on for
       itself — see the end of flight.js. */
    shadow:     0,      /* 0 = none (r1b's original), 1 = full              */
    shadowSoft: 0.9,    /* world units of penumbra per unit of distance × 100 */

    /* camera */
    fov:        0.92,
    horizon:    0.32,   /* high, so the glow lives above the headline band   */
    clear:      52,     /* how far above the ground it flies                 */
    speed:      3.4,    /* world units per second                            */
    drift:      0.20,   /* how far the lazy yaw wanders                      */
    driftRate:  0.041,
    zfar:       470,
    march:      1.00,   /* × the marching resolution. cost scales with it    */

    /* light */
    skyBase:    0.09,
    skyBand:    0.30,
    glow:       0.88,   /* the sun's spill into the sky                      */
    glowTight:  0.29,   /* how close to the horizon it stays                 */
    glowPow:    3.2,    /* how tightly it hugs the sun's azimuth             */
    litBase:    0.05,
    litGain:    0.70,
    rim:        0.26,   /* the hot edge on the sun-facing flank              */
    altBoost:   0.15,   /* extra light on the tops — what makes a ridge read */
    haze:       0.0072, /* aerial perspective. high buries the distance      */
    bloom:      0.24,
    cell:       3       /* px per cell — the coarseness of the dither        */
  };

  /* ── Perlin ───────────────────────────────────────────────────────────────
     Improved Perlin noise, with the lattice wrapped at a per-octave period so
     each octave tiles and the whole map is seamless on a torus. */
  var perm = new Uint8Array(512);
  function shuffle() {
    var a = new Uint8Array(256), i, j, t;
    for (i = 0; i < 256; i++) a[i] = i;
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = a[i]; a[i] = a[j]; a[j] = t; }
    for (i = 0; i < 512; i++) perm[i] = a[i & 255];
  }

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
  /* ── resolution, and what the landing does to it ──────────────────────────
     384 cells at 2.9 world units carried the hero and the survey perfectly
     well, because from a hundred units up a map cell is a screen cell and the
     grid is invisible. The flight ends six metres off the ground, and there a
     single cell spans fifty to a hundred screen cells: what fills the bottom
     of the frame is the interpolation between four height samples, magnified,
     which reads as smooth rounded lobes sliding under the camera.

     Sampling the same field more finely would not have helped — six octaves
     from `baseFreq` put the smallest real feature at about twelve world units,
     so the surface genuinely has nothing in it below that and a finer grid
     would only have drawn the same smooth shape more accurately. The detail
     has to exist before it can be resolved, so the octave count goes up with
     the grid: two more octaves take the finest feature to about three world
     units, and 1.45 per cell is what it takes to hold them.

     The world keeps its extent — N × CELL_WORLD is unchanged at 1113.6 — so
     the landscape is the same landscape, the same keyframes fly over it, and
     the large octaves are untouched. What is new is only what was missing:
     form at the scale the reader's feet are on. */
  var N = 768;                     /* heightmap resolution */
  var CELL_WORLD = 1.45;           /* world units per map cell */

  var HEIGHT = new Float32Array(N * N);
  var SHADE  = new Float32Array(N * N);
  /* how much water went over each cell during the erosion pass, normalised to
     0..1 at the end. Zero everywhere until something erodes. This is the map
     the rivers are drawn from — see `flowAt`. */
  var FLOW   = new Float32Array(N * N);

  /* the sun: low, ahead, and to the right. One vector, used by both the baked
     shading and the sky glow, so the rim light and the glow always agree.
     Ahead of the camera and off to the RIGHT: the headline occupies the left
     third, so the sun goes opposite it — the same composition r1 uses, hot key
     on one side, near-black type bed on the other. */
  var SUN = { x: 0, y: 1, z: 0 }, SUN_H = { x: 0, z: 1 };

  function aimSun() {
    var az = yaw0 + P.sunAz;
    var x = Math.sin(az), z = Math.cos(az), y = P.sunY;
    var l = Math.sqrt(x * x + y * y + z * z);
    SUN.x = x / l; SUN.y = y / l; SUN.z = z / l;
    var lh = Math.sqrt(SUN.x * SUN.x + SUN.z * SUN.z) || 1;
    SUN_H.x = SUN.x / lh; SUN_H.z = SUN.z / lh;
  }

  /* 41ms. Only the six-octave height pass is in here; the shading is separate
     because moving the sun costs 1ms and should not pay for the noise again. */
  function build() {
    var i, j, u, v, k, f, amp, norm, n, r, h, mask;
    var OCT = P.octaves | 0;
    for (j = 0; j < N; j++) {
      v = j / N;
      for (i = 0; i < N; i++) {
        u = i / N;
        /* ridged multifractal: 1-|n| creases the noise at every zero crossing,
           which is what produces ridgelines instead of rolling blobs */
        h = 0; amp = 1; norm = 0; f = P.baseFreq;
        for (k = 0; k < OCT; k++) {
          n = perlin(u * f, v * f, f);
          r = 1 - Math.abs(n); r *= r;
          h += amp * r; norm += amp;
          amp *= P.roughness; f *= 2;
        }
        h = Math.pow(h / norm, P.ridge);   /* deepen valleys, keep peaks */
        /* a broad mask, so the world has plains and ranges rather than one
           uniform field of mountains */
        mask = 0.5 + 0.5 * perlin(u * 2, v * 2, 2);
        HEIGHT[j * N + i] = h * (0.26 + P.mask * mask) * P.amp;
      }
    }
    if (P.erode > 0) erosion();
    shade();
  }

  /* ── the brush the removal is spread over ─────────────────────────────────
     A droplet that takes its material out of the single cell it happens to be
     standing in digs a one-cell pit, and fifty thousand of them dig fifty
     thousand of them: the map comes out looking sandblasted rather than
     carved. Spreading each bite over a small disc is what turns pits into a
     channel, and it is the one detail that decides whether this reads as
     erosion or as noise. Precomputed once — the weights do not depend on
     where the droplet is, only on the radius. */
  var BRUSH = null, BRUSH_R = -1;
  function brushFor(r) {
    if (BRUSH_R === r) return BRUSH;
    var ri = Math.ceil(r), i, j, ox = [], oz = [], w = [], sum = 0;
    for (j = -ri; j <= ri; j++) {
      for (i = -ri; i <= ri; i++) {
        var d = Math.sqrt(i * i + j * j);
        if (d >= r) continue;
        ox.push(i); oz.push(j); w.push(1 - d / r); sum += 1 - d / r;
      }
    }
    for (i = 0; i < w.length; i++) w[i] /= sum;
    BRUSH = { ox: Int32Array.from(ox), oz: Int32Array.from(oz),
              w: Float32Array.from(w), n: w.length };
    BRUSH_R = r;
    return BRUSH;
  }

  /* ── running the water ────────────────────────────────────────────────────
     One droplet at a time, each carrying a little water and whatever it has
     picked up. At every step it reads the surface under itself, steers down
     the gradient — with a pinch of inertia, so it holds its line through a
     hollow instead of stopping dead in it — and moves one cell.

     Then the only rule that matters: a droplet can carry an amount
     proportional to how fast it is going and how far downhill it just went.
     Over capacity it drops the difference; under it, it takes some more. That
     single asymmetry is what carves — material is lifted off the steep upper
     slopes where the water is quick, and set down where the ground flattens
     and it slows. Valleys get floors, slopes get their concave profile, and
     the flats at the bottom are alluvium rather than untouched noise.

     Going uphill it deposits unconditionally, and that is not a special case
     but the whole reason pits fill: a droplet that runs into a hollow fills
     it until it can leave. Left out, the map ends up covered in closed basins
     the water never gets out of.

     The map is a torus, so there are no edges to handle — a droplet that runs
     off one side arrives on the other, which is exactly what the sampling
     does everywhere else in this file.

     Seeded off the map's own seed rather than the shared generator, so the
     same landscape erodes the same way every time it is built. Dragging a
     slider must not reshuffle the rivers. */
  function erosion() {
    var drops = P.erodeDrops | 0;
    if (drops <= 0) return;

    var b = brushFor(P.erodeRadius);
    var life = P.erodeLife | 0;
    var inertia = P.erodeInertia, cap = P.erodeCap;
    var eRate = P.erodeRate, dRate = P.depositRate;
    var evap = P.evaporate, minS = P.minSlope;
    var rand = mulberry32((SEED ^ 0x9e3779b9) >>> 0);

    FLOW = new Float32Array(N * N);

    /* the range before any of this, so it can be put back afterwards */
    var lo0 = Infinity, hi0 = -Infinity, q;
    for (q = 0; q < HEIGHT.length; q++) {
      if (HEIGHT[q] < lo0) lo0 = HEIGHT[q];
      if (HEIGHT[q] > hi0) hi0 = HEIGHT[q];
    }

    var d, s, k;
    for (d = 0; d < drops; d++) {
      var px = rand() * N, pz = rand() * N;
      var dx = 0, dz = 0, speed = 1, water = 1, sed = 0;

      for (s = 0; s < life; s++) {
        var cx = Math.floor(px), cz = Math.floor(pz);
        var fx = px - cx, fz = pz - cz;
        var x0 = ((cx % N) + N) % N, x1 = (x0 + 1) % N;
        var z0 = ((cz % N) + N) % N, z1 = (z0 + 1) % N;
        var i00 = z0 * N + x0, i10 = z0 * N + x1;
        var i01 = z1 * N + x0, i11 = z1 * N + x1;
        var h00 = HEIGHT[i00], h10 = HEIGHT[i10];
        var h01 = HEIGHT[i01], h11 = HEIGHT[i11];

        /* the surface and its slope under the droplet, from the same four
           corners — one read of the map answers both questions */
        var gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz;
        var gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
        var hOld = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz)
                 + h01 * (1 - fx) * fz      + h11 * fx * fz;

        dx = dx * inertia - gx * (1 - inertia);
        dz = dz * inertia - gz * (1 - inertia);
        var dl = Math.sqrt(dx * dx + dz * dz);
        if (dl < 1e-6) {
          /* dead flat and out of momentum: send it off in some direction
             rather than letting it stand there eroding one spot forever */
          var a = rand() * 6.2832;
          dx = Math.cos(a); dz = Math.sin(a);
        } else { dx /= dl; dz /= dl; }

        px += dx; pz += dz;
        if (px < 0) px += N; else if (px >= N) px -= N;
        if (pz < 0) pz += N; else if (pz >= N) pz -= N;

        var hNew = heightCell(px, pz);
        var dh = hNew - hOld;

        var capacity = Math.max(-dh, minS) * speed * water * cap;

        if (dh > 0 || sed > capacity) {
          /* uphill fills the hollow it just climbed out of; over capacity
             puts back only a share, so deposition trails off rather than
             dumping the whole load in one cell */
          var put = dh > 0 ? Math.min(dh, sed) : (sed - capacity) * dRate;
          sed -= put;
          /* straight onto the four corners it came from — deposition is a
             settling, not a scour, and does not want the brush */
          HEIGHT[i00] += put * (1 - fx) * (1 - fz);
          HEIGHT[i10] += put * fx * (1 - fz);
          HEIGHT[i01] += put * (1 - fx) * fz;
          HEIGHT[i11] += put * fx * fz;
        } else {
          /* never take more than the step dropped, or the droplet digs
             itself a shaft it can never climb out of */
          var take = Math.min((capacity - sed) * eRate, -dh);
          for (k = 0; k < b.n; k++) {
            var bx = ((cx + b.ox[k]) % N + N) % N;
            var bz = ((cz + b.oz[k]) % N + N) % N;
            HEIGHT[bz * N + bx] -= take * b.w[k];
          }
          sed += take;
        }

        speed = Math.sqrt(Math.max(0, speed * speed - dh * 4));
        water *= 1 - evap;
        if (water < 0.01) break;
      }
    }

    /* ── put the range back ───────────────────────────────────────────────
       Erosion is a net removal: the peaks come down, the hollows fill, and
       the map ends up flatter than the amplitude asked for. Everything
       downstream is calibrated against that amplitude — the water table, the
       tree line at `amp × treeLine`, the ceiling the march skips against —
       so rescaling to the range the noise produced keeps every one of those
       numbers meaning what it meant before. The shape is the new one; only
       the height it is drawn at is the old. */
    var lo = Infinity, hi = -Infinity;
    for (q = 0; q < HEIGHT.length; q++) {
      if (HEIGHT[q] < lo) lo = HEIGHT[q];
      if (HEIGHT[q] > hi) hi = HEIGHT[q];
    }
    var span = hi - lo;
    if (span > 1e-6) {
      var g = (hi0 - lo0) / span;
      for (q = 0; q < HEIGHT.length; q++) HEIGHT[q] = lo0 + (HEIGHT[q] - lo) * g;
    }

    accumulate();
  }

  /* ── where the water ends up ──────────────────────────────────────────────
     The first version of this counted droplet visits: every drop added its
     water to each cell it crossed, and the total stood in for drainage. It
     does not. Fifty thousand droplets over thirty steps make one and a half
     million visits across a hundred and forty-seven thousand cells, so what
     that field actually measures is traffic — roughly ten everywhere, a bit
     more in the hollows. Forty per cent of the map came out above any
     threshold that showed a river at all, which is not a river network, it
     is a wet map.

     What a river needs is *drainage area*: how much ground is uphill of this
     point and drains through it. That is a different quantity and it is the
     one that is long-tailed — a trunk valley collects thousands of cells, the
     gully feeding it collects ten — which is precisely why real river
     networks look the way they do, a few big channels and a fractal spray of
     small ones.

     It is also exactly computable in one pass, without iterating: sort the
     cells by height, walk them from the top down, and hand each cell's total
     to its steepest downhill neighbour. Every cell is visited after
     everything that drains into it, so one sweep is enough. A hundred and
     forty-seven thousand cells sorted is a few milliseconds against the two
     hundred the erosion itself costs.

     Diagonals are weighted by their longer step, or the network develops a
     preference for the diagonals — the classic D8 artefact, rivers that run
     at forty-five degrees because that neighbour was fractionally steeper. */
  function accumulate() {
    var n = N * N, i, j, q;
    var acc = new Float32Array(n);
    for (q = 0; q < n; q++) acc[q] = 1;

    /* cells by descending height. A typed array of indices sorted against the
       heightmap — the comparator is the only part of this that costs. */
    var order = new Int32Array(n);
    for (q = 0; q < n; q++) order[q] = q;
    var idx = Array.prototype.slice.call(order);
    idx.sort(function (a, b) { return HEIGHT[b] - HEIGHT[a]; });

    var DX = [-1, 0, 1, -1, 1, -1, 0, 1];
    var DZ = [-1, -1, -1, 0, 0, 1, 1, 1];
    var DD = [1.4142, 1, 1.4142, 1, 1, 1.4142, 1, 1.4142];

    for (q = 0; q < n; q++) {
      var o = idx[q];
      var x = o % N, z = (o / N) | 0;
      var h = HEIGHT[o];
      var best = -1, bestSlope = 0;
      for (i = 0; i < 8; i++) {
        var nx = ((x + DX[i]) % N + N) % N;
        var nz = ((z + DZ[i]) % N + N) % N;
        var no = nz * N + nx;
        var slope = (h - HEIGHT[no]) / DD[i];
        if (slope > bestSlope) { bestSlope = slope; best = no; }
      }
      /* no lower neighbour: a pit, and the water stops there. The erosion's
         uphill-deposit rule has already filled most of them */
      if (best >= 0) acc[best] += acc[o];
    }

    /* Drainage area spans four orders of magnitude, so it is stored as its
       square root normalised against a high quantile. The square root because
       that is how a channel actually widens with the area behind it, which
       makes this field directly usable as a width; the quantile rather than
       the maximum because one exceptional trunk valley would otherwise take
       the whole range and leave every other watercourse rounding to nothing. */
    var roots = new Float32Array(n);
    for (q = 0; q < n; q++) roots[q] = Math.sqrt(acc[q]);
    var sorted = Float32Array.from(roots).sort();
    var ref = sorted[Math.floor(n * 0.999)] || 1;
    for (q = 0; q < n; q++) {
      var f = roots[q] / ref;
      FLOW[q] = f > 1 ? 1 : f;
    }
  }

  /* height at a fractional cell position, wrapped. The erosion's own sampler:
     it works in cell space, where the droplet lives, rather than world space. */
  function heightCell(px, pz) {
    var cx = Math.floor(px), cz = Math.floor(pz);
    var fx = px - cx, fz = pz - cz;
    var x0 = ((cx % N) + N) % N, x1 = (x0 + 1) % N;
    var z0 = ((cz % N) + N) % N, z1 = (z0 + 1) % N;
    var a = HEIGHT[z0 * N + x0], b2 = HEIGHT[z0 * N + x1];
    var c = HEIGHT[z1 * N + x0], e = HEIGHT[z1 * N + x1];
    return a * (1 - fx) * (1 - fz) + b2 * fx * (1 - fz)
         + c * (1 - fx) * fz       + e * fx * fz;
  }

  function shade() {
    aimSun();
    var i, j;
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
    if (P.shadow > 0) castShadow();
  }

  /* ── the shadow one thing throws on another ───────────────────────────────
     Everything above is orientation: a face turned away from the sun goes
     dark. What it has never done is ask whether anything *stands between* a
     point and the light, which is the difference between shading and a shadow,
     and the thing a low sun is almost entirely made of.

     The obvious way to answer it — march from every cell toward the sun — was
     measured at 151ms against a 33ms rebuild, which is too slow to sit behind
     a button. It is also unnecessary. The sun is one direction, so the answer
     can be swept rather than searched: walk each line of the map *downwind* of
     the light carrying the top of the shadow being thrown, drop it by the
     sun's gradient at every step, and raise it to meet any ground that pokes
     through. A cell is in shadow when the carried line is above it. One
     comparison per cell, no marching, and it is exact.

     Two details that matter. The walk starts a shadow's reach before the first
     cell it records, because the map wraps and a line has to arrive already
     carrying whatever is upwind of it. And the shadow edge is softened over a
     distance proportional to how far the caster is, which is what a real
     penumbra does — a crisp edge at four hundred units is the giveaway of a
     shadow map, and softening it also hides the heightmap's own resolution. */
  function castShadow() {
    var sh = Math.sqrt(SUN.x * SUN.x + SUN.z * SUN.z) || 1e-6;
    var sx = SUN.x / sh, sz = SUN.z / sh;   /* horizontal, toward the sun     */
    var rise = SUN.y / sh;                  /* height gained per unit walked  */
    if (rise > 40) return;                  /* sun overhead: nothing to cast  */

    /* how far a shadow can possibly reach, in cells */
    var amp = P.amp * 1.05;
    var reach = Math.ceil(amp / rise / CELL_WORLD) + 2;

    /* step along the dominant axis so the walk never skips a cell */
    var majX = Math.abs(sx) >= Math.abs(sz);
    var ux = majX ? -Math.sign(sx) : -sx / Math.abs(sz);
    var uz = majX ? -sz / Math.abs(sx) : -Math.sign(sz);
    var stepW = Math.sqrt(ux * ux + uz * uz) * CELL_WORLD;
    var drop = rise * stepW;                /* the shadow line falls this far */
    var soft = P.shadowSoft * 0.01;

    var lines = N, total = N + reach, k, s, top, hgt, x, z, ix, iz, o;
    for (k = 0; k < lines; k++) {
      /* start a shadow's reach upwind so the line arrives already loaded */
      if (majX) { x = -reach * ux;     z = k - reach * uz; }
      else      { x = k - reach * ux; z = -reach * uz;     }
      top = -1e9;
      for (s = 0; s < total; s++) {
        ix = ((Math.round(x) % N) + N) % N;
        iz = ((Math.round(z) % N) + N) % N;
        hgt = HEIGHT[iz * N + ix];
        top -= drop;
        if (hgt > top) top = hgt;
        else if (s >= reach) {
          /* how deep under the shadow line it sits, softened with distance
             so near edges stay crisp and far ones do not */
          o = iz * N + ix;
          var deep = (top - hgt) / (amp * soft + 1e-6);
          if (deep > 1) deep = 1;
          SHADE[o] *= 1 - P.shadow * deep;
        }
        x += ux; z += uz;
      }
    }
  }

  /* Both samplers interpolate with smoothstepped weights rather than raw
     linear ones. At 3px cells a map cell covers a lot of near-field screen, and
     plain bilinear showed its facet creases as visible flat plates in the
     foreground. Smoothstepping the weights costs two multiplies and removes
     them, because the surface stops being piecewise-planar. */
  function heightAt(wx, wz) {
    var fx = wx / CELL_WORLD, fz = wz / CELL_WORLD;
    var xi = Math.floor(fx), zi = Math.floor(fz);
    var tx = fx - xi, tz = fz - zi;
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
    var x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N;
    var z0 = ((zi % N) + N) % N, z1 = (z0 + 1) % N;
    var a = HEIGHT[z0 * N + x0], b = HEIGHT[z0 * N + x1];
    var c = HEIGHT[z1 * N + x0], d = HEIGHT[z1 * N + x1];
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  }
  /* was nearest-neighbour, which drew the shading in hard rectangular blocks
     wherever one map cell spanned more than a few pixels */
  function shadeAt(wx, wz) {
    var fx = wx / CELL_WORLD, fz = wz / CELL_WORLD;
    var xi = Math.floor(fx), zi = Math.floor(fz);
    var tx = fx - xi, tz = fz - zi;
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
    var x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N;
    var z0 = ((zi % N) + N) % N, z1 = (z0 + 1) % N;
    var a = SHADE[z0 * N + x0], b = SHADE[z0 * N + x1];
    var c = SHADE[z1 * N + x0], d = SHADE[z1 * N + x1];
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  }
  /* How much water came down here, 0..1, from the erosion pass — zero
     everywhere if nothing eroded. Sampled exactly as the other two are: three
     maps read three different ways disagree at the seams, and this one is
     going to be compared against the height at the same point. */
  function flowAt(wx, wz) {
    var fx = wx / CELL_WORLD, fz = wz / CELL_WORLD;
    var xi = Math.floor(fx), zi = Math.floor(fz);
    var tx = fx - xi, tz = fz - zi;
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
    var x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N;
    var z0 = ((zi % N) + N) % N, z1 = (z0 + 1) % N;
    var a = FLOW[z0 * N + x0], b = FLOW[z0 * N + x1];
    var c = FLOW[z1 * N + x0], d = FLOW[z1 * N + x1];
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  }

  /* ── palette ──────────────────────────────────────────────────────────────
     Eight entries, warm dusk, weighted so the colour arrives late — the same
     shape of ramp as the rest of the page, anchored near #EC4E02 at step 5.
     Eight is also about what an ordered dither carries without banding. */
  var RAMP = SCREEN.RAMP.dusk;
  var STEPS = RAMP.length - 1;
  /* the same threshold table the rest of the page screens through */
  var BAYER = SCREEN.BAYER;

  /* ── canvas ───────────────────────────────────────────────────────────── */
  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block';
  host.appendChild(cv);
  var ctx = cv.getContext('2d');
  var buf = document.createElement('canvas');
  var bctx = buf.getContext('2d');

  /* CSS px per rendered cell. 7 was far too coarse — it read as a low-res
     mosaic rather than as a screened image, and the ridgelines lost their
     shape to it. 3 is close to what the paper-design Dithering shader gives at
     u_pxSize 2, which is the fineness this is meant to match: still visibly
     dithered, but with enough resolution for the terrain to be legible. */
  var MAX_CELLS = 172000;   /* ~5.9ms a frame, measured */
  var bw = 0, bh = 0, img = null, data = null, W = 0, H = 0;

  function size() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* Cost scales with the buffer, and the buffer scales with the viewport, so
       an ultrawide display would otherwise pay several times what a laptop
       does for the same picture. Past the budget the cells grow instead —
       coarser on a 34" monitor, which is where you are least likely to notice,
       rather than a hero that stutters there. */
    var cell = P.cell;
    var cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    if (cols * rows > MAX_CELLS) {
      cell = Math.ceil(cell * Math.sqrt(cols * rows / MAX_CELLS));
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
    }
    bw = Math.max(48, cols);
    bh = Math.max(32, rows);
    buf.width = bw; buf.height = bh;
    img = bctx.createImageData(bw, bh);
    data = img.data;
    return true;
  }

  /* ── camera ───────────────────────────────────────────────────────────── */
  var camY = 0, camYset = false;
  var ZNEAR = 1.4;

  /* Sky parameters are copied into locals once a frame rather than read from P
     per pixel. skyLum runs on every cell of the buffer — up to 172,000 of them
     — and six property lookups in there is a million a frame for nothing.

     The horizon sits high in the frame, so the sun's glow, the brightest thing
     the renderer can produce, lives in the upper third and the headline band
     below it stays terrain. Measured before that change: the glow ran straight
     through the h1 box on every seed tested, at 1.04:1. */
  var _hz = 0.32, _skyBase = 0.09, _skyBand = 0.30, _glow = 0.88, _glowTight = 0.29, _glowPow = 3.2;

  function syncSky() {
    _hz = P.horizon; _skyBase = P.skyBase; _skyBand = P.skyBand;
    _glow = P.glow; _glowTight = P.glowTight; _glowPow = P.glowPow;
  }

  /* sky: a vertical ramp plus the sun's glow, placed by the ray's actual world
     direction rather than by screen position, so the glow stays put as the
     camera's yaw drifts */
  function skyLum(y, sunDot) {
    var t = y / bh;
    var base = _skyBase + _skyBand * Math.pow(Math.max(0, 1 - Math.abs(t - _hz) / 0.66), 2.4);
    var toSun = Math.max(0, sunDot);
    var glow = Math.pow(Math.max(0, 1 - Math.abs(t - _hz) / _glowTight), 2.4)
             * Math.pow(toSun, _glowPow);
    var v = base + glow * _glow;
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
    syncSky();
    lastTime = time;

    /* hoisted for the same reason as the sky terms — these are read inside the
       per-column march and the per-pixel fill */
    var CLEAR = P.clear, ZFAR = P.zfar, FOV = P.fov;
    var litBase = P.litBase, litGain = P.litGain, rimGain = P.rim;
    var altBoost = P.altBoost, hazeK = P.haze, amp = P.amp;
    var step = 0.34 / P.march, grow = 1 + 0.0115 / P.march;

    var yaw = yaw0 + Math.sin(time * P.driftRate) * P.drift;   /* a lazy drift */
    var sinY = Math.sin(yaw), cosY = Math.cos(yaw);

    var ground = heightAt(camX, camZ);
    if (!camYset) { camY = ground + CLEAR; camYset = true; }
    else camY += ((ground + CLEAR) - camY) * 0.02;    /* ease over the ridges */

    var horizonPx = P.horizon * bh;
    var scaleY = bh * 1.05;
    var x, y, z, dz;

    for (x = 0; x < bw; x++) {
      var rx = ((x + 0.5) / bw * 2 - 1) * FOV;
      var dirX = rx * cosY + sinY;
      var dirZ = -rx * sinY + cosY;
      var inv = 1 / Math.sqrt(dirX * dirX + dirZ * dirZ);
      dirX *= inv; dirZ *= inv;
      var sunDot = dirX * SUN_H.x + dirZ * SUN_H.z;

      z = ZNEAR; dz = step;
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
          var lit = litBase + litGain * sh + rimGain * Math.pow(sh, 6);
          /* the tops catch more light than the flanks — cheap, and it is what
             makes a ridgeline read as a ridge rather than as a shade boundary */
          var alt = (heightAt(wx, wz) / amp - 0.52) / 0.48;
          if (alt > 0) lit += altBoost * (alt > 1 ? 1 : alt);
          var haze = 1 - Math.exp(-z * hazeK);
          haze *= haze;
          for (y = top; y < yb; y++) {
            var lum = lit + (skyLum(y, sunDot) - lit) * haze;
            put((y * bw + x) * 4, lum < 0 ? 0 : lum > 1 ? 1 : lum, x, y);
          }
          yb = top;
        }
        z += dz; dz *= grow;
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
    ctx.globalAlpha = P.bloom;
    ctx.filter = 'blur(' + Math.max(6, Math.round(Math.min(W, H) * 0.030)) + 'px)';
    ctx.drawImage(buf, 0, 0, W, H);
    ctx.restore();
  }

  /* ── run ──────────────────────────────────────────────────────────────── */
  var lastTime = 0;

  reseed(SEED);
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
          camZ += P.speed * dt;
          camX += P.speed * 0.22 * dt;
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

  /* ── the tuning surface ───────────────────────────────────────────────────
     Same arrangement as the sign-off: the numbers are published, tune.js reads
     them, and nothing on the page depends on any of this existing. The three
     commit levels are the three costs — 41ms to re-bake the noise, 1ms to
     re-bake the shading, free to re-read a number next frame. */
  window.TERRAIN = {
    params: P,
    defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
    build: function () { build(); this.draw(); },      /* shape changed  */
    shade: function () { shade(); this.draw(); },      /* sun moved      */
    resize: function () { size(); this.draw(); },      /* cell changed   */
    draw: function () { render(lastTime); },
    regen: function () {
      reseed((Math.random() * 0xffffffff) >>> 0);
      build();
      this.draw();
    },
    info: function () { return bw + '×' + bh + ' cells · seed ' + SEED; },

    /* The world itself, published read-only. The r1c showcases survey this
       same heightmap rather than generating one of their own — which is the
       whole point of that experiment: the map in the middle of the page is a
       map *of the terrain the hero is flying over*, not a picture that happens
       to also be terrain. Costs nothing to offer and nothing on this page
       reads it. */
    world: {
      heightAt: heightAt,
      shadeAt: shadeAt,
      flowAt: flowAt,
      size: N,
      cellWorld: CELL_WORLD,
      sun: SUN,
      camera: function () { return { x: camX, z: camZ, y: camY, yaw: yaw0 }; }
    }
  };
})();
