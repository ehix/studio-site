# Five directions for the studio site landing page

## Context

I have a taste library at `~/workspace/websites/taste-library` — 102 analysed
design references across 12 style families, each with a written brief.

This studio site has made good progress but the look and feel is too limited —
that's what this exercise is for. Read `DESIGN-BRIEF.md` in this repo for
**content and information architecture only** (what sections exist, what the
copy says). Do **not** treat its existing visual direction as a constraint;
widening past it is the whole point.

We can't one-shot this. The purpose is to cast a wider net and pull in more
inputs before committing to a direction.

## How to reach the library

The library is a **sibling directory**, not part of this project. Run
`/add-dir ~/workspace/websites/taste-library` before you start, or you will not
be able to read it.

**You do not need the dev server.** It is not running, and the Astro app is
only a viewer — every reference is plain markdown on disk. Read the files
directly:

```bash
cd ~/workspace/websites/taste-library

# all 13 family briefs in one pass
for f in src/content/families/*.md; do echo "───── $(basename $f .md)"; cat "$f"; done

# every item in a family — substitute the family id
grep -l "^family: notation$" src/content/items/*.md | while read f; do cat "$f"; echo; done
```

Each item file carries `structure` (surface-neutral compositional moves),
`surface` (its own finish), `vocabulary`, a `verdict`, and a prose note in the
body explaining what is worth taking and why. **The body notes are often the
most useful part — read them, not just the frontmatter.**

Pay attention to `verdict`. `reject` records what to avoid and why;
`borrow-structure` means take the composition and leave the finish.

The rendered family brief (`familyBrief()` in `src/lib/prompts.ts`) is just
summary → principles → vocabulary → one reference-point line per item.
Assemble it yourself from the files; there is no need to build or serve
anything.

If you want to browse it visually rather than read it: `npm run dev`, then
`http://localhost:4321`. Astro's content layer caches across schema changes, so
restart it if anything looks stale.

Background on how the taxonomy was built and why is in
`docs/superpowers/specs/2026-08-03-taste-library-design.md`.

## Intent — identical for all five

A landing page for my studio site.

- **Main goal:** showcase work.
- **Conversion goal:** get people to contact me about services.
- It is a portfolio site showing my digital skills to prospective clients.
- It must be interactive, engaging, visually standout, tactile and informative.
- The positioning is *a small team's unfair advantage*.
- It should feel like serious, crafted intelligence — calm and confident, never
  loud SaaS hype.
- A founder should think *"this person actually understands technology, design
  and data"* within three seconds.

## Guardrails — identical for all five

**Always:**

- **One monumental image or animation anchors the page.**
- **Imagery is processed, never raw** — halftone, dither, grain, ASCII,
  linework.
- **Technical marginalia** — coordinates, IDs, ruler ticks, timestamps, part
  numbers, revision marks, sheet numbers, registration crosses. These are not
  content; they are evidence the thing has been measured, located and
  versioned, and they are what make a page read as a document or an instrument
  rather than as marketing. Push them to edges and corners. Worked examples in
  the library: *"Isometric cube at 35 degrees"* (date, year, sequence number and
  identity mark each taking a corner so the centre belongs to the subject),
  *"A4.1 wall section drawing, Outpost"* (a full-height title band holding
  project, date, revisions, scale, north point and sheet number),
  *"WildCompanion Explorer X1 in forest green"* (frequencies to five decimals,
  real coordinates).
- **Type at extremes** — monumental display or tiny mono labels, very little in
  the middle. No comfortable body size, no subheads, nothing "slightly larger
  than the paragraph". Removing the middle removes every chance to fudge
  hierarchy: each element becomes either the subject or an annotation. See
  *"Cyrillic Swiss poster with red A"* (two sizes on the whole sheet, enormous
  and tiny) and *"Carbon bike frame with race number"* (a huge number for a
  spectator at distance against tiny specification text for the owner, neither
  compromising toward the other).
- **A single warm accent**, chosen per direction.

**Never:**

- Purple gradients.
- Glossy 3D SaaS blobs.
- Untextured stock photography.
- Rounded-everything friendliness.
- Icon-grid feature rows.

## Working rules

1. **No hacky workarounds.** If you are unsure about anything, stop and ask me
   rather than guessing.
