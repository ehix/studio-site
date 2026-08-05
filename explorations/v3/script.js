/* ===========================================================================
   v3 — SCREENED FIELD

   One control: screen pitch.

   Pitch is the variable that decides what a screen actually is. The library
   keeps two captures of the same dot screen at two pitches and files them
   separately for exactly this reason — at a fine pitch the screen behaves as
   a texture you could tile, and at a coarse one it behaves as a device you
   would notice. Everything else about the mechanism is identical.

   So the control moves that boundary while you watch, and reports the true
   value in CSS pixels. Dot diameter is held at 0.6 of the pitch, which keeps
   the ratio of mark to aperture constant as the screen coarsens: what changes
   is the scale of the structure, not how much of the image it covers.
   =========================================================================== */

(function () {
  "use strict";

  var DOT_RATIO = 0.6;

  var input = document.getElementById("pitch-input");
  var value = document.getElementById("pitch-value");
  var root  = document.documentElement;
  if (!input || !value) return;

  function apply() {
    var pitch = Number(input.value);
    root.style.setProperty("--pitch", pitch + "px");
    root.style.setProperty("--dot", (pitch * DOT_RATIO).toFixed(2) + "px");
    value.textContent = pitch;
  }

  input.addEventListener("input", apply);
  apply();
})();
