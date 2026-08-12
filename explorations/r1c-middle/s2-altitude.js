/* ===========================================================================
   r1c/s2 — ALTITUDE IN THE MARGIN

   The cheapest idea in the set and possibly the best value: no new graphic at
   all. A hairline in the left gutter carries a height that falls as you read,
   from a kilometre over the range in the hero to eight centimetres in the
   grass at the sign-off.

   It does not illustrate the descent. It *states* it — which is the job, since
   the descent is currently something a reader might notice rather than
   something the page says. Terminal flavour in the margins is exactly where
   the brief puts it.

   ── how the number is derived ─────────────────────────────────────────────
   Not from scroll percentage. Percentage of a document is meaningless — add a
   case study and every altitude moves. Instead each station is an element, and
   the readout interpolates between the stations either side of the viewport
   centre. Sections can be added, reordered or removed and the ladder still
   reads correctly, because it is anchored to content rather than to pixels.

   Interpolation is logarithmic. 1200m to 0.08m is four and a half orders of
   magnitude; done linearly the number sits above 1000 for the first half of
   the page and then falls off a cliff. In log space every screen of scrolling
   costs roughly the same proportion of the descent, which is what the eye
   reads as a steady fall.
   =========================================================================== */
(function () {
  'use strict';

  var rail = document.querySelector('[data-altitude]');
  if (!rail) return;

  /* [selector, metres, label] — the label names the scale, not the section */
  var STATIONS = [
    ['.hero',        1240, 'range'],
    ['#statement',    460, 'hillside'],
    ['#work',          90, 'field'],
    ['.band',          14, 'path'],
    ['#capability',    1.4, 'tussock'],
    ['#close',        0.35, 'stem'],
    ['.signoff',      0.08, 'blade']
  ];

  var stations = STATIONS
    .map(function (s) {
      var el = document.querySelector(s[0]);
      return el ? { el: el, m: s[1], label: s[2] } : null;
    })
    .filter(Boolean);
  if (stations.length < 2) return;

  /* ── chrome ─────────────────────────────────────────────────────────────
     Built here rather than in the markup: it is instrumentation over the page,
     it has no meaning without the script, and a rail of empty ticks in the
     HTML would be read out by a screen reader as a list of nothing. */
  rail.innerHTML =
    '<div class="alt__line"><i class="alt__fill"></i></div>' +
    '<div class="alt__read"><b class="alt__num">1240</b><span class="alt__unit">m</span>' +
    '<span class="alt__name">range</span></div>' +
    '<ol class="alt__ticks"></ol>';

  var fill = rail.querySelector('.alt__fill');
  var num = rail.querySelector('.alt__num');
  var unit = rail.querySelector('.alt__unit');
  var name = rail.querySelector('.alt__name');
  var ticks = rail.querySelector('.alt__ticks');

  stations.forEach(function (s) {
    var li = document.createElement('li');
    li.textContent = s.label;
    s.tick = li;
    ticks.appendChild(li);
  });

  /* ── the readout ────────────────────────────────────────────────────────── */
  function centreOf(el) {
    var r = el.getBoundingClientRect();
    return r.top + scrollY + r.height / 2;
  }

  function fmt(m) {
    if (m >= 100) return [String(Math.round(m)), 'm'];
    if (m >= 10) return [m.toFixed(1), 'm'];
    if (m >= 1) return [m.toFixed(2), 'm'];
    /* under a metre the page has stopped being a landscape and started being a
       plant. Centimetres say that without a word of copy. */
    return [(m * 100).toFixed(m >= 0.1 ? 0 : 1), 'cm'];
  }

  var marks = [], total = 0;

  function measure() {
    marks = stations.map(function (s) { return { y: centreOf(s.el), m: s.m, s: s }; });
    marks.sort(function (a, b) { return a.y - b.y; });
    total = marks[marks.length - 1].y - marks[0].y;
    stations.forEach(function (s) {
      var top = (centreOf(s.el) - marks[0].y) / (total || 1);
      s.pct = top * 100;
      s.tick.style.top = s.pct.toFixed(2) + '%';
    });
    railPx = rail.getBoundingClientRect().height || 1;
  }

  /* The readout is pinned at the rail's midpoint and the ticks are wherever
     their section falls, so sooner or later one lands underneath it — which it
     did, printing "14.5m" straight through PATH. The readout is the primary
     reading, so the tick yields. */
  var railPx = 1;
  function declutter() {
    var guard = 26 / railPx * 100;
    stations.forEach(function (s) {
      s.tick.classList.toggle('is-hidden', Math.abs(s.pct - 50) < guard);
    });
  }

  function update() {
    /* The reading point is the middle of the viewport — except at the very end
       of the document, where it drifts toward the bottom. Without that the last
       station is unreachable: the sign-off and footer are shorter than half a
       screen, so scrolling to the bottom left the readout stuck at 22cm and the
       ladder never arrived at the blade it exists to arrive at. */
    var maxS = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    var endBias = Math.min(1, Math.max(0,
      (scrollY - (maxS - innerHeight * 0.5)) / (innerHeight * 0.5)));
    var here = scrollY + innerHeight * (0.5 + 0.42 * endBias);
    var i = 0;
    while (i < marks.length - 2 && marks[i + 1].y < here) i++;
    var a = marks[i], b = marks[i + 1];
    var t = (here - a.y) / ((b.y - a.y) || 1);
    if (t < 0) t = 0; else if (t > 1) t = 1;

    /* logarithmic — see the header */
    var m = Math.exp(Math.log(a.m) + (Math.log(b.m) - Math.log(a.m)) * t);
    var f = fmt(m);
    num.textContent = f[0];
    unit.textContent = f[1];
    name.textContent = (t < 0.5 ? a.s : b.s).label;

    var prog = (here - marks[0].y) / (total || 1);
    fill.style.transform = 'scaleY(' + Math.max(0, Math.min(1, prog)).toFixed(4) + ')';

    marks.forEach(function (mk) {
      mk.s.tick.classList.toggle('is-past', here >= mk.y - 4);
    });
    declutter();
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }

  measure();
  update();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { measure(); update(); }, { passive: true });
  /* fonts and the hero canvas both change layout after first paint */
  addEventListener('load', function () { measure(); update(); });
})();
