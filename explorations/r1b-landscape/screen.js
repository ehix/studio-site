/* ===========================================================================
   r1b — THE SCREENING STAGE

   The last step of every graphic on this page is the same one: a low-resolution
   luminance buffer is ordered-dithered and quantised to an eight-entry indexed
   palette. Two things now feed that step — the light fields in field.js and the
   grass in grass.js — so it lives here rather than in either of them.

   The point is not tidiness. It is that "the same dither" has to mean the same
   code: a second copy of a Bayer table drifts, and then the footer screens at a
   slightly different threshold to the hero and the page stops looking like one
   printing.
   =========================================================================== */
var SCREEN = (function () {
  'use strict';

  /* ── indexed palettes ─────────────────────────────────────────────────────
     Eight steps, hand-picked rather than interpolated, so the ramp has a shape:
     the shadows stay near-neutral and the colour arrives only in the last three
     steps, which is how a warm key actually behaves on film. */
  var RAMP = {
    amber: [
      [10, 9, 8], [22, 18, 15], [42, 31, 22], [70, 47, 29],
      [112, 71, 36], [170, 108, 47], [225, 163, 88], [248, 226, 182]
    ],
    cool: [
      [8, 9, 11], [17, 21, 26], [30, 38, 48], [46, 60, 76],
      [70, 92, 112], [110, 137, 158], [163, 187, 203], [226, 238, 245]
    ],
    /* the hero's own. Hotter than `amber` and anchored near #EC4E02 at step 5:
       the landscape is the one place on the page that carries real colour, and
       the ramp the plates use went muddy across a whole sky. */
    dusk: [
      [9, 8, 10], [22, 17, 19], [44, 27, 25], [78, 40, 27],
      [124, 58, 26], [180, 88, 26], [228, 134, 46], [252, 210, 148]
    ]
  };

  /* 4x4 Bayer. The dither is the point, not a compromise: it is what lets an
     8-entry palette carry a continuous falloff without banding, and it is the
     texture the pixel family is named for. */
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* Screen a Float32Array of luminance into an ImageData of the same cell
     dimensions. Callers that can compute luminance inside their own loop —
     field.js does — should inline the two lines below instead of allocating a
     buffer; callers that accumulate luminance over many passes — grass.js
     draws hundreds of blades into one buffer — need it as a separate stage.

     The threshold offset is centred on the step so the pattern reads as texture
     rather than as a bias.

     `alpha` is optional. Given one, coverage is screened through the same Bayer
     table taken to a single bit and cells at zero are skipped outright — which
     is most of them for a graphic drawn over type, and is why the alpha is done
     here rather than in a second pass over the whole buffer. A feathered edge
     would resolve detail below the cell size and undo the screening; a dithered
     hard edge keeps every pixel countable. */
  function screen(luma, img, bw, bh, ramp, alpha) {
    var d = img.data, n = ramp.length - 1, o = 0, i = 0, x, y, l, q, c, b, a;
    for (y = 0; y < bh; y++) {
      for (x = 0; x < bw; x++, i++, o += 4) {
        b = BAYER[(y & 3) * 4 + (x & 3)];
        if (alpha) {
          a = alpha[i];
          if (a <= 0) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0; continue; }
          d[o + 3] = a > (b + 0.5) / 16 ? 255 : 0;
        } else {
          d[o + 3] = 255;
        }
        l = luma[i];
        if (l < 0) l = 0; else if (l > 1) l = 1;
        q = Math.round(l * n + (b / 16 - 0.469));
        if (q < 0) q = 0; else if (q > n) q = n;
        c = ramp[q];
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
      }
    }
  }

  return { RAMP: RAMP, BAYER: BAYER, screen: screen };
})();
