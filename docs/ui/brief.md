# TASK-40 — UI rework brief (binding for all design agents)

Repo: `/var/www/watercolourlove` (branch `feature/TASK-40-ui-refactor`). Read files there directly.
This brief lives at `docs/ui/brief.md`; specifications go to `docs/ui/round-<n>/<team>.md`,
prototypes to `public/preview/round-<n>/<team>.html`.

## What the product is

Watercolourlove (native app name: Tintmap) finds the main colours in a photo, mixes each of them from
the paints the user owns, and shows the photo as flat, numbered colour areas — a paint-by-numbers plan
for a real watercolour painting. Everything runs in the browser: no backend for the work itself.

Two methods:
- **Mix mode** — every colour area gets one mixed colour, painted once. Palette entries are grouped
  into "mixes", each with up to five washes (labels like `6L`).
- **Layer mode (glazing)** — a few base paints, one wash per layer, painted light to dark over each
  other, with coats, accents and a step-by-step painting walk.

The user is a painter standing at a table, usually with the photo on screen and brush in hand.

## Who uses it and where (this drives the whole design)

- Markus (the owner) and other watercolour painters. Not developers, not power users of software.
- **Primary device: iPad in the studio.** Landscape and portrait. Often **wearing latex or nitrile
  gloves**, sometimes with wet or paint-stained fingers. Touch accuracy is poor; fine targets fail.
- Secondary: desktop/laptop browser (planning before painting), phone (looking something up).
- Also runs inside the native Tintmap web view in places (`isNative`, `lib/native.js`).
- Sunlight and studio lamps: contrast must hold. Dark mode is used in the evening. Both are required.

## The hard goal

> "modern and clean and not like another vibe coded webapp" — the owner.

Concretely, that means: no purple gradients, no glassmorphism, no rounded-pill everything, no emoji,
no icon soup, no drop-shadow-on-everything, no AI-startup landing-page tropes, no 8-colour accent
palette. It should look like a considered, quiet, professional tool made by someone who paints —
calm surfaces, real hierarchy, type that does the work, colour used only where colour is the subject.
The photo and the paint swatches are the only saturated things on screen.

## Non-negotiable house rules (owner's global rules — violating these fails the review)

1. **No emoji anywhere.** Not in UI text, code, comments, commit messages, docs. No decorative
   unicode symbols as a substitute (no check marks, crosses, warning signs, arrows used as icons…).
   Status is written in words ("OK", "FAILED", "Achtung"/"Note"). Existing emoji get removed
   (note: `index.html` still has an emoji favicon — it must go, replaced by a drawn SVG icon).
2. **No left-border accents.** The `border-left: 4px solid …` pattern on cards, panels, callouts,
   result boxes or quotes is banned everywhere. Colour accents go through background, icon or type.
3. **BEM** (`block__element--modifier`), nesting of state via modifier classes. No utility classes,
   no scoped styles, one block per file.
4. Project language is **English** for all UI text, comments and commit messages.
5. CSS token naming follows the owner's house standard:
   - colours `--c-*`: `--c-copy`, `--c-copy-light`, `--c-corporate` (primary), `--c-corporate-hover`,
     `--c-accent`, `--c-head`, `--c-danger`, `--c-success`, `--c-background`, `--c-white`, `--c-border`
   - font families `--ff-copy`, `--ff-head`, `--ff-fixed`
   - font sizes `--fs-mini`, `--fs-small`, `--fs-copy`, `--fs-medium`, `--fs-large`,
     `--fs-hl-small`, `--fs-hl-medium`, `--fs-hl-large`, stepped up by media query inside `:root`
     (breakpoints 1024 / 1280 / 1440)
   - spacing: `--gap` plus calc multiples `--gap-025x`, `--gap-05x`, `--gap-15x`, `--gap-2x`,
     `--gap-3x`; vertical rhythm `--m-vert`, `--m-vert-slim`, `--m-vert-2x`
   - widths `--max-width`, `--article-width`; radius `--radius`, `--radius-medium`, `--radius-small`;
     shadow `--shadow`, `--shadow-flat`
   - file structure is flat, cascade-ordered, no `base/ components/ layouts/` folders and no
     underscore prefixes: `site.css` as the entry, then `reset`, `fonts`, `properties`, `typography`,
     `scaffold`, `animations`, `header`, `footer`, `forms`, `tables`, `ui`, then `components/<block>.css`
     (one per Vue block, aggregated by `components.css`), then `print.css`.
   - **Plain CSS, no Sass** for this project: the PRD fixes "BEM, plain CSS files under `src/css/`"
     and adding a build dependency needs the owner's approval, which is not available. So: same
     structure and same token names, written as plain CSS with `@import`, sizes in `rem` directly
     instead of a `pxtorem()` function.

## Touch rules (iPad with gloves) — treat as acceptance criteria

