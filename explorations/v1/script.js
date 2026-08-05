/* ===========================================================================
   v1 — NOTATION

   Two behaviours, and both of them are the two-ink rule made operable rather
   than decoration added on top.

   1. The assert-layer toggle. Ink draws; assert only says something about what
      is drawn. Switching assert off should leave a complete, readable drawing
      behind — if anything the page actually needs disappears with it, the
      two-ink claim was never true. That makes this a test, not a gimmick.

   2. The depth marker. It reports real signed distance in CSS pixels from the
      ±0 datum rule to the centre of the viewport. It measures the drawing, so
      by the same rule it is an assertion, and it lives in the assert layer.
      Nothing here counts anything it is not actually counting.
   =========================================================================== */

(function () {
  "use strict";

  /* --- 1. assert layer --------------------------------------------------- */

  var root   = document.documentElement;
  var button = document.getElementById("assert-toggle");
  var state  = document.getElementById("assert-state");

  button.addEventListener("click", function () {
    var on = root.getAttribute("data-assert") === "on";
    root.setAttribute("data-assert", on ? "off" : "on");
    button.setAttribute("aria-pressed", String(!on));
    state.textContent = on ? "OFF" : "ON";
  });

  /* --- 2. depth marker --------------------------------------------------- */

  var scale  = document.querySelector(".depth");
  var marker = document.querySelector(".depth__marker");
  var read   = document.querySelector(".depth__read");
  var datum  = document.querySelector(".datum");
  if (!scale || !marker || !datum) return;

  var scaleTop = 0, scaleHeight = 0, datumTop = 0;

  function measure() {
    var page = window.scrollY;
    var box  = scale.getBoundingClientRect();
    scaleTop    = box.top + page;
    scaleHeight = box.height;
    datumTop    = datum.getBoundingClientRect().top + page;
  }

  function paint() {
    var eye = window.scrollY + window.innerHeight / 2;   // reading position
    var y   = Math.max(0, Math.min(scaleHeight, eye - scaleTop));
    marker.style.transform = "translateY(" + y.toFixed(1) + "px)";

    var signed = Math.round(eye - datumTop);
    var sign   = signed < 0 ? "−" : "+";            /* true minus sign */
    read.textContent = sign + String(Math.abs(signed)).padStart(4, "0");
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; paint(); });
  }

  measure();
  paint();
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", function () { measure(); paint(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); paint(); });
  }
})();
