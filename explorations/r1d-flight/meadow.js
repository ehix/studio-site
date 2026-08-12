/* ===========================================================================
   r1d — THE MEADOW

   Grass on the actual landscape, which is three separate problems wearing one
   word:

     cover   where it grows. A baked 384² map, the same resolution and the
             same wrapping as the height and shade maps, masked by slope,
             altitude and the waterline. This is what turns one uniform
             material into a place — green valleys, bare tops, lush
             shorelines.
     grain   what it looks like at a distance. Per-pixel value noise in world
             space, faded out as its period drops below the size of a screen
             cell, because detail finer than a pixel is not detail, it is
             noise that crawls the moment the camera moves.
     trees   what stands on it. Real world-anchored geometry, projected and
             drawn into the same luminance buffer as everything else,
             depth-tested against the terrain the marcher already found — and
             therefore able to break a ridgeline against the sky, which is the
             thing shading alone can never do.

   ── why none of grass.js could be reused ──────────────────────────────────
   That file is the sign-off, and it is screen-space by construction: its
   blades are rooted at fractions of frame height and its three "distances"
   are three sets of hand-tuned lengths and weights rather than three actual
   distances. It draws a beautiful flat field and cannot be told where the
   ground is. Nothing in it survives contact with a camera that pitches.

   What is shared is the weather. `GRASS.noise` is the gust field the sign-off
   already moves to, and both the grain and the trees here sample the same
   one — two noise fields at similar frequencies read as two weathers in one
   place, which is worse than no weather at all.
   =========================================================================== */