2. **Do not blend directions.** Each version commits fully to its own
   aesthetic. Five distinct arguments are the deliverable; five variations on
   one theme are a failure.
3. **All marginalia must be true.** Use real values — actual commit SHAs, real
   timestamps, genuine project IDs, true dimensions and coordinates. Never
   invent a coordinate, a part number, or a counter that counts nothing. The
   library records two captures that fail this and marks both
   `borrow-structure` for it: the CBRPNK board runs meters that measure
   nothing, and the NETRAN sheet uses the whole apparatus of notation — grid,
   crosses, sector references — purely to lend a display typeface the authority
   of a document. Fake technical detail is cosplay, and the founder evaluating
   whether I "actually understand technology, design and data" is exactly the
   person who will notice. If you need a value and don't have a real one, ask
   me for it.

## Hero images come later

Do **not** generate, source, or download any imagery.

For each version, reserve the hero slot exactly where its placement note says
and fill it with a flat CSS stand-in in that direction's palette. Size all
typography and negative space **as if the real image were already there**, so
it drops in later with zero layout changes.

## The five directions

Each is grounded in specific families. Read those families' briefs and items
before starting.

### v1 — Notation
Families: `notation` (9 items), `design-system` (3)

The page as a technical drawing sheet. Two-ink system: one ink draws, the
accent only *asserts* things about what is drawn — dimensions, callouts,
revisions. Full-height title band down one edge carrying all metadata. Leader
lines, hairline weights throughout, sheet number set largest and alone.
Hierarchy from position, never thickness.

**Hero placement:** in the drawing field, left of the title band, landscape ~3:2.

### v2 — Instrument
Families: `instrument` (21 items)

The page as a hard-surface industrial object. Bone plastic, chamfered edges,
moulded seams instead of rules, visible fasteners. Content in horizontal
subsystem bands where each band is one complete function. Labels sit *outside*
their controls, never on them. Colour muted and functional — bone, forest
green, graphite, one warning accent.

**Hero placement:** full-bleed object shot, centred, roughly square, on a flat
two-value split ground.

### v3 — Screened Field
Families: `screened-field` (9), `reproduction` (3), `pixel` (2)

The page as processed image. A regular pitch imposed over continuous imagery —
orthogonal dot grid, reeded glass, line screen, ordered dither. The screen
modulates rather than quantises, so colour survives. Type sits flat over the
field with no blending. This direction leans hardest into "imagery is
processed, never raw".

**Hero placement:** full-bleed background behind the masthead, full viewport
height, type overlaid.

### v4 — Instrument UI
Families: `instrument-ui` (7 items)

The page as a live readout. High data density, where whitespace serves scanning
rather than calm. Tabular monospace numerals that don't jitter when they
update. State carried by fill length and ring completion rather than by hue.
Corner brackets implying a viewport without drawing a box. Ground may be light
or dark — darkness buys contrast, never mood.

**Hero placement:** wide monitoring strip across the top third, ~21:9, with
readout panels flanking below.

### v5 — Substrate
Families: `substrate` (17 items), `wet-pigment` (2)

The page as material. Paper fibre, tooth, uncoated stock, torn edges showing
the pale fibre core. Even illumination — no vignette, no hotspot, no
directional drama. Warmth comes from the material itself, never a wash laid
over it. Where pigment appears it bleeds and collects at its edge, so the
boundary is the sharpest thing in the frame, never a blur.

**Hero placement:** inset plate, portrait ~4:5, placed off-centre with generous
reserved ground around it.

## Output

```
explorations/
  v1/index.html   (+ its own css/js)
  v2/…  v3/…  v4/…  v5/…
  index.html      ← the comparison view
```

Relative to this repo root. Each version is self-contained and independently
openable. **No shared stylesheet** — sharing one would pull the five toward
each other.

**`explorations/index.html` is a required deliverable.** I want to see all five
options on one screen at the same time, to compare and contrast. Build it as a
grid of five live iframes, each scaled to fit and labelled with its number and
direction name. All five visible simultaneously without scrolling on a standard
laptop screen. Clicking one opens it full size.

## Before you write any code

Report back with:

1. Which families you'll draw on for each of the five directions.
2. The single warm accent for each, as a hex value.
3. Any real values you need from me for the marginalia — project IDs, dates,
   dimensions, client names.

Wait for my response before building.
