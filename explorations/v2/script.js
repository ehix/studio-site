/* ===========================================================================
   v2 — INSTRUMENT

   One control, and it is the direction's argument made operable: a knurled
   rotary with four detents driving the recessed readout beside it.

   Three things make it belong to this family rather than being a tab strip in
   disguise. The form states the gesture — knurling says turn, so no label has
   to. The label lives on the housing beneath the control, never on its face.
   And the motion ratchets rather than glides, because a detented control does
   not travel continuously between positions.

   Every value the readout can show is true. Nothing here counts anything it
   is not actually counting.
   =========================================================================== */

(function () {
  "use strict";

  var MODES = [
    {
      lit: "SOURCE",
      rows: [
        ["Build", "studio-site a94bcca"],
        ["Dated", "2026-07-06"],
        ["Stack", "astro 7.0.6 · tailwind 4.3.2 · three 0.185.1"]
      ]
    },
    {
      lit: "LIBRARY",
      rows: [
        ["Ref",     "taste-library ce649c6"],
        ["Corpus",  "102 items · 12 families"],
        ["Verdict", "87 adopt · 13 borrow-structure · 2 reject"]
      ]
    },
    {
      lit: "MEASURE",
      rows: [
        ["Bone",  "8.14:1 on housing"],
        ["Amber", "8.57:1 on recess"],
        ["Ink",   "10.05:1 on bone plate"]
      ]
    },
    {
      lit: "STOCK",
      rows: [
        ["Face",    "Barlow Condensed · Barlow Semi Condensed"],
        ["Licence", "SIL OFL 1.1"],
        ["Weight",  "5 files · 111,580 bytes"]
      ]
    }
  ];

  var STEP = 60;                       /* degrees between detents */

  var knob   = document.getElementById("knob");
  var lit    = document.getElementById("lit");
  var rows   = document.getElementById("rows");
  var marks  = document.querySelectorAll(".detents li");
  if (!knob || !lit || !rows) return;

  var index = 0;

  function render() {
    var mode = MODES[index];

    knob.style.transform = "rotate(" + index * STEP + "deg)";
    knob.setAttribute(
      "aria-label",
      "Mode selector, four detents. Currently: " + mode.lit.toLowerCase() + "."
    );

    for (var i = 0; i < marks.length; i++) {
      marks[i].classList.toggle("is-set", i === index);
    }

    lit.textContent = mode.lit;

    var html = "";
    for (var r = 0; r < mode.rows.length; r++) {
      html += "<dt>" + mode.rows[r][0] + "</dt><dd>" + mode.rows[r][1] + "</dd>";
    }
    rows.innerHTML = html;
  }

  function step(by) {
    index = (index + by + MODES.length) % MODES.length;
    render();
  }

  knob.addEventListener("click", function () { step(1); });

  knob.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp")   { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft"  || e.key === "ArrowDown") { e.preventDefault(); step(-1); }
  });

  /* Dragging round the dial. The detent is what the hand is looking for, so
     the pointer angle is quantised to the nearest position rather than
     tracked continuously. */
  var dragging = false;

  function angleFrom(e) {
    var box = knob.getBoundingClientRect();
    var dx  = e.clientX - (box.left + box.width / 2);
    var dy  = e.clientY - (box.top + box.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;   /* 0deg at 12 o'clock */
  }

  knob.addEventListener("pointerdown", function (e) {
    dragging = true;
    knob.setPointerCapture(e.pointerId);
  });

  knob.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var a = angleFrom(e);
    if (a < 0) a += 360;
    var detent = Math.round(a / STEP);
    if (detent >= 0 && detent < MODES.length && detent !== index) {
      index = detent;
      render();
    }
  });

  function release(e) {
    if (!dragging) return;
    dragging = false;
    if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
  }
  knob.addEventListener("pointerup", release);
  knob.addEventListener("pointercancel", release);

  render();
})();
