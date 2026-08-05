# Rebuild brief — two directions, material implemented

Supersedes `FIVE-DIRECTIONS-BRIEF.md`. That brief produced five flat pages with
six material techniques between them; v1 and v2 contained zero filters, blend
modes, noise, masks or keyframes. This one exists to fix the three instructions
that caused it.

**Reference implementation: `explorations/v3b/index.html`.** Read it before
starting. It is a single file, no dependencies, WebGL, and it implements the
screened-field family as live material. Match that standard or beat it.

## What went wrong, so it isn't repeated

1. **The anchor was deleted.** The old brief demanded "one monumental image
   anchors the page" and then forbade imagery and mandated a flat CSS stand-in.
   Every direction was a composition built around a hole.
2. **Finish was called optional.** "Not on finishing any of them" — but in this
   work atmosphere *is* the finish. Grain, screen, fibre and refraction are the
   substance, not a polish pass.
3. **The library was read as mood.** It is not. It is a specification.

## The rule that replaces all three

**Every quality in the taste library is a technique, not an adjective.**

The item notes are written as implementable physics. Read them that way:

| Library says | You implement |
|---|---|
| "Dot diameter tracks luminance alone" | sample field luminance per cell, `r = sqrt(lum) * k` |
| "Never rotated to the 45° rosette" | orthogonal grid — rotation is what makes it a *page* not a *panel* |
| "Chromatic fringe only in the falloff" | offset the R/G/B smoothstep edges, not the centres |
| "Grain rises where value is lowest" | `grain * (1.0 - lum)` — never a constant-density overlay |
| "Ribs lighten toward their centre like a lens" | `feDisplacementMap` with a vertical sawtooth, or per-rib UV offset |
| "Inclusions span a speck to a strand fifty times its length" | two scales of noise composited, not one |
| "The boundary is the sharpest thing in the frame" | wet edges get *more* contrast and saturation, never a blur |
| "Indexed palette, every midtone a checkerboard" | ordered Bayer matrix, quantise to N colours, `image-rendering: pixelated` |

If you cannot name the technique, you have not understood the reference.

### The library names things — use it that way

The pixelated motion in the reference snippet has a name, and the library
already held it. Two captures in `pixel`, one grep:

- **ordered dither** — thresholding through a fixed matrix rather than a
  random one, which is why the texture is stable and patterned instead of
  fizzing
- **quantised ground** — the dither belongs to the background; the interface
  sits on top at full resolution
- **indexed palette** — a fixed, countable set of colours; every apparent
  midtone is two entries interleaved
- **countable cell** — the grid is coarse enough to count at reading distance,
  which is what fixes the viewing scale
- **aliased edge** — no anti-aliasing, because smoothing dissolves the grid

One quality the captures do not name, because a still cannot show it: the cell
grid is anchored in **screen space** while the field moves through it. Tone
flips cell by cell instead of sliding. That pop is the motion, and applying a
dither to an already-moving image will not produce it.

## The rule I got wrong and you must get right

**The screen is placed, not applied.**

The governing item for screened-field says it outright: screen the subject and
leave the ground flat. Every other capture in that family runs its screen edge
to edge, and edge-to-edge is what makes it wallpaper. My first pass at v3b
applied it uniformly and the page was unreadable and inert. The fix — a
placement mask that keeps one region quiet — solved the atmosphere *and* the
legibility in one change.

The same principle generalises: **the material needs somewhere to not be.**

## Scope

**Five directions, each with its material fully implemented.** Built and
rendering, indexed at `explorations/index.html`:

| | Family | Material | Accent |
|---|---|---|---|
| v6 | pixel | ordered dither, 4×4 Bayer, seven indexed colours | `#E06A1F` |
| v7 | screened-field | orthogonal dot screen, placed not applied | `#B5502A` |
| v8 | instrument | bone fascia, hard seams, chamfers, detents | `#E2600F` |
| v9 | notation | two inks, isometric plot, registration lattice | `#C8322A` |
| v10 | substrate | fibre at two scales, lime skin over rust render | `#A85D3C` |

Every accent is quoted from a library item, not invented. Every palette is
chosen for its own family; none inherits the reference snippet's colours, and
none reuses another direction's underlying pattern.

**No generated imagery.** Higgsfield is planned for image and animation
generation later. This pass proves we reach most of the target without it,
using shaders and procedural material. If you hit a ceiling that only real
imagery can break, say where and why.

**No invented strapline.** The wordmark is the monumental element, because it
is the slot being tested — sized for a real name of 6 to 14 characters. Every
other copy slot is drawn as visibly empty.

**Marginalia is about this site, not about the library.** Route count, case
studies, unfilled slots, commit, dependency versions, deployment target, plus
live-measured viewport, ratio, cell or seam or pitch, frame time and cursor.
The library is the source; it is not the subject.

## Everything else carries over

Intent, guardrails, working rules, placeholder policy and pending values are
unchanged — see `FIVE-DIRECTIONS-BRIEF.md` and `FIVE-DIRECTIONS-ANSWERS.md`.
Restating the ones that matter most here:

- Type at extremes. Monumental display or 10px mono, nothing between.
- Technical marginalia, and **all of it true**. Live-measured values are the
  best kind — viewport, device pixel ratio, screen pitch, frame time, cursor
  position are unfalsifiable and they change as you move.
- One warm accent per direction, from the library.
- Placeholders must look like placeholders, never like facts.

## Comparison

**Stop comparing at thumbnail scale.** The iframe grid rewards designs that
read at 20%, which is the exact opposite of monumental. Keep `index.html` as an
index — a list linking to each direction full-screen — not a wall of scaled
iframes.

## Definition of done

A direction is finished when a screenshot of it would be worth showing to
someone without explanation. Not when the sections are present.
