/* ===========================================================================
   r1b — THE TUNING PANEL

   A development surface for the two generated graphics on this page: the hero
   landscape and the sign-off grass. It exists because between them they carry
   about fifty numbers that were all arrived at by eye, and the loop of "edit a
   constant, rebuild, reload, scroll, wait for a gust" is slow enough that you
   stop trying things — which is the actual cost. With a slider you find the
   shape of a parameter in about four seconds.

   THIS SHIPS NOWHERE NEAR THE REAL SITE. It is one <script> in one exploration.
   When a direction is chosen the numbers get pasted into the `P` blocks in
   terrain.js and grass.js and this file is simply not carried across — which is
   why every specification below lives here rather than next to the parameters.
   The graphics publish nothing but their numbers and the calls that rebuild
   them; they do not know a panel exists.

   Hidden by default. `?tune` in the URL opens it; the ` key toggles it.

   ── the commit levels ─────────────────────────────────────────────────────
   Each control declares what changing it costs, because that decides whether
   it can be dragged live:

     live   the renderer re-reads it next frame                        free
     css    not a render parameter at all                             free
     shade  re-bakes the hero's shading pass                         ~1ms
     size   re-allocates a cell buffer                                ~1ms
     sow    re-generates the grass blades                            ~2ms
     build  re-bakes the hero's 384² six-octave heightmap           ~41ms

   Everything but `build` commits on drag. `build` commits on release, because
   41ms a frame is a slider that fights you.
   =========================================================================== */
