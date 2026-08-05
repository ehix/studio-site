# Five directions — handover

Built 2026-08-04. All five plus the comparison view are in `explorations/`.
Open `explorations/index.html` first.

```
explorations/
  index.html        ← comparison view, all five live at identical scale
  v1/ v2/ v3/ v4/ v5/   index.html · style.css · script.js · fonts/
```

Each version is self-contained: its own stylesheet, its own script, its own
self-hosted woff2 files. No shared stylesheet, nothing fetched at view time.
They open straight from disk.

---

## 1. Two things I need you to look at before the placeholder list

### The accent table did not survive the session boundary

The answers file quotes only one value from the table you approved — v3
`#B5502A`. The other four were in the checkpoint message itself, which I no
longer have. So I rebuilt them under the rule you enforced in that answer:
each accent must be **quoted from a library item**, never invented.

| | Direction | Accent | Quoted from |
|---|---|---|---|
| v1 | Notation | `#A35139` | *Truffle Trouble* — "Colour tokens with contrast ratios" |
| v2 | Instrument | `#FFB162` | *Burning Flame* — same card |
| v3 | Screened Field | `#B5502A` | **locked by you, unchanged** |
| v4 | Instrument UI | `#B17457` | *Desert Clay* — "MILK to GRAPHITE swatch stack" |
| v5 | Substrate | `#A4623E` | *Burnt Sienna* — "Sage green garden swatch stack" |

Every one is a named swatch with a quoted hex in the library, so all five are
traceable. **If any of these differ from what you approved, say which and I
will swap them** — it is a one-line change per direction.

### I removed a claim I should not have written

I had given the Malmesbury Abbey entry the line *"Rebuilt to hold a thousand
years of records and still open in under a second on a phone in the nave."*
You gave me the project name and nothing else, so that performance figure was
invented — a rule 3 violation, springboard or not. It is now `———` in all five
and appears in the slot list below.

---

## 2. Placeholder slots

Everything below is a visible blank. Nothing in the five pages invents a value.

### Across all five (5 × each)

| Slot | Current | Where |
|---|---|---|
| Studio name | `STUDIO —` | `h1`, `<title>`, colophon, plus the title band (v1) and brand block (v2) |
| Domain | `studio.example` | colophon, `mailto:` href |
| Email address | `——— @ studio.example` | contact block |
| Location | `——.———°N ——.———°W` | contact block |
| Malmesbury Abbey — one line | `———` | work item 1 |
| Malmesbury Abbey — role | `———` | work item 1 |
| Malmesbury Abbey — date delivered | `———` | work item 1 |
| Malmesbury Abbey — outcome figure | `——%` | work item 1 |
| Project 2 — name | `CLIENT A` | work item 2 |
| Project 2 — one line, role, date, outcome | `———` `———` `———` `——%` | work item 2 |
| Project 3 — name | `CLIENT B` | work item 3 |
| Project 3 — one line, role, date, outcome | `———` `———` `———` `——%` | work item 3 |
| Service 1 — name and one line | `SERVICE A` `———` | capability section |
| Service 2 — name and one line | `SERVICE B` `———` | capability section |
| Service 3 — name and one line | `SERVICE C` `———` | capability section |

### Direction-specific

| Direction | Slot | Current |
|---|---|---|
| v1 | Revision row 2, date and note | `———` `———` |

### Still pending from your list, with no slot yet

- **Studio start date** — I found no honest place for it. It belongs in the
  colophon (`© STUDIO — 2026` could become a range) or as a "practising since"
  line. Tell me which and I will cut the slot.
- **Contact postal address** — currently represented only by coordinates. Say
  if you want a street address block instead and I will add one.

### Sizing note

Every wordmark is set with `max-width: 14ch` and a display size chosen so a
**14-character name drops in on one line with no reflow**. It is one string per
version — search `STUDIO` in that version's `index.html`. The domain is one
string too.

---

## 3. Copy I wrote, which you have not approved

This is authored copy rather than placeholder, so it will not announce itself
as missing. It makes no factual claims, but it is mine and not yours:

- **The positioning line**, phrased slightly differently per direction, all
  built from "a small team's unfair advantage" and the design/engineering/data
  triad. v1: *"One hand draws the design, the engineering and the data, so
  nothing is lost in the gaps between them."*