var MEADOW = (function () {
  'use strict';

  var P = {
    /* where it grows */
    slopeBare:  0.62,  /* gradient at which rock takes over               */
    slopeSoft:  0.30,  /* how wide that transition is                     */
    treeLine:   0.62,  /* × terrain amplitude. above this, bare           */
    treeSoft:   0.26,
    shoreLift:  0.55,  /* extra cover along the waterline                 */
    shoreBand:  14,    /* how far up from the water it reaches, world units */
    patchScale: 0.045, /* the low frequency that breaks up the boundary   */
    patchDepth: 0.42,

    /* what it looks like */
    albedo:     0.80,  /* grass against rock at 1.0. lower reads softer   */
    grain:      0.30,  /* how hard the fine texture bites                 */
    grainScale: 1.35,  /* world units per cycle of the fine texture       */
    clumpScale: 7.0,   /* and of the coarse one under it                  */
    clump:      0.45,  /* the coarse one's share of the grain             */

    /* ── bare rock ───────────────────────────────────────────────────────
       Finer than the grass and harder, because that is the difference
       between a meadow and a broken face. `1 - cover` is what it rides on,
       which is a free slope term: the cover map is already zero on steep
       ground by construction, so rock texture appears exactly where rock is. */
    rock:       0.26,  /* how hard the rock texture bites                 */
    rockScale:  0.62,  /* world units per cycle of the fine break         */
    rockClumpScale: 3.4,/* and of the coarse one under it                 */
    rockClump:  0.55,  /* the coarse one's share                          */
    windScale:  48,    /* world units per cycle of the gust the trees feel */

    /* near-field relief — light, not geometry. See `relief` */
    relief:     2.6,   /* how hard the small form is lit                   */
    reliefScale: 2.4,  /* world units per cycle of the fine octave         */
    reliefStep:  3.6,  /* × that, for the coarse one                       */
    reliefCoarse: 0.85,/* how much the coarse octave counts                */
    reliefFar:  160,   /* world units. past this it is not the near field  */


    /* ── weather on the ground ───────────────────────────────────────────
       Cloud shadow, and the numbers are the whole story. The first version
       of this rode along inside the grain at a 48-unit period travelling 26
       units a second — a full light-and-dark cycle every 1.8 seconds. The
       page redraws about four times a second once the camera has settled, so
       that arrived as roughly seven frames per cycle: not weather, a strobe.

       A cloud shadow is hundreds of metres across and crosses at walking
       pace. At 340 units and 2.6 a second one cycle takes just over two
       minutes, which is smooth at *any* refresh rate — and that is what
       makes it cheap as well as calm, because it no longer needs frames
       spent on it to look continuous. Slowing it down was the optimisation. */
    cloudScale: 240,   /* world units per cycle, across the wind          */
    cloudStretch: 2.8, /* × that, along it. see `cloud`                   */
    /* At 2.6 a cloud took ninety-two seconds to travel its own width, which
       is not slow weather, it is still weather. This crosses one in about
       thirty — a drift you can see without it becoming something moving in
       the corner of the eye while somebody is trying to read. `idle` in
       flight.js is the other half of this number: see the note there. */
    cloudRate:  8.0,   /* world units a second                            */
    cloudDepth: 0.42,  /* how far it pulls the sun down                   */
    cloudCover: 0.38,  /* threshold. high = fewer, more separate shadows  */
    cloudEdge:  0.30,  /* how soft their edges are                        */

    /* ── standing growth ─────────────────────────────────────────────────
       These were blades, and blades were an arithmetic error. The terrain is
       96 world units from valley floor to peak, and it is drawn with
       ridgelines and aerial haze, so the eye reads it as a range — kilometres.
       Put a three-quarter-unit blade of grass at the foot of that and the
       range silently becomes a hundred-metre hill with waist-high grass on
       it. Everything looked oversized because it *was*: the vegetation was
       telling the truth about the scale and the landscape was not.

       Trees settle it in the vegetation's favour. Three units against a
       ninety-six unit range is about a thirtieth, which is what a conifer
       against a real ridge actually measures, and it puts the landing eye at
       five and a half units just above the canopy rather than lost in a lawn.
       Nothing about the terrain changed. It simply stopped being contradicted. */
    treeFrom:  200,    /* altitude at which trees start to appear          */
    treeReach: 320,    /* how far out they are sown, world units          */
    treeStep:  3.40,   /* the lattice they are sown on                    */
    treeThin:   34,    /* distance at which they start being thinned out  */
    treeH:     3.20,   /* mean height, world units                        */
    treeWidth: 0.36,   /* canopy half-width, × height                     */
    treeSway:  0.10,   /* × how far the gust leans them                   */
    glade:      42,    /* trees kept this far back from the landing       */
    /* Crown and skirt are separate because a conifer is not a flat colour:
       the top catches the sun and the underside is the darkest thing in the
       frame. That contrast is most of what makes a silhouette read. */
    treeCrown: 0.52,   /* brightness at the top                           */
    treeSkirt: 0.26,   /* × that, at the bottom                           */
    treeSun:   0.72,   /* how much the terrain's own shading counts       */
    treeTone:  1.00,   /* × the lot of it                                 */
    treeModel: 0.44,   /* the lit side against the shaded side            */
    treeBroad: 0.30,   /* what fraction of them are not conifers          */
    treeTiers:  3,     /* whorls in a conifer silhouette                  */
    treeCast:  0.55,   /* how dark the shadow one throws                  */
    treeCastMin: 7,    /* screen cells of height below which it throws none */
    treeAir:   1.00,   /* how much aerial perspective they take. 0 = none    */
    treeBias:  3.00,   /* depth-test slack, × what one screen row covers     */
    treeBiasMax: 6.0   /* world units. the most that slack is allowed to be  */
  };

  /* ── the cover map ────────────────────────────────────────────────────────
     Baked rather than evaluated, for exactly the reason terrain.js bakes its
     heightmap: the mask needs four height lookups and a noise call to work out
     one value, and doing that per pixel would cost more than the terrain
     shading it is modulating. At 384² it is a bilinear lookup instead — the
     same cost as `shadeAt`, which is to say almost none.

     The resolution is a deliberate match. A cover map finer than the heightmap
     would be describing vegetation growing on slopes the terrain does not
     have. */
  var N = 0, CW = 1, COVER = null, W = null, bakedStamp = NaN;

  /* value noise. Cheaper than simplex — measured at three quarters the cost —
     and for a texture that exists to be dithered into an eight-entry palette,
     the difference in quality between them does not survive the screening. */
  function hash(a, b) {
    var n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var fx = x - xi, fz = z - zi;
    var u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = hash(xi, zi), b = hash(xi + 1, zi);
    var c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    var top = a + (b - a) * u, bot = c + (d - c) * u;
    return top + (bot - top) * v;
  }

  function bake(world, amp, sea, stamp) {
    W = world; N = world.size; CW = world.cellWorld;
    COVER = new Float32Array(N * N);
    var tree = amp * P.treeLine, soft = amp * P.treeSoft;
    var x, z;
    for (z = 0; z < N; z++) {
      for (x = 0; x < N; x++) {
        var wx = x * CW, wz = z * CW;
        var h = W.heightAt(wx, wz);
        var c;
        if (h < sea) { COVER[z * N + x] = 0; continue; }   /* under the lake */

        /* slope, from the same central difference the shading normal uses */
        var gx = (W.heightAt(wx + CW, wz) - W.heightAt(wx - CW, wz)) / (2 * CW);
        var gz = (W.heightAt(wx, wz + CW) - W.heightAt(wx, wz - CW)) / (2 * CW);
        var grad = Math.sqrt(gx * gx + gz * gz);

        c = 1 - smooth01((grad - P.slopeBare) / P.slopeSoft);
        c *= 1 - smooth01((h - tree) / soft);

        /* the waterline. Ground just above a lake is the lushest thing on a
           real map and it is the one place the eye checks. */
        var up = h - sea;
        if (up < P.shoreBand) c += P.shoreLift * (1 - up / P.shoreBand) * (1 - c);

        /* break the boundary up, or the tree line is a contour line */
        var patch = vnoise(wx * P.patchScale, wz * P.patchScale);
        c *= 1 - P.patchDepth * (1 - patch);

        COVER[z * N + x] = c < 0 ? 0 : c > 1 ? 1 : c;
      }
    }
    bakedStamp = stamp;
  }

  function smooth01(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  /* Keyed on the terrain's fingerprint, not on its settings — see
     `terrainStamp` in flight.js. Asking whether the amplitude had changed said
     "no" to a whole new landscape generated at the same amplitude, and the
     trees went on being sown by the old map's slopes and shorelines. */
  function stale(stamp) { return !COVER || stamp !== bakedStamp; }

  /* the same wrapped bilinear as heightAt and shadeAt, deliberately — three
     maps sampled three different ways would disagree at the seams */
  function coverAt(wx, wz) {
    var fx = wx / CW, fz = wz / CW;
    var xi = Math.floor(fx), zi = Math.floor(fz);
    var tx = fx - xi, tz = fz - zi;
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
    var x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N;
    var z0 = ((zi % N) + N) % N, z1 = (z0 + 1) % N;
    var a = COVER[z0 * N + x0], b = COVER[z0 * N + x1];
    var c = COVER[z1 * N + x0], d = COVER[z1 * N + x1];
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  }

  /* ── the form the heightmap cannot hold ───────────────────────────────────
     The map is 384² at 2.9 world units a cell, smoothstep-interpolated. That
     is the finest thing the terrain can describe, and at the landing the
     camera is five metres up: one map cell covers about twenty-eight screen
     cells down there, so the ground within thirty units of the reader is a
     single interpolated patch with no geometry in it whatsoever. It is the
     flattest thing in the frame and it is the last thing the page shows.

     The obvious repair is to displace the surface — add a couple of octaves
     to the height in the near field. It does almost nothing, and the reason
     is worth writing down because it is not obvious: the lighting on this
     page does not come from the surface. It comes from `shadeAt`, a map baked
     once from the heightmap, and a marcher that finds a displaced surface
     still looks its shading up in a table that knows nothing about the
     displacement. The bumps would be lit exactly as though they were flat.
     All that work would show up in silhouette and nowhere else.

     So what is added is the light, not the geometry. A slope tilted toward
     the sun is brighter and one tilted away is darker, and that difference —
     not the height — is the entire visual content of small relief. Take the
     gradient of a noise field, dot it with the sun, and the ground has form.
     No marcher change, no ceiling to invalidate, no cover map to re-bake.

     Faded out with distance on exactly the terms `grain` uses, and for
     exactly the same reason: once a period drops below about two screen
     cells it is detail the buffer cannot hold, and leaving it in makes the
     hillside boil the moment the camera moves. It is also multiplied by the
     key light, because a bump in shadow has no lit side and no dark side —
     unlit relief is the giveaway of a normal map applied without thinking. */
  function relief(px, pz, foot, range, sunX, sunZ) {
    /* ── the near field, and meaning it ────────────────────────────────────
       The Nyquist fade alone is not a distance limit. One screen cell is
       about 0.003 world units per unit of range here, so the coarse octave
       does not reach its own limit until three thousand units out — which is
       to say the fade was letting this run on every ground pixel in the
       frame, and it cost nine and a half milliseconds of a fifty-one
       millisecond hero to do it.

       This exists to put form under the reader's feet at the landing, where
       one map cell covers twenty-eight screen cells. Past a hundred and sixty
       units the heightmap and the grain are carrying the ground perfectly
       well and there is nothing for it to add, so it stops — which costs one
       comparison on the pixels that skip it and takes the whole feature down
       to under two milliseconds. */
    if (range >= P.reliefFar) return 0;
    var near = 1 - smooth01((range - P.reliefFar * 0.45) / (P.reliefFar * 0.55));
    if (near <= 0) return 0;

    var s = P.reliefScale;
    if (foot >= s * P.reliefStep) return 0;

    var v = 0, i, sc, fade, e, gx, gz, w;
    for (i = 0; i < 2; i++) {
      sc = i === 0 ? s : s * P.reliefStep;
      fade = 1 - smooth01(foot / (sc * 0.5) - 1);
      if (fade <= 0) continue;
      e = sc * 0.28;
      gx = vnoise((px + e) / sc, pz / sc) - vnoise((px - e) / sc, pz / sc);
      gz = vnoise(px / sc, (pz + e) / sc) - vnoise(px / sc, (pz - e) / sc);
      w = (i === 0 ? 1 : P.reliefCoarse) * fade;
      v -= (gx * sunX + gz * sunZ) * w;
    }
    return v * P.relief * near;
  }

  /* ── the grain ────────────────────────────────────────────────────────────
     Two octaves, and a fade that is the whole reason this does not shimmer.

     `foot` is the world-space width of one screen cell at the distance being
     shaded. When the grain's period drops below about two of those, it is
     detail the buffer cannot hold: leave it in and every camera movement makes
     the hillside boil, which is the classic way procedural ground texture
     announces itself as fake. So each octave is faded out as it approaches its
     own Nyquist limit and the far hills go smooth on their own — which is also
     what distance does to real grass.

     The weather used to be a third term in here and is not any more. It is a
     different phenomenon at a different scale — see `cloud` — and mixing the
     two meant cloud shadow could only fall on vegetation, which is not how
     shadow works. */
  function grain(px, pz, foot) {
    /* Nothing to draw once both octaves are past their limit, which is most
       of the frame whenever the camera is high. Worth an early return rather
       than two noise calls that are about to be multiplied by zero. */
    if (foot >= P.clumpScale * 0.5 * 2) return 0;

    var g = 0, w = 0;

    var fadeA = 1 - smooth01(foot / (P.grainScale * 0.5) - 1);
    if (fadeA > 0) {
      g += vnoise(px / P.grainScale, pz / P.grainScale) * fadeA;
      w += fadeA;
    }
    var fadeB = 1 - smooth01(foot / (P.clumpScale * 0.5) - 1);
    if (fadeB > 0) {
      g += vnoise(px / P.clumpScale, pz / P.clumpScale) * P.clump * fadeB;
      w += P.clump * fadeB;
    }
    if (w <= 0) return 0;
    return (g / w - 0.5) * P.grain;
  }

  /* ── the rock ─────────────────────────────────────────────────────────────
     The same idea as the grain, pointed at the other material, and it exists
     because of an arithmetic limit rather than a taste.

     The heightmap is 384 cells across a 1114-unit torus, so one cell is 2.9
     world units. Standing at the landing, five and a half units up, the ground
     the reader is looking at is ten to sixty units away — and measured there,
     one heightmap cell covers a median of twenty-eight *render* cells, up to
     forty-six. Every hillside in the near field is one bilinear ramp between
     two samples, stretched across a third of the frame. That is the whole of
     why it goes smooth close up, and no amount of shading recovers a shape the
     map does not carry: it is a Nyquist limit, not a lighting problem.

     What shading *can* do is stop the surface reading as a poured material.
     Real rock at ten metres is not smooth, it is broken — and a broken surface
     is mostly a value texture, which on an eight-level dither is most of what
     survives anyway. So the same two-octave, footprint-faded noise the grass
     uses is applied to bare ground at rock scales, which are finer and bite
     harder.

     It costs nothing where it cannot be seen. The fade means the early return
     fires for everything past about seven units of footprint, which at the
     landing is most of the frame and at any altitude is nearly all of it. */
  function rock(px, pz, foot) {
    if (foot >= P.rockClumpScale * 0.5 * 2) return 0;

    var g = 0, w = 0;

    var fadeA = 1 - smooth01(foot / (P.rockScale * 0.5) - 1);
    if (fadeA > 0) {
      g += vnoise(px / P.rockScale, pz / P.rockScale) * fadeA;
      w += fadeA;
    }
    var fadeB = 1 - smooth01(foot / (P.rockClumpScale * 0.5) - 1);
    if (fadeB > 0) {
      g += vnoise(px / P.rockClumpScale + 41.7, pz / P.rockClumpScale + 13.3)
           * P.rockClump * fadeB;
      w += P.rockClump * fadeB;
    }
    if (w <= 0) return 0;
    return (g / w - 0.5) * P.rock;
  }

  /* ── cloud shadow ─────────────────────────────────────────────────────────
     Returns how much of the direct sun is blocked, 0 to 1, so the caller can
     take it out of the key and leave the ambient alone. That is the whole
     trick to making it read as cloud rather than as a stain: a shadow removes
     the sun and nothing else, so ground already in the shade of a ridge
     barely changes, and it is the sunlit slopes that go dark as one passes
     over. Ground in shadow going darker still is what dirt looks like.

     One octave, thresholded. The threshold is what gives distinct shadows
     with clear sky between them instead of an even mottle — cloud cover is
     patchy by nature, and a smooth noise field mapped straight to brightness
     reads as haze. */
  /* ── stretched along the wind ─────────────────────────────────────────────
     Round clouds are a noise function's idea of weather. Real cloud at this
     scale is organised by the wind that is carrying it: it comes in streets,
     drawn out along the direction of travel and narrow across it, which is
     why the word for what you see from above is *wisps* and not blobs.

     One divisor, and it earns twice over. On the ground the shadows become
     long bands raking across the valleys rather than round patches. From
     above — where the survey looks down on the top of this same layer — it is
     the difference between a single soft wash covering the frame and a set of
     distinct streaks you can count. That matters more than it sounds, because
     at seventy-eight degrees down the camera only sees about five hundred
     world units of the deck: at the old round scale that was less than two
     cloud cells across the whole view, so the survey was being veiled by
     exactly one cloud and it read as haze. */
  /* ── and which way it travels ─────────────────────────────────────────────
     Stretching the field made the clouds read, and then made them read as
     stationary, for a reason that is obvious in hindsight: the drift ran along
     the same axis as the stretch. A streak sliding along its own length barely
     changes shape, so ninety seconds of travel produced almost no visible
     movement — the cloud was moving the whole time and there was nothing on
     screen to say so.

     So the travel crosses the streaks instead. The long axis stays put and the
     bands march sideways across the valleys, which is the motion the eye
     actually picks up, and it is what a shear between the wind that organised
     the cloud and the wind now carrying it does anyway. */
  function cloud(px, pz, t) {
    var d = t * P.cloudRate;
    var n = vnoise((px + d * 0.35) / (P.cloudScale * P.cloudStretch),
                   (pz + d) / P.cloudScale);
    return smooth01((n - P.cloudCover) / P.cloudEdge) * P.cloudDepth;
  }

  /* ── trees ────────────────────────────────────────────────────────────────
     World-anchored, which is the only thing that matters here: sown on a fixed
     lattice in world space and jittered from a hash of the lattice index, so a
     tree stays where it is while the camera descends onto it. Sown relative to
     the camera instead — which is the cheaper thing to write — and the whole
     forest swims, and the ground stops being ground.

     Each is a projected conifer, drawn straight into the luminance buffer
     before screening, and depth-tested against the distance the marcher
     already recorded for that cell. That z-buffer does two jobs: it keeps a
     tree standing behind a rise from drawing over it, and — because sky cells
     are recorded at infinity — it lets the ones on a ridgeline draw *into*
     the sky. That is the detail worth having all of this for. A forested
     ridge does not read as a shaded slope, it reads as a jagged black edge
     against a bright horizon, and there is no way to fake that from shading
     alone.

     ── the glade ────────────────────────────────────────────────────────────
     The landing is chosen for being flat, open and unobstructed, and flat
     open ground is exactly where the cover map says the trees are thickest.
     Left alone, the clearing search would find the camera a view and the
     forest would immediately plant itself in it. So the trees are held back
     from the landing spot, softly, over `glade` units — which is not a
     workaround, it is what a clearing in a wood is. The ground cover is
     untouched inside it: the glade is meadow, ringed by forest, with the
     range beyond. */
  function trees(luma, zbuf, bw, bh, cam, basis, tx, ty, t, gust, land) {
    var alt = cam.alt;
    if (alt > P.treeFrom) return 0;
    var fade = 1 - smooth01((alt - P.treeFrom * 0.55) / (P.treeFrom * 0.45));
    if (fade <= 0.01) return 0;

    var reach = P.treeReach, step = P.treeStep;
    var fx = basis.fx, fy = basis.fy, fz = basis.fz;
    var rx = basis.rx, rz = basis.rz;
    var ux = basis.ux, uy = basis.uy, uz = basis.uz;
    var air = basis.air;

    var gx0 = Math.floor((cam.x - reach) / step), gx1 = Math.floor((cam.x + reach) / step);
    var gz0 = Math.floor((cam.z - reach) / step), gz1 = Math.floor((cam.z + reach) / step);
    var drawn = 0, gi, gj;

    /* ── which way the light is coming from, on screen ────────────────────
       The single largest cue that a thing has volume is that one side of it
       is brighter than the other, and for that a flat sprite only needs to
       know which side. Project the sun's horizontal direction onto the
       camera's right vector and that is it: positive means the sun is off to
       the right of frame, so canopies are lit on their right. It is constant
       for the whole pass — one dot product for the entire forest — and it
       turns a row of flat triangles into a row of things with a lit face. */
    var sun = W.sun;
    var sunSide = sun.x * rx + sun.z * rz;
    var sunMag = Math.sqrt(sun.x * sun.x + sun.z * sun.z) || 1;
    sunSide = (sunSide / sunMag) * P.treeModel;

    for (gj = gz0; gj <= gz1; gj++) {
      for (gi = gx0; gi <= gx1; gi++) {
        var h1 = hash(gi, gj);
        var wx = (gi + h1) * step;
        var wz = (gj + hash(gi + 7919, gj)) * step;
        var dx = wx - cam.x, dz = wz - cam.z;
        var d2 = dx * dx + dz * dz;
        if (d2 > reach * reach) continue;

        /* thin with distance so the screen density stays even rather than
           piling ten thousand sub-cell trees into the horizon */
        var d = Math.sqrt(d2);
        if (d > P.treeThin && h1 > P.treeThin / d) continue;

        var cov = coverAt(wx, wz);
        if (cov < 0.25) continue;

        /* the glade */
        if (land) {
          var lx = wx - land.x, lz = wz - land.z;
          var ld = Math.sqrt(lx * lx + lz * lz);
          if (ld < P.glade) {
            cov *= smooth01((ld / P.glade - 0.45) / 0.55);
            if (cov < 0.25) continue;
          }
        }
        if (hash(gi, gj + 104729) > cov) continue;

        var gy = W.heightAt(wx, wz);
        var h = P.treeH * (0.62 + 0.76 * hash(gi + 31, gj + 17)) * (0.55 + 0.45 * cov);

        /* the gust, the same one the ground and the weather use. A conifer
           does not bend the way a blade does — the trunk barely moves and the
           crown drifts — so this is a tenth of the lean, not all of it. */
        var sway = gust ? gust((wx + t * 26) / P.windScale, wz / P.windScale) : 0;
        var lean = sway * P.treeSway * h;

        if (!project(wx, gy, wz, cam, fx, fy, fz, rx, rz, ux, uy, uz, tx, ty, bw, bh, A)) continue;
        if (!project(wx + lean, gy + h, wz, cam, fx, fy, fz, rx, rz, ux, uy, uz, tx, ty, bw, bh, B)) continue;

        /* ── is any of it actually in frame? ─────────────────────────────────
           Trees are sown on a disc around the camera, so most of them are
           beside it or behind it: at the hero only about one in seven of the
           ones big enough to cast a shadow has its root on screen. `project`
           rejects what is behind the camera and nothing else, so all the rest
           come back with screen coordinates in the thousands — finite, useless,
           and actively dangerous to anything downstream that measures its own
           work in pixels. That is where the streaks came from; see `cast`.

           Culling against the frustum in camera space costs two comparisons
           and no division. Horizontally a trunk is one vertical line, so the
           root stands for the whole tree. Vertically the crown is always above
           the root — same column, and the camera's up vector has a positive y
           at any pitch short of ninety degrees — so a tree can be thrown out
           when its crown is below the frame or its root above it with no risk
           of dropping one that straddles. The slack leaves room for a canopy
           whose centre is out but whose branches are in. */
        if (Math.abs(A[4]) > A[3] * tx * 1.5) continue;    /* off to the side   */
        if (B[5] < -B[3] * ty * 1.2) continue;             /* crown below frame */
        if (A[5] >  A[3] * ty * 1.2) continue;             /* root above frame  */

        /* The same key the ground under it gets, cloud included. Without the
           cloud term a shadow crossing the valley darkened the grass and left
           the wood standing in it at full brightness, which is the one thing
           that gives away that two materials are being lit by two systems.
           Taken before the ambient floor, exactly as the terrain takes it, so
           a cloud removes the sun and leaves the sky. */
        var key = (1 - P.treeSun)
                + P.treeSun * W.shadeAt(wx, wz) * (1 - cloud(wx, wz, t));
        var vary = 0.80 + 0.40 * hash(gi + 3, gj + 29);
        var crown = P.treeCrown * key * vary * P.treeTone;
        var edge = 1 - smooth01((d - reach * 0.70) / (reach * 0.30));
        var a = fade * cov * edge;

        /* the air between, once per tree — see `airAt` in flight.js. A tree is
           a few cells across, so the haze cannot meaningfully vary over it and
           there is no reason to pay for it per pixel. Taken at the middle of
           the trunk rather than the root, because that is where the mass is. */
        var k = 1, add = 0;
        if (air) {
          var mx = wx - cam.x, my = gy + h * 0.5 - cam.y, mz = wz - cam.z;
          var mr = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
          air(mr, gy + h * 0.5, mx / mr, my / mr, mz / mr, AIR);
          k = 1 - (1 - AIR[0]) * P.treeAir;
          add = AIR[1] * P.treeAir;
        }

        /* ── the slack the depth test needs, and why it is not a constant ────
           Every pixel of a tree is tested against the z-buffer at one depth:
           the range to its root. The buffer holds the range the marcher
           recorded for the *centre* of each cell, and the tree stands
           somewhere inside that cell rather than at its centre — so the two
           numbers disagree by however much the depth changes across one cell.

           Near the reader that is nothing. At the landing it is not: the
           ground is being seen almost edge-on, and a single row of screen
           there covers one to six world units of range, occasionally eighty
           at a silhouette. Against that a flat 0.6 of slack is no slack at
           all, so the bottom rows of a trunk fail a test the rows above it
           pass, and the tree is drawn with its feet cut off — standing in the
           air a little above the ground it is rooted in. Measured over a
           landing frame: about a quarter of the trees with a gap at the base
           had one for this reason and no other.

           So the slack is scaled by the depth one row actually covers here,
           read straight off the buffer under the trunk — two loads a tree,
           not a per-pixel cost. Capped, because at a silhouette the row below
           the root belongs to a hillside a hundred units nearer and a slack
           that large would let the wood draw through the ridge in front of
           it. The cap is what keeps this a bias and not a licence. */
        bias = 0.6;
        var bxi = Math.round(A[0]), byi = Math.round(A[1]);
        if (bxi >= 0 && bxi < bw && byi >= 0 && byi < bh - 1) {
          var zHere = zbuf[byi * bw + bxi];
          var zBelow = zbuf[(byi + 1) * bw + bxi];
          if (zHere < 1e29 && zBelow < 1e29) {
            var rowZ = zHere - zBelow;
            if (rowZ < 0) rowZ = -rowZ;
            rowZ *= P.treeBias;
            bias += rowZ > P.treeBiasMax ? P.treeBiasMax : rowZ;
          }
        }

        /* the shadow first, so the tree stands on it rather than under it. The
           step count follows the tree's size on screen — a shadow the length of
           a thumbnail does not need twenty samples, and one at the reader's
           feet does. It is tested against the same buffer at the same grazing
           angles, so it takes the same slack — a shadow whose near end has been
           eaten leaves the tree standing on nothing, which is the very thing
           the shadow is there to prevent. */
        var hpx = A[1] - B[1];
        if (P.treeCast > 0 && hpx >= P.treeCastMin && sun.y > 0.05) {
          var steps = Math.round(hpx * 0.5);
          if (steps < 4) steps = 4; else if (steps > 24) steps = 24;
          cast(luma, zbuf, bw, bh, cam, basis, tx, ty,
               wx, wz, wx - sun.x / sun.y * h, wz - sun.z / sun.y * h,
               h * P.treeWidth, steps, a * P.treeCast * key, add);
        }

        var broad = hash(gi + 61, gj + 43) < P.treeBroad;
        (broad ? broadleaf : conifer)(
          luma, zbuf, bw, bh, A[0], A[1], B[0], B[1], A[2],
          crown, crown * P.treeSkirt, sunSide, a,
          hash(gi + 97, gj + 53), k, add);
        drawn++;
      }
    }
    return drawn;
  }

  /* ── the two forms ────────────────────────────────────────────────────────
     One silhouette repeated across a hillside is a texture, not a wood, and
     the eye finds the repeat immediately. Two forms with per-tree proportions
     is enough to stop that happening — a stand reads as many things rather
     than one thing stamped out.

     Both are drawn as rows of horizontal span with no antialiasing on the
     edge, for the same reason grass.js refuses it on its own coverage: a
     feathered edge resolves detail below the cell size and undoes the
     screening the whole page is built on.

     `side` is the screen-space direction of the sun. Each row is shaded
     across its width from it, which costs one multiply per span and is what
     stops these reading as cut-out shapes. */

  /* A spruce: whorls, widening downward, each overhanging the one below.
     Drawn as tiers rather than one smooth cone because at eight cells tall a
     smooth cone is a triangle and a tiered one still has a species. */
  function conifer(luma, zbuf, bw, bh, rx0, ry0, tx0, ty0, z, vTop, vBot, side, a, r, k, add) {
    var top = Math.round(ty0), bot = Math.round(ry0);
    var H = bot - top;
    if (H < 1) { plot(luma, zbuf, bw, bh, Math.round(rx0), bot, z, vTop * k + add, a); return; }
    if (H > bh * 2) H = bh * 2;

    var halfW = H * P.treeWidth * (0.78 + 0.44 * r);
    var tiers = P.treeTiers, i, x;
    for (i = 0; i <= H; i++) {
      var y = top + i;
      if (y < 0) continue;
      if (y >= bh) break;
      var f = i / H;
      var w;
      if (f < 0.88) {
        /* where this row sits inside its own whorl, 0 at the top of the
           tier and 1 at its skirt */
        var tf = f * tiers, ti = Math.floor(tf), tw = tf - ti;
        w = halfW * ((ti + 0.45 + 0.55 * tw) / tiers);
      } else {
        w = halfW * 0.09;                                    /* the trunk */
      }
      var cx = rx0 + (tx0 - rx0) * (1 - f);
      var v = vTop + (vBot - vTop) * f;
      span(luma, zbuf, bw, bh, cx, w, y, z, v, side, a, k, add);
    }
  }

  /* A broadleaf: a round crown on a bare stem, so it silhouettes as a blob
     against the conifers' spikes. */
  function broadleaf(luma, zbuf, bw, bh, rx0, ry0, tx0, ty0, z, vTop, vBot, side, a, r, k, add) {
    var top = Math.round(ty0), bot = Math.round(ry0);
    var H = bot - top;
    if (H < 1) { plot(luma, zbuf, bw, bh, Math.round(rx0), bot, z, vTop * k + add, a); return; }
    if (H > bh * 2) H = bh * 2;

    var halfW = H * P.treeWidth * (1.15 + 0.5 * r);
    var stem = 0.34 + 0.12 * r;          /* how much of it is trunk */
    var i;
    for (i = 0; i <= H; i++) {
      var y = top + i;
      if (y < 0) continue;
      if (y >= bh) break;
      var f = i / H;
      var w;
      if (f < 1 - stem) {
        /* an ellipse through the crown */
        var u = (f / (1 - stem)) * 2 - 1;
        w = halfW * Math.sqrt(1 - u * u * 0.94);
      } else {
        w = halfW * 0.08;
      }
      var cx = rx0 + (tx0 - rx0) * (1 - f);
      var v = vTop + (vBot - vTop) * f;
      span(luma, zbuf, bw, bh, cx, w, y, z, v, side, a, k, add);
    }
  }

  /* One row of a canopy, shaded across its width from the sun's side. */
  function span(luma, zbuf, bw, bh, cx, w, y, z, v, side, a, k, add) {
    var x0 = Math.round(cx - w), x1 = Math.round(cx + w);
    var inv = w > 0.5 ? 1 / w : 0;
    /* the model first, then the air over the top of it — shading belongs to
       the tree and haze belongs to the distance between it and the camera */
    for (var x = x0; x <= x1; x++) {
      plot(luma, zbuf, bw, bh, x, y, z,
           v * (1 + side * (x - cx) * inv) * k + add, a);
    }
  }

  /* ── the shadow a tree throws ─────────────────────────────────────────────
     Walked along the ground in world space, not across the screen.

     The first version drew a straight line between two projected points and
     stepped it a pixel at a time. That is the natural thing to write and it is
     unsound, for a reason worth stating plainly: a screen-space length is only
     as short as the projection happens to make it. `project` rejects what is
     behind the camera and nothing else, so a tree ninety degrees off the view
     direction returns a screen x in the tens of thousands — and a routine that
     measures its own work in pixels will then go and do tens of thousands of
     pixels' worth of it. Shadows three to ten world units long were arriving
     as lines of up to ninety-six thousand cells; the guard at four hundred
     threw out only the very worst, and the survivors drew black diagonals
     clean across the frame. Those were the streaks in the landscape, and the
     trees casting them were mostly not even in shot.

     In world space a length is a length. Each sample sits on the ground under
     the shadow, so it drapes over what it crosses instead of cutting a
     straight line through it, and each is depth-tested on its own range —
     which fixes the second half of the same bug, where every pixel of the
     streak carried the *root's* distance and so drew over hills the tree stood
     behind. The width comes from the crown's true half-width projected at that
     sample, so the taper is the real one: the crown is the wide part, and it is
     the crown that lands at the far end. */
  function cast(luma, zbuf, bw, bh, cam, bs, tx, ty,
                x0, z0, x1, z1, hw, steps, a, add) {
    var projK = bw / (2 * tx);
    for (var i = 1; i <= steps; i++) {
      var f = i / steps;
      var sx = x0 + (x1 - x0) * f, sz = z0 + (z1 - z0) * f;
      if (!project(sx, W.heightAt(sx, sz), sz, cam,
                   bs.fx, bs.fy, bs.fz, bs.rx, bs.rz, bs.ux, bs.uy, bs.uz,
                   tx, ty, bw, bh, D)) continue;
      var y = Math.round(D[1]);
      if (y < 0 || y >= bh) continue;
      var w = hw * f * projK / D[3];
      if (w < 0.5) w = 0.5;
      var xa = Math.round(D[0] - w), xb = Math.round(D[0] + w);
      if (xb < 0 || xa >= bw) continue;
      if (xa < 0) xa = 0;
      if (xb >= bw) xb = bw - 1;
      var av = a * (1 - f * 0.45);
      for (var x = xa; x <= xb; x++) plot(luma, zbuf, bw, bh, x, y, D[2], add, av);
    }
  }

  function plot(luma, zbuf, bw, bh, x, y, z, v, a) {
    if (x < 0 || x >= bw || y < 0 || y >= bh) return;
    var o = y * bw + x;
    /* the slack, because the trunk sits exactly on the surface the marcher hit
       and would otherwise fail its own depth test. Set once per tree — see
       `trees` for what it is made of and why it is not a constant. */
    if (z < zbuf[o] + bias) luma[o] += (v - luma[o]) * a;
  }

  var A = [0, 0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0, 0], D = [0, 0, 0, 0, 0, 0];
  var AIR = [1, 0];

  /* The depth-test slack for the tree being drawn, in world units. Module
     scope for the same reason the scratch vectors above are: it is set once
     per tree and read once per pixel, and threading it through four call
     frames to say the same thing would cost more than the test it guards. */
  var bias = 0.6;

  /* world point to buffer cell, in the render loop's own convention: a
     direction is f + sxn*r + syn*u, so the camera-space components divided by
     the forward one are exactly sxn and syn */
  function project(wx, wy, wz, cam, fx, fy, fz, rx, rz, ux, uy, uz, tx, ty, bw, bh, out) {
    var vx = wx - cam.x, vy = wy - cam.y, vz = wz - cam.z;
    var cf = vx * fx + vy * fy + vz * fz;
    if (cf < 0.25) return false;
    var cr = vx * rx + vz * rz;
    var cu = vx * ux + vy * uy + vz * uz;
    out[0] = ((cr / cf) / tx * 0.5 + 0.5) * bw - 0.5;
    out[1] = (0.5 - (cu / cf) / ty * 0.5) * bh - 0.5;
    /* Range, not forward distance. The z-buffer holds what the marcher
       recorded, and what the marcher records is distance along the ray — at
       forty degrees below the horizon those differ by a third, which is
       enough to let a blade draw through a rise it is standing behind. */
    out[2] = Math.sqrt(vx * vx + vy * vy + vz * vz);
    /* the camera-space components as well, because the frustum test wants them
       raw: `|cr| < cf·tx` is the same question as "is it on screen" without the
       division that makes the answer meaningless when cf is small */
    out[3] = cf; out[4] = cr; out[5] = cu;
    return true;
  }

  return {
    params: P,
    defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
    bake: bake, stale: stale, coverAt: coverAt,
    grain: grain, rock: rock, cloud: cloud, relief: relief,
    trees: trees,
    noise: vnoise
  };
})();
