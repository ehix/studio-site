# CLAUDE.md — Field Terminal portfolio

Freelance web studio portfolio. Style name: **Field Terminal** — graph-paper
warmth meets terminal precision. A well-kept engineer's notebook rendered by a
machine. `DESIGN-BRIEF.md` is the source of truth; when in doubt, choose restraint.

Audience is dual: local small organisations (must read as *deliberate* and
trustworthy) and technical peers who will view source (must read as *competent*).
The site is the proof of capability: Lighthouse 95+, WCAG AA, quietly distinctive.

## Design tokens

All colour/space/type values live as CSS custom properties in
`src/styles/tokens.css` and are mapped into Tailwind via `@theme inline`.
Never hardcode a hex, px shadow, or font size in a component — use the token.

### Colour (roles, not decoration)

| Token | Light | Role |
|---|---|---|
| `--paper` | `#d1cdb7` | Page background |
| `--paper-grid` | `#ccc8b1` | Background grid lines (1px, 0.3rem cell) |
| `--paper-raised` | `#dcd8c0` | Panels, inputs, cards |
| `--stone` | `#bab5a1` | Shadows, selection, hairlines, disabled. **Never body text** (1.3:1) |
| `--ink` | `#454138` | All text, borders, inverted panels |
| `--ember` | `#cd664d` | Accent. Max one highlight per view. **Never small text on paper** (2.3:1) — use on ink panels or as large/graphic elements only |

Contrast facts: ink/paper 6.35:1, ink/raised 7.08:1 — body text is ink-on-paper
or ink-on-raised **only**.

Dark theme inverts the metaphor: ink-family becomes ground, paper-family becomes
text; grid texture stays. Implemented via `[data-theme]` overrides of the same
custom properties — components never branch on theme.

### Texture

Signature background on every page: fine 0.3rem grid, `--paper-grid` lines on
`--paper`, built from two crossed `linear-gradient`s. Panels sit on top in
`--paper-raised` with the hard offset shadow for layered-paper depth.

### Typography

- **Monospace throughout**: Commit Mono, self-hosted woff2, subset,
  `font-display: swap`. All-mono discipline is part of the identity.
- Strict modular scale (1.25 ratio) defined as tokens — no arbitrary sizes.
- Letter-spacing: 0.03rem body, up to 0.1rem nav/labels, 0.5rem reserved for
  rare display moments.
- No faux weights.

### Shape and depth

- `border-radius: 0` everywhere. Sharp corners are policy.
- Borders: 1px solid `--ink`; `--stone` for hairline dividers.
- Depth: hard offset shadow only — `box-shadow: 0.2em 0.2em 0 0 var(--stone)`.
  No blur elevation. Nothing floats; everything is paper on paper.
- Forms use exposed `fieldset`/`legend` — aesthetic and semantically correct.

## Motion

Motion is seasoning:
- Durations 150–300ms; easing `cubic-bezier(0.2, 0, 0, 1)` or `steps()` for a
  mechanical feel.
- Scroll reveals: single subtle translate/fade, once, never re-triggering.
  CSS scroll-driven animations preferred; IntersectionObserver fallback.
- Hovers ≤150ms — terminals don't ease languidly.
- One signature interaction site-wide (the hero cube, future work). Everything
  else stays quiet.
- Honour `prefers-reduced-motion` completely: reveals instant, autorotation off.
- No animation that delays reading content.

## Layout

- Single centred column: ~68ch prose, ~1100px for hero/case-study media.
- Sections separated by `<hr>` and whitespace — not cards or background shifts.
- Generous vertical rhythm; space is the luxury signal.
- Mobile first.

## Voice and quirks

- Plain English headings; terminal flavour in the margins only
  (`// contact`, `[ok]`) — never obscure meaning for non-technical visitors.
- One typographic quirk (TBD with the new name), used sparingly: logo, 404,
  section markers. One quirk is identity; three is noise.
- 404/empty states get personality — low-risk places to be playful.
- Footer: quiet, mono, `© <name> 2026` style.

## Tech conventions

- Astro + Tailwind v4 (CSS-first `@theme`; tokens in `src/styles/tokens.css`).
- Static output; Cloudflare Pages from GitHub.
- No client-side framework. The only script island will be the future cube
  (`client:visible`).
- Semantic HTML throughout: heading order, fieldset forms, hr dividers must
  validate cleanly — view-source is part of the audience.
- Case studies are markdown content collections (`src/content/case-studies/`).
- Budget: < 300KB total first-load transfer including fonts (and cube, later).
- Contact form: honeypot, no CAPTCHA.

## Anti-goals (hard rules)

- No gradient-mesh blobs, glassmorphism, blur-in-by-word text, grainy hero
  overlays, or anything recognisable from template/prompt libraries.
- No source-game references in code, comments, class names, or copy. The
  vocabulary is: paper, ink, stone, ember, field, terminal.
- No dark-corporate-SaaS sections ("Trusted by", logo walls).
- No hardcoded design values — tokens only.
- The slashed ø is retired with the old name. Do not reintroduce it.