- Every interactive target at least **48 x 48 px** of real hit area; primary actions 56 px tall.
  Spacing between neighbouring targets at least 8 px so a gloved finger cannot hit two.
- **Nothing may depend on hover.** The current build hides meaning in `title="…"` tooltips in dozens
  of places — on touch these never appear. Every such explanation must become visible text, a hint
  line, or an info affordance that works on tap.
- **Nothing may depend on double-click** (the saturation/contrast reset currently does) or on a
  precise drag (the floating recipe panel is dragged by its header; close-up framing is a drag).
  Drags must still work on touch (`touch-action`, pointer events) and must have a non-drag fallback.
- Sliders are used constantly (Colours, Simplify, Details, Saturation, Contrast, Layers, Accents).
  Native range inputs with a 14 px thumb are unusable with gloves: the thumb must be large
  (28-32 px), the track tall enough to hit, and every slider must have a readable value and a
  stepper or discrete alternative so an exact value can be set without dragging.
- Scrolling areas must not trap or fight the page scroll; no nested scroll regions smaller than
  about 240 px tall.
- Safe areas (`env(safe-area-inset-*)`) are already respected and must stay respected.
- Long-press, right-click and keyboard-only paths must not be the only way to reach anything.
- Tap feedback must be immediate and visible (active state), since analysis takes a moment.

## Current state (what you are redesigning)

Entry: `src/App.vue` — header (title, tagline, Account button), then a two-column `app__main`:
a sticky **stage** (left) with the canvas, and a **sidebar** (right) with stacked panels. Below:
print-only legend/sheets, footer links, and five overlay dialogs.

Components in `src/components/` (read them):

| File | What it is | Known trouble |
|---|---|---|
| `PaintingCanvas.vue` | The picture: canvas, zoom button, close-up frame button, status, click-to-select, hover tooltip | Two small floating icon buttons stacked top-left over the image; status text overlaps; crosshair cursor only |
| `ControlsPanel.vue` | Everything: image name, New / Take photo / Sample / Save / Collection / Print, method switch, areas, Simplify, Show + Outlines/Numbers, Colours, Details, Max. paints, Saturation, Contrast, Reset, AI panel | One panel with ~15 controls and 7 buttons in a row; a 3-column grid of sliders; the heaviest problem in the app |
| `AiPanel.vue` | Optional AI help: provider, model, API key, consent, cost, answer notes | Sits at the bottom of the settings panel, same weight as a slider |
| `PaletteList.vue` | The colours found: number, swatch, paints, share of image, recipe bar, wash bar | Dense rows, 1.2rem text, small tap targets |
| `EntryEditor.vue` | The selected colour: target vs. mix, colour picker, "Edit only this area", up to 5 alternative recipes | On wide screens it becomes a **floating draggable panel** (`floating.js`) that covers the page |
| `RecipeLine.vue`, `RecipeTip.vue`, `PaintChip.vue` | Recipe rows, pointer tooltip, paint chips | `RecipeTip` follows the pointer — meaningless on touch |
| `LayerList.vue`, `LayerArea.vue`, `LayerSteps.vue`, `LayerStrip.vue`, `LayerSheets.vue` | Layer mode: list with tick/solo/coats, the clicked spot, the step walk, a layer button row on narrow screens, printed sheets | Parallel universe to the mix-mode panels, inconsistent with them |
| `PaintBox.vue` (299 lines) | Modal dialog: selected paints, Pans/Tubes grids, Auto, several boxes, own paints form | The biggest dialog; chips are 112 px wide, 46 px tall |
| `CollectionDialog.vue` | Saved pictures as thumbnails | |
| `ProDialog.vue`, `AccountDialog.vue`, `AccountGate.vue` | Plans, account, sign-in gate | Three more separate visual languages |
| `ConsentBanner.vue` | Analytics consent, fixed at the bottom | |
| `CloseupBar.vue`, `CloseupStrip.vue` | Return to the base picture; close-up thumbnails with a 22 px remove button | 22 px target: far too small |
| `PanelToggle.vue` | 28 px fold button in panel headers | 28 px target: too small |
| `PrintLegend.vue` | Print-only legend | Must keep working |

CSS today: `src/css/main.css` imports `base/_variables.css`, `base/_reset.css`, `layouts/_app.css`,
26 `components/_*.css` files and `layouts/_print.css`. Tokens are `--paper --surface --ink --ink-soft
--line --accent --accent-soft --good --fair --rough --chip-line --radius --gap --font-size --font`,
dark mode by `prefers-color-scheme`. Base text size is `1.4rem` with `html` at browser default, so
`rem` values look odd (1.2rem = 12px); the print sheet relies on `html { font-size: 10px }`.