(function () {
  'use strict';

  /* [key, min, max, step, commit, hint] */
  var MODULES = [
    {
      name: 'hero',
      api: window.TERRAIN,
      actions: [['new landscape', 'regen']],
      groups: [
        ['shape · applies on release', [
          ['amp',       10, 260, 1,     'build', 'valley floor to peak'],
          ['ridge',    0.6, 3.5, 0.01,  'build', 'above 1 deepens the valleys'],
          ['octaves',    1,   8, 1,     'build', 'detail. fewer is smoother'],
          ['baseFreq',   1,  14, 0.5,   'build', 'how many ranges across the map'],
          ['roughness',0.2, 0.8, 0.01,  'build', 'amplitude falloff per octave'],
          ['mask',       0, 1.6, 0.01,  'build', 'plains-to-ranges variation']
        ]],
        ['erosion · applies on release', [
          ['erode',      0,    1, 1,     'build', '0 = none. runs the water'],
          ['erodeDrops', 0, 200000, 5000,'build', 'droplets. cost is linear'],
          ['erodeLife',  4,  120, 2,     'build', 'steps each one gets'],
          ['erodeRadius',1,  6.0, 0.2,   'build', 'cells a bite is spread over'],
          ['erodeRate',  0,  1.0, 0.02,  'build', 'how greedily it takes'],
          ['depositRate',0,  1.0, 0.02,  'build', 'and how readily it puts back'],
          ['erodeCap',  0.5, 12,  0.1,   'build', 'how much a fast drop carries'],
          ['erodeInertia',0, 0.9, 0.01,  'build', 'how much it ignores the slope'],
          ['evaporate',0.002,0.2, 0.002, 'build', 'water lost per step'],
          ['minSlope',  0,   0.1, 0.002, 'build', 'capacity floor on flat ground']
        ]],
        ['sun', [
          ['sunAz',   -3.14, 3.14, 0.01, 'shade', 'azimuth, off the opening heading'],
          ['sunY',     0.02, 1.60, 0.01, 'shade', 'elevation. low rakes, high flattens'],
          ['shadow',   0,    1.00, 0.05, 'shade', 'cast shadow. 0 = orientation only'],
          ['shadowSoft',0.1, 6.00, 0.1,  'shade', 'how soft a distant shadow edge is']
        ]],
        ['camera', [
          ['fov',       0.3, 1.8,  0.01, 'live', 'field of view'],
          ['horizon',  0.05, 0.8,  0.01, 'live', 'where the horizon sits'],
          ['clear',       4, 200,  1,    'live', 'how high it flies'],
          ['speed',       0,  30,  0.1,  'live', 'how fast it flies'],
          ['drift',       0, 1.2,  0.01, 'live', 'how far the yaw wanders'],
          ['driftRate',   0, 0.4,  0.001,'live', 'how quickly it wanders'],
          ['zfar',      120, 900,  10,   'live', 'draw distance'],
          ['march',     0.3, 2.2,  0.05, 'live', 'marching resolution. costs time']
        ]],
        ['light', [
          ['skyBase',    0, 0.5,  0.01,   'live', 'the sky floor'],
          ['skyBand',    0, 0.9,  0.01,   'live', 'brightness toward the horizon'],
          ['glow',       0, 2.0,  0.01,   'live', "the sun's spill"],
          ['glowTight',0.05, 0.9, 0.01,   'live', 'how close it hugs the horizon'],
          ['glowPow',    1,  12,  0.1,    'live', 'how tightly it hugs the sun'],
          ['litBase',    0, 0.4,  0.01,   'live', 'ambient on the terrain'],
          ['litGain',    0, 1.5,  0.01,   'live', 'the key on the terrain'],
          ['rim',        0, 1.2,  0.01,   'live', 'hot edge on the sun-facing flank'],
          ['altBoost',   0, 0.8,  0.01,   'live', 'extra light on the tops'],
          ['haze',       0, 0.03, 0.0002, 'live', 'aerial perspective'],
          ['bloom',      0, 0.8,  0.01,   'live', 'spill past the edges'],
          ['cell',       2,   8,  1,      'size', 'px per cell — dither coarseness']
        ]]
      ]
    },
    {
      name: 'sign-off',
      api: window.GRASS,
      groups: [
        ['field', [
          ['fullness',  0.0,  2.5, 0.01, 'sow',  'how much grass'],
          ['length',    0.3,  2.2, 0.01, 'sow',  'how tall'],
          ['thickness', 0.4,  3.0, 0.01, 'sow',  'blade width'],
          ['heads',     0.0,  2.5, 0.01, 'sow',  'how much has gone to seed'],
          ['swell',     0.0,  2.5, 0.01, 'sow',  'undulation of the top edge'],
          ['seed',      0.0, 99.0, 0.10, 'sow',  're-grows the field'],
          ['cell',      2.0,  8.0, 1.00, 'size', 'px per cell — dither coarseness']
        ]],
        ['wind', [
          ['speed',     0.0,  3.0, 0.01, 'live', 'rate the gusts travel'],
          ['strength',  0.0,  2.5, 0.01, 'live', 'how far a gust bends a blade'],
          ['bias',     -0.4,  0.4, 0.01, 'live', 'steady lean. 0 only oscillates'],
          ['flutter',   0.0,  3.0, 0.01, 'live', 'per-blade chatter'],
          ['gustScale', 0.3,  7.0, 0.05, 'live', 'gusts across the width']
        ]],
        ['light', [
          ['glow',       0.0, 2.0, 0.01, 'live', 'the band behind the field'],
          ['glowY',      0.0, 1.0, 0.01, 'live', 'where that band sits'],
          ['glowSpread', 0.1, 1.3, 0.01, 'live', 'how tall it is'],
          ['glowX',      0.0, 1.0, 0.01, 'live', 'the key, across the frame'],
          ['tipLight',   0.0, 2.0, 0.01, 'live', 'light on the top of each blade'],
          ['fade',       0.2, 1.0, 0.01, 'live', 'below here it goes to black']
        ]],
        ['wordmark', [
          ['frontDens',  0.0, 4.0, 0.01, 'sow',  'blades crossing the type'],
          ['frontReach', 0.3, 2.0, 0.01, 'sow',  'how far up the letterforms'],
          ['frontTone',  0.1, 1.6, 0.01, 'live', 'their brightness'],
          ['frontAlpha', 0.0, 1.0, 0.01, 'css',  'opacity of the front layer']
        ]]
      ]
    }
  ];

  /* Pages can add their own tabs by pushing a spec onto window.TUNE_EXTRA
     before this file loads — which is how the r1c showcases get sliders
     without a second panel appearing in the corner. Same shape as the two
     above: { name, api, groups, actions? }. */
  var mods = MODULES.concat(window.TUNE_EXTRA || [])
    .filter(function (m) { return m.api; });
  if (!mods.length) return;

  /* ── chrome ─────────────────────────────────────────────────────────────
     Borrows the page's own custom properties so it sits in the same world,
     with fallbacks in case it is ever pasted somewhere they do not exist. */
  var css = document.createElement('style');
  css.textContent = [
    /* A panel made of section/header/nav/legend/label inside a page that
       styles section/header/nav/legend/label. The hero tab opened with 66px of
       nothing above it because base.css puts --gap on every <section>. Reset
       first, at 1-0-0, so every rule below still wins on specificity. */
    '#tune *{margin:0;padding:0;border:0;background:none;font:inherit;',
      'color:inherit;letter-spacing:inherit;text-transform:none;line-height:inherit}',
    '#tune section{display:block}',
    '#tune{position:fixed;top:12px;right:12px;z-index:9999;width:296px;',
      'max-height:calc(100vh - 24px);display:flex;flex-direction:column;',
      'background:var(--bg-2,#1b1917);color:var(--ink,#f2efe8);',
      'border:1px solid var(--edge-ui,#5c564c);',
      'font:11px/1.45 var(--mono,ui-monospace,monospace);letter-spacing:.02em;',
      'box-shadow:0 0 0 1px rgba(0,0,0,.5)}',
    '#tune[hidden]{display:none}',
    '#tune header{display:flex;gap:6px;align-items:center;flex:0 0 auto;',
      'padding:8px 10px;border-bottom:1px solid var(--edge,#332f2a)}',
    '#tune h2{font-size:11px;font-weight:400;letter-spacing:.1em;',
      'text-transform:uppercase;margin-right:auto}',
    '#tune button{font:inherit;letter-spacing:.06em;color:inherit;cursor:pointer;',
      'background:none;border:1px solid var(--edge-ui,#5c564c);',
      'padding:2px 7px;border-radius:0}',
    '#tune button:hover{color:var(--accent,#e0975c);border-color:var(--accent,#e0975c)}',
    '#tune nav{display:flex;flex:0 0 auto;border-bottom:1px solid var(--edge,#332f2a)}',
    '#tune nav button{flex:1;border:0;border-right:1px solid var(--edge,#332f2a);',
      'padding:6px 0;text-transform:uppercase;letter-spacing:.12em;',
      'color:var(--gap-ink,#9b9184)}',
    '#tune nav button:last-child{border-right:0}',
    '#tune nav button[aria-selected=true]{color:var(--ink,#f2efe8);',
      'background:var(--raised,#242120);box-shadow:inset 0 -2px 0 var(--accent,#e0975c)}',
    '#tune .body{overflow:auto;flex:1 1 auto;overscroll-behavior:contain}',
    '#tune section[hidden]{display:none}',
    '#tune fieldset{border:0;border-top:1px solid var(--edge,#332f2a);padding:6px 10px 9px}',
    '#tune fieldset:first-child{border-top:0}',
    '#tune legend{padding:0;font-size:10px;letter-spacing:.14em;',
      'text-transform:uppercase;color:var(--gap-ink,#9b9184)}',
    '#tune .row{display:grid;grid-template-columns:1fr auto;align-items:baseline;',
      'margin-top:6px;gap:6px}',
    '#tune label{cursor:pointer}',
    '#tune .val{font-variant-numeric:tabular-nums;color:var(--muted,#c0b8ab)}',
    '#tune .row.off .val{color:var(--accent,#e0975c)}',
    '#tune input[type=range]{grid-column:1/-1;width:100%;height:13px;margin:1px 0 0;',
      'accent-color:var(--accent,#e0975c);cursor:ew-resize}',
    '#tune .note{flex:0 0 auto;padding:7px 10px;color:var(--gap-ink,#9b9184);',
      'border-top:1px solid var(--edge,#332f2a)}',
    '#tune .acts{display:flex;gap:6px;padding:7px 10px 0}',
    '#tune textarea{width:100%;height:88px;margin-top:6px;resize:vertical;',
      'background:var(--bg,#131110);color:inherit;font:inherit;',
      'border:1px solid var(--edge,#332f2a);padding:6px;border-radius:0}'
  ].join('');
  document.head.appendChild(css);

  var panel = document.createElement('aside');
  panel.id = 'tune';
  panel.hidden = true;
  panel.innerHTML =
    '<header><h2>tune</h2>' +
    '<button type="button" data-act="reset">reset</button>' +
    '<button type="button" data-act="copy">copy</button>' +
    '<button type="button" data-act="close" aria-label="close">×</button></header>' +
    '<nav role="tablist"></nav><div class="body"></div>' +
    '<div class="note"><span id="t-info"></span><br>' +
    '<span style="opacity:.7">` toggles · copy gives the changed lines</span></div>';

  var nav = panel.querySelector('nav');
  var body = panel.querySelector('.body');
  var current = mods[0];

  /* ── build ──────────────────────────────────────────────────────────────── */
  mods.forEach(function (m, mi) {
    m.rows = {};
    m.defaults = m.api.defaults;

    var tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.textContent = m.name;
    tab.addEventListener('click', function () { select(m); });
    m.tab = tab;
    nav.appendChild(tab);

    var sec = document.createElement('section');
    sec.setAttribute('role', 'tabpanel');
    m.sec = sec;

    if (m.actions) {
      var acts = document.createElement('div');
      acts.className = 'acts';
      m.actions.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = a[0];
        b.addEventListener('click', function () { m.api[a[1]](); info(); });
        acts.appendChild(b);
      });
      sec.appendChild(acts);
    }

    m.groups.forEach(function (g) {
      var fs = document.createElement('fieldset');
      fs.innerHTML = '<legend>' + g[0] + '</legend>';
      g[1].forEach(function (c) {
        var key = c[0], commit = c[4], hint = c[5];
        var id = 't-' + mi + '-' + key;
        var row = document.createElement('div');
        row.className = 'row';
        row.innerHTML =
          '<label for="' + id + '" title="' + hint + '">' + key + '</label>' +
          '<span class="val"></span>' +
          '<input type="range" id="' + id + '" min="' + c[1] + '" max="' + c[2] +
          '" step="' + c[3] + '" value="' + m.api.params[key] + '" title="' + hint + '">';
        fs.appendChild(row);

        var input = row.querySelector('input');
        m.rows[key] = { row: row, input: input, out: row.querySelector('.val'), step: c[3] };

        /* `build` costs 41ms. Committing that on every input event turns a
           drag into a slideshow, so the number tracks the thumb and the
           rebuild waits for the pointer to come up. */
        if (commit === 'build') {
          input.addEventListener('input', function () {
            m.api.params[key] = parseFloat(input.value);
            paint(m, key);
          });
          input.addEventListener('change', function () {
            set(m, key, parseFloat(input.value), commit);
          });
        } else {
          input.addEventListener('input', function () {
            set(m, key, parseFloat(input.value), commit);
          });
        }
      });
      sec.appendChild(fs);
    });

    body.appendChild(sec);
  });

  document.body.appendChild(panel);

  /* ── plumbing ───────────────────────────────────────────────────────────── */
  function fmt(v, step) {
    if (step >= 1) return String(Math.round(v));
    if (step >= 0.1) return v.toFixed(1);
    if (step >= 0.01) return v.toFixed(2);
    return v.toFixed(4);
  }

  function paint(m, key) {
    var r = m.rows[key];
    if (!r) return;
    var v = m.api.params[key];
    r.input.value = v;
    r.out.textContent = fmt(v, r.step);
    /* mark anything moved off the value the page shipped with */
    r.row.classList.toggle('off', Math.abs(v - m.defaults[key]) > 1e-9);
  }

  function info() {
    var api = current.api;
    document.getElementById('t-info').textContent =
      api.info ? api.info()
               : api.blades() + ' blades · ' + api.field.bw + '×' + api.field.bh + ' cells';
  }

  function set(m, key, value, commit) {
    m.api.params[key] = value;
    if (commit === 'build') m.api.build();
    else if (commit === 'shade') m.api.shade();
    else if (commit === 'sow') m.api.sow();
    else if (commit === 'size') m.api.resize();
    else if (commit === 'css') m.api.front.style.opacity = value;
    else m.api.draw();
    paint(m, key);
    info();
  }

  function paintAll() {
    mods.forEach(function (m) { Object.keys(m.rows).forEach(function (k) { paint(m, k); }); });
    info();
  }

  function select(m) {
    current = m;
    mods.forEach(function (o) {
      o.sec.hidden = o !== m;
      o.tab.setAttribute('aria-selected', String(o === m));
    });
    info();
  }

  panel.addEventListener('click', function (e) {
    var act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (!act) return;

    if (act === 'close') { toggle(false); return; }

    /* reset and copy act on the visible tab only — resetting the hero while
       tuning the grass would silently throw away work */
    if (act === 'reset') {
      var m = current, api = m.api;
      Object.keys(m.defaults).forEach(function (k) { api.params[k] = m.defaults[k]; });
      if (api.front) api.front.style.opacity = '';
      if (api.build) api.build(); else api.sow();
      api.resize();
      paintAll();
      return;
    }

    if (act === 'copy') {
      var mod = current;
      var lines = Object.keys(mod.defaults)
        .filter(function (k) { return Math.abs(mod.api.params[k] - mod.defaults[k]) > 1e-9; })
        .map(function (k) { return '    ' + k + ': ' + (+mod.api.params[k].toFixed(4)) + ','; });
      var text = lines.length
        ? '/* ' + mod.name + ', tuned ' + new Date().toISOString().slice(0, 10) + ' */\n'
          + lines.join('\n')
        : '/* ' + mod.name + ': nothing moved off the defaults */';
      var ta = panel.querySelector('textarea') || document.createElement('textarea');
      ta.value = text;
      ta.readOnly = true;
      if (!ta.parentNode) panel.querySelector('.note').appendChild(ta);
      ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
    }
  });

  /* ── visibility ─────────────────────────────────────────────────────────── */
  function toggle(on) {
    panel.hidden = on === undefined ? !panel.hidden : !on;
    if (!panel.hidden) paintAll();
  }

  addEventListener('keydown', function (e) {
    if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    e.preventDefault();
    toggle();
  });

  select(mods[0]);
  if (/[?&]tune\b/.test(location.search)) toggle(true);
  else paintAll();

  console.info('press ` for the tuning panel (or add ?tune)');
})();
