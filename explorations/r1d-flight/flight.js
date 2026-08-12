/* ===========================================================================
   r1d — THE FLIGHT

   One camera, one world, one sun, one weather, for the whole page. Scrolling
   flies it:

     A  the opening pan. Low over the range, looking at the horizon. Before any
        scroll it just flies, exactly as the hero does today.
     B  the rise. Up to nine hundred units and pitching over to a survey view,
        straight up off the flight line — no lateral travel. The page content
        floats over this.
     C  the descent. Straight back down the same column, still looking down.
     D  the landing. A pitch back up to the horizon a few units off the ground,
        turning as it comes to the bearing with the most distant high ground on
        it, so the page ends on the wordmark in the grass with a range standing
        behind it.

   ── the column ────────────────────────────────────────────────────────────
   An earlier cut of this chose a landing spot from the whole terrain and flew
   the camera to it during the rise. It guaranteed a good backdrop and it was
   deeply disorientating: the reader got a climb and a long lateral traverse at
   the same time, over about a thousand pixels of scroll, and had no way to read
   either motion against the other.

   So the flight now goes straight up and straight back down over one column of
   the world — wherever the opening pan happened to have drifted to when the
   reader first scrolled. The clock on the opening drift stops at that moment,
   which is what makes the column stable and the rise continuous from it.

   The backdrop guarantee survives as a *bearing* rather than a position: from
   that column, the twelve compass directions are probed for distant high
   ground and the camera turns to the best of them on the way down. A turn is a
   motion the reader can follow; a traverse under a climb is not.

   ── why this needed a new renderer ────────────────────────────────────────
   terrain.js is a Voxel Space column marcher. It is fast because it assumes
   each screen column is a vertical plane in the world, marches outward along
   one horizontal line, and paints the run of pixels each step newly occludes.
   That assumption is exactly true at zero pitch and false at any other, which
   is why engines of that family fake pitch with a horizon offset and never
   look far down. This rig pitches to eighty degrees, so the assumption has to
   go.

   What replaces it is a per-pixel march with a real camera basis — and what
   makes that affordable rather than ruinous is knowing, before marching, where
   terrain becomes possible at all.

   Two things supply that, and neither of them is the pixel next door. A ray on
   its way down cannot meet the ground until it has descended to the height of
   the highest ground there is, which is one divide. Below that, a grid of
   per-block ceilings lets it skip whole blocks it passes over the top of. Both
   are properties of the world rather than of the frame, so both hold at any
   pitch — including straight down, where a column marcher has nothing sensible
   to say at all, and where screen-space coherence quietly stops being true.
   (It was tried, twice. See the note on the march for how it failed and what
   it looked like.)

   The world, the sun and the shading come from TERRAIN.world, so this is
   literally the terrain r1b flies over, lit by the same sun.
   =========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-flight]');
  var W = window.TERRAIN && window.TERRAIN.world;
  if (!host || !W) return;

  var REDUCED = matchMedia('(prefers-reduced-motion:reduce)').matches;
  var RAMP = SCREEN.RAMP.dusk;
  var noise = window.GRASS && GRASS.noise;

  var P = {
    /* the rig */
    startAlt:  52,     /* opening height above ground                       */
    surveyAlt: 900,    /* the top of the rise                               */
    landAlt:   5.5,    /* where it comes to rest                            */
    surveyPitch: -1.36,/* radians. -1.57 is straight down                   */
    camGround:  2,     /* radius the camera averages its ground over       */
    landPitch: -0.14,  /* the same high horizon the opening has              */
    fov:       0.92,
    pan:       3.0,    /* opening drift, world units a second               */
    lag:       0.42,   /* seconds. how far the camera trails the scrollbar  */
    turnFrom:  0.68,   /* where in the scroll the turn to the bearing starts */
    landFrom:  0.78,   /* where it starts sliding across to the clearing     */
    turnTo:    0.96,   /* and where both finish                             */
    sunFace:   0.50,   /* how hard the landing turns to face the sunset      */
    sunOff:    0.55,   /* radians the sun sits beside the landing bearing    */
    sunSite:    60,    /* weight of that in choosing the site, not the aim   */
    clearRise: -0.05,  /* elevation tangent the view wedge must stay under   */
    clearWeight: 2.0,  /* how hard ground above that is punished            */

    /* light */
    litBase:   0.05,
    litGain:   0.72,
    rim:       0.26,
    altBoost:  0.15,
    haze:      0.0072,
    airHeight: 220,   /* scale height of the air column, world units       */
    skyBase:   0.09,
    skyBand:   0.32,
    skyWidth:  0.30,  /* half-width of the horizon band, in ray elevation */
    glow:      0.90,
    glowTight: 0.30,
    glowPow:   3.2,
    bloom:     0.22,

    /* weather — one system, shared with the grass */
    windRate:  0.30,
    windSwell: 1.00,
    toGrass:   1.00,
    toHaze:    0.18,

    /* water
       A level, not a surface. Everywhere the terrain falls below it there is
       water, which is what a water table actually is, and it means the lakes
       are wherever the basins are rather than wherever somebody drew them.
       Held as a fraction of terrain amplitude so that it stays sensible when
       the shape sliders move: 0.22 puts about a fifth of the map under, which
       is valleys drowned and ranges untouched. */
    sea:       0.22,
    ripple:    0.030,  /* how far the surface normal wanders               */
    rippleRate:0.55,
    waterBase: 0.075,  /* the body of the water, unlit                     */
    waterShallow: 0.38,/* the pale band around the rim                     */
    waterDepth: 15.0,  /* how fast that band falls away, world units       */
    waterSky:  0.70,   /* how much sky it returns at grazing angles        */
    waterFloor:0.06,   /* reflectance looking straight down. see `water`   */
    waterSpec: 1.00,   /* the sun's path across it                         */
    waterGloss: 95,    /* how tight that path is. low = a broad sheen      */

    /* rivers — drawn from the drainage the erosion left behind. Zero, and
       silently free, on any map that has not been eroded: the flow field is
       all zeros and the threshold below is never met. */
    river:     0.92,   /* how completely a channel takes over the ground   */
    riverFrom: 0.30,   /* drainage above which there is one at all         */
    riverSoft: 0.26,   /* the bank. how quickly it takes over              */
    riverBed:  0.12,   /* how much light comes back off it. low — see `water` */
    riverFlat: 0.62,   /* gradient above which water will not lie          */
    riverGloss: 11,    /* broad. moving water is rough — see the call site */
    riverRipple: 0.075,/* and it wanders further than a lake surface       */

    /* the cloud deck — the sky half of the weather already on the ground */
    deck:      0.85,   /* how strongly the clouds take the sky. 0 = none   */
    /* ── how high the deck sits, and why it came down ──────────────────────
       At 520 the underside was too far away to have any form. The hero flies
       at about 90, so a ray leaving at a shallow angle — which is all of the
       sky in a frame pitched eleven degrees down — met the plane between
       seventeen hundred and five thousand units out, where the cell size has
       long since swallowed the shape and `deckFar` is busy fading what is
       left into haze. The clouds were there, and measurably so, but they
       arrived as a faint banding rather than as weather.

       Down here the same rays meet it inside a thousand units, where a cloud
       is still several cells across and reads as a thing with an edge. It
       also puts the camera *above* the deck from the rise onwards, which is
       what the survey wanted — see the veil in the march. */
    deckY:     300,    /* world height of the underside                    */
    deckFar:   5200,   /* where they lose themselves in haze               */
    deckDark:  0.055,  /* the body of one, in shadow                       */
    deckGlow:  0.62,   /* and the rim it carries toward the sun            */
    deckGlowPow: 5.0,  /* how tightly that rim hugs the sun                */
    /* the same deck seen from above, on the way over it */
    veil:      0.62,   /* how much a cloud top veils the ground under it   */
    veilBase:  0.34,   /* its own value. bright — nothing shades a top     */
    veilGlow:  0.50,   /* and what it gains facing the sun                 */

    /* the inversion — air pooled in the valleys. See `mistAt` */
    /* `mistY` is measured, not chosen. At 46 it sat above 86% of the ground
       on this map and stopped being an inversion — it was just a dimmer. The
       valleys proper are the bottom two fifths, which is here. */
    mist:      0.0040, /* per world unit of range, at the bottom of it     */
    mistY:     28,     /* world height of the top of the pool             */
    mistSoft:  22,     /* how far down from that it comes fully in        */
    mistLit:   0.02,   /* the elevation it takes its light from — horizon */
    mistGain:  0.92,   /* × that. how luminous the pool is                */

    relief:    1.00,   /* × meadow's own number. 0 turns the small form off */

    /* ground cover — see meadow.js */
    cover:     1,      /* 0 turns the vegetation off entirely             */
    trees:     1,      /* 0 keeps the cover but not the geometry          */

    /* render
       Two cell sizes, not one. The per-pixel march costs more than the hero's
       column marcher, and the first cut paid for that by rendering the whole
       page at cell 5 — which on a 1080p screen the cell cap pushed to 6, a
       quarter of r1b's cell count. Same world, same sun, and it did not look
       like the same landscape, because the dither *is* the landscape's texture.

       So: `cell` is what it renders at when the camera has settled, and it
       matches r1b. `cellMove` is what it drops to while the camera is actually
       moving, where nobody can resolve a 3px cell anyway. */
    cell:      3,
    cellMove:  5,
    /* ── ms between redraws once the camera has settled ────────────────────
       This is the other half of `cloudRate`, and the pair has bitten before:
       an earlier cut ran 240ms against a 1.8-second cloud cycle and stuttered
       badly, which is why the weather was slowed to a crawl and this was let
       out to 400.

       The hero does not go through here at all — at the top of the page the
       flight counts as flying and draws every frame, so the clouds animate at
       sixty and can be as quick as they like. What this governs is a reader
       who has stopped somewhere, and of those positions only the landing has
       any sky in it. At 400 against the new rate a cloud edge would advance
       about three cells a tick, which is a visible step; at 260 it is closer
       to one and a half, which the dither texture covers.

       The cost is honest and small: a draw down there is about 30ms, so this
       is roughly an eighth of a core on a page nobody is touching, against a
       thirteenth before. */
    idle:      260,    /* ms between redraws once the camera has settled  */
    far:       900,
    quality:   1.00,
    stepCap:   9.0     /* world units. see `trace` — grazing rays            */
  };

  /* ── the column and the bearing ───────────────────────────────────────────
     `spot` is where the flight rises from, descends onto and lands — one
     column, taken from the opening pan rather than searched for. While the
     page is at the top it tracks the drift; the moment the rise begins the
     drift clock stops and so does this.

     `yaw` is the separate half of it: the compass bearing with the most
     distant high ground on it, which is what the camera turns to on the way
     down so the wordmark gets a range behind it. Twelve bearings, two probes
     each so that a single spike cannot win the vote.

     `land` is the second half again, and it is not quite the column. See
     `findClearing` — it is the fix for the landings that came out as a wall
     of mud. */
  var spot = { x: 0, z: 0, yaw: 0, heading: 0, relief: 0 };
  var land = { x: 0, z: 0, yaw: 0, relief: 0, ok: false, wet: 0, stamp: NaN };

  function seaY() { return ((window.TERRAIN && TERRAIN.params.amp) || 96) * P.sea; }

  /* What "the most high ground" has to mean is the amount of range that ends
     up *above the horizon* once the camera is standing on the ground, and
     that is an angle, not a height. The first version averaged the elevation
     at 300 and 470 units and took the tallest, which quietly prefers a distant
     massif over a nearer ridge of the same apparent size — and a nearer ridge
     of the same apparent size is the better backdrop, because it is not
     hazed. So: twenty-four bearings, and for each the largest elevation angle
     seen anywhere along it. That is exactly the height the range will stand in
     frame. */
  var relief = 0;   /* set by bearingAt, read by whoever asked */

  /* The preview shown while the page is still on the deck, before a clearing
     has been chosen. Same measure as the real thing at half the bearings —
     this runs every frame of the drift and the answer is thrown away the
     moment the flight commits. */
  function bearingAt(x, z) {
    var o = outlook(x, z, 12);
    relief = o.h;
    return o.dir;
  }

  /* ── the clearing ─────────────────────────────────────────────────────────
     The landings were the weakest thing on the page and the reason was
     measurable rather than aesthetic. Sampling four hundred columns of a
     generated map: on two hundred and sixty-two of them there is ground
     *above the camera's eye* within sixty units of where it puts down. Two
     thirds of all loads finished with the camera buried in a hillside, and
     what that looks like is the whole frame filled with near-field terrain at
     grazing incidence — no horizon, no sky, no range, just a wall.

     It also looks blurred, and that part is a resolution problem underneath
     the framing one. The heightmap is 384 across a 1113-unit torus, so a cell
     is 2.9 units. At an eye height of five metres the nearest ground is under
     two cells away and every hillside within forty metres is a smeared
     bilinear blob. There is no shading fix for that; the terrain simply does
     not carry detail at the scale the camera is asking for.

     Flat ground answers both at once. On the flat there is nothing above the
     eye, so the horizon and the range come back — and there is no detail to
     resolve, so the coarse heightmap stops mattering. Sampled again: a
     genuinely flat, unobstructed patch exists within 220 units of 111 of 120
     columns, median distance 80. So the flight does not need to travel to a
     landing site, and it does not need the terrain rewritten under it. It
     needs to look around as it comes down, which is what putting an aircraft
     on the ground consists of.

     Scored in two passes because the honest score is too expensive to run on
     every candidate: a cheap one to rank a few hundred, then the real one on
     the best handful. */
  /* Local flatness: is the ground the camera is standing on smooth, and is
     anything piled up right next to it. Cheap enough to run on hundreds of
     candidates, and it is only half the question — see `outlook`. */
  function nearFlat(x, z) {
    var g = W.heightAt(x, z), sea = seaY();
    if (g < sea + 1.5) return -1e9;             /* not in the lake */
    var eye = g + P.landAlt;
    var above = 0, n = 0, varr = 0, k, d, h;
    for (k = 0; k < 8; k++) {
      var a = k / 8 * 6.2832, dx = Math.sin(a), dz = Math.cos(a);
      for (d = 6; d <= 54; d += 12) {
        h = W.heightAt(x + dx * d, z + dz * d);
        n++;
        if (h > eye) above++;
        varr += (h - g) * (h - g);
      }
    }
    return -(above / n) * 800 - Math.sqrt(varr / n) * 6;
  }

  /* ── the outlook ──────────────────────────────────────────────────────────
     Flatness alone does not buy a landing, which the first attempt at this
     proved: a genuinely flat shelf with the hillside continuing to climb just
     beyond it scores perfectly and still fills the frame with ground. There is
     no horizon in it and therefore no sky, no range and no picture.

     What the shot actually needs is a *view*: a bearing along which the ground
     stays below the eye far enough out that the horizon is visible, and then
     high ground beyond that to stand behind the wordmark. Those two pull
     against each other, and the way they resolve is distance. A ridge two
     hundred units away that clears the eye is a wall. The same ridge at six
     hundred, seen across open ground, is a range — the elevation angle is
     small, the horizon survives, and the haze does the rest.

     So each bearing is tested in two parts: how far the near ground rises
     through the wedge the camera can actually see, and then the largest
     elevation angle beyond three hundred units, which is the range that stands
     behind the wordmark. The first is a penalty rather than a gate, because a
     gate throws away the site instead of the bearing and a rough map can leave
     nothing at all standing.

     `clearWeight` is the exchange rate between them, and the sweep across
     twenty-two terrains is the argument for its value. At zero — which is what
     this did before — eighteen of twenty-two landings had a quarter of the
     frame or more blocked by near ground. At 0.5 that falls to four, at 2 to
     one. Past 2 it keeps improving and starts costing the sunset instead: the
     bearing is being chosen for openness alone, and the number of landings
     that still face the glow drops from nineteen in twenty-two to twelve. So
     2 is the knee, and it is a knee rather than a preference. */
  /* ── and facing the sunset ────────────────────────────────────────────────
     The sun is placed once, relative to the camera's opening heading, because
     that is what puts the glow beside the headline in the hero. It is not
     moved afterwards — moving it would re-light the whole flight and throw the
     hero's composition away. So the landing turns to meet it instead.

     It turns to `sunOff` *beside* it rather than straight at it, and that is
     the whole difference between a sunset and a silhouette. Aimed dead on, the
     shot is bright sky and nothing else: every slope the camera can see is
     turned away from the sun, so the ground goes black, and at the landing the
     sky is mostly behind the copy panel anyway. Measured, the visible band of
     the frame came out 2.7× darker facing the sun than facing away from it.

     Half a radian off, the glow still sits on the horizon and in frame — the
     lobe is broad — but the light now rakes across the ground instead of
     coming straight down the lens, so the range reads and the wordmark has a
     dark side to sit on. It is the same arrangement the hero uses: hot key on
     one side, near-black type bed on the other.

     `sunFace` is how hard it insists. Added to the elevation angle, which
     sounds arbitrary and is not: `el` spans about 0.2 from a bare horizon to a
     range, and one step of the bearing wheel is 22.5°, worth 0.04 of facing at
     0.5. So relief still chooses freely among the two or three bearings
     nearest the mark, and only a mountain better than anything on the map
     drags the shot right off it. */
  var RISE = new Float64Array(32), FAR = new Float64Array(32), HGT = new Float64Array(32);

  function outlook(x, z, dirs) {
    var g = W.heightAt(x, z), eye = g + P.landAlt;
    var sun = W.sun, sunAz = Math.atan2(sun.x, sun.z);
    var k, j, d, h, a, e;

    /* ── the near ground, spoke by spoke ────────────────────────────────────
       Kept as an elevation tangent rather than a height, and walked in
       geometric steps from seven units out rather than linear ones from
       thirty. Both changes are the same point: what blocks a shot is the angle
       a lump subtends, not how tall it is, and near ground subtends far more of
       the frame per unit of height than distant ground does. The old walk never
       looked closer than thirty units, so the ground most able to fill the
       frame was the ground it never sampled — and it asked only "is this above
       eye height?", which lets a bank rise to within a unit of the eye at ten
       paces and still pass. */
    for (k = 0; k < dirs; k++) {
      a = k / dirs * 6.2832;
      var dx = Math.sin(a), dz = Math.cos(a);
      var hi = -9;
      for (d = 7; d <= 260; d *= 1.18) {
        e = (W.heightAt(x + dx * d, z + dz * d) - eye) / d;
        if (e > hi) hi = e;
      }
      RISE[k] = hi;

      var el = -1e9, hh = g;
      for (d = 300; d <= 880; d += 70) {
        h = W.heightAt(x + dx * d, z + dz * d);
        e = (h - eye) / d;
        if (e > el) { el = e; hh = h; }
      }
      FAR[k] = el; HGT[k] = hh;
    }

    /* ── the wedge, not the line ────────────────────────────────────────────
       A camera does not look along a bearing, it looks through eighty-eight
       degrees of one, and the old test checked the centre line only. Whatever
       stood off to the side of the chosen bearing was never looked at, and over
       thirty landings that left twenty-six with terrain above the horizon
       somewhere in frame and fourteen of them badly blocked.

       The wheel is already a fan of probes around the site, so the wedge costs
       nothing extra to ask for: the worst rise within half a field of view
       either side is a max over the neighbouring spokes. */
    var span = Math.round(Math.atan(P.fov * 1.06) / (6.2832 / dirs));
    if (span < 1) span = 1;

    var open = 0, bestDir = 0, bestEl = -1e9, bestH = g;
    var bestSc = -1e9, bestFace = -1, bestRise = 9;
    for (k = 0; k < dirs; k++) {
      a = k / dirs * 6.2832;
      var w = -9;
      for (j = -span; j <= span; j++) {
        var r = RISE[(k + j + dirs) % dirs];
        if (r > w) w = r;
      }
      if (w <= P.clearRise) open++;

      /* how far off the sun this bearing is, folded to 0..π — either side of
         the sun will do, and insisting on one of them would put the glow in
         the same corner every load */
      var da = a - sunAz;
      while (da > Math.PI) da -= 6.2832;
      while (da < -Math.PI) da += 6.2832;
      var face = Math.cos(Math.abs(da) - P.sunOff);   /* 1 = the mark exactly */

      /* One-sided: there is nothing to be gained from ground that falls away
         harder than the threshold, only something to lose from ground that
         does not. */
      var over = w - P.clearRise;
      if (over < 0) over = 0;

      var sc = FAR[k] + P.sunFace * face - P.clearWeight * over;
      if (sc > bestSc) {
        bestSc = sc; bestEl = FAR[k]; bestDir = a; bestH = HGT[k];
        bestFace = face; bestRise = w;
      }
    }
    /* `el` and `h` stay the chosen bearing's own relief rather than the
       combined score — they are what ranks one site against another, and a
       site should not look better merely for pointing the right way. `face`
       and `rise` carry those parts separately. */
    return { open: open / dirs, dir: bestDir, el: bestEl, h: bestH - g,
             face: bestFace, rise: bestRise };
  }

  /* How much water is in sight. Only ever a tiebreak: a shoreline is a lovely
     place to finish and an unreliable one to insist on, and a page that ends
     the same way every load has stopped being generated. */
  function wetness(x, z) {
    var sea = seaY(), hit = 0, n = 0, k, d;
    for (k = 0; k < 8; k++) {
      var a = k / 8 * 6.2832, dx = Math.sin(a), dz = Math.cos(a);
      for (d = 60; d <= 460; d += 100) {
        if (W.heightAt(x + dx * d, z + dz * d) < sea) hit++;
        n++;
      }
    }
    return hit / n;
  }

  /* Two passes, because the honest score costs about five hundred height
     lookups and there is no point spending that on a candidate whose floor is
     a hillside. Rank a few hundred on flatness alone, then put the shortlist
     through the outlook. */
  function findClearing(cx, cz) {
    var seed = 1, i, best = null;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

    for (var pass = 0; pass < 3 && !best; pass++) {
      var reach = 220 * Math.pow(1.9, pass);
      var cand = [];
      for (i = 0; i < 300; i++) {
        var a = rnd() * 6.2832, r = Math.sqrt(rnd()) * reach;
        var x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        var s = nearFlat(x, z);
        if (s > -1e8) cand.push({ x: x, z: z, r: r, s: s - r * 0.05 });
      }
      cand.sort(function (u, v) { return v.s - u.s; });

      for (i = 0; i < Math.min(20, cand.length); i++) {
        var c = cand[i];
        var o = outlook(c.x, c.z, 16);
        /* Flatness, then how much of the horizon is open, then the range that
           is out there — and a nudge toward water, which is only ever allowed
           to break a tie between sites that are already good.

           `face` is here as well as in the bearing because the two questions
           are different: `outlook` picks the best bearing this site *has*, and
           this picks a site that has a good one. Without it the search happily
           settles somewhere whose only open view is due east of the sunset,
           and the bearing weight can do nothing about it — the sun-facing
           bearings are all walled in. */
        var fine = c.s + o.open * 220 + Math.min(o.el, 0.16) * 900
                 + wetness(c.x, c.z) * 22 + o.face * P.sunFace * P.sunSite
                 - Math.max(0, o.rise - P.clearRise) * P.clearWeight * 900;
        if (!best || fine > best.s) {
          best = { x: c.x, z: c.z, s: fine, yaw: o.dir, relief: o.h };
        }
      }
    }

    if (!best) {                                 /* nothing anywhere: keep the
                                                    column and take the hit */
      var o2 = outlook(cx, cz, 16);
      land.x = cx; land.z = cz; land.ok = false; land.wet = 0;
      land.yaw = o2.dir; land.relief = o2.h;
      return;
    }

    land.x = best.x; land.z = best.z; land.ok = true;
    land.wet = wetness(best.x, best.z);
    land.yaw = best.yaw; land.relief = best.relief;
  }

  /* ── the rig ──────────────────────────────────────────────────────────────
     Keyframes on scroll progress. Altitude is interpolated in log space: 52 to
     900 to 5 is three orders of magnitude, and done linearly the descent spends
     its whole second half in the last twenty units.

     The rise now runs to 0.46 rather than 0.42 with most of its work done by
     0.26 — the old table put the entire climb from 52 to 470 units inside the
     first quarter of the scroll, which on this page is about a thousand pixels.
     Roughly double the runway, weighted so the first move off the deck is the
     gentlest one: pitching over is what makes a reader lose the horizon, so it
     happens late and slowly, well after the altitude has established which way
     is up.

     The opening pitch is -0.20 rather than level, and that number is not a
     taste call. r1b puts its horizon at 0.32 of the frame height — high, so
     the sun's glow lives above the headline band rather than through it — and
     it does that with a `horizon` offset, which is a thing a column marcher
     can have and a real camera cannot. The equivalent here is an actual pitch:
     at this field of view, 0.32 of the frame works out to about twelve degrees
     down. Opening level put the horizon across the middle of the frame and
     lost r1b's composition entirely. */
  var KF = [
    { p: 0.00, alt: 'start',  pitch: -0.20, fov: 1.00 },
    { p: 0.11, alt: 92,       pitch: -0.26, fov: 1.00 },
    { p: 0.23, alt: 190,      pitch: -0.42, fov: 0.98 },
    { p: 0.35, alt: 420,      pitch: -0.80, fov: 0.94 },
    { p: 0.46, alt: 'survey', pitch: 'survey', fov: 0.88 },
    { p: 0.72, alt: 640,      pitch: 'survey', fov: 0.88 },
    { p: 0.86, alt: 150,      pitch: -1.16, fov: 0.92 },
    { p: 0.94, alt: 26,       pitch: -0.52, fov: 1.00 },
    { p: 1.00, alt: 'land',   pitch: 'land', fov: 1.06 }
  ];

  function kfVal(v) {
    if (v === 'start') return P.startAlt;
    if (v === 'survey') return P.surveyAlt;
    if (v === 'land') return P.landAlt;
    return v;
  }
  function kfPitch(v) {
    if (v === 'survey') return P.surveyPitch;
    if (v === 'land') return P.landPitch;
    return v;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }

  var cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 1, alt: 52,
              ground: 0, p: 0, turn: 0 };

  function progress() {
    var max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    return Math.min(1, Math.max(0, scrollY / max));
  }

  /* ── the column ───────────────────────────────────────────────────────────
     Where the flight rises from. While the drift clock is running this tracks
     the opening pan; once it stops, so does this, and the column is fixed for
     the rest of the flight. Nothing else in the rig moves horizontally. */
  function site(time) {
    var drift = time * P.pan;
    spot.x = W.camera().x + drift * 0.22;
    spot.z = W.camera().z + drift;
    spot.heading = W.camera().yaw + Math.sin(time * 0.041) * 0.20;
    spot.yaw = bearingAt(spot.x, spot.z);
    spot.relief = relief;
    /* the clearing belongs to a column, so moving the column throws it away.
       It is recomputed lazily, on the way up — see `rig`. */
    land.ok = false; land.found = false;
  }

  /* The search is a few thousand height lookups, which is nothing next to a
     frame but is not free either, and running it every frame of the drift
     would be pure waste — the column it belongs to is still moving. So it
     runs once, the first time the flight has committed to leaving the deck.
     By then the column is frozen and the answer is stable for the rest of the
     page. */
  /* A regenerated terrain is a different map with the sun in a different place
     on it, and a landing chosen for the old one means nothing on the new: the
     bearing that faced the sunset now faces away from it. Nothing announces a
     rebuild — the hero owns the terrain and rebuilds it whenever its own panel
     is touched — so it is noticed rather than signalled. Two height samples and
     the sun's azimuth are enough of a fingerprint, and reading them costs
     nothing against the several thousand lookups they are guarding. `sunFace`
     rides along so that retuning the bias re-runs the search too. */
  function ensureClearing() {
    var s = W.sun;
    var stamp = curStamp + Math.atan2(s.x, s.z) * 97
              + P.sunFace * 1e4 + P.sunOff * 7e3 + P.sunSite
              + P.clearRise * 3e5 + P.clearWeight * 41;
    if (land.found && land.stamp === stamp) return;
    land.found = true;
    land.stamp = stamp;
    findClearing(spot.x, spot.z);
  }

  /* ── what the camera stands on ────────────────────────────────────────────
     The altitude in the keyframes is height above ground, so the camera needs
     a ground to be above, and it used to take one height sample directly under
     itself. That was fine while the smallest thing in the landscape was nine
     world units across: the reference moved slowly and the camera glided.

     It stopped being fine when the ground gained the detail the landing needed
     — the finest feature is now a bit over two units, so a single sample under
     a camera crossing the ground picks up every small rise and the whole frame
     bobs with it. Measured along the landing approach it wobbled 0.21 units a
     step against a camera seven units up, which is not a landscape moving, it
     is the camera shaking.

     So the camera rides the large form instead: the mean of the point it is
     over and a ring around it, which is a low pass with the fine octaves in
     the stop band. Nine height lookups a frame against the several hundred
     thousand the march is already doing, and it takes the wobble from 0.21
     to 0.09.

     The radius is small, and that is the whole of the difficulty. This ground
     is ridged — `1 - |n|`, creased at every zero crossing — so a neighbourhood
     mean does not sit level with the point at its centre, it sits *below* it,
     and the wider the ring the further below. Since the keyframe altitude is
     measured from this reference, that bias is not a rounding error: it flies
     the camera lower than the flight says it does, and low is exactly what
     brings the near field's magnification back. A radius of seven, tried
     first, cost 0.59 units of mean clearance and 2.56 at worst — a third of
     the height the camera is meant to have at the landing — while damping no
     better than a radius of three. Two gets most of the smoothing for a bias
     of 0.02, and that is the trade: take the wobble out of the ride without
     quietly lowering it. */
  function groundFor(x, z) {
    var r = P.camGround, s = W.heightAt(x, z), k, a;
    for (k = 0; k < 8; k++) {
      a = k * 0.7854;
      s += W.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
    return s / 9;
  }

  function rig(p) {
    var i = 0;
    while (i < KF.length - 2 && KF[i + 1].p < p) i++;
    var a = KF[i], b = KF[i + 1];
    var f = smooth(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p || 1))));

    var altA = kfVal(a.alt), altB = kfVal(b.alt);
    var alt = Math.exp(Math.log(altA) + (Math.log(altB) - Math.log(altA)) * f);
    var pitch = kfPitch(a.pitch) + (kfPitch(b.pitch) - kfPitch(a.pitch)) * f;
    var fov = a.fov + (b.fov - a.fov) * f;

    /* One column for the climb and the survey; the last stretch of the
       descent slides across to the clearing. Median eighty units against a
       flight that has just come down from nine hundred — it is the sideways
       drift of an aircraft lining up, not a traverse, and it happens while
       the camera is already moving fastest vertically. */
    if (p > 0.02) ensureClearing();
    var put = smooth(Math.min(1, Math.max(0,
      (p - P.landFrom) / Math.max(1e-3, P.turnTo - P.landFrom))));
    var tx2 = land.found ? land.x : spot.x, tz2 = land.found ? land.z : spot.z;
    cam.x = spot.x + (tx2 - spot.x) * put;
    cam.z = spot.z + (tz2 - spot.z) * put;

    /* the turn onto the bearing, on the way down only, and the shortest way
       round — the other way and the camera spins through three hundred degrees
       to arrive at the same place */
    var turn = smooth(Math.min(1, Math.max(0,
      (p - P.turnFrom) / Math.max(1e-3, P.turnTo - P.turnFrom))));
    var aim = land.found ? land.yaw : spot.yaw;
    var dy = aim - spot.heading;
    while (dy > Math.PI) dy -= 6.2832;
    while (dy < -Math.PI) dy += 6.2832;
    cam.yaw = spot.heading + dy * turn;

    cam.ground = groundFor(cam.x, cam.z);
    cam.alt = alt;
    cam.y = cam.ground + alt;
    cam.pitch = pitch;
    cam.fov = fov * P.fov;
    cam.p = p;
    cam.turn = turn;
    return cam;
  }

  /* ── weather ──────────────────────────────────────────────────────────────
     One gust, sampled at a depth down the page, shared with the sign-off. The
     hero and the grass are the same afternoon in the same field. */
  function gust(depth, t) {
    if (!noise) return 0;
    return noise(depth * 0.6 * 1.6 - t * P.windRate, t * 0.16) * P.windSwell;
  }

  /* ── the sign-off's own grass, switched off ───────────────────────────────
     r1b's sign-off draws a flat field with a few blades crossing the wordmark,
     and on r1b that is the whole graphic. Here it is in front of a real
     landscape with real vegetation standing on it, and two fields at two
     scales in one frame is not more grass, it is a reason to distrust both.
     It was also simply in the way: the wordmark is the last thing on the page
     and it had a thicket drawn over it.

     The element stays in the DOM and the layers stay allocated, deliberately.
     grass.js publishes the gust field that the terrain cover, the trees and
     the weather all move to, and it bails out before publishing anything if
     its two canvases are missing — remove them and the wind stops everywhere.
     So it is sown with nothing instead, which costs one empty render loop. */
  if (window.GRASS && host.hasAttribute('data-grass-front-only')) {
    GRASS.params.fullness = 0;
    GRASS.params.frontDens = 0;
    GRASS.sow();
  }

  var grassBase = window.GRASS
    ? { strength: GRASS.params.strength, bias: GRASS.params.bias } : null;

  function weather(t) {
    if (grassBase && P.toGrass) {
      var g = gust(1, t);
      GRASS.params.strength = grassBase.strength * (1 + g * 0.5 * P.toGrass);
      GRASS.params.bias = grassBase.bias + g * 0.13 * P.toGrass;
    }
  }

  /* ── canvas ─────────────────────────────────────────────────────────────── */
  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'width:100%;height:100%;display:block';
  host.appendChild(cv);
  var ctx = cv.getContext('2d');
  var buf = document.createElement('canvas');
  var bctx = buf.getContext('2d');
  var bw = 0, bh = 0, img = null, luma = null, zbuf = null, VW = 0, VH = 0;
  var atCell = 0;             /* the cell size currently allocated for      */
  /* r1b's cap, because r1b's texture is the thing being matched. The moving
     tier gets the tighter one — that is the whole point of having two. */
  var MAX_STILL = 172000, MAX_MOVE = 78000;

  function size(want) {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    VW = w; VH = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cap = want === P.cell ? MAX_STILL : MAX_MOVE;
    var cell = want;
    var cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    if (cols * rows > cap) {
      cell = Math.ceil(cell * Math.sqrt(cols * rows / cap));
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
    }
    bw = Math.max(40, cols); bh = Math.max(30, rows);
    buf.width = bw; buf.height = bh;
    img = bctx.createImageData(bw, bh);
    luma = new Float32Array(bw * bh);
    /* the distance the marcher settled on, kept so the blade pass has
       something to depth-test against. It costs one store per cell in a loop
       that was already computing the number. */
    zbuf = new Float32Array(bw * bh);
    atCell = want;
    return true;
  }

  /* Swap tiers. Reallocating two typed arrays is a fraction of a millisecond
     and it happens twice per scroll gesture, not per frame. */
  function detail(want) {
    if (atCell === want) return false;
    return size(want);
  }

  /* ── a ceiling to skip against ────────────────────────────────────────────
     Rays spend most of their length proving that nothing is there — the sky
     rays of the opening frame climb out of the world one small step at a time,
     and the grazing ones run for hundreds of units over ground that never
     comes near them. Sampling the heightfield to establish that is the single
     largest cost in the file.

     So: a grid holding the highest ground in each block. Wherever the ray is
     above the local ceiling it cannot hit anything in that block and can jump
     the whole block at once. Conservative by construction — the step never
     crosses a block boundary, and never passes the height at which the ray
     would drop to the ceiling.

     One number sits above the grid: the highest ground anywhere on the map.
     A descending ray cannot meet terrain until it has come down to that, which
     is one divide at the start of the march and, from nine hundred units up,
     five sixths of the distance.

     A stack of coarser grids above this one was tried — each level the last
     one halved, holding the max of its four children, walked with the usual
     descend-on-failure traversal. It was slower than the flat grid at every
     altitude in the flight, and it never changed the number of height samples
     a ray took, which is the thing that actually costs. The reason is that
     both ends of the problem are already covered: high over the world the
     single divide above has done the skipping before the grid is consulted,
     and down among the hills the rays are *below* the ceilings, where no
     amount of hierarchy helps and only the fine march can answer. The levels
     were pure overhead in between. Measured, removed, recorded here so it is
     not attempted a third time. */
  var BN = 48;                       /* blocks across the map               */
  var BS = 0, BW = 0, BWI = 0, BMAX = null, BTOP = 0, bmaxStamp = NaN;

  /* ── has the terrain changed under us? ────────────────────────────────────
     The hero owns the map, and rebuilds it whenever its own panel is touched
     or the reader asks for a new landscape. Nothing announces that, and three
     things on this page are baked from it: the ceiling grid the march skips
     through, the cover map the vegetation grows on, and the landing.

     All three used to ask the wrong question — "has the amplitude or the water
     level changed?" That is true when a slider moves and *false* when the map
     is regenerated at the same settings, which is the common case and the one
     the reader hits. So a new landscape kept the previous one's ceiling, which
     told the march there was nothing above a block that now had a ridge in it;
     the ray sailed straight through and struck whatever lay behind. That is
     the tearing. It kept the previous cover map too, so the trees were sown by
     an older landscape's slopes and shorelines and stood on ground that no
     longer existed. That is the floating ones.

     Both only ever appeared after asking for a new landscape and never on a
     fresh load, which is exactly the shape of a stale cache.

     So the terrain is fingerprinted rather than trusted. Nine heights on a
     coprime lattice plus the two parameters will notice any rebuild, and nine
     bilinear lookups a frame is nothing against the four hundred thousand the
     march is already doing. */
  function terrainStamp() {
    var s = ((window.TERRAIN && TERRAIN.params.amp) || 96) * 31 + P.sea * 977;
    for (var i = 0; i < 9; i++) {
      s += W.heightAt(i * 127 + 11, i * 313 + 23) * (i + 3);
    }
    return s;
  }
  var curStamp = NaN;

  function buildCeiling() {
    var N = W.size, cw = W.cellWorld;
    var sea = seaY();
    BS = N / BN; BW = BS * cw;
    BMAX = new Float32Array(BN * BN);
    var bx, bz, i, j;
    for (bz = 0; bz < BN; bz++) {
      for (bx = 0; bx < BN; bx++) {
        var m = 0;
        for (j = 0; j <= BS; j++) {
          for (i = 0; i <= BS; i++) {
            var h = W.heightAt((bx * BS + i) * cw, (bz * BS + j) * cw);
            if (h > m) m = h;
          }
        }
        /* Water counts as ground for the purposes of the skip. A block whose
           terrain is entirely below the water table is a lake, and a lake has
           a surface a ray can strike — leave the ceiling at the terrain
           maximum and rays would sail over open water and come out as sky. */
        if (m < sea) m = sea;
        /* a margin, because the bilinear surface between samples can sit a
           little above all four of them */
        BMAX[bz * BN + bx] = m * 1.02 + 1.5;
      }
    }
    /* the highest ground anywhere on the map, which is what lets a descending
       ray skip straight to the altitude where terrain becomes possible */
    BTOP = 0;
    for (i = 0; i < BMAX.length; i++) if (BMAX[i] > BTOP) BTOP = BMAX[i];
    /* the lookup runs a few times per ray for sixty thousand rays a frame, so
       the block width is kept inverted and it multiplies rather than divides */
    BWI = 1 / BW;
    bmaxStamp = curStamp;
  }

  function ceilingAt(px, pz) {
    var bx = Math.floor(px * BWI) % BN; if (bx < 0) bx += BN;
    var bz = Math.floor(pz * BWI) % BN; if (bz < 0) bz += BN;
    return BMAX[bz * BN + bx];
  }

  /* Distance along the ray to where it leaves the block it is currently in.
     This is the part the first version got wrong, and it is worth being exact
     about because the failure was so recognisable: it advanced by `BW / hxz`,
     the length of a full block measured along the ray. From the middle of a
     block that overshoots into the next one — and the skip is only sound
     within the block whose ceiling was tested. Land in a taller neighbour and
     the march has just stepped over whatever was in it.

     On screen that is not noise. Block boundaries are axis-aligned and the
     error is constant across each one, so it comes out as clean rectangles of
     missing hillside, and the landing at the bottom of the page was full of
     them. A proper slab step — nearest of the two axis planes ahead — costs
     two divides per block and cannot skip anything. */
  function blockExit(px, pz, dx, dz) {
    var t = 1e30, b;
    if (dx > 1e-9) { b = (Math.floor(px * BWI) + 1) * BW; t = (b - px) / dx; }
    else if (dx < -1e-9) { b = Math.floor(px * BWI) * BW; t = (b - px) / dx; }
    if (dz > 1e-9) { b = (Math.floor(pz * BWI) + 1) * BW; b = (b - pz) / dz; if (b < t) t = b; }
    else if (dz < -1e-9) { b = Math.floor(pz * BWI) * BW; b = (b - pz) / dz; if (b < t) t = b; }
    return t;
  }

  /* ── the march ────────────────────────────────────────────────────────────
     Starts at the last distance before which terrain is impossible, and walks
     forward. A miss returns -1.

     That starting distance used to come from the pixel below — its hit was
     taken as a lower bound on this one's — and the argument for it was that
     the ray one pixel up is shallower, so it is higher everywhere ahead and
     cannot strike anything sooner. The argument is only true for rays that
     share an azimuth, and the rays in a column only share an azimuth while
     the camera is near level. Pitch it over and the column fans out sideways:
     the horizontal part of a ray is `cp - sp·syn` along the view and a fixed
     `sxn` across it, so as the ray approaches nadir its horizontal component
     shrinks toward nothing and the azimuth swings through a large angle for
     a single row of screen. At the survey the frame is pitched seventy-eight
     degrees down and adjacent rows are no longer stacked above one another at
     all — they are laid out side by side across the ground, sampling
     different hills, and which of them is struck first is decided by the
     terrain rather than by the geometry. Below `syn = cp/sp` the rays have
     passed nadir and point backwards, and the ordering is not merely weak but
     reversed.

     The bound was therefore false on two thirds of the survey's ground
     pixels, and false in the one direction that does damage: it started the
     march *under* the surface. The first sample is then already below ground,
     the bracket the refinement is handed is `[from, from]`, and the march
     hands back `from` unchanged — so the pixel inherits the depth of the
     pixel below it, and the one above inherits it in turn. That is what the
     streaks in the lower third of the survey were: not noise, and not the
     marcher missing anything, but a column of pixels all quoting one distance.

     What replaces it is a bound that owes nothing to its neighbours. No ray
     can meet the ground before it has descended to the highest ground there
     is, and `buildCeiling` already knows what that is. It is exact, it is one
     divide, it is correct at every pitch and for every pixel independently,
     and at the survey — nine hundred up over ground that tops out near a
     hundred and thirty — it skips five sixths of the march on its own. The
     block ceiling does the rest, as it always did. */
  var TNEAR = 0.7;
  var MAXH = 260;
  var SEA = 0;        /* world height of the water table, refreshed per frame */

  var WET = false;    /* did the last trace end on water */
  var RIVER = 0;      /* river strength this frame, 0 if the map has no flow */
  var DECK = 0;       /* cloud deck strength, 0 if there is no weather      */
  var VEIL = 0;       /* the same deck from above, 0 while below it         */
  var TIME = 0;       /* the frame's clock, for the drifting field          */
  var MIST = 0;       /* strength of the pooled air, read per pixel         */
  var RELIEF = 0;     /* near-field relief strength                         */
  /* the sun flattened onto the ground plane. The relief pass needs to know
     which way the light is coming from in plan, and normalising it once a
     frame is better than doing it per pixel for every cell in the near field */
  var SUNHX = 0, SUNHZ = 1;
  /* The march's stride, both halves of it: world units per screen cell per
     unit of distance, set from the projection each frame, and the width of one
     heightmap cell, which is the finest the ground can be. See the note on the
     step for why the stride is the larger of the two. */
  var FOOT = 0.0076;
  var CELLW = W.cellWorld || 2.9;

  function trace(dx, dy, dz) {
    /* Draw distance has to grow with altitude. At the top of the survey the
       camera is nine hundred units up and the shallowest ray in frame meets the
       ground past a thousand — with a fixed 900 the top third of the survey
       returned sky and the whole phase rendered as a dark band. */
    var far = Math.max(P.far, cam.alt * 4.5);
    var cx = cam.x, cy = cam.y, cz = cam.z;
    WET = false;
    /* a ray climbing away from the terrain can never come back to it */
    if (dy > 0 && cy > MAXH) return -1;

    /* ── the water plane ────────────────────────────────────────────────
       Water needs no marching at all, because it is a level rather than a
       surface: one horizontal plane, and wherever the terrain is under it
       there is a lake. Ray against plane is a divide.

       What makes it exactly right rather than approximately right is that no
       "is there water here?" test is needed. Take the nearer of the terrain
       hit and the plane crossing. If the plane crossing wins, the ray had not
       yet reached the ground when it arrived at water level — so the ground
       at that point is necessarily below water level, so there is water
       there. The condition proves itself.

       It also pays for itself: nothing below the surface is visible, so the
       crossing is a hard draw-distance cap for every ray that descends
       through it, and lake pixels stop marching the moment they hit it. */
    var sea = SEA, tw = 1e30;
    if (dy < -1e-6 && cy > sea) {
      /* The crossing only counts if it happens inside the draw distance.
         Without that test every downward ray in the frame carries a water hit
         — a ray a hundredth off the horizontal meets the water table six
         thousand units out, far past anything being drawn — and the march
         hands back water instead of sky for the entire lower half of a hero
         that has no lake anywhere near it. */
      var t0 = (sea - cy) / dy;
      if (t0 < far) { tw = t0; far = t0; }
    }

    var h, step, guard = 0;
    var t = TNEAR;
    /* down to the top of the world, in one divide */
    if (dy < -1e-6 && cy > BTOP) {
      var tc = (cy - BTOP) / -dy;
      if (tc > t) t = tc;
    }

    var hxz = Math.sqrt(dx * dx + dz * dz);
    if (hxz < 0.02) hxz = 0.02;

    /* ── the step, and why it has a ceiling ──────────────────────────────
       A step proportional to distance is right for a ray driving into the
       ground: the surface it can hit is farther away in world units the
       farther out it is, so the sampling stays roughly constant in screen
       terms. It is exactly wrong for a ray running nearly parallel to the
       ground, which is every ray in the lower half of the frame once the
       camera is five metres up at the landing. There, t*0.035 reaches thirty
       world units by the time the ray is nine hundred out — ten heightmap
       cells at a stride — and the march steps clean over whole ridges. Five
       halvings then refine a crossing that was never detected. That was the
       broken, torn-looking ground at the bottom of the page: not noise, but
       ridges that the marcher simply never sampled.

       So the step is capped, and the cap is scaled by how steeply the ray is
       descending. A ray going straight down can afford long strides; one
       skimming the surface cannot, and pays for it only where it matters.

       ── and why the stride is a screen cell ──────────────────────────────
       The stride used to be `t * 0.035`, and the constant is the thing to
       look at: what a distance-proportional step is *for* is to sample about
       once per screen cell, since nothing finer than that can be drawn. One
       cell subtends `2·tx/bw`, which this file already computes as `footK`
       for the grain — and solving 2·tx/bw = 0.035 gives a frame 46 cells
       wide. That is what the number was tuned against, and the buffer has
       been four times that for a long time, so the march had quietly been
       sampling every three or four screen cells and interpolating the rest.

       It did not show, because until the bound above was corrected no ray
       ever used this schedule: each one started at its neighbour's hit, a
       fraction of a unit from the surface, and struck ground on the first or
       second step. Fixing the bound put the march back to work and the old
       constant with it — at the survey, 23 world units a step against a 6.8
       unit cell, which reads as erosion channels filling in and flat ground
       spreading where there should be relief.

       So the stride is `footK` itself — the same quantity the grain uses to
       pick its octaves, scaling with resolution and field of view without
       being retuned.

       With a floor of one heightmap cell, which is the other half of the same
       argument. The stride must not step over anything worth resolving, and a
       feature is only worth resolving if it is both real and visible: nothing
       exists below one map cell, because the surface is bilinear between
       samples and cannot hide a ridge inside one, and nothing matters below
       one screen cell, because that is the Nyquist retreat the grain already
       makes. So the smallest thing worth not missing is the larger of the
       two, and the stride follows it.

       Both ends of that matter, and each was wrong on its own. Out at the
       survey the screen cell is the larger — 6.8 units against a 2.9 unit map
       cell — and the old constant strode 23, which is what filled the erosion
       channels in. Down in the near field the map cell is the larger, and a
       stride of one screen cell would be a quarter of a unit: four times the
       marching for detail the heightfield does not contain. The old constant
       happened to be about right there, which is why the opening pan never
       looked wrong and why chasing it with `footK` alone cost half the frame
       rate for nothing. */
    var graze = Math.abs(dy) / hxz;                 /* 0 = parallel to ground */
    var cap = P.stepCap * (0.35 + 2.2 * Math.min(1, graze));
    step = Math.min(cap, Math.max(CELLW, t * FOOT) / P.quality);
    guard = 0;
    var prev = t;
    while (t < far && guard++ < 900) {
      var ry = cy + dy * t;
      var qx = cx + dx * t, qz = cz + dz * t;
      var mh = ceilingAt(qx, qz);
      /* above the local ceiling: nothing in this block can be struck, jump it */
      if (ry > mh) {
        /* out of this block, and a hair further so the next iteration is
           unambiguously inside the next one */
        var adv = blockExit(qx, qz, dx, dz) + 1e-3;
        /* …but not past the point where a descending ray meets this ceiling */
        if (dy < 0) {
          var tv = (ry - mh) / -dy;
          if (tv < adv) adv = tv;
        }
        /* deliberately NOT floored at `step`: forcing a minimum here would
           reintroduce exactly the overshoot the slab step exists to prevent.
           The epsilon above already guarantees forward progress, and a ray
           grazing a boundary pays for it once, not repeatedly. */
        prev = t;
        t += adv;
        /* the skip is exact, so it is free to be long — but the ordinary step
           it hands back to must respect the cap */
        step = Math.min(cap, Math.max(step, Math.max(CELLW, t * FOOT) / P.quality));
        continue;
      }
      /* An ascending ray that has cleared the highest ground cannot come back
         down to it. Without this every sky pixel at the landing — where the
         camera is two units up and half the frame is sky — marched the full
         nine hundred units before admitting it had missed. */
      if (dy > 0 && ry > MAXH) return -1;
      h = W.heightAt(qx, qz);
      if (ry < h) {
        /* crossed between prev and t. Seven halvings rather than five: after
           a long ceiling skip the bracket can be a whole block wide, and five
           left an error big enough to shimmer along the near ridgelines. */
        var lo = prev, hi = t, mid, k;
        for (k = 0; k < 7; k++) {
          mid = (lo + hi) * 0.5;
          if (cy + dy * mid < W.heightAt(cx + dx * mid, cz + dz * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = t;
      t += step;
      step = Math.min(cap, step * 1.0125);
    }
    /* ran out of terrain. If the ray descended through the water plane on the
       way, that is what it is looking at. */
    if (tw < 1e29) { WET = true; return tw; }
    return -1;
  }

  /* ── sky ────────────────────────────────────────────────────────────────
     By ray direction rather than by screen row, which the column marcher could
     get away with and this cannot: at eighty degrees of pitch a screen row is
     not an elevation. */
  var SUN = W.sun;

  /* Fill a column from row `y0` up to the top with sky. Called once, when a
     ray misses — see the note in the render loop for why everything above it
     must miss too. The directions are rebuilt here rather than carried out of
     the loop because that is three multiplies a cell against the alternative
     of keeping a parallel array alive for the whole frame. */
  /* ── the sky, and the clouds that were already casting on the ground ──────
     The weather has crossed this landscape from the beginning: `MEADOW.cloud`
     is a drifting world-space field, and the terrain has been reading it and
     going dark under it for as long as there have been clouds in this file.
     What there has never been is a cloud. The sky was a gradient and a sun
     glow, so every shadow on those hills was being thrown by nothing — which
     is the sort of thing that cannot be unseen once it has been noticed.

     The fix is not to invent weather but to look at the weather that is
     already there. A cloud deck is a horizontal plane at `deckY`; a sky ray
     meets it at a known distance; sample the same field at that point and the
     cloud and the shadow it lays on the valley are the same object, drifting
     at the same rate, because they are the same three lines of noise.

     Perspective comes free and is most of the effect. The distance to the
     plane goes as 1/dy, so a deck of evenly sized cells compresses toward the
     horizon exactly as a real one does — overhead they are broad and separate,
     and by the skyline they have stacked into a band. Nothing about that had
     to be drawn; it is what a plane looks like.

     Two things are deliberately not modelled. The deck has no thickness, so
     from above it you would see nothing — and above it is the survey, which
     is pitched seventy-eight degrees down and has almost no sky in frame, so
     the case pays for itself by not arising. And it fades out with distance
     rather than running to the horizon: past a few thousand units the noise
     is turning over faster than one screen cell can hold, and detail below
     the cell is what makes a dithered image boil. It is the same Nyquist
     retreat `grain` makes, and it reads as cloud losing itself in haze. */
  function sky(x, y0, ax, ay, az, ux, uy, uz, ty, bh) {
    var deck = DECK, deckY = P.deckY, far = P.deckFar;
    var above = cam.y >= deckY;
    for (var y = y0; y >= 0; y--) {
      var syn = (1 - (y + 0.5) / bh * 2) * ty;
      var dx = ax + syn * ux, dy = ay + syn * uy, dz = az + syn * uz;
      var il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx *= il; dy *= il; dz *= il;
      var sunDot = dx * SUN.x + dy * SUN.y + dz * SUN.z;
      var v = skyLum(dy, sunDot);

      if (deck > 0 && !above && dy > 1e-3) {
        var td = (deckY - cam.y) / dy;
        if (td > 0 && td < far) {
          var cover = MEADOW.cloud(cam.x + dx * td, cam.z + dz * td, TIME)
                    / (MEADOW.params.cloudDepth || 1);
          if (cover > 0.001) {
            /* the cloud's own value: a dark body, and a hot edge wherever it
               sits toward the sun. At this hour that contrast is the whole
               character of the sky — undersides in shadow, rims on fire */
            var cl = P.deckDark
                   + P.deckGlow * Math.pow(sunDot > 0 ? sunDot : 0, P.deckGlowPow);
            var fade = 1 - td / far;
            fade *= fade;
            v += (cl - v) * cover * deck * fade;
          }
        }
      }
      luma[y * bw + x] = v;
    }
  }

  /* ── water, lit ───────────────────────────────────────────────────────────
     Three things, and the middle one is what makes it read as water rather
     than as a hole in the terrain.

     A body tone, which is nearly nothing: clear water seen from above is dark,
     and every mistake here is made by starting too bright.

     A Fresnel term. Looked at from overhead, water is dark and transparent;
     looked at along the surface it is a mirror. That change with angle is the
     single most recognisable thing about it, and it is what makes a lake at
     the far end of a survey pale into the sky while the same lake underfoot
     stays black.

     And the sun's path — a specular lobe off a rippled normal. Real water
     scatters one sun into a long streak because the surface is a field of
     small slopes, all facing slightly differently, so the highlight is drawn
     with a moving normal rather than a flat one. Cheap trigonometric swell
     rather than sampled noise: two sines are enough at this cell size, and
     the ripple is only ever a perturbation of the reflection. */
  /* `bed` is how much light comes back up off the bottom, 0 to 1, and it is an
     argument rather than a lookup because two different things call this. A
     lake works it out from its own depth — the pale rim is the whole reason
     that term exists. A river has no water table to measure against, and the
     answer for one is low for reasons that are not depth at all: it is cut
     into its own banks, shaded by them, and moving. Which is why a river in a
     valley reads as a *dark* line from above and only lights up when it turns
     far enough to catch the sun — the opposite of the intuition, and the thing
     that makes an aerial view of a range look the way it does.

     Everything else about the surface — the ripple, the reflection, the sun's
     path, the shading it sits under — is the same phenomenon for both and
     should not be written twice. */
  function water(px, pz, dx, dy, dz, t, bed, gloss, rr) {
    var wt = t * P.rippleRate;
    var nx = Math.sin(px * 0.21 + wt) * Math.sin(pz * 0.13 - wt * 0.7) * rr;
    var nz = Math.sin(pz * 0.17 - wt * 0.8) * Math.cos(px * 0.11 + wt * 0.6) * rr;

    /* reflect the view about the perturbed normal. |n| is 1 to first order in
       the ripple, which at these amplitudes is exact enough to be invisible */
    var vn = dx * nx + dy + dz * nz;
    var rx = dx - 2 * vn * nx, ry = dy - 2 * vn, rz = dz - 2 * vn * nz;

    var sd = rx * SUN.x + ry * SUN.y + rz * SUN.z;
    /* the sun's path stops at the mountain's shadow, like everything else on
       this page — one extra lookup, and without it a lake lying in shade still
       carried a highlight and read as a hole rather than as water */
    var sh = W.shadeAt(px, pz);
    /* and the weather, on the same terms the terrain gets it — a cloud over a
       lake takes the sun's path off it, which is most of what tells you a
       cloud is there when you are looking at water */
    if (window.MEADOW && P.cover > 0) sh *= 1 - MEADOW.cloud(px, pz, t);
    var spec = sd > 0 ? Math.pow(sd, gloss) * sh : 0;

    /* Schlick, near enough, on the angle between the ray and the surface —
       but with a floor well above the textbook 0.02. Schlick answers "how
       much of one incoming direction bounces", and a real surface integrates
       a whole sky dome plus what comes back up out of the water, so straight
       down is dimmer than the sides and never actually two per cent. Left at
       0.02 the survey filled up with lakes the exact value of terrain in
       shadow, which is the one thing water must not be. */
    var c = Math.abs(dy); if (c > 1) c = 1;
    var f = P.waterFloor + (1 - P.waterFloor) * Math.pow(1 - c, 5);

    /* ── the shallows ──────────────────────────────────────────────────────
       Fresnel alone is physically right and visually useless from above. Look
       straight down at water and the reflectance is two per cent, so the whole
       lake comes out at the body tone — which on this palette is the same
       value as terrain in shadow, and the survey filled up with dark patches
       that could equally have been either.

       What actually distinguishes water from above is depth. Light gets back
       out of a shallow lake and not out of a deep one, so the edges are pale
       and the middle is not, and it is that band around the rim which says
       "water" from any altitude. It costs one height lookup — the bed is
       already under the point being shaded. */
    var shallow = bed * P.waterShallow * (0.35 + 0.65 * sh);

    var v = P.waterBase + shallow + f * P.waterSky * skyLum(ry, sd) +
            spec * P.waterSpec;
    return v > 1 ? 1 : v;
  }

  /* ── the air between ──────────────────────────────────────────────────────
     The terrain gets aerial perspective per pixel, inside the march. Anything
     drawn *after* the march has to be given the same air or it does not live
     in the same landscape, and the trees were not being given any.

     The numbers say how bad that is. At the descent the air column works out
     at 0.9 of sea-level density, so ground a hundred units out has been
     carried 23% of the way to sky luminance, ground at two hundred 53%, and
     ground at three hundred and twenty — the far edge of where trees are sown
     — 77%. The trees on it were painted at nought per cent, full strength,
     every one of them.

     Value is the depth cue. A dark shape at full contrast against a background
     three quarters washed out is not a tree in the distance, it is a
     tree-shaped hole in the picture plane — which is exactly what they looked
     like: cut-outs floating over the hills, detached from the ground they
     stand on. Nothing about their position was ever wrong.

     Handed back as a multiply and an add, because the caller applies it per
     pixel underneath its own shading: `v * k + add`. */
  /* ── the inversion ────────────────────────────────────────────────────────
     The air column above already thins with height, which is right and is
     what keeps the survey crisp while the hero keeps its heavy horizon. What
     a scale height cannot describe is the thing that actually happens to a
     range at this hour: as the ground cools, the air lying on it cools with
     it, and settles. It does not disperse — it pools, in the valleys, in a
     layer with a top to it, and by dusk the ridges are standing out of a lake
     of luminous air with their feet lost in it.

     That is a different quantity from distance haze and it is driven by a
     different number. Haze asks how far the light travelled; this asks how
     deep in the pool the thing being looked at is sitting. So it is keyed on
     the height of the point itself rather than the midpoint of the path —
     which also fixes the case the midpoint gets wrong, and it is the one that
     matters most: from nine hundred units up, the midpoint of a ray into a
     valley floor is halfway up the sky and utterly out of the mist, while the
     valley it lands in is full of it.

     What it buys is depth separation in a picture that is otherwise short of
     it. Every cue this renderer has is value, and value alone flattens a
     range into a silhouette; an inversion sorts it into layers, each ridge
     paler than the one in front, which is the oldest depth cue there is and
     the reason a photograph of mountains at dusk reads as distance rather
     than as pattern. */
  function mistAt(range, hitY) {
    if (MIST <= 0) return 0;
    var below = (P.mistY - hitY) / P.mistSoft;
    if (below <= 0) return 0;
    if (below > 1) below = 1;
    below = below * below * (3 - 2 * below);
    return 1 - Math.exp(-range * MIST * below);
  }

  function airAt(range, hitY, dx, dy, dz, out) {
    var dens = Math.exp(-Math.max(0, (cam.y + hitY) * 0.5) / P.airHeight);
    var h = 1 - Math.exp(-range * P.haze * dens);
    h *= h;
    var sunDot = dx * SUN.x + dy * SUN.y + dz * SUN.z;
    /* the pooled air on top of the column, not instead of it, and carrying
       its own light — see the main loop for why it cannot be the same value */
    var m = mistAt(range, hitY);
    var k = (1 - h) * (1 - m);
    out[0] = k;
    out[1] = skyLum(dy, sunDot) * h * (1 - m) + mistLum(sunDot) * m;
  }

  /* What an inversion is lit by, and it is not the sky overhead. The pool
     lies in the bottom of the valley with the sun coming in almost flat
     across it, so what fills it is horizon light — which at this hour is the
     brightest thing in the world and is why valley mist at dusk glows rather
     than greys. Taken at the horizon in whatever direction the ray is looking,
     so it burns where it faces the sun and stays cool away from it.

     The first version of this blended toward `skyLum(dy)` — the sky in the
     ray's own direction — which for a camera looking down at a valley is the
     sky *below the horizon*, a value of about 0.09. The mist came out darker
     than the ground it was supposed to be lifting, and a landscape that
     should have been filling with light went flat and dim instead. */
  function mistLum(sunDot) {
    return skyLum(P.mistLit, sunDot) * P.mistGain;
  }

  function skyLum(dy, sunDot) {
    var base = P.skyBase + P.skyBand *
      Math.pow(Math.max(0, 1 - Math.abs(dy - 0.02) / P.skyWidth), 2.4);
    var glow = Math.pow(Math.max(0, 1 - Math.abs(dy) / P.glowTight), 2.0) *
               Math.pow(Math.max(0, sunDot), P.glowPow);
    var v = base + glow * P.glow;
    return v > 1 ? 1 : v;
  }

  function render(p, time) {
    if (!bw) return;
    /* the hero tab can rebuild the heightmap underneath us, and the water
       level is part of what the ceiling encodes */
    curStamp = terrainStamp();
    if (!BMAX || bmaxStamp !== curStamp) buildCeiling();
    SEA = seaY();
    rig(p);
    weather(time);

    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    /* forward; right, which is horizontal by construction and matches the
       screen-x basis the hero already uses; and up = forward × right.
       That order matters — the other one is the same vector negated, and the
       first version of this file rendered the world upside down. */
    var fx = sy * cp, fy = sp, fz = cy * cp;
    var rx = cy, rz = -sy;
    var ux = -sp * sy, uy = cp, uz = -sp * cy;

    /* The ceiling the sky test uses. This was an estimate from the amplitude —
       amp × 1.25 + 8 — which is the one number in the march that was guessed
       rather than measured, and a guess on the low side here does not degrade
       gracefully: it tells an ascending ray it has left the world while there
       is still a ridge above it. The block stack already knows the real answer
       exactly, so it may as well be asked. */
    MAXH = BTOP;

    /* fov is a tangent, not an angle — the same convention the hero uses, so
       the two agree. Read as radians it gave a 53° view where the hero has 85°,
       and the opening came out as a narrow band of hazed distance with no
       ridgeline in it at all. */
    var tx = cam.fov, ty = tx * (bh / bw);
    var litBase = P.litBase, litGain = P.litGain, rimG = P.rim;
    var altB = P.altBoost, hazeK = P.haze;
    var amp = (window.TERRAIN && TERRAIN.params.amp) || 96;

    /* world units per screen cell, per unit of distance. The grain reads it to
       pick its octaves and the march uses it as its stride — the same number,
       because "finer than one cell cannot be drawn" answers both questions. */
    var footK = 2 * tx / bw;
    FOOT = footK;

    /* Rivers cost a flow lookup on every ground pixel, so the whole pass is
       hoisted behind one flag: off if the reader has turned them down, and
       off on a map that was never eroded, where `flowAt` would dutifully
       return zero several hundred thousand times a frame. */
    RIVER = (W.flowAt && TERRAIN.params.erode > 0) ? P.river : 0;

    /* the deck rides on the same field the ground shadows come from, so it is
       only there when the vegetation pass that owns that field is */
    TIME = time;
    DECK = (window.MEADOW && P.cover > 0) ? P.deck : 0;
    /* one plane, two faces: the sky pass draws its underside from below, the
       march veils the ground with its top from above, and only one of those
       can be true at a time */
    VEIL = (DECK > 0 && cam.y > P.deckY) ? P.veil : 0;
    MIST = P.mist;
    RELIEF = (window.MEADOW && MEADOW.relief) ? P.relief : 0;
    var shl = Math.sqrt(SUN.x * SUN.x + SUN.z * SUN.z) || 1;
    SUNHX = SUN.x / shl; SUNHZ = SUN.z / shl;

    /* the cover map is baked from the terrain and the water level, so it is
       rebuilt on the same conditions the ceiling is */
    var cover = window.MEADOW && P.cover > 0;
    if (cover && MEADOW.stale(curStamp)) MEADOW.bake(W, amp, SEA, curStamp);

    var x, y, o;

    /* ── up the column ───────────────────────────────────────────────────
       Two versions of this loop tried to make one pixel's march pay for the
       next one's, and both were unsound for the same reason — see the note on
       the march, which now derives its start from the world instead. What is
       left of the coherence is the one part that survives a pitched camera:
       once a column has cleared the terrain it is sky the rest of the way up.

       That much is safe here because it is only ever claimed where there is
       sky to claim. The hero is near level, where a column really is a
       vertical fan and a ray that missed guarantees the ones above it miss;
       the survey, which is where the fan breaks down, is pitched far enough
       over that there is no sky in the frame at all and the early-out never
       fires. */
    for (x = 0; x < bw; x++) {
      var sxn = ((x + 0.5) / bw * 2 - 1) * tx;
      var ax = fx + sxn * rx, ay = fy, az = fz + sxn * rz;

      for (y = bh - 1; y >= 0; y--) {
        var syn = (1 - (y + 0.5) / bh * 2) * ty;
        var dx = ax + syn * ux, dy = ay + syn * uy, dz = az + syn * uz;
        var il = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= il; dy *= il; dz *= il;

        var sunDot = dx * SUN.x + dy * SUN.y + dz * SUN.z;
        o = y * bw + x;

        var t = trace(dx, dy, dz);
        if (t < 0) {
          sky(x, y, ax, ay, az, ux, uy, uz, ty, bh);
          for (var yy = y; yy >= 0; yy--) zbuf[yy * bw + x] = 1e30;
          break;
        }
        zbuf[y * bw + x] = t;

        var px = cam.x + dx * t, pz = cam.z + dz * t;
        var lit;
        if (WET) {
          /* the lake's own depth, as the pale rim has always been drawn from */
          var dep = SEA - W.heightAt(px, pz);
          lit = water(px, pz, dx, dy, dz, time,
                      Math.exp(-(dep > 0 ? dep : 0) / P.waterDepth),
                      P.waterGloss, P.ripple);
        }
        else {
        var sh = W.shadeAt(px, pz);
        /* Cloud takes the sun out before anything is lit by it, rather than
           darkening the result afterwards. A shadow removes the direct beam
           and leaves the ambient, so sunlit slopes go dark under one and
           ground already in the shade of a ridge barely changes — which is
           the difference between weather and a stain on the picture. */
        if (cover) sh *= 1 - MEADOW.cloud(px, pz, time);
        lit = litBase + litGain * sh + rimG * Math.pow(sh, 6);
        var alt = (W.heightAt(px, pz) / amp - 0.52) / 0.48;
        if (alt > 0) lit += altB * (alt > 1 ? 1 : alt);

        /* ── ground cover ────────────────────────────────────────────────
           Grass is not a texture laid over rock, it is a different material
           standing on it: darker, softer, and without the hot rim the bare
           faces carry. So the cover fraction mixes two lit values rather
           than tinting one, and then the grain rides on top of it.

           `foot` is the world width of one screen cell here, which is what
           tells the grain which of its octaves it is allowed to draw. It
           falls straight out of the projection: the frame spans 2·tx of
           tangent across bw cells, at distance t. */
        if (cover) {
          var foot = t * footK;

          /* the small form of the ground, added to the key light before the
             materials are mixed — it belongs to the shape of the hill, not to
             what happens to be growing on it, so grass and rock take it alike */
          if (RELIEF > 0) {
            var rel = MEADOW.relief(px, pz, foot, t, SUNHX, SUNHZ);
            if (rel !== 0) lit += rel * sh * RELIEF;
          }

          var cv = MEADOW.coverAt(px, pz);
          if (cv > 0.004) {
            var grass = litBase + litGain * sh * MEADOW.params.albedo;
            lit += (grass - lit) * cv;
            lit += MEADOW.grain(px, pz, foot) * cv;
          }
          /* and rock on whatever is left. `1 - cv` is a free slope term: the
             cover map is zero on steep ground by construction, so this puts
             broken texture exactly where the rock is and nowhere else. It is
             what stops the near field reading as poured material — see `rock`
             in meadow.js for why shading is all that is available there. */
          if (cv < 0.996) lit += MEADOW.rock(px, pz, foot) * (1 - cv);
        }

        /* ── the water in the valleys ────────────────────────────────────
           The erosion pass left a map of how much ground drains through each
           point, and above a threshold that is not a slope any more, it is a
           watercourse. Drawn as a material on the ground the marcher already
           hit rather than as geometry of its own: a river at this scale is
           one to three cells across, so carving a surface for it would be
           spending a lot to describe something thinner than the dither.

           What makes it read is not the shape but the value. Water is the
           only thing in this landscape that reflects — everything else is
           diffuse — so a channel comes out as a thread of sky brightness and
           a broken sun path lying in the bottom of a valley, which at a low
           sun is the most conspicuous thing on a hillside and is exactly how
           you pick a river out of a real one from the air.

           Three qualifications, all of them the same point: water goes where
           water can. Not on steep ground, because it would be a waterfall and
           not a surface; not below the water table, because that is a lake
           and already drawn; and faded in across the bank rather than
           switched on, because the sqrt-normalised drainage field is a width,
           and a channel that starts at full strength has no banks. */
        if (RIVER > 0 && !WET) {
          var fl = W.flowAt(px, pz);
          if (fl > P.riverFrom) {
            var wide = (fl - P.riverFrom) / P.riverSoft;
            if (wide > 1) wide = 1;
            wide = wide * wide * (3 - 2 * wide);
            /* the slope here, from the same central difference everything
               else uses. A stream will not lie on a face */
            var e = W.cellWorld;
            var sx2 = (W.heightAt(px + e, pz) - W.heightAt(px - e, pz)) / (2 * e);
            var sz2 = (W.heightAt(px, pz + e) - W.heightAt(px, pz - e)) / (2 * e);
            var grad = Math.sqrt(sx2 * sx2 + sz2 * sz2);
            var flat = 1 - grad / P.riverFlat;
            if (flat > 0) {
              if (flat > 1) flat = 1;
              /* A river is rougher water than a lake, and that is the whole
                 difference between the two here. A lake is a mirror: at
                 gloss 95 its sun path is a sheet you either see or do not.
                 Moving water is broken into a thousand facets, so the same
                 path spreads into a sheen that is visible from most of the
                 valley — which is exactly why you can trace a river across a
                 landscape at a low sun and cannot always find a pond in it. */
              var wv = water(px, pz, dx, dy, dz, time,
                             P.riverBed, P.riverGloss, P.riverRipple);
              lit += (wv - lit) * wide * flat * RIVER;
            }
          }
        }
        }
        /* Aerial perspective through an air column with a scale height, not a
           flat constant times slant range.

           The hero's single `haze` constant works because the hero only ever
           looks along the ground, where the air is dense the whole way. Reused
           unchanged for a camera nine hundred units up it hazed the survey out
           to a flat dark field: the ground was a thousand units away, so it got
           a thousand units of sea-level murk applied to it.

           Weighting by the density at the midpoint of the path fixes all three
           regimes at once — the hero keeps its heavy horizon, the survey comes
           out crisp, and the landing gets its distant range back. */
        var hitY = cam.y + dy * t;
        var dens = Math.exp(-Math.max(0, (cam.y + hitY) * 0.5) / P.airHeight);
        var haze = 1 - Math.exp(-t * hazeK * dens);
        haze *= haze;
        var l = lit + (skyLum(dy, sunDot) - lit) * haze;
        /* and the air that has settled into the valleys, over the top of the
           distance haze rather than mixed into it: the two are lit by
           different things and blending toward one value would be saying they
           are the same weather. The trees take the identical pair from
           `airAt`, because a wood standing in the mist and the hillside in
           front of it have to be in the same air. */
        var mv = mistAt(t, hitY);
        if (mv > 0) l += (mistLum(sunDot) - l) * mv;

        /* ── cloud from above ─────────────────────────────────────────────
           The survey has no sky in it. At seventy-eight degrees down the
           frame is entirely ground, so the deck — which is drawn on sky rays
           — has nothing to draw on, and the middle of the flight was the one
           stretch with weather on the hills and nothing in the air making it.

           But a camera at nine hundred units is not below the weather, it is
           *above* it, and what you actually see from up there is the tops:
           wisps lying over the landscape, bright where the low sun catches
           them, with their own shadows on the ground beside them. That is
           not a second cloud system, it is the same plane seen from the
           other face — so this is the same intersection the sky pass does,
           with the sign of the ray reversed, sampling the same field.

           It composites over the finished ground, haze and all, because it
           is in front of it: the cloud is between the camera and the hill,
           so everything that happened to the hill happened behind it.

           `td < t` is the whole test for whether it is in front. A ray that
           reaches the ground before it reaches the cloud plane is a ray
           looking at a hillside that stands above the weather, and those
           want no veil at all — which is what puts the peaks through it. */
        if (VEIL > 0 && dy < -1e-4) {
          var td = (P.deckY - cam.y) / dy;
          if (td > 0 && td < t && td < P.deckFar) {
            var vc = MEADOW.cloud(cam.x + dx * td, cam.z + dz * td, TIME)
                   / (MEADOW.params.cloudDepth || 1);
            if (vc > 0.001) {
              /* the lit top of it. No terrain can shade this — it is above
                 everything — so it is the one surface in the frame that
                 takes the sun unconditionally, and that is why cloud tops
                 read so bright against land at this hour. */
              var vl = P.veilBase
                     + P.veilGlow * Math.pow(sunDot > 0 ? sunDot : 0, P.deckGlowPow);
              var vf = 1 - td / P.deckFar;
              l += (vl - l) * vc * VEIL * vf * vf;
            }
          }
        }
        luma[o] = l < 0 ? 0 : l > 1 ? 1 : l;
      }
    }

    /* ── trees ─────────────────────────────────────────────────────────────
       After the terrain and before the screening, so they are dithered with
       everything else and belong to the same printing rather than sitting on
       top of it as a second graphic. They are handed the landing spot because
       the forest has to keep out of the glade — see meadow.js. */
    if (cover && P.trees > 0) {
      MEADOW.trees(luma, zbuf, bw, bh, cam,
        { fx: fx, fy: fy, fz: fz, rx: rx, rz: rz, ux: ux, uy: uy, uz: uz,
          air: airAt },
        tx, ty, time, noise, land.found ? land : null);
    }

    SCREEN.screen(luma, img, bw, bh, RAMP);
    bctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, VW, VH);

    if (P.bloom) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = P.bloom;
      ctx.filter = 'blur(' + Math.max(6, Math.round(Math.min(VW, VH) * 0.03)) + 'px)';
      ctx.drawImage(buf, 0, 0, VW, VH);
      ctx.restore();
    }

    if (instruments) instruments(cam, land.found ? land : spot);
  }

  /* The instrument rail hangs off this rather than reading the camera itself,
     so there is exactly one place that decides when the numbers are stale. */
  var instruments = null;

  /* ── run ──────────────────────────────────────────────────────────────────
     The camera does not read the scrollbar. It chases it.

     Scroll arrives as a burst of discrete jumps — a trackpad flick delivers
     several hundred pixels across a handful of events, and momentum keeps
     firing them for another half second. Mapped straight onto the rig, that is
     a camera that lurches: the previous cut of this file also dropped its idle
     tick to one frame in six once scrolling started, so between bursts the
     flight was stepping rather than flying.

     So `pWant` is the scrollbar and `pAt` is the aeroplane, and the second
     follows the first with a time constant. Exponentially, framerate-
     independently, so a 144Hz screen and a 60Hz screen fly the same arc. What
     the reader gets is inertia: a shove on the wheel becomes a smooth
     acceleration and a settle, which is what an aircraft does and what a
     scrollbar does not.

     It also buys the resolution swap for nothing. `pAt` says whether the
     camera is moving far more honestly than a scroll event does — a scroll
     event is over the instant it fires, whereas the camera keeps flying for
     the length of the lag. */
  var pWant = 0, pAt = 0;
  var driftClock = 0;   /* the opening pan. stops when the rise begins       */
  var windClock = 0;    /* the weather. never stops — the grass is still down
                           at the sign-off long after the drift has frozen   */
  var lastFrame = performance.now(), lastPaint = 0, settleAt = 0, rest = 0;
  var MOVE_EPS = 3e-4;  /* progress per second below which it has landed     */

  function draw() { lastPaint = performance.now(); render(pAt, windClock); }

  /* The top bar is transparent over the hero and takes its ground back below
     it. Two thresholds rather than one, or a page parked on the boundary
     flickers the bar on and off with every sub-pixel of scroll. */
  var root = document.documentElement;
  function bar() {
    var on = root.classList.contains('is-flown');
    if (!on && pWant > 0.012) root.classList.add('is-flown');
    else if (on && pWant < 0.004) root.classList.remove('is-flown');
  }

  function step(now) {
    var dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    windClock += dt;
    pWant = progress();

    /* The drift clock only runs while the page is genuinely at the top.
       Freezing it at the start of the rise is what fixes the column — and
       because it freezes at exactly the position the drift had reached, there
       is nothing to jump over. */
    var top = pWant < 0.004 && pAt < 0.004;
    if (top) { driftClock += dt; site(driftClock); }

    bar();

    var was = pAt;
    pAt += (pWant - pAt) * (1 - Math.exp(-dt / Math.max(0.02, P.lag)));
    if (Math.abs(pWant - pAt) < 1e-4) pAt = pWant;

    var scrolling = Math.abs(pAt - was) / Math.max(dt, 1e-3) > MOVE_EPS;
    var flying = top || scrolling;

    /* Narrow viewports have no gutter, so the rail sits over the copy there.
       It is an instrument: it earns its place while the reader is flying and
       is in the way while they are reading. So it comes out during a gesture
       and withdraws about a second after the camera settles — and the flag is
       driven by actual scrolling rather than by `flying`, because the opening
       pan never stops and would pin it open over the hero forever. */
    if (scrolling) { rest = 0; root.classList.add('is-flying'); }
    else if (!rest) rest = now;
    else if (now - rest > 900) root.classList.remove('is-flying');

    if (flying) {
      settleAt = 0;
      /* The opening pan is motion, but it is slow, unattended motion, and it
         is the frame most readers will look at longest — so it keeps the fine
         tier. Only a scroll gesture buys the coarse one. */
      detail(top ? P.cell : P.cellMove);
      draw();
      return;
    }

    /* Settled. Come up to the fine tier once, then draw only slowly — enough
       to keep the weather crossing, not enough to cost anything. */
    if (!settleAt) settleAt = now;
    if (now - settleAt < 90) return;
    if (atCell !== P.cell) { detail(P.cell); draw(); return; }
    /* The only thing moving on a settled frame is the weather, and the
       weather now takes two minutes to cross rather than two seconds — so
       this can be a slow tick without anything looking stepped. It was 240ms
       against a 1.8-second cloud cycle, which is where the stutter came from;
       at this speed even 400 is smooth, and it is the difference between
       spending a tenth of a core on an idle page and a fifth. */
    if (now - lastPaint > P.idle) draw();
  }

  /* ── r1d asks for cast shadows ────────────────────────────────────────────
     terrain.js defaults them off so that r1b, which shares the file, keeps the
     look it already has. This page wants them: it puts the reader on the
     ground at the end, and near ground with no shadow on it is the flattest
     thing in the frame — one heightmap cell covers about twenty-eight render
     cells down there, so shading is the only information it carries. */
  if (window.TERRAIN && TERRAIN.params.shadow === 0) {
    TERRAIN.params.shadow = 0.85;
    TERRAIN.shade();
  }

  /* ── and asks for the water to have been run ──────────────────────────────
     Same arrangement, same reason. r1b looks at this map from one altitude
     down one bearing, where ridged noise is convincing enough. This page flies
     the reader from nine hundred units to five over the course of the scroll,
     and the survey in the middle of that is the frame where a landscape either
     has drainage or admits it does not: from up there you are looking at the
     plan of the thing, and a plan is exactly what erosion writes.

     It costs a one-off pass at build rather than anything per frame, and it
     has to happen before the ceiling and the cover map are baked from the
     heightmap — hence here, before the first `terrainStamp`. */
  if (window.TERRAIN && TERRAIN.params.erode === 0) {
    TERRAIN.params.erode = 1;
    TERRAIN.params.shadow = 0.85;
    TERRAIN.build();
  }

  curStamp = terrainStamp();
  buildCeiling();
  site(0);
  size(P.cell);
  draw();

  if (!REDUCED) {
    (function tick(now) { step(now); requestAnimationFrame(tick); })(performance.now());
  } else {
    /* reduced motion: no lag, no idle pan, one frame per scroll */
    addEventListener('scroll', function () {
      pWant = pAt = progress();
      bar();
      draw();
    }, { passive: true });
  }

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { atCell = 0; if (size(P.cell)) draw(); }, 160);
  });

  /* ── what the instruments fly by ──────────────────────────────────────────
     The rail needs three things this closure owns and nothing else does: the
     live camera, the world column it is over, and a way to put the page at a
     given point in the flight. Everything it draws, it derives. */
  window.FLIGHT = {
    world: W,
    cam: cam,
    spot: spot,
    land: land,
    params: P,
    keyframes: KF,
    sea: seaY,
    onFrame: function (fn) { instruments = fn; },
    /* click-to-fly: scroll is the only control surface, so "go to 0.62 of the
       flight" is "put the scrollbar at 0.62". The lag turns the jump into an
       approach on its own — there is no separate animation here, and there
       must not be, or the camera would be flown by two things at once. */
    goTo: function (p) {
      var max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      scrollTo({ top: Math.max(0, Math.min(1, p)) * max,
                 behavior: REDUCED ? 'auto' : 'smooth' });
    },
    /* drift on to fresh ground. Only meaningful while the clock is running,
       which is to say while the page is at the top. */
    moveColumn: function () {
      driftClock += 26;
      site(driftClock);
      draw();
    }
  };

  /* meadow.js owns a lot of numbers that were arrived at by eye, and they are
     no use to anybody sitting inside a closure. Its own panel, because "where
     grass grows" and "how the camera flies" are two different afternoons of
     work and mixing them makes both harder to find. */
  if (window.MEADOW) {
    (window.TUNE_EXTRA = window.TUNE_EXTRA || []).push({
      name: 'meadow',
      api: {
        params: MEADOW.params,
        defaults: MEADOW.defaults,
        draw: function () { draw(); },
        /* Anything that changes where it grows has to re-bake the map — and
           has to stamp it, which this did not. Baking without a stamp left
           `bakedStamp` undefined, so the staleness test said yes on every
           subsequent frame and the cover map was rebuilt from scratch,
           forever, for the rest of the session. Touch one slider and the page
           quietly took a full bake per frame. */
        rebake: function () {
          MEADOW.bake(W, (window.TERRAIN && TERRAIN.params.amp) || 96,
                      seaY(), curStamp);
          draw();
        },
        info: function () { return 'cover baked at ' + W.size + '²'; }
      },
      actions: [['re-bake cover', 'rebake']],
      groups: [
        ['where it grows', [
          ['slopeBare', 0.1, 2.0, 0.02, 'rebake', 'gradient at which rock takes over'],
          ['slopeSoft', 0.05, 1.0, 0.01, 'rebake', 'width of that transition'],
          ['treeLine',  0.1, 1.2, 0.01, 'rebake', '× amplitude. above this, bare'],
          ['treeSoft',  0.02, 0.8, 0.01, 'rebake', 'width of the tree line'],
          ['shoreLift', 0,   1.0, 0.01, 'rebake', 'extra cover at the waterline'],
          ['shoreBand', 2,    60, 1,    'rebake', 'how far up from the water'],
          ['patchScale',0.005,0.2,0.002,'rebake', 'size of the patchiness'],
          ['patchDepth',0,   1.0, 0.02, 'rebake', 'how much it bites']
        ]],
        ['how it looks', [
          ['albedo',    0.3, 1.4, 0.01, 'live', 'grass against rock'],
          ['aa',        0.1, 0.6, 0.01, 'live', 'octave fade margin. 0.5 boils'],
          ['relief',    0,   8.0, 0.1,  'live', 'small form in the near field'],
          ['reliefScale',0.5, 12, 0.1,  'live', 'world units per cycle of it'],
          ['reliefStep', 1.5, 8,  0.1,  'live', '× that, for the coarse octave'],
          ['reliefCoarse',0, 2.0, 0.05, 'live', 'how much that one counts'],
          ['reliefFar',  20, 1600, 10,  'live', 'how far out it is drawn'],
          ['grain',     0,   1.0, 0.01, 'live', 'how hard the fine texture bites'],
          ['grainScale',0.3, 8.0, 0.05, 'live', 'world units per cycle of it'],
          ['clumpScale',1.0, 30,  0.5,  'live', 'and of the coarse one'],
          ['rock',      0,   1.0, 0.01, 'live', 'how hard bare rock breaks up'],
          ['rockScale', 0.15, 4.0,0.05, 'live', 'world units per cycle of it'],
          ['rockClumpScale',0.5,14,0.1, 'live', 'and of the coarse one'],
          ['rockClump', 0,   1.5, 0.02, 'live', "the coarse one's share"],
          ['clump',     0,   1.5, 0.02, 'live', "the coarse one's share"],
          ['windScale', 8,   200, 2,    'live', 'world units per cycle of the gust']
        ]],
        ['weather on the ground', [
          ['cloudScale', 40, 900, 10,   'live', 'world units per cycle, across'],
          ['cloudStretch',1,  8,  0.1,  'live', '× that, along the wind'],
          ['cloudRate',   0,  40, 0.2,  'live', 'world units a second'],
          ['cloudDepth',  0, 1.0, 0.01, 'live', 'how far it pulls the sun down'],
          ['cloudCover',  0, 1.0, 0.01, 'live', 'threshold. high = fewer shadows'],
          ['cloudEdge', 0.02,1.0, 0.01, 'live', 'how soft their edges are']
        ]],
        ['the trees', [
          ['treeFrom',  10, 600,  5,    'live', 'altitude at which they appear'],
          ['treeReach', 40, 900,  10,   'live', 'how far out they are sown'],
          ['treeStep',  1.0, 12,  0.1,  'live', 'the lattice they sit on'],
          ['treeThin',  5,  120,  1,    'live', 'distance they start thinning at'],
          ['treeH',     0.5, 12,  0.1,  'live', 'mean height, world units'],
          ['treeWidth', 0.1, 0.9, 0.01, 'live', 'canopy half-width × height'],
          ['treeSway',  0,   0.6, 0.01, 'live', '× how far the gust leans them'],
          ['glade',     0,  160,  2,    'live', 'trees kept back from the landing'],
          ['treeCrown', 0,   1.2, 0.01, 'live', 'brightness at the top'],
          ['treeSkirt', 0,   1.0, 0.01, 'live', '× that, at the bottom'],
          ['treeSun',   0,   1.0, 0.02, 'live', "how much the terrain's shade counts"],
          ['treeTone',  0.2, 2.0, 0.02, 'live', '× the lot of it'],
          ['treeModel', 0,   1.2, 0.02, 'live', 'lit side against shaded side'],
          ['treeBroad', 0,   1.0, 0.02, 'live', 'fraction that are not conifers'],
          ['treeTiers', 1,     6, 1,    'live', 'whorls in a conifer'],
          ['treeCast',  0,   1.2, 0.02, 'live', 'how dark a cast shadow is'],
          ['treeCastMin',1,   40, 1,    'live', 'cells of height below which none'],
          ['treeAir',   0,   1.5, 0.05, 'live', 'aerial perspective on them'],
          ['treeBias',  0,   8.0, 0.25, 'live', 'depth slack, × one screen row'],
          ['treeBiasMax',0,   20, 0.5,  'live', 'the most that slack can be']
        ]]
      ]
    });
  }

  (window.TUNE_EXTRA = window.TUNE_EXTRA || []).push({
    name: 'flight',
    api: {
      params: P,
      defaults: (function () { var d = {}, k; for (k in P) d[k] = P[k]; return d; })(),
      draw: draw,
      resize: function () { atCell = 0; size(P.cell); draw(); },
      sow: function () {
        /* the column is wherever the drift is, so a new one means drifting on
           — half a minute of pan in one go */
        driftClock += 30;
        site(driftClock);
        draw();
      },
      info: function () {
        return 'p ' + cam.p.toFixed(2) + ' · alt ' + Math.round(cam.alt) +
               ' · pitch ' + (cam.pitch * 57.3).toFixed(0) + '° · ' + bw + '×' + bh +
               ' (cell ' + atCell + ')';
      }
    },
    actions: [['move the column', 'sow']],
    groups: [
      ['the rig', [
        ['startAlt',   6, 200,  1,    'live', 'opening height above ground'],
        ['surveyAlt',200,1800, 10,    'live', 'the top of the rise'],
        ['landAlt',  0.5,  20,  0.1,  'live', 'where it comes to rest'],
        ['surveyPitch', -1.57, -0.6, 0.01, 'live', 'survey pitch (-1.57 = straight down)'],
        ['camGround',  0,   30,  0.5,  'live', 'how far the camera averages its ground'],
        ['landPitch', -0.4, 0.4, 0.01, 'live', 'pitch at the landing'],
        ['fov',      0.4, 1.6,  0.01, 'live', '× field of view'],
        ['pan',        0,  12,  0.1,  'live', 'opening drift speed'],
        ['lag',     0.02, 1.4,  0.02, 'live', 'how far the camera trails the scrollbar'],
        ['turnFrom',   0,   1,  0.01, 'live', 'where the turn onto the bearing starts'],
        ['turnTo',     0,   1,  0.01, 'live', 'and where it finishes'],
        ['sunFace',    0,   2,  0.05, 'live', 'how hard the landing faces the sunset'],
        ['sunOff',     0, 1.4, 0.05, 'live', 'radians the sun sits beside that bearing'],
        ['sunSite',    0, 400,   10, 'live', 'how much it steers the site, not just the aim'],
        ['clearRise', -0.4, 0.2, 0.01, 'live', 'elevation the view wedge must stay under'],
        ['clearWeight', 0,  10, 0.25, 'live', 'how hard a blocked wedge is punished']

      ]],
      ['light', [
        ['litBase',   0, 0.4,  0.01,   'live', 'ambient on the terrain'],
        ['litGain',   0, 1.5,  0.01,   'live', 'the key'],
        ['rim',       0, 1.2,  0.01,   'live', 'hot edge on the sun-facing flank'],
        ['altBoost',  0, 0.8,  0.01,   'live', 'extra light on the tops'],
        ['haze',      0, 0.03, 0.0002, 'live', 'aerial perspective'],
        ['airHeight', 40, 900, 10,     'live', 'scale height of the air'],
        ['mist',       0, 0.03, 0.0002,'live', 'air pooled in the valleys'],
        ['mistY',      0, 400, 2,      'live', 'the top of that pool'],
        ['mistSoft',   2, 200, 2,      'live', 'how sharply it has a top'],
        ['mistGain',   0, 2.0, 0.02,   'live', 'how luminous the pool is'],
        ['mistLit', -0.2, 0.6, 0.01,   'live', 'the elevation it is lit from'],
        ['skyBase',   0, 0.5,  0.01,   'live', 'sky floor'],
        ['skyBand',   0, 0.9,  0.01,   'live', 'brightness toward the horizon'],
        ['skyWidth',0.08, 1.0, 0.01,   'live', 'how tall the horizon band is'],
        ['glow',      0, 2.0,  0.01,   'live', "the sun's spill"],
        ['glowTight',0.05,0.9, 0.01,   'live', 'how close it hugs the horizon'],
        ['glowPow',   1,  12,  0.1,    'live', 'how tightly it hugs the sun'],
        ['bloom',     0, 0.8,  0.01,   'live', 'spill past the edges']
      ]],
      ['ground cover', [
        ['cover',     0,   1, 1,    'live', 'vegetation on or off'],
        ['trees',     0,   1, 1,    'live', 'the standing geometry on or off']
      ]],
      ['water', [
        ['sea',       0, 0.55, 0.005, 'live', 'water table, × terrain amplitude'],
        ['waterBase', 0, 0.4,  0.005, 'live', 'the body of it'],
        ['deck',       0,  1.0, 0.02,  'live', 'clouds in the sky'],
        ['deckY',     60, 2000, 20,    'live', 'how high the deck sits'],
        ['deckFar',  600,12000, 200,   'live', 'where it fades into haze'],
        ['deckDark',   0, 0.5,  0.005, 'live', 'the body of a cloud'],
        ['deckGlow',   0, 1.5,  0.02,  'live', 'the rim it turns to the sun'],
        ['deckGlowPow',1,  14,  0.5,   'live', 'how tight that rim is'],
        ['veil',       0,  1.0, 0.02,  'live', 'cloud tops seen from above'],
        ['veilBase',   0,  1.0, 0.01,  'live', 'how bright a top is'],
        ['veilGlow',   0,  1.5, 0.02,  'live', 'and what it gains at the sun'],
        ['river',      0,  1.0, 0.02,  'live', 'how strongly a channel reads'],
        ['riverFrom',  0,  1.0, 0.01,  'live', 'drainage above which there is one'],
        ['riverSoft',0.02, 0.8, 0.01,  'live', 'the bank'],
        ['riverBed',   0,  1.0, 0.01,  'live', 'light back off the bottom'],
        ['riverFlat',0.05, 2.0, 0.01,  'live', 'gradient water will not lie on'],
        ['riverGloss',  2, 140, 1,     'live', 'how broad its sun path is'],
        ['riverRipple', 0, 0.3, 0.005, 'live', 'how far its surface wanders'],
        ['waterShallow',0,1.0, 0.01,  'live', 'the pale band at the edges'],
        ['waterDepth',  1, 40, 0.5,   'live', 'how fast that band falls away'],
        ['waterSky',  0, 1.5,  0.01,  'live', 'sky returned at grazing angles'],
        ['waterFloor',0, 0.4,  0.005, 'live', 'reflectance looking straight down'],
        ['waterSpec', 0, 2.5,  0.01,  'live', "the sun's path"],
        ['waterGloss',20, 600, 5,     'live', 'how tight that path is'],
        ['ripple',    0, 0.12, 0.002, 'live', 'surface chop'],
        ['rippleRate',0, 2.0,  0.02,  'live', 'how fast it moves']
      ]],
      ['weather + cost', [
        ['windRate',  0, 1.2, 0.01, 'live', 'how fast the weather crosses'],
        ['windSwell', 0, 2.5, 0.01, 'live', 'gust amplitude'],
        ['toGrass',   0, 3.0, 0.01, 'live', 'how hard it drives the grass'],
        ['far',     200,1600, 20,   'live', 'draw distance'],
        ['quality', 0.4, 2.2, 0.05, 'live', 'march resolution. costs time'],
        ['stepCap',   2,  30, 0.5,  'live', 'longest stride a grazing ray may take'],
        ['idle',    120, 1200, 20,   'live', 'ms between redraws when settled'],
        ['cell',      2,  10, 1,    'size', 'px per cell, settled'],
        ['cellMove',  2,  12, 1,    'live', 'px per cell, while flying']
      ]]
    ]
  });
})();
