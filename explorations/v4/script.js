/* ===========================================================================
   v4 — INSTRUMENT UI

   One interaction: hold and read the trace.

   The strip runs live, plotting the page's own frame time. Move across it and
   the trace freezes to the sample under the cursor, so every panel below
   reports that moment instead of this one. Move off and it returns to live.

   The rule this direction has to satisfy is the hardest one in the brief: no
   counter may count nothing. So the readout measures the only thing this page
   can honestly measure — itself, rendering, on the machine it is running on.
   Frame time in milliseconds, the share of a 16.67 ms budget it used, the
   rolling rate, and the wall-clock time the sample was taken. Every figure
   here is a real reading with a real unit.

   State is length and completion, never hue. The accent is spent exactly
   twice, and both times it means NOW: the held cursor on the trace, and the
   primary action.
   =========================================================================== */

(function () {
  "use strict";

  var SAMPLES = 240;          /* the buffer, as stated in the legend */
  var BUDGET  = 1000 / 60;    /* 16.67 ms */
  var BLOCKS  = 16;           /* segments in the rate meter */

  var canvas = document.getElementById("trace");
  var strip  = document.getElementById("strip");
  var cursor = document.getElementById("cursor");
  var mode   = document.getElementById("mode");
  var msEl   = document.getElementById("ms");
  var ringEl = document.getElementById("ring-fill");
  var ringRd = document.getElementById("ring-read");
  var fpsEl  = document.getElementById("fps");
  var meter  = document.getElementById("meter");
  var stamp  = document.getElementById("stamp");
  var verdict= document.getElementById("verdict");
  if (!canvas || !strip) return;

  var ctx = canvas.getContext("2d");
  var css = getComputedStyle(document.documentElement);
  var INK  = css.getPropertyValue("--ink").trim()  || "#22251f";
  var HAIR = css.getPropertyValue("--hair").trim() || "#b6bbaa";
  var WELL = css.getPropertyValue("--well").trim() || "#c9cdbc";

  /* ring geometry must agree with the CSS dasharray */
  var CIRC = 2 * Math.PI * 42;

  /* --- buffers ----------------------------------------------------------- */

  var frames = [];            /* {ms, at} */
  var held   = -1;            /* index under the cursor, or -1 for live */

  for (var i = 0; i < BLOCKS; i++) {
    var block = document.createElement("i");
    meter.appendChild(block);
  }
  var blocks = meter.querySelectorAll("i");

  /* --- draw --------------------------------------------------------------- */

  function draw() {
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = WELL;
    ctx.fillRect(0, 0, w, h);

    /* a faint measuring grid behind the trace, at real millisecond values */
    var top = BUDGET * 2.5;                     /* full scale, 41.67 ms */
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 2;
    for (var ms = 0; ms <= top; ms += BUDGET) {
      var y = h - (ms / top) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (frames.length < 2) return;

    /* the trace itself: fine hairline, no fill, no glow */
    var step = w / (SAMPLES - 1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (var n = 0; n < frames.length; n++) {
      var x  = n * step;
      var yv = h - Math.min(frames[n].ms / top, 1) * h;
      if (n === 0) ctx.moveTo(x, yv); else ctx.lineTo(x, yv);
    }
    ctx.stroke();
  }

  /* --- report ------------------------------------------------------------- */

  function pad(n, w) { return String(n).padStart(w, "0"); }

  function report(sample, rollingFps) {
    msEl.textContent = sample.ms.toFixed(2);

    var pct = Math.round((sample.ms / BUDGET) * 100);
    ringRd.innerHTML = pct + "<span>%</span>";
    ringEl.style.strokeDashoffset = CIRC * (1 - Math.min(pct / 100, 1));

    fpsEl.textContent = pad(rollingFps, 2);

    var lit = Math.round((Math.min(rollingFps, 60) / 60) * BLOCKS);
    for (var b = 0; b < blocks.length; b++) {
      blocks[b].classList.toggle("is-lit", b < lit);
    }

    var d = sample.at;
    stamp.textContent =
      pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" +
      pad(d.getSeconds(), 2) + "." + pad(d.getMilliseconds(), 3);

    /* a plain-language reading of the number above it */
    verdict.textContent =
      sample.ms <= BUDGET      ? "Inside budget" :
      sample.ms <= BUDGET * 2  ? "One frame late" :
                                 "Dropping frames";
  }

  function rolling() {
    var recent = frames.slice(-60);
    if (!recent.length) return 0;
    var total = 0;
    for (var i = 0; i < recent.length; i++) total += recent[i].ms;
    return Math.round(1000 / (total / recent.length));
  }

  /* --- loop --------------------------------------------------------------- */

  var last = performance.now();

  function tick(now) {
    var delta = now - last;
    last = now;

    /* the first frame after a tab wakes measures the sleep, not the render */
    if (delta > 0 && delta < 2000) {
      frames.push({ ms: delta, at: new Date() });
      if (frames.length > SAMPLES) frames.shift();
    }

    draw();
    if (held < 0 && frames.length) report(frames[frames.length - 1], rolling());

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  /* --- hold and read ------------------------------------------------------ */

  function holdAt(clientX) {
    if (!frames.length) return;
    var box = strip.getBoundingClientRect();
    var t   = Math.max(0, Math.min(1, (clientX - box.left) / box.width));

    /* the buffer fills from the left, so map across the samples we actually
       have rather than across the full width */
    var idx = Math.min(frames.length - 1, Math.round(t * (SAMPLES - 1)));
    if (idx >= frames.length) idx = frames.length - 1;

    held = idx;
    strip.classList.add("is-held");
    cursor.style.transform = "translateX(" + (idx / (SAMPLES - 1)) * box.width + "px)";
    mode.textContent = "Held · sample " + (idx + 1) + " of " + frames.length;
    report(frames[idx], rolling());
  }

  function release() {
    held = -1;
    strip.classList.remove("is-held");
    mode.textContent = "Live";
  }

  strip.addEventListener("pointermove", function (e) { holdAt(e.clientX); });
  strip.addEventListener("pointerleave", release);

  strip.addEventListener("keydown", function (e) {
    if (!frames.length) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      var box = strip.getBoundingClientRect();
      var at  = held < 0 ? frames.length - 1 : held;
      at += (e.key === "ArrowRight" ? 1 : -1);
      at = Math.max(0, Math.min(frames.length - 1, at));
      held = at;
      strip.classList.add("is-held");
      cursor.style.transform = "translateX(" + (at / (SAMPLES - 1)) * box.width + "px)";
      mode.textContent = "Held · sample " + (at + 1) + " of " + frames.length;
      report(frames[at], rolling());
    }
    if (e.key === "Escape") release();
  });
  strip.addEventListener("blur", release);
})();
