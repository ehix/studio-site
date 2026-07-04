# Design Brief: Portfolio Rebuild

Working style name: **Field Terminal** — graph-paper warmth meets terminal precision. Lo-fi tech, brutalist-minimal, earth-toned. Feels like a well-kept engineer's notebook rendered by a machine.

This document seeds `CLAUDE.md` for the new build. It is the source of truth for design decisions. When in doubt, choose restraint.

---

## 1. Positioning

A freelance web studio portfolio. Audience is dual: local small organisations (churches, estate agents, charities) who need to feel trust and clarity, and technical peers who will view source. Every choice must read as *deliberate* to the first group and *competent* to the second.

The site itself is the primary proof of capability. It must be fast (Lighthouse 95+ across the board), accessible (WCAG AA), and quietly distinctive.

## 2. Design tokens

### Colour (roles, not decoration)

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#d1cdb7` | Page background |
| `--paper-grid` | `#ccc8b1` | Background grid lines (1px, 0.3rem cell) |
| `--paper-raised` | `#dcd8c0` | Panels, inputs, cards |
| `--stone` | `#bab5a1` | Shadows, selection, hairlines, disabled states. **Never body text** (1.3:1 on paper) |
| `--ink` | `#454138` | All text, borders, inverted panels |
| `--ember` | `#cd664d` | Accent: alerts, active states, one highlight per view maximum. **Never small text on paper** (2.3:1) — use on `--ink` panels or as large/graphic elements only |

Contrast facts: ink on paper = 6.35:1, ink on raised = 7.08:1. Both pass AA for all text sizes; keep body text ink-on-paper or ink-on-raised only.

Dark mode: invert the metaphor (ink becomes ground, paper becomes text), keep the grid texture. Treat as a v2 nicety, not launch scope.

### Texture

The signature background: fine 0.3rem grid, `--paper-grid` lines on `--paper`, via two crossed `linear-gradient`s. Present on every page. Panels sit on top in `--paper-raised` with a hard offset shadow (see below) for a layered-paper feel.

### Typography

- Primary: **monospace throughout** — a contemporary mono with character (Commit Mono, Berkeley Mono if licensed, or JetBrains Mono; Source Code Pro acceptable fallback). Self-host, `font-display: swap`, subset.
- Optional pairing for long-form case study prose: a quiet humanist serif or grotesque *only* if mono proves fatiguing at paragraph length. Test first; the all-mono discipline is part of the identity.
- Scale: strict modular scale (e.g. 1.25 ratio), defined as tokens. The old build's headings floated at arbitrary sizes (42px, 182px, 224px) with no rhythm — replace with a real hierarchy.
- Letter-spacing: 0.03rem body, up to 0.1rem for nav/labels, wide (0.5rem) reserved for rare display moments.
- No faux weights. Lighter weights only where the font provides them and contrast still passes.

### Shape and depth

- `border-radius: 0` everywhere. Sharp corners are policy.
- Borders: 1px solid `--ink` (or `--stone` for hairline dividers).
- Depth: hard offset shadows only, no blur-heavy elevation. Token: `box-shadow: 0.2em 0.2em 0 0 var(--stone)`. Nothing floats; everything is paper on paper.
- Forms keep the exposed `fieldset`/`legend` construction — it is both the aesthetic and semantically correct HTML.

## 3. Signature quirks (keep, but retune)

- The slashed **ø** was the old brand's glyph. Retire it with the nullpoint name. Choose one new typographic quirk tied to the new name and use it sparingly (logo, 404, section markers) — one quirk, applied consistently, is identity; three is noise.
- 404 and empty states get personality (the scattered-glyph 404 treatment worked). These are low-risk places to be playful.
- Terminal-flavoured microcopy is welcome in labels and states (`// contact`, `[ok]`) but must never obscure meaning for non-technical visitors. Plain English headings; flavour in the margins.

## 4. Motion language

Motion is seasoning. Rules:

- Durations 150–300ms, easing `cubic-bezier(0.2, 0, 0, 1)` or steps() where a mechanical feel suits.
- Scroll-triggered section reveals: single subtle translate/fade, once, no re-triggering. CSS scroll-driven animations preferred; IntersectionObserver fallback.
- Hover states: instant or near-instant (≤150ms) — terminal interfaces don't ease languidly.
- One signature interaction site-wide: the hero cube (below). Everything else stays quiet.
- Honour `prefers-reduced-motion` completely: reveals become instant, cube autorotation stops (drag still works).

## 5. Signature element: the cube

Rebuild of the lost WebGL cube as the hero centrepiece.

- Three.js (or raw WebGL as a deliberate flex — decide once, document why).
- A single textured cube, slow idle rotation, drag/inertia to spin. Each face carries a texture from real project work (Abbey screenshots, code, design artefacts) — the cube literally shows the portfolio.
- Face textures styled to palette: duotone/tinted to `--ink`/`--paper` family so photography doesn't break the world.
- Rendered on transparent canvas over the grid background.
- Progressive: static rendered image fallback for no-JS/low-power; lazy-init after first paint; must not cost more than ~150KB gzipped total including library.
- Subtle scanline or dither on the cube faces is on-brand if cheap to render.

## 6. Layout system

- Single centred column, max-width ~68ch for prose, wider (~1100px) for the hero and case study media.
- Section separation by horizontal rules and whitespace, not cards or background shifts.
- Generous vertical rhythm — the old build's biggest weakness was cramped, weightless spacing. Space is the luxury signal in a brutalist layout.
- Mobile first; the grid texture, mono type and rules all scale down gracefully. Cube may shrink but ships on mobile.

## 7. Content architecture

- Home: hero (name, one-line positioning, cube) → selected work → services → contact.
- Case studies as markdown content collections. Launch with Malmesbury Abbey: problem, approach, parity/QA process, outcomes. Before/after imagery. This page does the selling.
- Contact: keep the fieldset form; submissions via form service or Cloudflare Worker + email. Honeypot, no CAPTCHA.
- Footer: quiet, mono, copyright line in the old `© <name> 2026` style.

## 8. Tech constraints

- Astro + Tailwind (tokens above defined as CSS custom properties, mapped into the Tailwind theme).
- Static output, deployed on Cloudflare Pages from GitHub.
- No client-side framework except the cube's script island (`client:visible`).
- Semantic HTML throughout; the fieldset forms, hr dividers and heading order should validate cleanly — view-source is part of the audience.
- Budget: < 300KB total transfer on first load including fonts and cube.

## 9. Anti-goals

- No gradient-mesh blobs, glassmorphism, blur-in-by-word text, grainy hero overlays, or anything recognisable from template/prompt libraries.
- No source-game references in code, comments, class names or copy — the style now stands on its own vocabulary (paper, ink, stone, ember, field, terminal).
- No dark corporate SaaS look-alike sections ("Trusted by", logo walls).
- No animation that delays reading content.
