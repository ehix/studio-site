# Answers to the checkpoint

Responses to the checkpoint raised against `FIVE-DIRECTIONS-BRIEF.md`. Your
family assignments and accent table are accepted as proposed. Read this in full,
then proceed.

## The big one — nothing from the existing studio site is a constraint

Not the fonts, not the tokens, not the name, not the surface. Treat that repo as
content and information architecture only. If a direction is better served by
something the old site never used, use it. Do not inherit anything by default.

## 1. Typeface — your choice, per direction

Commit Mono exists in the old repo under **SIL OFL 1.1** (three cuts at
`public/fonts/`, tracked, licence file alongside), so it is *available*. It is
not required and nothing should default to it. Each direction picks the face
that serves it.

Two conditions:

- The specimen line must **truthfully name what is actually being used**.
- The face must be genuinely licensed for web use — state the licence in the
  colophon.

If you want a face you can't license, say so and we'll decide together.

## 2. Field Terminal does not survive

It was the name of the surface these five directions exist to widen past.
Retire it. All five carry the studio wordmark and differ visually only.

## 3. Studio name and domain — placeholder, still being decided

Use `STUDIO —` as the wordmark and `studio.example` as the domain. Put both in
**one place per version** so a swap is a single edit.

Set them at a realistic length — assume the real name lands between 6 and 14
characters — and size the hero, title band and colophon around that, so a real
name drops in without reflow.

The five directions are also serving as the naming test bed: I want to see
candidates set in five different treatments before committing. Treat the
wordmark as a slot that has to look right, not as filler.

## 4. Placeholders must look like placeholders, never like facts

This is working rule 3 applied to missing data. Where I have not given you a
real value, do **not** invent a plausible one — use an obviously empty one.

- `CLIENT A`, not "Northfield Legal"
- `———`, not a date
- `000` or `——%`, not a metric

Anything a reader could mistake for a real claim is a rule 3 violation even in a
springboard, and it also hides from me which slots still need filling.

Real values where they genuinely exist: commit SHAs, dependency versions,
measured contrast ratios, taste-library counts, today's date, transfer budget.
Visible blanks everywhere else.

## 5. These are springboards, not builds

I am not taking five sites to production. Calibrate accordingly.

**Build:**
- The full landing page composition at desktop width
- Real type scales, real palette, real marginalia treatment
- **One** genuine interaction per direction that demonstrates its tactility —
  the thing that proves the direction is engaging rather than a static comp

**Skip:**
- Responsive breakpoints beyond "doesn't break"
- Cross-browser work
- CMS, routing, or any content pipeline
- Exhaustive accessibility passes
- Build optimisation
- Any page other than the landing page

Spend the effort making each direction **unmistakably itself**, not on
finishing any of them.

## Resolved from your list

- **Q9 GitHub handle** — `ehix`.
- **Q10 fonts** — answered above. Your call now, not a blocker.
- **Q11 Field Terminal** — retired, see above.
- **Sheet numbering** — your derivation is approved. `src/pages` holds `index`,
  `404`, `colophon`, `contact/`, `work/`; landing page as sheet 1 of 5. State
  the derivation on the sheet as you proposed.
- **Accents** — **build as tabled. Keep v3 `#B5502A`.** Both your accents are
  quoted from library items; `#C7913A` would be invented, and swapping a
  traceable value for an untraceable one to fix a swatch-strip problem is the
  wrong trade. In the comparison grid the five will be separated by their
  grounds long before anyone compares accents.

## One correction to the library

Your v3 note says the stitched cloud is "the only one in the family with a real
composition". That was an error in the item note itself, which you inherited —
**four** screened-field captures carry a `structure` block: stitched cloud,
reeded glass over a tonal split, faceted glass, and standing wave.

The library is fixed and pushed (`ce649c6`). Re-read that item.

What is actually singular about it is narrower and more useful for v3: it is the
only capture where **the screen is placed rather than applied** — subject
screened, ground left flat, where every other capture in the family runs its
screen edge to edge. It remains the governing item for the direction; the
reasoning just needs restating.

## Still pending from me

Services list, projects beyond Malmesbury Abbey, real Abbey numbers,
coordinates, studio start date, contact address.

Use visible placeholders for all of these, and list every placeholder slot in
your handover so I can fill them in one pass.

## Proceed

No further checkpoint needed before building. Come back when all five plus the
comparison view are up, with the placeholder-slot list.