- **The contact line**: *"Tell me what you are trying to build. I will tell you
  whether I am the right person to build it."*
- **The call to action**: *"Start a project."*
- **Section headings**: "Selected work", "What I do", "Contact".

---

## 4. What each direction is, and what its one interaction does

| | Direction | Ground | Type | The interaction |
|---|---|---|---|---|
| v1 | Notation | Bright drawing stock `#FAF8F3` | Archivo variable | **Assert-layer toggle.** Ink draws; the accent only says something *about* what is drawn. Switching the accent layer off leaves a complete, readable drawing — which turns the two-ink claim into something you can check rather than something I assert. |
| v2 | Instrument | Forest housing `#2E3A2F` | Barlow Condensed / Semi Condensed | **Detented rotary.** Knurled, so the form states the gesture; four detents, so the positions are countable; labelled on the housing beneath it, never on its face. Drives the recessed amber readout beside it. |
| v3 | Screened Field | Steel blue `#2C3B4D` | Bricolage Grotesque / Space Mono | **Screen pitch.** Drag it and the same mechanism moves from reading as a continuous surface to reading as a device you notice. That boundary is the direction's whole argument. |
| v4 | Instrument UI | Pale sage `#D7DACB` | Martian Mono variable | **Hold and read.** The strip traces this page's own frame time. Move across it and every panel below reports the sample under your cursor instead of the live one. |
| v5 | Substrate | Oatmeal `#C9C1B1` | Young Serif / Courier Prime | **Move the sheet.** The ground is two sheets of the same paper from different batches. You cannot see that while one covers the other, so it slides aside — with the torn edge and its pale fibre lip travelling with it. |

The comparison view labels each of these, and they only work in the full-size
page — the tiles are previews, not live controls.

---

## 5. Real values used as marginalia

Every technical mark on all five pages is one of these. Nothing counts nothing.

| Value | Source |
|---|---|
| `a94bcca`, 2026-07-06 | studio-site HEAD |
| `ce649c6`, 2026-08-04 | taste-library HEAD |
| 102 items, 12 populated families | `src/content/items`, `src/content/families` |
| 87 adopt / 13 borrow-structure / 2 reject | item frontmatter |
| astro 7.0.6 · tailwind 4.3.2 · three 0.185.1 | `package.json` |
| Sheet 1 of 5 | `src/pages` — index, 404, colophon, contact/, work/ |
| `github.com/ehix` | your answer to Q9 |
| Every contrast ratio quoted | computed from the actual token pairs |
| Frame time, budget %, rate, timestamp (v4) | measured live in the browser |
| Screen pitch in px (v3) | the actual CSS value being applied |
| Font file counts and byte totals (v2) | the files on disk |

---

## 6. Weights

Uncompressed bytes; woff2 is already compressed. Budget was < 300 KB.

| | HTML | CSS | JS | Fonts | Total |
|---|---|---|---|---|---|
| v1 | 10.6 KB | 18.3 KB | 2.9 KB | 90.1 KB | **121.9 KB** |
| v2 | 9.5 KB | 15.7 KB | 4.1 KB | 111.6 KB | **140.9 KB** |
| v3 | 6.4 KB | 11.8 KB | 1.4 KB | 164.8 KB | **184.5 KB** |
| v4 | 9.1 KB | 11.4 KB | 7.2 KB | 38.5 KB | **66.2 KB** |
| v5 | 7.7 KB | 13.9 KB | 3.7 KB | 65.0 KB | **90.2 KB** |

All five faces are SIL OFL 1.1 and are named truthfully in each colophon.

---

## 7. What was skipped, per your scope

Responsive work beyond "does not break", cross-browser testing, build
optimisation, any page other than the landing page, and exhaustive
accessibility passes. Heading order validates and contrast is measured and
quoted on all five, because both were cheap and both are part of the argument.

## 8. Where the name test bed stands

`NAMING-SHORTLIST.md` is unchanged. The five treatments now exist, so the next
step it describes is available: shortlist three, run the domain and
existing-trader checks, then set the survivors in all five. Say the word and I
will drop a candidate into every version so you can see it five ways.
