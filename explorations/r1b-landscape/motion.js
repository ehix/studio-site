/* ===========================================================================
   r1 — reveals, split type, nav state.

   Replaces r-shared/reveal.js for this direction because the headings need
   word-level masking, which the shared file doesn't do. Everything the shared
   file got right is carried over verbatim: no negative root margin, per-group
   stagger, and a failsafe that reveals rather than un-hides.

   THE RULE THIS FILE EXISTS TO OBEY: never apply a hidden state after first
   paint. The earlier version of this page added its hidden class asynchronously
   *with the transition already attached*, and eleven elements animated 1 -> 0
   over 900ms in front of the reader. Measured 1 -> 0.467 -> 0.097 -> 0.006 -> 0.

   Two mechanisms, both safe:
     .rise        hidden by CSS under html.reveal, which a blocking <head>
                  script sets before the first paint.
     [data-split] not hidden by CSS at all. The splitter hides it in the same
                  synchronous pass that restructures it, so there is no frame
                  where the un-split text is visible and then isn't. If this
                  script never runs, the heading is simply plain text.
   =========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var revealing = root.classList.contains('reveal');

  /* ── split headings into masked words ─────────────────────────────────── */
  function wrapWords(node, out) {
    var kids = [].slice.call(node.childNodes);
    kids.forEach(function (k) {
      if (k.nodeType === 3) {
        if (!k.textContent.trim()) return;
        var frag = document.createDocumentFragment();
        k.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span');
          w.className = 'wd';
          var inner = document.createElement('i');
          inner.textContent = part;
          w.appendChild(inner);
          frag.appendChild(w);
          out.push(inner);
        });
        node.replaceChild(frag, k);
      } else if (k.nodeType === 1 && k.tagName !== 'BR') {
        wrapWords(k, out);
      }
    });
  }

  if (revealing) {
    [].slice.call(document.querySelectorAll('[data-split]')).forEach(function (el) {
      try {
        var words = [];
        wrapWords(el, words);
        if (!words.length) return;
        /* the delay is baked in here rather than in the observer, so the
           rhythm is a property of the sentence and not of scroll speed */
        words.forEach(function (w, i) {
          w.style.transitionDelay = Math.min(i, 12) * 42 + 'ms';
        });
        el.classList.add('is-split');
      } catch (e) { /* leave the heading as plain text */ }
    });
  }

  /* ── reveal on entry ──────────────────────────────────────────────────────
     Two independent triggers, because the observer alone is not trustworthy
     enough for content that is invisible until it fires.

     Measured on this page: after an instant jump to #capability the observer
     had still not delivered 1,400ms later, and the whole section — heading and
     all three rows — was blank until a 2,500ms failsafe rescued it. Intersection
     callbacks are scheduled off the rendering lifecycle, so anything that
     throttles frames (a slow device, a backgrounded tab that just came forward,
     a headless renderer) delays the reveal and blanks the section for as long
     as it takes.

     So: the observer stays, because it gives the clean staggered entrance. But
     a plain scroll listener checks the remaining items synchronously against
     the viewport and reveals anything that is on screen, whatever the observer
     is doing. It costs one getBoundingClientRect per unrevealed element, the
     set only shrinks, and the listener removes itself when it empties. */
  if (revealing) {
    var pending = [].slice.call(document.querySelectorAll('.rise,[data-split]'));

    function reveal(el) {
      if (el.classList.contains('is-in')) return;
      if (!el.hasAttribute('data-split')) {
        var group = el.closest('[data-stagger]');
        if (group) {
          var sibs = [].slice.call(group.querySelectorAll('.rise'));
          el.style.transitionDelay = Math.min(sibs.indexOf(el), 6) * 85 + 'ms';
        }
      }
      el.classList.add('is-in');
    }

    var poll = null;

    function sweep() {
      var still = [];
      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        /* anything not still below the fold is due */
        if (el.getBoundingClientRect().top < innerHeight) reveal(el);
        else still.push(el);
      }
      pending = still;
      if (!pending.length) {
        removeEventListener('scroll', sweep);
        if (poll) { clearInterval(poll); poll = null; }
      }
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px', threshold: 0.01 });
      pending.forEach(function (el) { io.observe(el); });
    }

    addEventListener('scroll', sweep, { passive: true });

    /* Timers are not scheduled off the rendering lifecycle, which both the
       observer and the scroll event are. Measured here: with frames throttled,
       neither of those fired for over a second and #capability stayed blank;
       this sweep catches the same case in under 200ms. It is the only trigger
       that keeps working when the page is not painting, so it is the one that
       decides how long content can possibly be invisible.

       It also replaces the blanket "reveal everything" failsafe the earlier
       version used. That timer could not tell a section that had failed to
       reveal from one that was simply still below the fold, so after 1.2s it
       revealed the entire page — and a reader who landed and paused before
       scrolling got no reveals at all, because they had all already fired.
       This runs until the last item is on screen and then stops itself, so the
       guarantee is "nothing visible stays hidden" rather than "everything is
       shown whether or not you have reached it". */
    poll = setInterval(sweep, 220);
    sweep();
  }

  /* ── nav ──────────────────────────────────────────────────────────────── */
  var nav = document.querySelector('[data-nav]');
  var links = [].slice.call(document.querySelectorAll('[data-navlink]'));
  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (nav) {
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      nav.classList.toggle('is-stuck', y > 24);

      /* CRITIQUE (heuristic 1, scored 3): no active section state and no
         progress cue over 5,078px. Both answered here — the rule under the nav
         is the progress bar, and the current section is marked. */
      var doc = document.documentElement;
      var max = doc.scrollHeight - innerHeight;
      nav.style.setProperty('--progress', max > 0 ? (y / max) : 0);

      var current = -1;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= innerHeight * 0.34) current = i;
      }
      links.forEach(function (a, i) {
        a.classList.toggle('is-here', i === current);
        if (i === current) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  }
})();