Stores (`src/stores/`): `analysis` (image, settings, entries, layers, close-ups, selection),
`paints` (boxes, enabled paints, own paints), `layout` (collapsed panels, floating positions),
`collection`, `account`, `pro`, `consent`, `ai`. **The design must not change store APIs or any
logic in `src/lib/`.** This is a presentation-layer rework.

## What must still be reachable after the rework (feature inventory)

Load photo / take photo / next sample · save to collection · open collection (rename, delete) ·
print and PDF · method Mix/Layer · areas Organic/Geometric · Simplify · Colours · Details (variety) ·
Max. paints · Layers · Accents · Max. coats · Saturation · Contrast · reset of both · view switch
(Mixed paint / Photo colour / Photo / Sketch, layer mode: Layered paint / Photo / Sketch) ·
Outlines · Numbers · Guides (sketch view) · select an area and see its recipe · change a colour ·
reset to photo colour · edit only the clicked area · choose among alternative recipes · the colour
list with washes · solo a layer, tick layers, coats, the spot card, the step walk · paint box
(selected paints, pans/tubes, Auto, All/Invert/None, several boxes, own paints, P/T marks) ·
close-ups (frame, thumbnails, return, remove) · AI panel (provider, model, key, consent, cost, ask,
notes, forget) · account (sign in, plan, export, delete) · plan dialog · consent banner ·
footer links (Manual, Privacy, Terms, Imprint, Privacy settings).

Nothing may quietly disappear. Things may be moved, grouped, folded, or put behind a clearly
labelled second level — say where.

## Typography

Pick **one Google font** (a second only with a real reason) that is genuinely readable at arm's
length on a tablet, has tabular figures (the app is full of three-digit paint numbers, area numbers,
percentages and ratios) and does not read as a startup default. It will be **self-hosted** as woff2
in `public/fonts/` (no request to Google: the app has a GDPR consent banner and must not load
third-party assets). Variable font preferred, two weights maximum if static.
Justify the choice against at least two alternatives, on legibility grounds, not taste.
Define a type scale with a clear rhythm (base size on a tablet around 16-17 px, steps that are
actually distinguishable) and state line heights, weights and letter spacing per role.

## What a design round must produce

A written specification precise enough to build from without inventing: layout at each breakpoint,
the token values (every `--c-*`, `--fs-*`, `--gap*`, radius, shadow) for light **and** dark, the
component inventory with states (default, hover, active, focus-visible, disabled, selected, busy),
the information architecture and the user's path through it, the touch sizes, and the migration
notes per existing component. Reference real file names. No mood-board prose, no metaphors without
a consequence, no "delightful".

## Phone: the worst screen today (added after round 1 was started)

The owner opened the running app on an iPhone on 2026-10-12. The screenshot is in this repo at
`docs/ui/evidence/phone-settings-2026-10-12.png` — look at it.

What it shows, and what the new design must fix:
- The three-column settings grid does not collapse. "Saturation 200%" and "Contrast 100%" run into
  each other as "Saturation200%Contrast100%"; "Max. paints" wraps onto two lines while its segmented
  control drops to the next row; "Simplify areas" overlaps its own slider.
- Seven action buttons wrap into two ragged rows that take a third of the screen.
- The picture — the whole point of the app — is scrolled off the top. On a phone the user sees
  nothing but controls.
- Text is far too large for the viewport: the base of `1.4rem` is never stepped down, so labels are
  set at the size of headlines and everything wraps.
- Nothing is reachable with one thumb; the settings are a single long scroll with no structure.

**The phone is a first-class target**, not a fallback: the painter checks a colour on the phone while
the picture is on the easel. Specify the phone layout explicitly — what is on screen first (the
picture), where the controls live (a sheet, a tab bar, a second level — your decision, but state it),
how the colour list reads at that width, and how the type scale steps down. A design that only
describes the desktop and says "stacks on small screens" is incomplete and will be marked down.

## Deliverable per round: a prototype that can be opened on a device

Besides the specification, every round produces a **static HTML prototype** of the design, built by
a separate agent from the specification text alone. It is published to the development server after
each round so the owner can open it on his phone and his iPad and judge it with his hands.

Requirements for the prototype (the prototype agent builds it, but the specification must be precise
enough to make it possible):
- One self-contained HTML file, no build step, no external requests except the chosen Google font
  (in the prototype only; the real app self-hosts it).
- Genuinely responsive: phone, iPad portrait, iPad landscape, desktop. The same file, real CSS, no
  device frames and no screenshots.
- A switch for light and dark, and a switch between the screens: the stage with the picture, the
  colour list with a recipe, the settings, the paint box, layer mode, and one dialog.
- Realistic content: a 20-colour list, three-digit paint numbers, a three-paint recipe with a wash
  bar, a seven-layer plan, 54 paints in the box. Placeholder pictures may be flat colour fields.
- Every rule from this brief holds in the prototype: no emoji, no left-border accents, BEM names,
  the house token names, the touch sizes.
