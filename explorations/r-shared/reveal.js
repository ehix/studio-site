/* ===========================================================================
   Shared reveal + nav behaviour for the five directions.

   The `reveal` class is NOT set here. It is set by a blocking inline script in
   <head> so it lands before the first paint:

     <script>if(matchMedia('(prefers-reduced-motion:no-preference)').matches
       &&'IntersectionObserver' in window)
       document.documentElement.classList.add('reveal');</script>

   Setting it here instead is what produced the defect this file exists to
   avoid: the page painted at opacity 1, then the class arrived with its own
   transition attached, and eleven elements animated 1 → 0 over 900ms in front
   of the reader.
   =========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ── reveals ──────────────────────────────────────────────────────────── */
  if (root.classList.contains('reveal')) {
    var items = [].slice.call(document.querySelectorAll('.rise'));

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        /* stagger within the element's own group, not within whatever batch
           the observer happened to deliver. the old version keyed off the
           batch index, so the rhythm changed with scroll speed. */
        var group = el.closest('[data-stagger]');
        var delay = 0;
        if (group) {
          var sibs = [].slice.call(group.querySelectorAll('.rise'));
          delay = Math.min(sibs.indexOf(el), 5) * 80;
        }
        el.style.transitionDelay = delay + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, {
      /* no negative margin: anything already on screen at load fires now,
         rather than waiting for a scroll that may never come */
      rootMargin: '0px',
      threshold: 0.01
    });

    items.forEach(function (el) { io.observe(el); });

    /* failsafe. reveals everything rather than removing the class, so what it
       reveals still animates instead of snapping. */
    setTimeout(function () {
      items.forEach(function (el) { el.classList.add('is-in'); });
    }, 2500);
  }

  /* ── nav gains its rule once you have left the top ────────────────────── */
  var nav = document.querySelector('[data-nav]');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-stuck', (window.scrollY || 0) > 24);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
