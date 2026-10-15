# Round 2 — Studio bench — the complete specification

Team: Studio bench (the surviving design). Round 2 of 3. Author: UX lead.
Binding input: `docs/ui/brief.md`.
Supersedes `docs/ui/round-1/bench.md` entirely. The implementer reads **only this file**.
Code read for this round: `src/App.vue`, every file in `src/components/`, every file in `src/css/`,
`src/stores/analysis.js`, `src/stores/paints.js`, `src/stores/layout.js`, `src/stores/pro.js`,
`src/lib/color.js`, `docs/ui/evidence/phone-settings-2026-10-12.png`.

This round is design only. Nothing under `src/` was changed.

One character is used as punctuation and nothing else: ` · ` (middle dot), as a separator inside
meta lines, as the app already does. It is not an icon. **This design contains no icons inside
controls at all** (section 10) and no emoji, no check marks, no crosses, no arrows, no chevrons, and
no left-border accents.

---

## 0. What is true now that was not true in round 1

Round 1's structure survived both critiques intact. Six things changed, and they change the design,
not its wording.

1. **The root font size is fixed at the root.** `html { font-size: 62.5% }`, 1rem = 10px, and every
   value in this document is written in honest rem. The phone evidence screenshot is caused by
   `--font-size: 1.4rem` in `src/css/base/_variables.css` resolving against a 16 px root — 22.4 px
   for every label. Section 4 states the migration for all 39 rem values in `src/css/`.
2. **Every control carries a word.** No icon-only control exists. Four icon-only controls in the
   current build are named with their replacements in section 10.
3. **Selection and focus are achromatic.** `--c-corporate` is graphite, not blue. The only
   saturated things on screen are the photo and the paint. One chromatic signal survives,
   `--c-danger`, and section 7.2 argues why.
4. **The phone is laid out from a height budget in pixels**, not from a percentage and a hope.
   Section 5 proves every breakpoint against real viewport heights, including the two that failed in
   round 1: phone landscape and the layer-mode step walk.
5. **Hints are per group and dismissible.** The fourteen permanent hint lines are gone. `AI help` is
   no longer a top-level settings group; it sits with the account behind one labelled button.
6. **The variety slider is called `Variety`.** `Details` is now used for one thing only: a close-up
   of the picture.

---

## 1. Stance

The app is a workbench. The painter opens it again and again, knows where things are, and works with
gloved or wet hands beside a sheet of paper. Everything needed while painting stays on one surface.
Density is allowed where it buys speed and is paid for with strong grouping and quiet surfaces.

Three rules decide every detail below.

- **Only paint is coloured.** Hue on screen means "this is a colour you will mix". Selection, focus,
  state, emphasis and hierarchy are carried by a graphite field, a heavier rule, a bolder number, a
  thicker edge, position and weight. A hue next to a swatch is interference, not information.
- **Every control says what it does, in a word.** With gloves on and in a hurry a word is
  unambiguous and an icon is a guess.
- **The picture is a sheet of paper.** Square corners, a white plate, a hairline edge, no shadow, no
  rounded card floating on a tint. Radii everywhere are 2–4 px, so the silhouette is a ruled
  technical sheet rather than the current default shape of a considered-looking webapp.

---

## 2. Information architecture

### 2.1 Five places, and only five

| Place | What is in it | Where it is |
|---|---|---|
| **Stage** | the picture, what is drawn on it, which part of it | top on phone and iPad portrait, left column on iPad landscape and desktop |
| **Plan** | the list: the colours of a mix plan, or the layers of a layer plan | `Colours` / `Layers` tab on phone; left panel column on iPad portrait; rail on landscape and desktop |
| **Detail** | what is selected: one colour with its recipes, or one spot with its layers | `Recipe` / `Spot` tab on phone; above the plan everywhere else |
| **Setup** | everything that changes how the plan is computed, plus the doors to the second level | `Settings` tab on phone; right panel column on iPad portrait; below the plan in the rail |
| **Source** | the photo itself: where it came from, what is saved, what is printed, which close-ups exist | `Source` tab on phone; a card at the top of the right column / rail at ≥48rem |

`Source` is new in round 2 and exists for two reasons. The six photo actions were a wrap row of
buttons eight pixels from the picture the painter taps all day, two of which throw away a plan
(section 13). And the close-up strip had no home on the phone. Both now live in one named card with
its own groups.

There is no sixth place and no floating window. Every panel has one fixed home at every breakpoint.
`Account` lives in exactly one place at every breakpoint: the `More` block at the end of Setup. The
app bar carries the app name and, at ≥64rem, the tagline — and nothing else.

### 2.2 One plan model: how mix mode and layer mode become one interface

Today mix mode and layer mode are two parallel sets of components (`PaletteList` vs `LayerList`,
`EntryEditor` vs `LayerArea`, plus `LayerStrip` which exists only because the layer list sits too far
down the page). One `plan` block replaces the pair, with two kinds of row.

> A **plan** is an ordered list of **steps to paint**. In mix mode a step is a mixed colour (a mix
> with its washes). In layer mode a step is a layer (a wash with its coats). Both have: a number, a
> swatch, a primary line, a meta line, and — when selected — a bar that splits the step into parts.

| Slot | Mix mode | Layer mode |
|---|---|---|
| Plan title | `Colours` | `Layers` |
| Plan count line | `20 colours in 12 mixes` | `5 layers and 2 accents, 11 steps to paint` |
| Row leading control | none (the tick column is 0 wide) | `Show` checkbox, 48 px cell |
| Row number | mix number, `7` | layer number `1`…`5`, accents `A1`…`A3` |
| Row swatch | base colour of the mix, on white | the wash on white paper |
| Row primary line | `1 x 663 Sepia brown + 2 x 485 Indigo` | `663 Sepia brown · 1:4 with water, like tea` |
| Row meta | `4 washes · 23% of image · changed by hand` | `3 coats · 23% of image · for the darks` |
| Row bar (selected only) | wash bar, one button per wash (`W L M R C`) | coat bar, one button per coat |
| Tap on the row | select this mix; the picture shows only its washes | solo this layer; the picture shows only it |
| Tap on a bar segment | select that wash | open the step that paints that coat |
| Detail card | `Colour 7`: photo colour, your mix, recipes | `This spot`: photo, layered, the layers on it |
| Plan header action | `Paint box` | `Paint box` · `Show all layers` · `Paint step by step` (phone) |

Switching method does not switch the interface. It swaps the contents of the plan rows, the detail
card and four rows in Setup. The layout, the row anatomy, the selection model and all touch targets
are identical. `LayerStrip.vue` disappears because its reason to exist no longer holds at any
breakpoint.

### 2.3 First level and second level, stated honestly

**First level — visible, or behind one labelled tap, with no scrolling past anything:**

the picture · `Fit` / `Full size` · the view switch · `Outlines` · `Numbers` · `Guides` (sketch
view) · `Pick a detail` · the step walk · the plan list · the selected colour or spot with its
recipe · the plan controls (`Colours`/`Layers`, `Variety`/`Accents`, `Simplify areas`, `Max.
paints`/`Max. coats`) · `Areas` · `Saturation` · `Contrast` · their reset · the photo actions · the
door to the paint box.

**Where the honesty is needed.** Two first-level things are one labelled tap away on the phone and
visible above 48rem, because the height budget in section 5 leaves no alternative:

- the view switch, `Fit`/`Full size`, `Outlines`, `Numbers` and `Guides` are behind the `Show`
  button in the phone stage bar, which opens the **Show sheet**;
- Setup is a scroll on the phone, and it gets a sticky four-word group bar (`Method · Plan · Shapes
  · Photo`) so each group is one tap, not a swipe.

**Second level — one tap from the first level, behind a labelled button, never behind hover, a
gesture or a long press:**

| Second level | Opened by | Kind |
|---|---|---|
| Show sheet (phone only) | `Show` in the stage bar | bottom sheet |
| Paint box | `Paint box` in the plan header and in Setup group `Plan` | dialog |
| Collection | `Collection` in the Source card | dialog |
| AI help | `AI help` in Setup group `More` | dialog |
| Account | `Account` in Setup group `More` | dialog |
| Plans and purchase | raised by `pro.require()`, as today | dialog |
| Confirm | raised by a destructive action (section 13) | dialog |
| Privacy settings | `Privacy settings` in Setup group `More` | banner |
| Manual, Privacy, Terms, Imprint | footer links; on phone in Setup group `More` | pages |

Nothing else is below the first level. No setting is behind an accordion that is closed by default
(folds persist, but every group starts open on a device that has never folded it), and no action
exists only in a context menu, a long press or a tooltip.

---

## 3. The user's path

### 3.1 First run, any device

1. The app opens with the sample photo already analysed (`analysis.loadSample(true)` unchanged).
2. The stage shows the numbered areas. `picture__readout` reads `Tap an area to see its recipe.`
3. The plan shows twenty colours. The detail card shows `Nothing selected. Tap an area in the
   picture, or a colour in the list.`
4. One tap on the picture fills the detail card. No panel moves, nothing floats, nothing covers the
   picture.
5. Each settings group shows its hint paragraph once. `Hide hints` in the group head removes it for
   good on this device; `Show hints` brings it back.

### 3.2 Planning, desktop or iPad landscape

Open the Source card, `New photo`; set `Colours` and `Simplify areas` in Setup while watching the
stage; `Paint box`, tick what is on the table, filter by `663` to find a paint, `Update mixes`; walk
the plan list; tap a colour that looks wrong and either `Change colour` or choose another recipe;
`Save`; `Print / PDF`.

### 3.3 Painting, phone at the easel — the loop the current build fails

1. Open the app. The picture is at the top, sticky; it never scrolls away.
2. Tap area `12`. The readout reads `12 · 23% of image · 1 x 663 Sepia brown + 2 x 485 Indigo`, and
   the `Recipe` tab label becomes `Recipe 12`.
3. Tap `Recipe`. The detail card fills the panel region: title, the two colour fields at 80 px, the
   recipe line. Picture and recipe are both on screen — proved in section 5.1, with 246 px of panel
   against 208 px of content on a 390 × 844 iPhone.
4. Tap `Colours` to compare the neighbouring numbers; the picture stays where it is; the head and
   three full rows are visible.
5. Nothing in this loop needs Settings, so Settings is never in the way.

### 3.4 Painting, layer mode, the step walk

`Paint step by step` — in the stage bar at ≥48rem, in the plan header on the phone. The walk
replaces the view bar in the stage at ≥48rem; on the phone it takes over the `Spot` tab, which is
relabelled `Step`, the readout is dropped and `Previous` / `Next` are pinned as 56 px buttons
directly above the tab bar. `Then: let it dry completely.` is inside the first 164 px of the panel
region at every phone height (section 5.1c). The step position survives closing the app
(section 15.3).

---

## 4. The root font size, and the migration of every rem value

### 4.1 The fix

```css
/* scaffold.css */
html { font-size: 62.5%; }   /* 1rem = 10px at the browser default of 16px */
body { font-size: var(--fs-copy); }   /* 1.6rem = 16px */
```

`--font-size: 1.4rem` in `src/css/base/_variables.css` is deleted. It was written as if the root were
10 px — the comment in `src/css/layouts/_print.css:5` says so in as many words ("1.4rem = 14px") —
but nothing ever set the root, so every label rendered at 22.4 px. That is the phone evidence
screenshot. With `62.5%` the intent and the result finally agree, and a reader who has raised their
browser's default font size still gets the increase, which a hard `10px` would throw away.

**Two traps, stated so they are not walked into.**

1. `rem` inside a media query resolves against the *initial* font size (16 px), **not** against the
   root element. So `@media (min-width: 48rem)` is 768 px with or without `62.5%`. Every breakpoint
   in section 5 is therefore unchanged by this fix. Do not "correct" them.
2. `em` inside `@media` behaves the same way. Only lengths in rules are affected.

### 4.2 The print override, reconciled

`src/css/layouts/_print.css` currently opens with `@media print { html { font-size: 10px; } }`. With
the root at `62.5%` that override is a no-op in the common case and actively discards the user's
font-size preference in the rest. It is **deleted**, and replaced by an explicit print type block
that also closes the second print defect the critics found — an A4 sheet is about 794 px wide at
96 dpi, so the `≥48rem` step of the type ramp would otherwise apply and print text at 17 px where it
is 14 px today:

```css
@media print {
  :root {
    --fs-mini: 9px;  --fs-small: 11px; --fs-copy: 14px; --fs-medium: 15px;
    --fs-large: 17px; --fs-hl-small: 19px; --fs-hl-medium: 22px; --fs-hl-large: 28px;
    --gap: 12px;
  }
}
```

Absolute px inside `@media print` is correct: the sheet is a fixed physical object, and `@page
{ margin: 12mm }` stays. The ramp's media queries are all `min-width`, so the print block must come
last in `print.css` to win; it does, because `print.css` is the final `@import` of `site.css`.

### 4.3 Migration of every rem value in `src/css/`

All 39 occurrences, by file. "Today" is what the browser actually renders (value × 16 px); "meant"
is value × 10 px, the author's intent. Nothing is left to the implementer's judgement.

| File | Occurrence | Today | Meant | Becomes |
|---|---|---|---|---|
| `base/_variables.css:15` | `--font-size: 1.4rem` | 22.4 | 14 | deleted; `body { font-size: var(--fs-copy) }` = 1.6rem (16) |
| `layouts/_app.css:3` | `.app__title 2.2rem` | 35.2 | 22 | `--fs-medium` (1.8rem / 18) — the app name is not a headline |
| `layouts/_app.css:5` | `clamp(380px, 38rem, 44vw)` | 608 | 380 | `--rail` (38rem / 380, then 41rem / 44rem by breakpoint) |
| `layouts/_app.css:7` | `.app__hint 1.3rem` | 20.8 | 13 | `--fs-small` (1.4rem / 14), in `picture__readout` |
| `layouts/_app.css:12` | `.app__footer-link 1.2rem` | 19.2 | 12 | `--fs-small` (1.4rem / 14) |
| `layouts/_print.css:5` | comment, `1.4rem = 14px` | — | — | comment deleted; section 4.2 replaces it |
| `components/_panel.css:2` | `.panel__title 1.5rem` | 24 | 15 | `--fs-large` (2rem / 20) for card titles |
| `components/_palette.css:3` | `.palette__count 1.2rem` | 19.2 | 12 | `--fs-small` becomes `plan__count` |
| `components/_palette.css:4` | `.palette__key 1.2rem` | 19.2 | 12 | `--fs-small` becomes `plan__key` |
| `components/_palette.css:14` | `.palette__paints 1.2rem` | 19.2 | 12 | `--fs-copy` (1.6rem / 16) becomes `plan__name`, promoted (it is the recipe) |
| `components/_palette.css:15` | `.palette__meta 1.2rem` | 19.2 | 12 | `--fs-small` becomes `plan__meta` |
| `components/_palette.css:18` | `.palette__part-text 1rem` | 16 | 10 | `--fs-small` (14) on a white plate becomes `plan__part-text` (section 7.2, floor for text on paint) |
| `components/_palette.css:20` | `.palette__wash 1.1rem` | 17.6 | 11 | `--fs-copy` (16) becomes `plan__wash`, 48 px hit area |
| `components/_recipe.css:11` | `.recipe__part-text 1rem` | 16 | 10 | `--fs-small` (14) on a white plate |
| `components/_recipe.css:18` | `.recipe--full .chip 1.2rem` | 19.2 | 12 | `--fs-copy` (16) |
| `components/_recipe.css:21` | `.recipe--full .recipe__part-text 1.1rem` | 17.6 | 11 | `--fs-small` (14) |
| `components/_layers.css:2` | `.layers__name 1.4rem` | 22.4 | 14 | `--fs-copy` (16) becomes `plan__name`; `white-space: nowrap` replaced by a 2-line clamp |
| `components/_layers.css:13` | `.layers__note 1.2rem` | 19.2 | 12 | `--fs-small` becomes `plan__note` |
| `components/_layers.css:29` | `.layers__kind 1.1rem` | 17.6 | 11 | `--fs-small` (14); `border-radius: 999px` becomes `--radius-small` |
| `components/_steps.css:8` | `.steps__lines 1.3rem` | 20.8 | 13 | `--fs-copy` (16) becomes `walk__lines`; this is the instruction being obeyed |
| `components/_steps.css:12` | `.steps__warn 1.3rem` | 20.8 | 13 | `--fs-small` (14) becomes `walk__warn` |
| `components/_closeup.css:9` | `.closeup__number 1.1rem` | 17.6 | 11 | `--fs-mini` (1.2rem / 12) on a white plate; `border-radius: 999px` becomes `--radius-small` |
| `components/_chip.css:1` | `.chip 1rem` | 16 | 10 | `--fs-small` (14) |
| `components/_paintbox.css:26` | `.paintbox__note 1.2rem` | 19.2 | 12 | `--fs-small` (14) |
| `components/_controls.css:3` | `.controls__saved 1.2rem` | 19.2 | 12 | `--fs-small` (14) becomes `stage__state` |
| `components/_field.css:5` | `.field__hint 1.2rem` | 19.2 | 12 | `--fs-small` (14) becomes `settings__hint` / `control__status` |
| `components/_editor.css:6` | `.editor__caption 1.2rem` | 19.2 | 12 | `--fs-small` (14) becomes `detail__caption` |
| `components/_editor.css:11` | `.editor__subtitle 1.3rem` | 20.8 | 13 | `--fs-medium` (1.8rem / 18) becomes `detail__subtitle` |
| `components/_editor.css:16` | `.editor__washes 1.2rem` | 19.2 | 12 | `--fs-copy` (16) becomes `detail__washes` rows |
| `components/_editor.css:19` | `width: min(36rem, …)` floating panel | 576 | 360 | deleted with `floating.js` |
| `components/_ai.css:6` | `.ai__check 1.3rem` | 20.8 | 13 | `--fs-copy` (16) — it is a consent sentence |
| `components/_ai.css:11` | `.ai__mixes 1.3rem` | 20.8 | 13 | `--fs-copy` (16) |
| `components/_ai.css:13` | `.ai__details 1.3rem` | 20.8 | 13 | `--fs-copy` (16) |
| `components/_consent.css:2` | `.consent__text 1.3rem` | 20.8 | 13 | `--fs-copy` (16) |
| `components/_consent.css:3` | `.consent__title 1.5rem` | 24 | 15 | `--fs-medium` (1.8rem / 18) |
| `components/_tip.css:2,4` | `min(30rem, 90vw)`, `1.2rem` | 480 / 19.2 | 300 / 12 | deleted with `RecipeTip.vue` |
| `components/_gate.css:3` | `width: min(46rem, 100%)` | 736 | 460 | `--article-width` (64rem / 640) |
| `components/_gate.css:4` | `.gate__title 2.4rem` | 38.4 | 24 | `--fs-hl-medium` (2.8rem / 28) |
| `components/_gate.css:19` | `.gate__footer 1.2rem` | 19.2 | 12 | `--fs-small` (14) |
| `components/_account.css:2` | `width: min(46rem, …)` | 736 | 460 | `--article-width` (64rem / 640) via `dialog` |
| `components/_account.css:4` | `.account__title 2rem` | 32 | 20 | `--fs-hl-small` (2.2rem / 22) via `dialog__title` |
| `components/_account.css:12` | `.account__link 1.2rem` | 19.2 | 12 | `--fs-small` (14) |
| `components/_pro.css:1` | `width: min(46rem, …)` | 736 | 460 | `--article-width` (64rem / 640) via `dialog` |
| `components/_pro.css:3` | `.pro__title 2rem` | 32 | 20 | `--fs-hl-small` via `dialog__title` |
| `components/_pro.css:11,12` | `1.2rem` ×2 | 19.2 | 12 | `--fs-small` (14) |

Rule for the whole migration: **no `rem` literal survives in a component file.** Type sizes come
from `--fs-*`, spacing from `--gap*`, widths from `--max-width` / `--article-width` / `--rail`, touch
sizes from `--touch` / `--touch-primary`. A `grep -rn "rem" src/css/components/` after the rework
returns nothing but token definitions. Widths are *not* mechanically converted: 46rem rendered 736 px
today and `--article-width` is set to 640 px deliberately, because 640 px is a readable measure and
736 px is not.

---

## 5. Layout per breakpoint, proved against real viewport heights

Breakpoints (the house ramp 1024 / 1280 / 1440 plus 768, because iPad portrait is a primary device):

| Name | Range | Device |
|---|---|---|
| phone | `< 48rem` (768) | iPhone portrait and landscape |
| tablet | `48rem – 63.999rem` (768–1023) | iPad portrait |
| wide | `64rem – 79.999rem` (1024–1279) | iPad landscape, small laptop |
| desktop | `≥ 80rem` (1280) | laptop and desktop; one more type step at `≥ 90rem` (1440) |

**The unit is `svh`, not `vh` or `dvh`.** `100svh` is the viewport with the browser chrome *shown* —
the smallest it gets — so a layout computed from `svh` never overflows when the iOS toolbars come
back. `dvh` is the trap: it grows and shrinks as the page scrolls, so a sticky block sized in `dvh`
changes height under the finger. A `vh` fallback line precedes each `svh` line for the two engines
that lack it.

```css
--picture-max: calc(100vh  - var(--chrome-v));
--picture-max: calc(100svh - var(--chrome-v));
```

**Working heights used in the proofs.** The number that matters is the one the page actually gets,
not the device's pixel height.

| Device | Viewport | In Safari (toolbars shown) | Standalone / native web view |
|---|---|---|---|
| iPhone 14/15 portrait | 390 × 844 | **734** | 844 − 47 top − 34 bottom inset = **763** |
| iPhone 13 mini / X portrait | 375 × 812 | **702** | 812 − 47 − 34 = **731** |
| iPhone SE portrait | 375 × 667 | **553** | 667 − 20 − 0 = **647** |
| iPhone 14 landscape | 844 × 390 | **320** | 390 − 0 − 21 = **369** |
| iPad 10.2 portrait | 768 × 1024 | **954** | 1024 − 20 = **1004** |
| iPad 10.2 landscape | 1024 × 768 | **698** | **768** |

Every budget below is computed against the **Safari** column, which is the tighter case in portrait,
and the surplus in the standalone column goes to the picture through the formula. All safe-area
insets are written into the values (section 5.5), so the native web view cannot push a bar under the
status bar.

### 5.1 Phone (`< 48rem`), portrait

```
+--------------------------------------+  app__bar          4.8rem + safe-area-top, fixed
| Watercolourlove                      |
+--------------------------------------+
| Show: Mixed paint        Full size   |  stage__bar        4.8rem   <- sticky
|                                      |
|            P I C T U R E             |  picture__pane     --picture-max
|                                      |
| 12 · 23% of image · 1 x 663 Sepia... |  picture__readout  4rem, aria-live
+--------------------------------------+  <- end of the sticky region
|                                      |
|   panel region: the active tab       |  scrolls under the sticky stage
|                                      |
+--------------------------------------+
| Colours | Recipe | Settings | Source |  app__tabs  5.6rem + safe-area-bottom, fixed
+--------------------------------------+
```

Three bands above the picture in round 1 became one. `stage__tools`, both `viewbar` rows and the
status slot are gone from the phone: the view switch, `Outlines`, `Numbers`, `Guides` and
`Fit` / `Full size` are in the **Show sheet** behind the `Show` button, whose label names the current
view (`Show: Mixed paint`, ellipsised if the view name is long); `Pick a detail` and the close-up
strip are in the `Source` tab; `Paint step by step` is in the plan header; and `Analysing…` takes top
precedence in the readout, which is `aria-live="polite"` anyway.

#### (a) The height budget, portrait

| Band | Height | 734 | 702 | 553 | 763 (standalone) |
|---|---|---|---|---|---|
| `app__bar` | 4.8rem | 48 | 48 | 48 | 48 |
| gap | `--gap-05x` | 8 | 8 | 8 | 8 |
| `stage__bar` | 4.8rem | 48 | 48 | 48 | 48 |
| gap | `--gap-05x` | 8 | 8 | 8 | 8 |
| `picture__pane` | `--picture-max` | **264** | **238** | **153** | **299** |
| gap | `--gap-05x` | 8 | 8 | 8 | 8 |
| `picture__readout` | 4rem | 40 | 40 | 40 | 40 |
| gap | `--gap-05x` | 8 | 8 | 8 | 8 |
| **panel region, visible** | the rest | **246** | **240** | **176** | **240** |
| `app__tabs` | 5.6rem | 56 | 56 | 56 | 56 |
| **sum** | | **734** | **702** | **553** | **763** |

Fixed chrome is `--chrome-v: 22.4rem` (224 px). The formula, with a guaranteed floor for the panel
region, is:

```css
--panel-min: 24rem;                                  /* 240 */
@media (max-height: 44rem) { :root { --panel-min: 17.6rem; } }   /* 176 on a 667-tall phone */
--chrome-v: calc(22.4rem + env(safe-area-inset-top) + env(safe-area-inset-bottom));
--picture-max: max(10rem, min(36svh, calc(100svh - var(--chrome-v) - var(--panel-min))));
```

The picture is never more than 36 % of the viewport and never less than 100 px; the panel region is
never less than 240 px (176 px on a 667-tall phone). Both of the claims round 1 got wrong are now
arithmetic, not assertion: the panel region is 246 px on a 390 × 844 iPhone, not 300 px and not 95 px.

#### (b) What has to fit in the panel region, and does

| Tab | Content that must be visible with the picture | Height | Fits in 246 / 240 / 176 |
|---|---|---|---|
| `Recipe` | `detail__head` 48 + gap 8 + caption 20 + two 80 px colour fields + gap 8 + recipe line 44 | **208** | 246 yes · 240 yes · 176 uses the short-screen variant below |
| `Recipe`, `max-height: 44rem` | head 40 + gap 8 + two 60 px fields with the caption printed inside + gap 8 + recipe line 44 | **160** | 176 yes |
| `Spot` (layer) | head 48 + gap 8 + caption 20 + two 80 px fields + gap 8 + `Match: good · distance 4.2` 24 | **188** | 246 yes · 240 yes; 160 on the short variant |
| `Colours` / `Layers` | `plan__head` 48 + three rows of 56 with 8 px between them | **240** | 246 yes · 240 yes · 176 shows the head and two rows |
| `Settings` | sticky `settings__nav` 48 + the first control row 88 | **136** | yes at every height; Setup is a scroll and says so |
| `Source` | `source__head` 48 + `New photo` 56 | **104** | yes at every height |

#### (c) Phone, layer mode, the step walk — the layout round 1 did not have

In walk mode the `Spot` tab is relabelled `Step` and becomes the walk. Two bands change: the readout
is not rendered (the step lines say more than it could), and `walk__nav` is pinned at the bottom of
the panel region, directly above the tab bar, where a thumb reaches it.

```css
.app--walk { --chrome-v: calc(17.6rem + env(safe-area-inset-top) + env(safe-area-inset-bottom)); }
.app--walk { --picture-max: max(10rem, min(26svh, calc(100svh - var(--chrome-v) - 5.6rem - 16.4rem))); }
```

| Band | Height | 734 | 702 | 553 |
|---|---|---|---|---|
| `app__bar` + gap | 5.6rem | 56 | 56 | 56 |
| `stage__bar` + gap | 5.6rem | 56 | 56 | 56 |
| `picture__pane` | `min(26svh, …)` | **191** | **183** | **144** |
| gap | | 8 | 8 | 8 |
| panel region, visible | the rest | **311** | **287** | **177** |
| `walk__nav` (`Previous` / `Next`) | 5.6rem, sticky bottom | 56 | 56 | 56 |
| `app__tabs` | 5.6rem | 56 | 56 | 56 |
| **sum** | | **734** | **702** | **553** |

What must be inside the first 164 px of that panel region, and is: `walk__title` 44
(`Step 3 of 11: layer 2 of 5, 663 Sepia brown, coat 1 of 2`, two lines) + `walk__target` 48 (the wash
field with its caption) + `walk__lines` 72 (`Mix` / `Paint` / `Then`, 24 each). `Then: let it dry
completely.` is therefore visible without scrolling on a 667-tall iPhone SE. `walk__view` (the
segmented `Where to paint | This wash | So far`) and `walk__warn` sit below and scroll.

#### (d) Phone landscape (`< 48rem` and `max-height: 30rem`)

Round 1 specified this to overflow by 100 px. The canvas is now sized from what is left in its own
column, not from the viewport.

```css
@media (max-width: 47.999rem) and (max-height: 30rem) {
  .app__bar { display: none; }               /* the name is not a control; Account is in Setup */
  .app__tabs { min-height: 4.8rem; }
  .app__main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
               gap: var(--gap-05x); }
  :root { --picture-max: calc(100svh - 4.8rem - 4.8rem - var(--gap-05x) * 3
                              - env(safe-area-inset-bottom)); }
}
```

| Band | 320 (Safari) | 369 (standalone, inset 21) |
|---|---|---|
| padding top | 8 | 8 |
| stage column: `stage__bar` | 48 | 48 |
| gap | 8 | 8 |
| stage column: `picture__pane` | **200** | **228** |
| panel column: `picture__readout` 40 + gap 8 + content | 40 + 8 + **208** | 40 + 8 + **236** |
| padding bottom | 8 | 8 |
| `app__tabs` (+ bottom inset) | 48 | 48 + 21 |
| **sum (tallest column)** | **320** | **369** |

The panel column is its own scroll container at 256 px (284 px standalone) — above the brief's 240 px
floor for a nested scroll region, with `overscroll-behavior: contain`. The readout moves into the top
of the panel column in landscape, where it is at eye level beside the picture.

#### (e) Phone, full-size picture

`Full size` (in the Show sheet) sets `app--picture-full`: the stage takes the whole space between the
app bar and the tab bar (`--picture-max: calc(100svh - 11.2rem - env(...))`), the panel region is
`display: none`, the pane gets `overflow: auto; touch-action: pan-x pan-y pinch-zoom`, and the stage
bar's button reads `Fit`. This is the only state in which a panel is hidden, and `Fit` is always one
labelled tap away.

#### (f) What the phone fixes, point by point against the evidence screenshot

| Defect in `docs/ui/evidence/phone-settings-2026-10-12.png` | Fix |
|---|---|
| three-column settings grid that does not collapse | there is no settings grid below 64rem; one control per row, and no three-column grid at any width |
| `Saturation200%Contrast100%` | every control row is `label / value` then `minus / slider / plus` on its own row; the value has its own cell at `min-width: 4ch`, right-aligned, tabular |
| `Max. paints` wrapping away from its control | the segmented control is on the row below its label, full width, three 48 px options |
| seven action buttons in two ragged rows | the photo actions are in the `Source` tab as a single column of 56 px rows, in two named groups |
| the picture scrolled off the top | the stage is sticky; the picture is the only element always visible |
| text far too large for the viewport | `html { font-size: 62.5% }` and a phone base of 16 px (section 4) |
| nothing reachable with one thumb | four tabs at the bottom, 56 px, and the walk's `Previous` / `Next` pinned above them |

### 5.2 iPad portrait (`48rem – 63.999rem`)

```
+-------------------------------------------------------------+
| Watercolourlove                                             |  app__bar 5.6rem, in flow
+-------------------------------------------------------------+
| Meadow (sample)                              In collection  |  stage__head 4.8rem, in flow
| Mixed paint | Photo colour | Photo | Sketch                 |  viewbar  4.8rem  <- sticky
| Full size · Pick a detail · Outlines · Numbers              |  stage__bar 4.8rem <- sticky
|                   P I C T U R E                             |  picture__pane      <- sticky
| 12 · 23% of image · 1 x 663 Sepia brown + 2 x 485 Indigo    |  readout 4rem       <- sticky
+-------------------------------------------------------------+
| Detail 1   Detail 2   Detail 3                              |  closeup strip, in flow
+------------------------------+------------------------------+
| detail card                  | source card                  |
| plan card                    | settings card                |
+------------------------------+------------------------------+
| footer links                                                 |
+-------------------------------------------------------------+
```

At `≥48rem` the app bar is **in normal flow**, not fixed: it scrolls away, which buys 56 px of
picture, and it holds nothing a painter needs mid-stroke. Only four bands are sticky:
`viewbar`, `stage__bar`, `picture__pane`, `picture__readout`. `stage__head` and the close-up strip
are deliberately outside the sticky block — this is the fix for round 1's iPad arithmetic, which
made the whole stage card sticky and so made it taller than the viewport.

```css
@media (min-width: 48rem) {
  .app__bar { position: static; }
  .app__stage-sticky { position: sticky; top: var(--gap-05x); z-index: 2;
                       background: var(--c-background); }
  :root { --stage-chrome: 16rem; }       /* 48 viewbar + 48 bar + 40 readout + 3 x 8 gaps */
  :root { --picture-max: min(42svh, calc(60svh - var(--stage-chrome))); }
}
.app__panels { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
               gap: var(--gap); align-items: start; }
```

| Band | 954 (Safari) | 1004 (standalone, inset 20) |
|---|---|---|
| `app__bar` (in flow) | 56 | 56 |
| gap | 16 | 16 |
| `stage__head` (in flow) | 48 | 48 |
| gap | 8 | 8 |
| **sticky block** `viewbar` 48 + `stage__bar` 48 + picture + readout 40 + 3 gaps 24 | **560** | **581** |
|   of which `picture__pane` | **400** | **421** |
| **visible below the sticky block, at rest** | **266** | **295** |
| **sum** | **954** | **1004** |

The sticky block is 560 px = **58.7 %** of 954 (57.9 % of 1004), under the 60 % ceiling, so it is
always shorter than the viewport and always sticks. Scrolled to the bottom of the page the picture
still occupies 560 px and 394 px are free for the panels. The close-up strip (88 px) and the two
panel columns scroll normally.

Width check at 768 px: padding 2 × 16, so 736 px of content. `stage__bar` holds `Full size` 100 +
`Pick a detail` 130 + `Outlines` 100 + `Numbers` 100 = 430 plus 3 × 8 gaps = 454 ≤ 736. In layer mode
`Paint step by step` (170) and in sketch view `Guides` (90) are added: 454 + 170 + 90 + 16 = 730 ≤ 736.
The row never wraps (section 9.4) — it is a single non-wrapping scroll row, so its height is 48 px
regardless of content and the arithmetic above cannot be broken by a label.

### 5.3 iPad landscape (`64rem – 79.999rem`) and desktop (`≥ 80rem`)

```
+--------------------------------------------------------------------------+
| Watercolourlove   Find the main colours in a photo and mix them ...      |
+---------------------------------------------+----------------------------+
| Meadow (sample)              In collection  | source card                |
| Mixed paint | Photo colour | Photo | Sketch |                            |
| Full size · Pick a detail · Outlines · Nu.. | detail card                |
|                 P I C T U R E               |                            |
| 12 · 23% · 1 x 663 Sepia brown + 2 x 485 .. | plan card                  |
+---------------------------------------------+                            |
| Detail 1   Detail 2                         | settings card              |
+---------------------------------------------+----------------------------+
| footer links                                                             |
+--------------------------------------------------------------------------+
```

```css
@media (min-width: 64rem) {
  .app__main { display: grid; grid-template-columns: minmax(0, 1fr) var(--rail);
               gap: var(--gap); align-items: start;
               max-width: var(--max-width); margin-inline: auto; padding: var(--gap); }
  :root { --rail: 38rem; --picture-max: min(56svh, calc(72svh - var(--stage-chrome))); }
}
@media (min-width: 80rem) { :root { --rail: 41rem; } }
@media (min-width: 90rem) { :root { --rail: 44rem; } }
```

| Band | 698 (Safari, 1024 × 768) | 768 (standalone) | 820 (1440 × 900 desktop) |
|---|---|---|---|
| `app__bar` + tagline | 56 | 56 | 56 |
| gap | 16 | 16 | 16 |
| `stage__head` | 48 | 48 | 48 |
| gap | 8 | 8 | 8 |
| **sticky block** (chrome 160 + picture) | **503** | **553** | **590** |
|   of which `picture__pane` | **343** | **393** | **430** |
| **free below, at rest** | **67** | **87** | **102** |
| **sum** | **698** | **768** | **820** |

The sticky block is 72 % of the viewport at the cap, so it always sticks. At rest the close-up strip
(8 + 88 = 96 px) starts 29 px below the fold on a 1024 × 768 iPad in Safari and is fully visible in
the native web view; it is in page flow and scrolls into view, and it only exists once a close-up has
been made. The rail is in page flow and scrolls with the page, so there is no nested scroll container
anywhere outside dialogs and phone landscape, and the brief's 240 px rule cannot be broken.

Width at 1024: 1024 − 32 padding − 16 gap − 380 rail = **596 px** of stage column. A 3:2 photo at
596 px wide wants 397 px of height and gets 343, so the picture is height-limited and renders
514 × 343 — centred, with `Full size` one tap away. At 1440: 1440 − 32 − 16 − 410 = **982 px**.

### 5.4 Where every card sits, per breakpoint

| Card | phone | tablet | wide / desktop |
|---|---|---|---|
| `stage` | sticky top (bar, picture, readout) | sticky inside the left-to-full-width stage | sticky, left column |
| `source` | `Source` tab | right column, first | rail, first |
| `detail` | `Recipe` / `Spot` / `Step` tab | left column, first | rail, second |
| `plan` | `Colours` / `Layers` tab | left column, second | rail, third |
| `settings` | `Settings` tab | right column, second | rail, fourth |
| `closeup` strip | inside `source` | under the sticky block | under the sticky block |
| `footer` | end of the `Settings` tab, in group `More` | page foot | page foot |

### 5.5 Safe areas, written into the values

Round 1 promised insets and then wrote every value without them. The concrete values:

```css
.app__bar   { padding-top: env(safe-area-inset-top);
              min-height: calc(var(--bar-height) + env(safe-area-inset-top)); }
.app__stage { top: calc(var(--bar-height) + env(safe-area-inset-top)); }  /* phone */
.app__main  { padding-top: calc(var(--bar-height) + env(safe-area-inset-top) + var(--gap-05x));
              padding-bottom: calc(var(--tabs-height) + env(safe-area-inset-bottom) + var(--gap));
              padding-inline: max(var(--gap-05x), env(safe-area-inset-left))
                              max(var(--gap-05x), env(safe-area-inset-right)); }
.app__tabs  { padding-bottom: env(safe-area-inset-bottom);
              min-height: calc(var(--tabs-height) + env(safe-area-inset-bottom)); }
.consent    { bottom: calc(var(--tabs-height) + env(safe-area-inset-bottom)); }  /* phone */
.dialog__foot { padding-bottom: calc(var(--gap) + env(safe-area-inset-bottom)); }
```

`--chrome-v` already carries both insets (section 5.1a), so the picture gives up exactly the height
the insets take and never more.

---

## 6. Touch model

Acceptance criteria, not guidance. Every number below is a layout box in the browser's box model,
measurable in the inspector.

| Element | Hit area | Notes |
|---|---|---|
| Button, default | `min-height: var(--touch)` 48, `min-width: 4.8rem`, padding-inline `--gap-05x` ×2 | |
| Button, primary of a screen or dialog | `min-height: var(--touch-primary)` 56 | `New photo`, `Update mixes`, `Previous`, `Next`, `Continue`, the confirm dialog's primary |
| Segmented option | `min-height: 4.8rem`, `min-width: 6rem` | |
| Checkbox row (`switch`) | whole row 48, box 2.4rem (24) | the word is part of the target |
| Slider band | `height: 4.8rem`, track 1rem (10), thumb 3rem (30) | |
| Stepper (`minus` / `plus`) | `4.8rem` square | |
| Tab | `min-height: 5.6rem` | |
| Plan row | `min-height: 5.6rem` phone, `6.4rem` at ≥48rem; the whole row | |
| Plan swatch | `4.8rem` wide × the full row height (so ≥ 48 × 56) | section 9.6 |
| Wash / coat segment | `min-height: 4.8rem` hit area, 4rem painted band (padding on the button, not the bar) | round 1's 40 px is fixed |
| Paint chip | `min-height: 6.4rem`, `min-width: 14rem` | the whole chip is its checkbox's label |
| Close-up thumbnail | `height: 7.2rem` | |
| Close-up `Remove` | `min-height: 4.8rem`, a word | replaces today's 22 px cross |
| Fold button (`Hide` / `Show`) | `min-height: 4.8rem`, a word | replaces today's 28 px chevron |
| `Close` in a dialog head | `min-height: 4.8rem`, the word `Close` | |
| Close-up frame handle | `4.8rem` square, placed **outside** the frame edge | section 6.2 |
| Gap between neighbouring targets | `≥ var(--gap-05x)` 8 | enforced by the `gap` of every flex and grid container that holds controls |
| Gap between a destructive group and a safe one | `≥ var(--gap-15x)` 24 | section 13 |

### 6.1 Gestures and their fallbacks

| Today | Problem | This design |
|---|---|---|
| hover tooltip on the canvas (`RecipeTip.vue`) | invisible on touch | `picture__readout`, always rendered, filled by hover on a fine pointer **and by selection**, with the same string in both cases (section 9.3) |
| `title="…"` on 33 controls | invisible on touch | each one has a named visible home; section 11 is the full table |
| double-click on a slider resets it | unreachable on touch | the button `Reset saturation and contrast` in Setup group `Photo`; `@dblclick` is deleted |
| drag the floating recipe panel | precise drag, covers the picture | the panel does not float. `floating.js` is deleted, `useFloating` is removed from the detail card |
| drag a frame for a close-up | precise drag | the drag stays, with `touch-action: none` while framing. Non-drag fallback in 6.2 |
| arrow keys walk the steps | keyboard only | `Previous` / `Next`, 56 px, always visible; the key handler stays as an extra |
| long-press / right-click | — | nothing is reachable only this way; there is no context menu in the design |

### 6.2 The close-up frame, sized so it works on a phone

Round 1's "40 % of the shorter side" gives an 80 px frame on a phone canvas, with four 48 px handles
that overlap each other. Fixed:

- Minimum frame edge: **14.4rem (144 px)**, three times the handle. `That frame is too small. Make it
  at least a third of the picture.` is shown when a drag ends below it.
- Handles are placed **outside** the frame: each is a 48 px square whose inner corner touches the
  frame corner, so the frame's own content is never covered.
- Default placement on a tap: a frame of **60 %** of the shorter canvas side, centred on the tap and
  clamped to the pane. On the smallest phone canvas (153 px tall, section 5.1a) that is 92 px, below
  the 144 px minimum — so **on a canvas whose shorter side is under 240 px the frame is not resizable
  at all**: it is a fixed 60 % frame, moved by dragging anywhere inside it, with `Use this detail` and
  `Cancel` in `picture__banner`. The handles are not rendered, and `picture__readout` says
  `Drag the frame over the part you want.` instead of mentioning a size.
- Above 240 px of shorter side: the frame is drawn by a drag, or placed by a tap, and adjusted by the
  four handles.

### 6.3 Feedback, focus and busy

- `:active` on every control: no transform, no scale; the background moves one step **toward the
  surface** (not "darker" — in dark mode `--c-corporate-hover` is lighter than `--c-corporate`, which
  is the correct direction there), applied with no transition.
- `:focus-visible`: a two-tone ring that reads on a photo, on paint and on paper:
  `outline: 0.3rem solid var(--c-focus); outline-offset: 0.2rem;
   box-shadow: 0 0 0 0.2rem var(--c-focus-backing);`
  Ratios in section 7.2.
- Busy: `picture__pane` drops to `opacity: 0.55`, `picture__readout` reads `Analysing…` or
  `Planning layers…` with top precedence, and the controls that re-run the analysis stay enabled and
  queue, as today.
- Tap feedback is immediate even though analysis is not: the control's value and the readout update
  on the tap; `analyse()` runs after the debounce in section 15.2.
- `@media (prefers-reduced-motion: reduce)` sets every transition to `0ms`.
- Transitions allowed anywhere: `background-color 120ms linear`, `color 120ms linear`,
  `opacity 200ms linear`. Nothing moves, scales, slides or fades in.

---

## 7. Tokens

House names, plain CSS custom properties in `properties.css`, all on `:root`, dark mode redefined
under `@media (prefers-color-scheme: dark)`. No Sass.

### 7.1 The achromatic rule, and the tokens it needs

`--c-corporate` is the primary colour of this interface, and in this interface the primary colour is
**graphite**. A blue "primary" placed on the selected plan row, the active segment and the active tab
sits a hue directly around the swatches the painter is matching, and it is the single thing that made
round 1 read as a generic tool-shaped webapp. Selection is a graphite field, a 2 px edge on all four
sides, a bolder number, and the word `selected` in the meta line.

Tokens beyond the house list, named in the same system: `--c-surface`, `--c-surface-sunken`,
`--c-corporate-soft`, `--c-corporate-ink`, `--c-danger-ink`, `--c-border-strong`, `--c-plate`,
`--c-plate-ink`, `--c-focus`, `--c-focus-backing`, `--c-overlay`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--c-background` | `#efece6` | `#171512` | the page |
| `--c-surface` | `#ffffff` | `#211e1a` | cards, dialogs, bars |
| `--c-surface-sunken` | `#f4f1ec` | `#2b2722` | slider tracks, inset rows, hovered rows |
| `--c-copy` | `#221f1c` | `#ece6dd` | body text, the selection edge, the active rule |
| `--c-copy-light` | `#5e564e` | `#ada49a` | meta lines, hints, captions |
| `--c-head` | `#141210` | `#fbf7f1` | headings, the selected plan number |
| `--c-border` | `#cdc5b8` | `#403931` | **non-interactive** hairlines inside a card only |
| `--c-border-strong` | `#7e766c` | `#8a8278` | every control edge, every card edge, the slider track outline |
| `--c-corporate` | `#262220` | `#e7e1d8` | primary button fill, slider fill, checkbox `accent-color` |
| `--c-corporate-hover` | `#0e0c0b` | `#fffaf2` | primary hover and active |
| `--c-corporate-ink` | `#ffffff` | `#1a1714` | the ink on `--c-corporate` and `--c-corporate-hover` |
| `--c-corporate-soft` | `#e4dfd6` | `#353028` | the selected field: plan row, active segment, active tab, chosen recipe |
| `--c-accent` | `var(--c-corporate)` | `var(--c-corporate)` | alias; see 7.4 |
| `--c-success` | `var(--c-copy)` | `var(--c-copy)` | alias; see 7.4 |
| `--c-danger` | `#8c2f22` | `#e4867a` | the one chromatic signal; see 7.3 |
| `--c-danger-ink` | `#ffffff` | `#2a0f0b` | the ink on `--c-danger` |
| `--c-white` | `#ffffff` | `#ffffff` | kept for the house list; equal to `--c-plate` |
| `--c-plate` | `#ffffff` | `#ffffff` | paper: behind every swatch and under every label that sits on paint |
| `--c-plate-ink` | `#221f1c` | `#221f1c` | the ink on `--c-plate`, dark in **both** themes |
| `--c-focus` | `#221f1c` | `#ece6dd` | the focus ring |
| `--c-focus-backing` | `#ffffff` | `#171512` | the 2 px inner band of the focus ring |
| `--c-overlay` | `rgba(20, 18, 16, 0.55)` | `rgba(0, 0, 0, 0.66)` | dialog and sheet backdrop |

### 7.2 Measured contrast, every pair, both themes

Computed by WCAG 2.1 relative luminance. **Text needs ≥ 4.5:1, a control edge or a non-text
indicator needs ≥ 3:1.** Round 1's sentence "Everything clears 4.5:1" was false and is deleted; this
table replaces it, and it includes the ink-on-fill pairs round 1 never checked.

| Pair | Light | Dark | Needs | Verdict |
|---|---|---|---|---|
| `--c-copy` on `--c-surface` | **16.40** | **13.38** | 4.5 | pass |
| `--c-copy` on `--c-background` | **13.91** | **14.69** | 4.5 | pass |
| `--c-copy` on `--c-surface-sunken` | **14.55** | **11.96** | 4.5 | pass |
| `--c-copy` on `--c-corporate-soft` (selected row) | **12.36** | **10.55** | 4.5 | pass |
| `--c-copy-light` on `--c-surface` | **7.20** | **6.76** | 4.5 | pass |
| `--c-copy-light` on `--c-background` | **6.11** | **7.42** | 4.5 | pass |
| `--c-copy-light` on `--c-surface-sunken` | **6.39** | **6.04** | 4.5 | pass |
| `--c-copy-light` on `--c-corporate-soft` | **5.42** | **5.33** | 4.5 | pass |
| `--c-head` on `--c-surface` | **18.69** | **15.55** | 4.5 | pass |
| `--c-head` on `--c-corporate-soft` | **14.08** | **12.26** | 4.5 | pass |
| `--c-corporate-ink` on `--c-corporate` (primary button) | **15.76** | **13.73** | 4.5 | pass |
| `--c-corporate-ink` on `--c-corporate-hover` | **19.52** | **17.18** | 4.5 | pass |
| `--c-danger-ink` on `--c-danger` (destructive button) | **8.25** | **6.82** | 4.5 | pass |
| `--c-danger` on `--c-surface` (error text) | **8.25** | **6.31** | 4.5 | pass |
| `--c-danger` on `--c-background` | **7.00** | **6.93** | 4.5 | pass |
| `--c-plate-ink` on `--c-plate` (labels on paint) | **16.40** | **16.40** | 4.5 | pass |
| `--c-focus` on `--c-focus-backing` | **16.40** | **14.69** | 3 | pass |
| `--c-focus` on `--c-surface` | **16.40** | **13.38** | 3 | pass |
| `--c-border-strong` on `--c-surface` | **4.47** | **4.38** | 3 | pass |
| `--c-border-strong` on `--c-background` | **3.79** | **4.81** | 3 | pass |
| `--c-border-strong` on `--c-surface-sunken` | **3.97** | **3.92** | 3 | pass |
| `--c-border-strong` on `--c-corporate-soft` | **3.37** | **3.46** | 3 | pass |
| `--c-corporate` (slider fill, 2 px edge) on `--c-surface-sunken` | **13.99** | **11.41** | 3 | pass |
| `--c-corporate` on `--c-corporate-soft` | **11.88** | **10.07** | 3 | pass |
| `--c-plate` on `--c-surface` (swatch plate vs card) | 1.00 | **16.60** | 3 | see below |
| `--c-corporate-soft` on `--c-surface` (selected field vs card) | 1.33 | 1.27 | — | see below |
| `--c-border` on `--c-surface` | 1.71 | 1.46 | — | see below |

Three pairs are under 3:1 **by design, and none of them carries information alone.**

- `--c-plate` on `--c-surface` in light mode is 1.00 because the plate *is* white in light mode. It
  is bounded by a `--c-border-strong` hairline (4.47:1), which is the edge that reads.
- `--c-corporate-soft` on `--c-surface` is a field, not an indicator. The indicator is the 2 px
  `--c-copy` edge drawn on all four sides of the selected element (12.36:1 / 10.55:1 against the
  field, 16.40:1 / 13.38:1 against the card) plus the bolder number and the word `selected`. If the
  field were removed entirely, selection would still be unambiguous. This is what satisfies "state is
  never carried by colour alone".
- `--c-border` is used **only** for non-interactive hairlines inside a card: the rule between plan
  rows, the rule between the two colour fields in the detail card, the rule under a dialog head, the
  column rule after `plan__number`. It never outlines a control, never outlines a card, and never
  separates two things that a 3:1 rule would be about. Every control edge and every card edge uses
  `--c-border-strong`.

**Text that sits on paint.** `contrastText()` in `src/lib/color.js` is a binary black/white switch at
OKLab L > 0.68 and guarantees nothing near 4.5:1 for a mid-lightness paint. `src/lib/` must not
change, so the fix is presentational and absolute: **no text is ever drawn directly on a paint
colour.** Every label over a swatch, a wash segment, a recipe bar part or a paint chip sits on a
`--c-plate` plate with `--c-plate-ink` (16.40:1 in both themes), `--radius-small`, padding
`--gap-025x` `0.6rem`, and a minimum size of `--fs-small` (14 px) — `--fs-mini` (12 px) is allowed
only for the close-up thumbnail's number, which is also on a plate. `chipStyle()` keeps returning
`--chip-ink`; the CSS stops reading it, so the function is untouched and its output is simply unused.
The side effect is a better object: a paint chip becomes a painted card with a written label on it,
which is what a paint chart looks like.

### 7.3 The one chromatic signal, argued

`--c-danger` is the only hue in the token set. It is unavoidable, and here is the argument.

A destructive confirmation presents two buttons of the same size, 24 px apart, to someone reaching
fast with a gloved finger. Position and weight distinguish them for a reader; they do not
distinguish them for someone who is not reading, which is exactly the person about to lose twenty
minutes of tuning. Red is the one signal that is understood pre-attentively and that no painter will
mistake for a judgement about a mix.

The interference risk is removed by confining where it may appear. `--c-danger` is permitted on
exactly three things:

1. the primary button of the **confirm dialog** (`button--danger`, with `--c-danger-ink`),
2. `app__notice` and the error lines fed by `analysis.error`, `collection.error`, `account.error`,
   `analysis.aiError`,
3. `Delete account` in the account dialog's own closing block.

It is forbidden everywhere else, and in particular: never in the stage, never in the plan card, never
in the detail card, never in the paint box's chip grid, never on `walk__warn` (which is a note about
shape count, set in `--c-copy` at `--fs-small`), and never within a finger's width of a swatch. A
dialog is a different surface from the picture, so the hue is never beside the paint.

### 7.4 The two house tokens that are aliases here, and why

The brief fixes the house token list, and two of its names have no job left once selection is
achromatic. They are declared as aliases rather than quietly dropped, so a future file that uses them
inherits the rule instead of inventing a colour.

- `--c-accent: var(--c-corporate)`. There is no second signal colour. An accent hue beside a swatch
  is the interference this round removed.
- `--c-success: var(--c-copy)`. `In collection` and every other saved state is carried by the word at
  weight 600, not by a green. `--good` and `--fair` in the current `_variables.css` are declared and
  never used anywhere in `src/css/`; they are deleted. `--rough` is used only for error text and
  `.account__delete`, and maps to `--c-danger`.

### 7.5 Type scale

`html { font-size: 62.5% }`, so `1rem = 10px`. The ramp is declared inside `:root` with media
queries, as the house standard requires. Phone base is 16 px and the scale steps **up**, never down.

| Token | phone | `≥48rem` | `≥64rem` | `≥90rem` | Role |
|---|---|---|---|---|---|
| `--fs-mini` | `1.2rem` 12 | `1.2rem` 12 | `1.3rem` 13 | `1.3rem` 13 | the close-up thumbnail number, on a plate |
| `--fs-small` | `1.4rem` 14 | `1.5rem` 15 | `1.5rem` 15 | `1.6rem` 16 | meta, hints, captions, tab labels, labels on paint |
| `--fs-copy` | `1.6rem` 16 | `1.7rem` 17 | `1.7rem` 17 | `1.8rem` 18 | body, control labels, buttons, the recipe line |
| `--fs-medium` | `1.8rem` 18 | `1.9rem` 19 | `2rem` 20 | `2rem` 20 | control values, the app name, `detail__subtitle` |
| `--fs-large` | `2rem` 20 | `2.1rem` 21 | `2.2rem` 22 | `2.4rem` 24 | card titles |
| `--fs-hl-small` | `2.2rem` 22 | `2.4rem` 24 | `2.6rem` 26 | `2.8rem` 28 | dialog titles, **the plan number** |
| `--fs-hl-medium` | `2.8rem` 28 | `3rem` 30 | `3.2rem` 32 | `3.6rem` 36 | the account gate title |
| `--fs-hl-large` | `3.6rem` 36 | `4rem` 40 | `4.4rem` 44 | `4.8rem` 48 | reserved; unused in the app |

### 7.6 Spacing, radius, shadow, sizes

| Token | Value | Note |
|---|---|---|
| `--gap` | `1.6rem` 16 | base |
| `--gap-025x` | `calc(var(--gap) * 0.25)` 4 | inside a chip, inside a plate |
| `--gap-05x` | `calc(var(--gap) * 0.5)` 8 | the minimum between neighbouring targets |
| `--gap-15x` | `calc(var(--gap) * 1.5)` 24 | between settings groups; between a destructive group and a safe one |
| `--gap-2x` | `calc(var(--gap) * 2)` 32 | |
| `--gap-3x` | `calc(var(--gap) * 3)` 48 | |
| `--m-vert` | `2.4rem` 24 | between cards |
| `--m-vert-slim` | `1.2rem` 12 | between rows inside a card |
| `--m-vert-2x` | `4.8rem` 48 | above the footer |
| `--max-width` | `144rem` 1440 | the app's outer width |
| `--article-width` | `64rem` 640 | dialog text columns, the account gate |
| `--rail` | `38rem` / `41rem` / `44rem` | 380 / 410 / 440 by breakpoint |
| `--radius` | `0.4rem` 4 | cards, dialogs |
| `--radius-medium` | `0.3rem` 3 | buttons, inputs, segmented |
| `--radius-small` | `0.2rem` 2 | chips, bars, plates, swatches |
| `--shadow` | `0 1px 2px rgba(26, 22, 18, 0.10), 0 10px 28px rgba(26, 22, 18, 0.12)` | dialogs, sheets and the consent banner **only** |
| `--shadow-flat` | `0 1px 0 0 var(--c-border-strong)` | sticky bars; a 1 px rule, not a drop shadow |
| `--touch` | `4.8rem` 48 | |
| `--touch-primary` | `5.6rem` 56 | |
| `--bar-height` | `4.8rem` 48 | phone app bar; 5.6rem at ≥48rem |
| `--tabs-height` | `5.6rem` 56 | |
| `--stage-bar` | `4.8rem` 48 | |
| `--readout-height` | `4rem` 40 | |
| `--stage-chrome` | `16rem` 160 | ≥48rem: viewbar + stage bar + readout + 3 gaps |
| `--chrome-v` | `22.4rem` 224 + insets | phone portrait; `17.6rem` in walk mode |
| `--panel-min` | `24rem` 240, `17.6rem` under `max-height: 44rem` | phone |
| `--picture-max` | computed per breakpoint, section 5 | |

Dark mode shadow: `--shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 10px 28px rgba(0, 0, 0, 0.5)`.

No drop shadow on a card, panel, row, chip, swatch or button. The radii are deliberately near-square:
the current default shape of a considered-looking webapp is a 12 px rounded white card, and this app
is a ruled sheet.

---

## 8. Typography

**IBM Plex Sans**, self-hosted as woff2 in `public/fonts/`, variable with the `wght 400–600` axis
range subset, Latin + Latin-ext. Weights used: 400 and 600, nothing else.

```css
--ff-copy: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--ff-head: var(--ff-copy);
--ff-fixed: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;   /* hex values only */
```

Why, on legibility grounds:

- The screen is full of three-digit paint numbers (`663`, `485`, `208`), area numbers, percentages
  and ratios, read at arm's length, often at an angle, sometimes through a smear. The letterforms
  that decide whether that works are `1 / l / I` and `0 / O`. In IBM Plex Sans the capital `I`
  carries crossbars, the digit `1` has both a flag and a foot, and the lowercase `l` is a plain stem:
  three unmistakably different shapes. That is the single most important property here.
- Rejected: **Inter**. Its capital `I` is a bare stem identical to the lowercase `l`, so `485 Indigo`
  and a paint whose name contains an `l` read alike at distance unless the optional alternate set is
  enabled by a feature setting, which is one more thing to fail. It is also the default of exactly
  the kind of app the owner does not want to look like.
- Rejected: **Source Sans 3**. Humanist and pleasant, but its stems are lighter at the same optical
  size, which is the wrong direction under a studio lamp and in sunlight on a glossy iPad, and its
  capital `I` is also a bare stem.
- `font-variant-numeric: tabular-nums` is set on every element that holds a number in a column or a
  changing value: `plan__number`, `control__value`, percentages, ratios, the token count, the step
  count. It is **not** set on running text.

| Role | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| App name | `--fs-medium` | 600 | 1.2 | `-0.01em` |
| Tagline (≥64rem) | `--fs-copy` | 400 | 1.4 | `0` |
| Card title | `--fs-large` | 600 | 1.25 | `-0.005em` |
| Dialog title | `--fs-hl-small` | 600 | 1.2 | `-0.01em` |
| Group title (Setup) | `--fs-copy` | 600 | 1.3 | `0.02em`, not uppercase |
| Control label | `--fs-copy` | 600 | 1.3 | `0` |
| Control value | `--fs-medium` | 600 | 1.2 | `0`, tabular |
| Body and buttons | `--fs-copy` | 400 (buttons 600) | 1.45 | `0` |
| Plan primary line (the recipe, the water ratio) | `--fs-copy` | 400 | 1.35 | `0` |
| Meta, hint, caption | `--fs-small` | 400 | 1.4 | `0` |
| **Plan number** | `--fs-hl-small` | 400, **600 when selected** | 1 | `0`, tabular |
| Label on a plate (over paint) | `--fs-small` | 600 | 1 | `0`, tabular where numeric |
| Hex value | `--fs-small` | 400 | 1.2 | `0`, `--ff-fixed` |
| Walk lines (`Mix` / `Paint` / `Then`) | `--fs-copy` | `dt` 600, `dd` 400 | 1.4 | `0` |

No uppercase transforms anywhere. No italics; the existing `Leave the paper white` becomes upright
and is carried by its own line.

`index.html`: the emoji favicon data URI is removed and replaced by `public/favicon.svg` — a drawn
quartered square in `#262220`, `#8c2f22`, `#efece6`, `#7e766c`, 2 px radius, no text. A favicon is
not a control, so section 10's word rule does not reach it.

---

## 9. Components

One file per block in `src/css/components/`. BEM, modifier classes for state, no utility classes, no
scoped styles. Every block lists its states: default, hover, active, focus-visible, disabled,
selected, busy — where a state does not apply it is marked `n/a`.

### 9.1 `app` — the shell

Elements: `app__bar`, `app__name`, `app__tagline`, `app__notice`, `app__notice-text`,
`app__notice-hide`, `app__main`, `app__stage`, `app__stage-sticky`, `app__panels`, `app__rail`,
`app__tabs`, `app__tab`, `app__footer`, `app__footer-link`.
Modifiers: `app--layer`, `app--walk`, `app--picture-full`.

- `app__bar`: phone `position: fixed; inset: 0 0 auto 0;` height 48 + inset; at ≥48rem
  `position: static;` height 56. Holds `app__name` (`--fs-medium`, 600) and, at ≥64rem,
  `app__tagline`. Nothing else. Border-bottom `1px solid var(--c-border-strong)`.
- `app__notice` is the **single home for store-level errors** on every breakpoint. `role="alert"`,
  fixed under the app bar on phone and in flow under it at ≥48rem, `--c-danger` text on
  `--c-surface`, a 1 px `--c-danger` edge, a 48 px `Hide` button, and — on phone — the name of the
  tab the error came from appended in `--c-copy-light`: `Could not load image: file too large ·
  Source`. Round 1 routed `analysis.error` to the plan card and `collection.error` to a component
  that lives in another tab, so on a phone a failed photo load produced nothing visible. Fed by
  `analysis.error`, `collection.error`, `account.error`. A picture-load failure also replaces the
  readout with `The photo could not be loaded.`
- `app__tabs`: four items, `flex: 1 1 0; min-height: 5.6rem;` label `--fs-small`. Active:
  `background: var(--c-corporate-soft); font-weight: 600;` and a `0.3rem` top rule in `--c-copy`,
  with `aria-current="page"`. No icons; four words fit at 375 px (93 px per tab).
  Labels: `Colours · Recipe · Settings · Source` in mix mode; `Layers · Spot · Settings · Source` in
  layer mode; the second becomes `Step` while the walk is open.
  **A waiting selection is named, not dotted**: the label becomes `Recipe 12` (or `Spot`, `Step 3`)
  when something is selected and that tab is not active. Round 1's 6 px coloured dot was both a hue
  and information carried by colour alone.
  States: default · hover (`--c-surface-sunken`) · active (`--c-corporate-soft` + rule + 600) ·
  `:focus-visible` (ring) · pressed (`--c-surface-sunken`) · disabled n/a.
- `app__footer`: the five links, `--fs-small`, underlined, 48 px tall each, `--gap` apart. On phone
  it is rendered inside Setup group `More`.

### 9.2 `stage`

```
stage
  stage__head          image name · state                     (>= 48rem)
  stage__sticky        the sticky block
    viewbar            the view switch                        (>= 48rem)
    stage__bar         the word buttons                       (all)
    picture            the pane and what is over it
    picture__readout   one line, never empty, aria-live
  closeup              the strip of details                   (>= 48rem; phone: in Source)
```

- `stage__head` (≥48rem only): one 48 px row, `stage__name` (`--fs-medium`, flex 1, one line,
  `text-overflow: ellipsis`) and `stage__state` (`In collection`, `--fs-small`, 600). It is **not**
  sticky. On the phone the name is the heading of the `Source` card instead, where it wraps to two
  lines and is never truncated — so no tooltip is needed to read it.
- `stage__bar` (all breakpoints): one 48 px row, `flex-wrap: nowrap; overflow-x: auto;
  scroll-snap-type: x proximity; scrollbar-width: none;`. Its height is therefore 48 px whatever it
  holds, which is what makes section 5's arithmetic safe. Contents in order:
  - phone: `Show: <current view>` (flex 1, ellipsised) · `Full size` / `Fit`
  - ≥48rem: `Full size` / `Fit` · `Pick a detail` / `Cancel` · `Paint step by step` /
    `Close the walk` (layer mode) · `Outlines` · `Numbers` · `Guides` (sketch view only)
- There are **no floating buttons over the image**. `painting__zoom` and `painting__zoom--frame`
  are deleted (section 10).

### 9.3 `picture`

Elements: `picture__pane`, `picture__canvas`, `picture__frame`, `picture__handle`, `picture__banner`,
`picture__readout`.
Modifiers: `picture--busy`, `picture--framing`, `picture--full`.

- `picture__pane`: `background: var(--c-plate); border: 1px solid var(--c-border-strong);
  border-radius: 0;` — square corners, because it is a sheet of paper. It is the positioning context
  for the frame and the banner. `height: var(--picture-max)`, the canvas centred inside it with
  `max-width: 100%; max-height: 100%;`.
- `picture__canvas`: `cursor: crosshair` on fine pointers; `touch-action: manipulation`, or `none`
  while framing.
- `picture__banner`: the only element ever drawn over the image. One line of copy plus one button,
  `min-height: 4.8rem`, `background: var(--c-surface)` at 94 % opacity, pinned to the **bottom** edge
  of the pane, never over the middle. Its copy wraps to at most two lines
  (`-webkit-line-clamp: 2`); below 360 px the button moves to its own 48 px row and the banner is
  96 px tall — it is over the picture, not in the budget, so this cannot break section 5.
- `picture__handle`: four 48 px squares, each **outside** its frame corner, transparent fill, a 2 px
  `--c-plate` and 1 px `--c-copy` outline so they read on any photo. Not rendered on a canvas whose
  shorter side is under 240 px (section 6.2).
- `picture__readout`: a fixed 4rem band, `--fs-small`, `--c-copy-light`, one line,
  `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` `aria-live="polite"`. Space is
  reserved whether or not there is content, so nothing jumps. The full string is always also present
  in the detail card, so the ellipsis never hides the only copy of anything.

Readout content, in order of precedence. **A selection renders the same string as a hover** — round 1
gave the recipe to the mouse and a sentence about undoing a tap to the finger, on the device the
brief calls primary.

| Situation | Content |
|---|---|
| Busy | `Analysing…` / `Planning layers…` |
| Photo failed to load | `The photo could not be loaded.` |
| Framing armed | `Drag a frame over the part you want, or tap once to place one.` (under 240 px: `Drag the frame over the part you want.`) |
| Pointer over an area, mix mode | `12 · 23% of image · 1 x 663 Sepia brown + 2 x 485 Indigo` |
| A colour is selected, mix mode | `12 · 23% of image · 1 x 663 Sepia brown + 2 x 485 Indigo` |
| Pointer over or selection, layer mode | `Spot · 3 layers · match: good` |
| A close-up is open | prefixed `Detail 2 · ` |
| Nothing, mix mode | `Tap an area to see its recipe.` |
| Nothing, layer mode | `Tap a spot to see which layers cover it.` |
| Sketch view | `The sketch is the outline to transfer to paper. Nothing to pick here.` |

Clearing a selection is **not** in the readout. It is the `Clear selection` button in the detail
card's head, which is where the selection is.

### 9.4 `viewbar` (≥48rem) and the `showsheet` (phone)

`viewbar`: one 48 px row. A visually hidden `Show` label, then `segmented` with the view options,
`flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x mandatory;` each option
`scroll-snap-align: start; min-width: 10rem;`. It never wraps into ragged rows, so its height is
fixed at 48 px.
Options: mix mode `Mixed paint · Photo colour · Photo · Sketch`; layer mode `Layered paint · Photo ·
Sketch`.

`showsheet` (phone only): a bottom sheet on the shared `dialog` chrome,
`max-height: 70svh; border-radius: var(--radius) var(--radius) 0 0;` Title `Show`, a 48 px `Close`.
Body, in order:
1. the view `segmented`, full width, options stacked as four 48 px rows — tapping one applies it and
   **closes the sheet** (one tap, one change);
2. `Outlines`, `Numbers`, and `Guides` while the view is `Sketch` — 48 px `switch` rows; these leave
   the sheet open;
3. `Full size` / `Fit`, a 48 px button; leaves the sheet open.
Under the toggles, one caption: `Quarters and diagonals, to transfer the sketch to paper.` (shown
only in sketch view).

### 9.5 `walk` — the painting walk (replaces `steps`)

Elements: `walk__head`, `walk__title`, `walk__nav`, `walk__prev`, `walk__next`, `walk__close`,
`walk__view`, `walk__hint`, `walk__target`, `walk__caption`, `walk__lines`, `walk__warn`.

- At ≥48rem the open walk replaces `viewbar` inside the sticky block, so `--stage-chrome` does not
  change and section 5's budget holds unchanged. `walk__title` and `walk__lines` render in the detail
  card's place at the top of the rail.
- On phone the walk is the `Step` tab (section 5.1c), with `walk__nav` sticky at the bottom of the
  panel region: `position: sticky; bottom: 0;` two 56 px buttons, `flex: 1`, 8 px apart, on
  `--c-surface` with a top rule.
- `walk__title`: `Step 3 of 11: layer 2 of 5, 663 Sepia brown, coat 1 of 2`.
- `walk__target`: the wash field, 48 px, with the text `One stroke on white paper` / `2 coats on
  white paper` on a plate, and `walk__caption` under it: `Estimated from a single sample. Test the
  wash on a scrap first.`
- `walk__view`: the `segmented` `Where to paint | This wash | So far`, with **one** visible
  `walk__hint` line under it matching the chosen option:
  - `Where to paint`: `The paper after this step. What is painted now is in full colour, the rest faded.`
  - `This wash`: `Only the areas painted now, filled with one stroke of this wash.`
  - `So far`: `The paper with all layers up to and including this step.`
- `walk__lines`: a `dl` with `Mix`, `Paint`, `Then` and today's text, `--fs-copy`. `Then` reads
  `let it dry completely.` or, on the last step, `you are done.`
- `walk__warn`: today's text, `--fs-small`, `--c-copy`, **not** `--c-danger` (section 7.3):
  `34 separate shapes in this step. A higher "Simplify areas" gives fewer and bigger ones.`
- States: `walk__prev` / `walk__next` disabled at the ends (`opacity: 0.45; cursor: default`), with
  the step count making the position obvious.

### 9.6 `plan` — the list, both modes

Elements: `plan__head`, `plan__title`, `plan__count`, `plan__actions`, `plan__key`, `plan__status`,
`plan__list`, `plan__item`, `plan__tick`, `plan__row`, `plan__number`, `plan__swatch`, `plan__name`,
`plan__meta`, `plan__sub`, `plan__bar`, `plan__part`, `plan__part-text`, `plan__washes`,
`plan__wash`, `plan__coats`, `plan__coat`, `plan__painted`, `plan__note`, `plan__empty`,
`plan__empty-actions`.
Modifiers: `plan--layer`, `plan__item--selected`, `plan__item--current`, `plan__item--muted`,
`plan__item--painted`, `plan__wash--selected`, `plan__coat--current`.

Row geometry, identical in both modes:

```css
/* The item is the grid, because the tick and the bars must be siblings of the row
   button, not children of it (section 14.1). */
.plan__list { display: flex; flex-direction: column; gap: var(--gap-05x); }
.plan__item {
  display: grid;
  grid-template-columns: [row] minmax(0, 1fr);          /* mix mode: no tick column */
  row-gap: var(--gap-05x);
}
/* No rule between rows: the 8 px gap is the separator, which is also the minimum
   distance between two neighbouring targets. The list is ruled by the vertical
   line after plan__number, not by horizontal ones. Row pitch is therefore exactly
   56 + 8 = 64 px on a phone, which is the number section 5.1b counts with. */
.plan--layer .plan__item {
  grid-template-columns: [tick] 4.8rem [row] minmax(0, 1fr);
  column-gap: var(--gap-05x);
}
.plan__tick  { grid-column: tick; align-self: start; min-height: var(--touch); }
.plan__row   { grid-column: row; display: grid; align-items: center;
               grid-template-columns: [number] 3.2rem [swatch] 4.8rem [body] minmax(0, 1fr);
               column-gap: var(--gap-05x);
               min-height: 5.6rem;           /* 6.4rem at >= 48rem */
               padding: 0 var(--gap-05x); border-radius: var(--radius-small); }
.plan__sub   { grid-column: row; display: flex; align-items: stretch; gap: var(--gap-05x);
               min-height: var(--touch); }   /* selected row only: the bar plus "Painted" */
.plan__number { border-inline-end: 1px solid var(--c-border); padding-inline-end: var(--gap-05x); }
```

The column rule after `plan__number` is a table rule between columns, not a `border-left` accent on a
container, and it is what makes the list read as a paint chart rather than a stack of cards.

**`plan__swatch` — the object a wet brush is held beside, finally sized.**
`width: 4.8rem; align-self: stretch;` so it is 48 × 56 on a phone and 48 × 64 above, in both cases
over the 48 px floor and over the area of a 48 px square. `background: var(--c-plate);` with the
colour painted as an inner block inset by 1 px, `border: 1px solid var(--c-border-strong);`
`border-radius: var(--radius-small);` No text on it; its value is in `plan__name` and in the detail
card. **The mix swatch is drawn at the wash strength on white paper, not at masstone** — `paints.hex`
is the colour at strength 1, a mid-strength wash, and this is what the painter compares against.
In layer mode the swatch is the wash on white paper, one stroke. Nothing coloured sits within
`--gap` (16 px) of the swatch on either side: the number column with its rule is on one side and
`plan__name`, which is text, on the other.

- `plan__number`: `--fs-hl-small` (22 px on a phone, 26 at ≥64rem), tabular, weight 400; selected it
  becomes weight 600 in `--c-head`. It is the thing most often looked up, from a metre away.
- `plan__name`: the primary line, `--fs-copy` in `--c-copy`. Mix mode: `1 x 663 Sepia brown + 2 x 485
  Indigo`. Layer mode: `663 Sepia brown · 1:4 with water, like tea` — the water ratio and the
  consistency word are promoted out of the faint meta line, because that is what is read while
  mixing. Two-line clamp, never `nowrap`.
- `plan__meta`: `--fs-small` in `--c-copy-light`. Mix: `4 washes · 23% of image · changed by hand`.
  Layer: `3 coats · 23% of image · for the darks`. When the row is selected the word `selected` is
  appended. When the row is the walk's current layer, `painting now` is appended. When
  `--muted`, the meta reads `Not needed for this picture`.
- `plan__sub` is a 48 px band rendered **only for the selected row**, in the `row` column, holding
  three things: `plan__bar` (the ratio bar, one `plan__part` per paint, each with its `plate`),
  then in mix mode `plan__washes` (one `plan__wash` button per wash, the letters `W L M R C` on a
  plate) or in layer mode `plan__coats` (one `plan__coat` button per coat, text `3 coats · 23%` on a
  plate), then `plan__painted`. Nothing is lost by hiding it on unselected rows: the ratio bar is the
  picture of `plan__name`, which prints `1 x 663 Sepia brown + 2 x 485 Indigo` in words on **every**
  row, and the wash count is in `plan__meta` as `4 washes`. This keeps the list scannable, keeps the
  row inside section 5's budget, and keeps every button out of the row button (section 14).
- `plan__painted`: a 48 px `switch` with the word `Painted`, at the end of the same 48 px `plan__sub`
  band as the wash or coat bar — so it exists for the selected row only, which is the row the painter
  has just finished, and it is a sibling of the row button, not inside it. Ticking it sets
  `plan__item--painted`, which drops `plan__name` and `plan__meta` to `--c-copy-light` and prints
  `painted` in the meta of every row, selected or not. It is the only record of where the afternoon
  got to; it persists (section 15.3). A plan with no washes and one coat still gets the band, holding
  nothing but `Painted`.
- `plan__key` (mix mode, when any mix has more than one wash):
  `W very watery · L light · M medium · R rich · C concentrated`.
- `plan__key` (layer mode): `Swatches are one stroke on white paper, estimated from a single sample.
  Test the wash on a scrap first.`
- `plan__status`: the recompute line (section 15.1) and the out-of-reach line.
- `plan__note`: `Tap a layer to see it alone, and again to show all layers. Tap a coat to open the
  step that paints it. Ticks only change what the picture shows — change the paints in the paint box.`
  `--fs-small`, below the list, two-line wrap, no truncation.
- States of `plan__row`: default · hover `--c-surface-sunken` · active `--c-surface-sunken` ·
  `:focus-visible` ring · **selected** `--c-corporate-soft` + `outline: 0.2rem solid var(--c-copy);
  outline-offset: -0.2rem;` + number at 600 in `--c-head` + the word `selected` ·
  `--current` a `0.3rem` inline-start… **no**: `--current` is marked by the words `painting now` in
  the meta and by the number at 600; there is no edge, so it cannot be confused with selected ·
  disabled n/a · `--muted` `opacity: 1` with the meta text above and `plan__swatch` drawn with a
  hatched 1 px `--c-border-strong` cross-rule instead of a colour.

### 9.7 `detail` — the selected colour or spot

Elements: `detail__head`, `detail__title`, `detail__clear`, `detail__compare`, `detail__field`,
`detail__caption`, `detail__hex`, `detail__match`, `detail__actions`, `detail__subtitle`,
`detail__washes`, `detail__wash`, `detail__recipes`, `detail__recipe`, `detail__chosen`,
`detail__note`, `detail__empty`.
Modifiers: `detail--empty`, `detail--layer`, `detail__recipe--chosen`.

- `detail__head`: 48 px (40 under `max-height: 44rem`), `detail__title` (`Colour 7` / `This spot`)
  and `detail__clear`, a 48 px button with the word **`Clear selection`** — not `Close`, because on a
  phone it sits inside a tab panel and `Close` would be a lie.
- `detail__compare`: two `detail__field` cells side by side, each **8rem (80 px)** tall — 6rem (60)
  under `max-height: 44rem` — on `--c-plate`, with a 1 px `--c-border` rule between them and a 1 px
  `--c-border-strong` edge around the pair. `detail__hex` is printed inside each field on a plate in
  `--ff-fixed`. `detail__caption` sits above the pair (inside the field on the short variant).
  Mix mode: `Photo colour` / `Your mix`. Layer mode: `Photo` / `Layered`.
  **The mix field is drawn at the wash strength on white paper, not at masstone.** Nothing coloured
  sits within `--gap` of the pair.
- `detail__match` (layer mode): one visible line, `Match: good · distance to the photo 4.2` — the
  number that is a tooltip today.
- `detail__actions`: `Change colour` (a 48 px label wrapping `input[type=color]`, its own swatch
  4.8rem × 4rem), `Back to photo colour` (only when overridden), `Edit only the tapped area` (only
  when the tapped area shares its colour with others). 56 px apart from `detail__compare`.
- `detail__subtitle`: `Recipes` / `Layers on this spot`, `--fs-medium`, 600.
- `detail__washes`: the element round 1 listed and never described. One 48 px row per wash of the
  selected mix, visible text: `L · light · 1:4 with water · 12% of image`. This is the home of the
  per-wash dilution and share that exist only in a `title` today (`PaletteList.vue:65`).
- `detail__recipe`: a selectable card, `min-height: 5.6rem`, holding the recipe line, the mixed hex
  and the distance. The chosen one gets `background: var(--c-corporate-soft)`, a 2 px `--c-copy`
  border on all four sides, and the word `Chosen` (`detail__chosen`, `--fs-small`, 600) — field plus
  edge plus word, never colour alone.
- `detail__note`: `Same mix as 7L, 7M — only the amount of water differs.` / `Leave the paper white.`
  / `Not painted here: 2, 5.`
- There is **no drag handle, no `position: fixed`, no z-index above the page.** `floating.js` is
  deleted.
- States: default · hover n/a on the card · `detail__recipe` hover `--c-surface-sunken` · active ·
  `:focus-visible` ring · selected as above · disabled n/a · busy: the card keeps the last selection
  and `picture__readout` carries `Analysing…`.

### 9.8 `source` — the photo card

Elements: `source__head`, `source__name`, `source__state`, `source__group`, `source__group-title`,
`source__actions`, `source__status`, `source__closeups`.

Two groups, **24 px apart** (`--gap-15x`), because round 1 put `New photo` and `Sample` — each of
which throws a tuned plan away — eight pixels from `Save` and `Print / PDF`, in a row above the
picture the painter taps all day.

| Group | Rows | Status line |
|---|---|---|
| `This picture` | `Save` · `Collection` · `Print / PDF` | `In collection` when saved; `Nothing to print yet.` when there is nothing; `Saving pictures is part of the paid plan.` for a free browser account |
| `Start over` | `New photo` (56 px, primary) · `Take photo` (coarse pointer only) · `Sample` | `A new photo replaces the plan on screen.` |

`source__name` is the image name as a heading, `--fs-medium`, wrapping to two lines, never truncated
(so the `title` on `ControlsPanel.vue:4` has no reason to exist). `source__closeups` holds the
close-up strip on the phone.

`New photo` and `Sample` raise the confirm dialog when the plan has unsaved hand-changes
(section 13). On phone the rows are a single column of 56 px buttons; at ≥48rem a single column of
48 px buttons in the rail, except `New photo`, which stays 56.

### 9.9 `settings` and `control`

```
settings
  settings__nav                   phone only: Method · Plan · Shapes · Photo, sticky, 48 px
  settings__group
    settings__group-head
      settings__group-title       Method / Plan / Shapes / Photo / More
      settings__hints             button: "Hide hints" / "Show hints"   (not in More)
      fold                        button: "Hide" / "Show"
    settings__hint                one paragraph per group, dismissible
    settings__group-body
      control                     one per row
```

**Hints are per group, not per row.** Round 1 made `control__hint` part of the anatomy of every row
and then filled fourteen of them; read as a page that is generated documentation a painter scrolls
past forever. Now each group carries **one** paragraph, shown until `Hide hints` is tapped on that
device, and brought back by `Show hints`. State is `layout.collapsed['hints:<group>']`, which
`layout.toggle()` already persists — no store API change.

A hint is an *explanation*. A **status** is a *fact*, it is always visible, and it is not a hint:

| Control | Permanent status line |
|---|---|
| `Layers` | `Chosen by hand. Auto in the paint box picks again.` / `Chosen by the app.` |
| `Paint box` (button) | `54 paints selected.` / `7 of 8 base paints chosen.` |
| `Max. paints` | `Applies at once, without re-analysing the photo.` |
| `Reset saturation and contrast` | n/a (the label says it); disabled while both are 100 |

`control` anatomy, one row, two lines, no permanent hint:

```
+---------------------------------------------+
| Colours                                  20 |  label (600, --fs-copy) / value (600, --fs-medium, tabular, right, min-width 4ch)
| [ - ]  ======O---------------------- [ + ]  |  48 px stepper, slider band 48 px, 48 px stepper
+---------------------------------------------+
```

Elements: `control__label`, `control__value`, `control__field`, `control__step`, `control__status`.
Modifiers: `control--segment`, `control--button`, `control--disabled`.
Row height: 40 (label line) + 48 (field) = **88 px**, plus `--m-vert-slim` between rows.

- `slider`: `input[type=range]`, `height: 4.8rem` so the whole band is the hit area. Track
  `::-webkit-slider-runnable-track` / `::-moz-range-track`: `1rem` tall, `--radius-small`,
  `background: var(--c-surface-sunken)`, `outline: 1px solid var(--c-border-strong)`. Filled portion
  `--c-corporate` (13.99:1 / 11.41:1 against the empty track). Thumb: `3rem` (30) square-ish with
  `--radius-small`, `background: var(--c-corporate)`, a 2 px `--c-surface` ring and a 1 px
  `--c-border-strong` outline. `accent-color` is **not** used — it cannot express this.
- `control__step`: 48 px square buttons with the words `minus` / `plus` as visually hidden text and
  the characters `−` / `+` rendered at `--fs-medium`. These two are typographic operators in a
  mathematical role, not icons standing in for words; the accessible name is
  `One less colour` / `One more colour`.
- Steppers and sliders both commit on an idle, not per tap: section 15.2.
- `control--segment` replaces the field row with a full-width `segmented`: `Method`, `Areas`,
  `Max. paints`, `Max. coats`.
- `control--button` replaces the field row with one 48 px button: `Paint box`, `Reset saturation and
  contrast`.
- **One column at every width.** The two-column variant round 1 proposed for `Shapes` and `Photo` at
  ≥64rem is dropped: it was the one place density could tip into clutter, it costs only vertical
  space in a rail that scrolls, and a single column means one layout to get right. The three-column
  grid that produced `Saturation200%Contrast100%` does not exist at any width.
- `settings__nav` (phone): sticky at the top of the panel region, 48 px, four 600-weight words that
  scroll their group into view with `scroll-margin-top: calc(4.8rem + var(--gap-05x))`. `More` is
  not in the nav; it is at the end.

Groups and their contents:

| Group | Controls |
|---|---|
| `Method` | `Method` (segmented: `Mix` / `Layer`) |
| `Plan` | `Colours` 2–32 · `Variety` 0–10 (mix) · `Layers` 2–8 (layer) · `Accents` 0–3 (layer) · `Max. paints` 1/2/3 (mix) · `Max. coats` 1/2/3 (layer) · `Paint box` |
| `Shapes` | `Areas` (segmented) · `Simplify areas` 0–10 |
| `Photo` | `Saturation` 0–200 step 5 · `Contrast` 50–200 step 5 · `Reset saturation and contrast` |
| `More` | `AI help` · `Account` · `Privacy settings` · the footer links (phone) |

`More` has no fold button and no hints. It is a list of four 48 px buttons under a 24 px gap, at the
very end of Setup. `AI help` is a button that opens a dialog — it is not a settings group level with
`Plan` and `Photo`, because an AI provider is not a property of a watercolour plan.

### 9.10 `segmented`, `switch`, `button`, `chip`, `swatch`, `recipe`, `plate`

- `segmented`: `display: flex; border: 1px solid var(--c-border-strong);
  border-radius: var(--radius-medium); overflow: hidden;` options `flex: 1 1 0; min-height: 4.8rem;
  min-width: 6rem;`. Dividers: `border-inline-start: 1px solid var(--c-border-strong)` on every
  option but the first — a divider between equals inside one control, not an accent rule on a
  container.
  `segmented__option--active`: `background: var(--c-corporate-soft); font-weight: 600;` plus
  `box-shadow: inset 0 -0.3rem 0 0 var(--c-copy);` (a 3 px rule along the bottom edge) and
  `aria-pressed="true"`. Field, rule and weight: three signals, no hue.
  Disabled: `opacity: 0.45`, not clickable, with the reason in the group's status line.
- `switch`: a `label` wrapping a native checkbox, `min-height: 4.8rem`, box `2.4rem`,
  `accent-color: var(--c-corporate)`. The word is inside the label, so the whole row is the target.
- `button`: `--radius-medium`, `min-height: var(--touch)`, `font-weight: 600`, `white-space: nowrap`.
  - primary — `background: var(--c-corporate); color: var(--c-corporate-ink);` 15.76:1 / 13.73:1.
    This is the pair round 1 shipped at 1.96:1 in dark mode.
  - `button--secondary` — `background: var(--c-corporate-soft); color: var(--c-copy);` 12.36:1 / 10.55:1.
  - `button--quiet` (replaces `button--ghost`) — transparent, `1px solid var(--c-border-strong)`,
    `color: var(--c-copy)`. The current ghost uses `--ink-soft`, too weak in sunlight.
  - `button--danger` — `background: var(--c-danger); color: var(--c-danger-ink);` 8.25:1 / 6.82:1.
    Only inside the confirm dialog and on `Delete account`.
  - hover: one step toward `--c-corporate-hover` / `--c-surface-sunken`. active: the same, no
    transition. `:focus-visible`: the ring. `:disabled`: `opacity: 0.45; cursor: default;` plus a
    visible reason nearby — a disabled button never leaves the user guessing.
- `plate`: the new shared element for any label over paint. `background: var(--c-plate);
  color: var(--c-plate-ink); border-radius: var(--radius-small); padding: var(--gap-025x) 0.6rem;
  font-size: var(--fs-small); font-weight: 600;` Used by `plan__part-text`, `plan__wash`,
  `plan__coat`, `recipe__part-text`, `chip__strong`, `chip__text`, `closeup__number`,
  `walk__target`'s text, `detail__hex`.
- `chip` (a paint): `min-height: 6.4rem; min-width: 14rem;` the paint colour as the chip's
  background, a 1 px `--c-border-strong` edge, and a `plate` holding two lines —
  line 1 `663 Sepia brown` (`--fs-small`, 600), line 2 `Schmincke Horadam · Sepiabraun · estimate`
  (`--fs-small`, 400, `--c-plate-ink` at 85 % via a separate token-free `opacity` on the span).
  `chip--selected`: a 2 px `--c-copy` edge plus the word `in box` on the plate.
  `chip--locked` (free plan): the plate reads `Pro`, the chip is `opacity: 0.55`, and tapping it
  raises `pro.require()` as today.
- `swatch`: a colour on a `--c-plate` ground with a 1 px `--c-border-strong` edge,
  `--radius-small`, never smaller than 48 px in its smaller dimension anywhere it is interactive.
- `recipe`: keeps its current structure and its two surviving layouts, `recipe--wide` (print) and
  `recipe--full` (the detail card). The pointer-tip layout is dropped with `RecipeTip.vue`. All text
  inside a bar part is a `plate`.

### 9.11 `dialog` — shared chrome for all seven dialogs

One block, used by `paintbox`, `collection`, `pro`, `account`, `ai`, `confirm` and the phone
`showsheet`, so the "three more separate visual languages" become one.

```css
.dialog        { width: min(96rem, calc(100vw - var(--gap))); max-height: calc(100svh - var(--gap));
                 padding: 0; border: 1px solid var(--c-border-strong); border-radius: var(--radius);
                 background: var(--c-surface); box-shadow: var(--shadow); }
.dialog--text  { width: min(var(--article-width), calc(100vw - var(--gap))); }  /* pro, account, confirm, ai */
.dialog::backdrop { background: var(--c-overlay); }
.dialog__head  { position: sticky; top: 0; min-height: 5.6rem; display: flex; align-items: center;
                 gap: var(--gap-05x); padding: var(--gap-05x) var(--gap);
                 border-bottom: 1px solid var(--c-border); background: var(--c-surface); }
.dialog__title { font-size: var(--fs-hl-small); font-weight: 600; flex: 1; }
.dialog__close { min-height: var(--touch); }     /* the word "Close" */
.dialog__body  { padding: var(--gap); overflow-y: auto; overscroll-behavior: contain; }
.dialog__foot  { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: var(--gap-05x);
                 padding: var(--gap) var(--gap) calc(var(--gap) + env(safe-area-inset-bottom));
                 border-top: 1px solid var(--c-border); background: var(--c-surface); }
@media (max-width: 47.999rem) {
  .dialog { width: 100vw; height: 100svh; max-height: none; border-radius: 0; border: 0; }
}
```

`dialog__close` is the **word** `Close`, 48 px. Focus moves to `dialog__title` on open and returns to
the element that opened it on close (section 14.4).

### 9.12 `paintbox`

- `dialog__head`: `Paint box` (mix) / `Paint box: base paints` (layer) · `Close`.
- First body row, sticky under the head: **`paintbox__filter`**, a 48 px text input,
  `placeholder="Filter by number or name"`, matching on `number`, `name` and `nameDe`. Without it,
  54 chips in two columns on a phone are ~27 rows and about 1 700 px of scrolling with no way to find
  `663 Sepia brown` except by eye. `paintbox__count` beside it: `12 of 54 shown · 8 in the box`, and
  for a free browser account `8 of 54 — the free plan allows 8` with a `More paints` button that
  raises `pro.require()`.
- Second body row: the box `segmented` (box names, wrapping) and `New box`, `Rename`, then — after a
  24 px gap — `Delete box`.
- `paintbox__group` for `Selected paints` / `Base paints` (pinned above the filter, always visible),
  then `Pans`, `Tubes`, each vendor, then `Your own paints`. Each group head carries a `switch` with
  the visible words `Use Pans for Auto`.
- `paintbox__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--gap-05x); }` chips `min-height: 6.4rem` (today 46 px, under the floor).
- `paintbox__readout`: a 48 px line at the bottom of the body, above the foot, showing the full
  description of the last-tapped chip: `663 Sepia brown · Schmincke Horadam · Sepiabraun · colour
  estimated · last pan, nearly out`. This is the home of `PaintChip.vue`'s `nameDe` and the free-text
  stock `note`, which have no other surface in the app.
- `paintbox__note` under the group whose paints are estimated: `Colours marked "estimate" are guessed
  from the catalogue, not measured.`
- `dialog__foot`: `Update mixes` / `Update layers` (primary, 56 px, disabled when nothing changed,
  with the status `Nothing changed yet.`), `Auto` with the status `Let the app choose the paints that
  suit this picture.`, `Revert`, then after a 24 px gap `Clear`.
- **The plan does not update behind the dialog.** `Update mixes` is an explicit act, the dialog
  closes when it is tapped, and the foot says so: `Update mixes` carries the status `Closes the paint
  box and works out the plan again.` The loop "tick a paint, see what it does" is therefore tick, then
  `Update mixes`, then look, then `Paint box` again, and the painter is told that rather than discovering it.

### 9.13 `closeup`

- `closeup__bar`, above the picture while a close-up is open: `Detail 2` and `Back to the whole
  picture` (48 px). The readout is also prefixed `Detail 2 · `.
- `closeup__strip`: a row of items, each a 7.2rem thumbnail with a visible caption `Detail 2` and a
  48 px `Remove` **word** button beneath it. `closeup__item--active` gets a 2 px `--c-copy` outline
  and the caption at 600 with ` · showing` appended.
- Home: inside `source` on the phone (`source__closeups`), under the sticky block at ≥48rem. Never
  inside the phone's sticky region — that was round 1's unbudgeted 88 px.
- Empty: the strip is not rendered; `Pick a detail` carries the whole affordance.

### 9.14 `ai` (a dialog)

Opened by `AI help` in Setup group `More`. Sections in order: the `Off` / `On` segmented with one
`ai__hint` line under it (`Off: the app chooses colours and paints itself. On: an AI model chooses
them, once you ask.`), today's explanation paragraph, `Provider`, `Model`, `Your API key` with its
hint, `Remember the key on this device`, the consent paragraph with its checkbox, `Ask about this
picture` (primary, 56 px) with the cost estimate under it, then the answer: notes, mixes, details to
keep, the final-wash switch, the sketch line, the match line, the token line, and — after a 24 px gap
— `Forget key and consent`. No copy changes; only the place and the touch sizes. `analysis.aiError`
renders above the ask button **and** in `app__notice`, because the dialog may be closed when the
request fails.

### 9.15 `confirm`, `consent`, `gate`, `pro`, `account`, `collection`

- `confirm`: section 13.
- `consent`: unchanged content; 48 px buttons; `Accept` is `button--secondary`, `Decline` is
  `button--quiet`, equally reachable, no dark pattern; on phone it sits above the tab bar
  (section 5.5); it is the one non-dialog element allowed `--shadow`.
- `gate`: one card at `--article-width`, the two statements as 48 px `switch` rows, `Continue` 56 px.
- `pro`, `account`, `collection`: on the shared `dialog--text` / `dialog` chrome; their own blocks
  keep only what is specific. `collection__list` gets `repeat(auto-fill, minmax(18rem, 1fr))` cells,
  a name that wraps to two lines (no truncation tooltip), `Open` and `Rename` at 48 px, and `Delete`
  at 48 px separated by a 24 px gap. `account__delete` is `button--danger` and raises the confirm
  dialog.

---

## 10. Words, not icons

Every control carries a word. Both painter critics defended this independently: with gloves on and
in a hurry a word is unambiguous and an icon is a guess. The current build has exactly four
icon-only controls — `grep -rn "<svg" src/components/` returns four hits — and all four are the small
targets the brief names.

| Today | Size | Replacement | Where it lives |
|---|---|---|---|
| `PaintingCanvas.vue:3-17` `painting__zoom`, a magnifier over the image | 18 px glyph in a floating button | the word `Full size` / `Fit` | `stage__bar` at ≥48rem; in the Show sheet on the phone |
| `PaintingCanvas.vue:19-33` `painting__zoom--frame`, a crop icon over the image | 18 px glyph in a floating button | the words `Pick a detail` / `Cancel` | `stage__bar` at ≥48rem; `source` card on the phone |
| `CloseupStrip.vue:15-19` `closeup__remove`, a cross | 22 px | the word `Remove` | under each close-up thumbnail, 48 px |
| `PanelToggle.vue` the fold chevron | 28 px | the words `Hide` / `Show` | `settings__group-head`, 48 px, as `FoldButton.vue` |

Three further consequences:

- **Nothing is drawn over the picture any more** except `picture__banner` while framing. Both
  floating buttons are deleted, so the image is never partly covered by chrome.
- `dialog__close` is the word `Close`, not a drawn cross. Round 1 had specified an SVG cross; it is
  gone.
- `control__step` renders `−` and `+`. These are mathematical operators in their own role, not
  pictures standing in for words, and each carries a full accessible name (`One less colour`,
  `One more colour`). They are the only non-alphabetic glyphs in any control in the design.

**Icons may remain only where they are redundant to a word that is also present.** This design uses
that permission **zero times**: after the rework `grep -rn "<svg" src/components/` returns nothing.
The only drawn mark that ships is `public/favicon.svg`, which is not a control.

---

## 11. Every `title` attribute in the current build, and its new home

`grep -rn 'title=' src/components/ src/App.vue` returns **33** matches. Each one below has a named
home as specific text — not "becomes visible". Where a string is dynamic, the source of the text is
named. **After the rework, no `title` attribute exists anywhere in `src/components/`**: the attribute
is removed, not kept "as a bonus", because a tooltip that duplicates visible text still invites a
future author to put something new in one.

| # | File:line | Today's string | New home, as text |
|---|---|---|---|
| 1 | `LayerList.vue:31` | `Show layer 3 in the picture` | `plan__tick`'s visually hidden label text, `Show layer 3, 663 Sepia brown, in the picture`; the visible word beside the box is `Show` |
| 2 | `LayerList.vue:35` (`row.title`, built at `:122`) | `Show only this layer.` / `Show all layers.` + `It brings the picture 1.2 closer to the photo.` | the gain becomes the third clause of `plan__meta`: `3 coats · 23% of image · alone it brings the picture 1.2 closer`; the action is stated once in `plan__note`: `Tap a layer to see it alone, and again to show all layers.` |
| 3 | `LayerList.vue:36` | `One stroke on white paper. An estimate from one swatch: test the wash on a scrap first.` | `plan__key` in layer mode, once under the head: `Swatches are one stroke on white paper, estimated from a single sample. Test the wash on a scrap first.` |
| 4 | `LayerList.vue:52` | `3 coats on 23% of the image. Click to see the step that paints coat 3.` | the coat segment's own visible plate text `3 coats · 23%`, plus `plan__note`: `Tap a coat to open the step that paints it.` |
| 5 | `LayerSteps.vue:22` (`v.title`, 3 strings at `:57-59`) | the three view explanations | `walk__hint`, one visible line under `walk__view`, matching the chosen option (section 9.5) |
| 6 | `LayerSteps.vue:31` | `An estimate from one swatch: test the wash on a scrap first` | `walk__caption` under `walk__target`: `Estimated from a single sample. Test the wash on a scrap first.` |
| 7 | `RecipeLine.vue:3` | `Mixed: #7a5a3f · 1:4 with water` | `detail__hex` inside the `Your mix` field: `#7a5a3f`, and the dilution as the second clause of the field's caption: `Your mix · 1:4 with water` |
| 8 | `RecipeLine.vue:13` | the paint's name on the result chip | the chip's `plate` prints `663 Sepia brown` as visible text |
| 9 | `RecipeLine.vue:34` | `1 x 663 Sepia brown` on a bar part | `recipe__part-text` prints `1 x 663` on its plate, and the full line `1 x 663 Sepia brown + 2 x 485 Indigo` is `plan__name` / the detail card's recipe line |
| 10 | `PaletteList.vue:28` | `Base colour of the mix: #7a5a3f` | the hex is printed in the detail card's `Your mix` field (#7); `plan__swatch` carries visually hidden text `Base colour of mix 7` |
| 11 | `PaletteList.vue:51` (`paint.title`, built at `:122`) | `1 x 663 Sepia brown` | same as #9 |
| 12 | `PaletteList.vue:65` | `L: 1:4 with water, 12% of image` | `detail__washes`, one visible 48 px row per wash: `L · light · 1:4 with water · 12% of image` |
| 13 | `AiPanel.vue:13` (`choice.title`, 2 strings at `:137-138`) | `The app chooses colours and paints itself` / `An AI model chooses colours and paints, once you ask it` | `ai__hint`, one visible line under the `Off` / `On` segmented control |
| 14 | `PaintingCanvas.vue:7` | `Show the picture in full size` / `Fit the picture to the window` | the button's own word: `Full size` / `Fit` |
| 15 | `PaintingCanvas.vue:24` | `Drag a frame over the part to zoom in on. Click here to cancel.` / `Zoom in on a part of the picture` | the button's words `Pick a detail` / `Cancel`, and `picture__banner`: `Drag a frame over the part you want, or tap once to place one.` |
| 16 | `CollectionDialog.vue:21` | `Open Meadow` | the thumbnail's visible caption is the name; the button's visible word is `Open`; its accessible name stays `Open Meadow` |
| 17 | `CollectionDialog.vue:29` | the picture's name (a truncation tooltip) | `collection__name` wraps to two lines (`-webkit-line-clamp: 2`); the full name is in the rename field |
| 18 | `CloseupStrip.vue:9` | `Show detail 2` | the thumbnail's visible caption `Detail 2`, with ` · showing` when active |
| 19 | `CloseupStrip.vue:15` | `Remove detail 2` | the visible word `Remove` on a 48 px button; accessible name `Remove detail 2` |
| 20 | `ControlsPanel.vue:4` | the image name (a truncation tooltip) | `source__name` is a heading that wraps to two lines and is never truncated |
| 21 | `ControlsPanel.vue:7` | `Choose a photo` | the label's word `New photo`, plus the group status `A new photo replaces the plan on screen.` |
| 22 | `ControlsPanel.vue:15` | `Load the next sample photo` | the button's word `Sample`, plus the group status; the word is in `Start over`, which says what it does |
| 23 | `ControlsPanel.vue:39` (`m.title`, 2 strings at `:271-272`) | `Mix every colour on the palette and paint each area once` / `Glaze a few paints over each other, light to dark` | `settings__hint` of group `Method` (both sentences, one paragraph) |
| 24 | `ControlsPanel.vue:60` (`a.title`, 2 strings at `:262-263`) | `Areas follow the outlines in the photo` / `Areas as polygons with a few straight edges that overlap` | `settings__hint` of group `Shapes` |
| 25 | `ControlsPanel.vue:85` | `Quarters and diagonals, to transfer the sketch to paper` | the caption under the toggles in `viewbar` / the Show sheet, shown only in sketch view |
| 26 | `ControlsPanel.vue:182` | `How often one wash may be painted over itself` | `settings__hint` of group `Plan` |
| 27 | `ControlsPanel.vue:228` | `Saturation and contrast back to the photo as it is` | the button's own label `Reset saturation and contrast`, plus the group hint |
| 28 | `LayerArea.vue:16` | `Distance to the photo: 4.2` | `detail__match`, visible: `Match: good · distance to the photo 4.2` |
| 29 | `LayerArea.vue:30` | `This layer leaves the spot unpainted` / `Show the step that paints this` | the row's visible text `Not painted here`, and `detail__note`: `Tap a layer to open the step that paints it.` |
| 30 | `PaintBox.vue:12` | `Let the app choose the base paints for this picture` / `Let the app select the paints that suit each picture` | the status line under `Auto` in `dialog__foot` |
| 31 | `PaintBox.vue:71` | `Let Auto choose from Pans` | the group head's switch label becomes the visible words `Use Pans for Auto` |
| 32 | `PaintChip.vue:6` (`description`, built at `:33-40`) | `Schmincke Horadam · Sepiabraun · colour estimated · last pan, nearly out` | line 2 of the chip's plate carries `Schmincke Horadam · Sepiabraun · estimate`; the full string including the free-text stock `note` is in `paintbox__readout` (section 9.12) — this is the only surface `nameDe` and `note` have anywhere in the app |
| 33 | `PanelToggle.vue:7` | `Show Plan` / `Hide Plan` | the button's own word `Show` / `Hide`; accessible name `Show the Plan settings` / `Hide the Plan settings` |

---

## 12. Copy

Every string. Sentence case, English, no exclamation marks, no emoji, no symbol standing in for a
word.

### 12.1 Shell

| Place | Copy |
|---|---|
| App name | `Watercolourlove` (`Tintmap` in the native shell — `APP_NAME` unchanged) |
| Tagline (≥64rem) | `Find the main colours in a photo and mix them from your watercolours.` |
| Notice dismiss | `Hide` |
| Tabs, mix mode | `Colours` · `Recipe` · `Settings` · `Source` |
| Tabs, layer mode | `Layers` · `Spot` · `Settings` · `Source` |
| Tabs, walk open | `Layers` · `Step` · `Settings` · `Source` |
| Tab with a waiting selection | `Recipe 12` · `Spot` · `Step 3` |
| Footer | `Manual` · `Privacy` · `Terms` · `Imprint` · `Privacy settings` |

The fourth tab is `Source`, not `Photo`. On one screen the current build uses `Photo` for the file
actions, for a view option (`Photo`) and inside a second view option (`Photo colour`), and the tab
and the view sit about 100 px apart. The view options are the painter's language and keep their
names; the tab is renamed.

### 12.2 Stage and Source

| Element | Copy |
|---|---|
| Source group titles | `This picture` · `Start over` |
| Source actions | `Save` · `Collection` · `Print / PDF` · `New photo` · `Take photo` · `Sample` |
| Saved state | `In collection` |
| Source statuses | `A new photo replaces the plan on screen.` · `Nothing to print yet.` · `Saving pictures is part of the paid plan.` |
| Fit toggle | `Full size` when fitted, `Fit` when at full size |
| Detail frame | `Pick a detail`; while armed, `Cancel` |
| Framing banner | `Drag a frame over the part you want, or tap once to place one.` |
| Framing banner, small canvas | `Drag the frame over the part you want.` |
| Frame placed | `Use this detail` · `Cancel` |
| Frame too small | `That frame is too small. Make it at least a third of the picture.` |
| Walk opener / closer | `Paint step by step` · `Close the walk` |
| Busy | `Analysing…` · `Planning layers…` |
| Photo failed | `The photo could not be loaded.` |
| View options, mix | `Mixed paint` · `Photo colour` · `Photo` · `Sketch` |
| View options, layer | `Layered paint` · `Photo` · `Sketch` |
| Show button (phone) | `Show: Mixed paint` |
| Show sheet title | `Show` |
| Toggles | `Outlines` · `Numbers` · `Guides` |
| Guides caption (sketch view) | `Quarters and diagonals, to transfer the sketch to paper.` |
| Close-up bar | `Detail 2` · `Back to the whole picture` |
| Close-up item | `Detail 2` · `Detail 2 · showing` · `Remove` |

### 12.3 Plan

| Element | Copy |
|---|---|
| Title | `Colours` / `Layers` |
| Count, mix | `20 colours in 12 mixes` (singular `1 colour in 1 mix`) |
| Count, layer | `5 layers and 2 accents, 11 steps to paint` |
| Actions | `Paint box` · `Show all layers` (disabled when all are shown) · `Paint step by step` (phone, layer mode) |
| Wash key, mix | `W very watery · L light · M medium · R rich · C concentrated` |
| Swatch note, layer | `Swatches are one stroke on white paper, estimated from a single sample. Test the wash on a scrap first.` |
| Mix row name | `1 x 663 Sepia brown + 2 x 485 Indigo` |
| Mix row meta | `4 washes · 23% of image · changed by hand` |
| Mix row, one wash | `medium · 23% of image` |
| Mix row, no paints | `Paper white` |
| Layer row name | `663 Sepia brown · 1:4 with water, like tea` |
| Layer row meta | `3 coats · 23% of image · for the darks · alone it brings the picture 1.2 closer` |
| Layer group title | `Accents, painted last` |
| Row states in the meta | `selected` · `painting now` · `painted` · `Not needed for this picture` |
| Painted tick | `Painted` |
| Note | `Tap a layer to see it alone, and again to show all layers. Tap a coat to open the step that paints it. Ticks only change what the picture shows — change the paints in the paint box.` |
| Recompute line | `18 of your 20 colours were kept. 2 could not be matched after this change and went back to the photo colour.` |
| Unused paints (auto) | `Not needed for this picture: 485 Indigo.` |
| Unused paints (by hand) | `No layer for 485 Indigo: it adds too little here. Swap it in the paint box.` |
| Out of reach | `14% of the picture is out of reach of these paints. Compare with Photo, or swap a paint.` |
| Empty, mix | `No paints selected in the paint box.` + `Open paint box` |
| Empty, layer | `No base paints chosen. Open the paint box and pick up to 8, or let the app choose.` + `Paint box` · `Choose for me` |

### 12.4 Detail

| Element | Copy |
|---|---|
| Title | `Colour 7` / `This spot` |
| Clear | `Clear selection` |
| Captions, mix | `Photo colour` · `Your mix · 1:4 with water` |
| Captions, layer | `Photo` · `Layered` |
| Match line | `Match: good · distance to the photo 4.2` |
| Actions | `Change colour` · `Back to photo colour` · `Edit only the tapped area` |
| Subtitle, mix | `Recipes` |
| Subtitle, layer | `Layers on this spot` |
| Washes row | `L · light · 1:4 with water · 12% of image` |
| Chosen recipe | `Chosen` |
| Shared washes | `Same mix as 7L, 7M — only the amount of water differs.` |
| No recipes | `No paints selected in the paint box.` |
| Spot unpainted | `Leave the paper white.` |
| Spot skipped layers | `Not painted here: 2, 5.` |
| Spot note | `Tap a layer to open the step that paints it.` |
| Empty, mix | `Nothing selected. Tap an area in the picture, or a colour in the list.` |
| Empty, layer | `Nothing selected. Tap a spot in the picture to see its layers.` |

### 12.5 Setup

Hints are one paragraph per group, dismissible. Statuses are facts and always visible.

| Group | Hint (one paragraph, dismissible) |
|---|---|
| `Method` | `Mix: every area gets one mixed colour, painted once. Layer: a few thin washes, each painted over the dry one before.` |
| `Plan` | `Colours sets how many mixed colours the plan has — more means more detail and more mixes to prepare. Variety at 0 keeps the picture as close to the photo as it can; at 10 a small area of another hue may keep its own mix. Max. paints is how many paints one mix may use, Max. coats how often one wash may be painted over itself. Layers and Accents only apply in layer mode: accents are small strong touches painted last.` |
| `Shapes` | `Organic areas follow the outlines in the photo. Geometric areas are shapes with straight edges, laid over each other from large to small. A higher Simplify gives fewer and bigger shapes to paint.` |
| `Photo` | `The plan is worked out from the photo with these two values applied, not from the original. Reset puts both back to the photo as it is.` |
| Hints control | `Hide hints` / `Show hints` |
| Fold control | `Hide` / `Show` |

| Control | Label | Status (always visible) |
|---|---|---|
| segmented | `Method` | — |
| slider 2–32 | `Colours` | — |
| slider 0–10 | `Variety` | — |
| slider 2–8 | `Layers` | `Chosen by hand. Auto in the paint box picks again.` / `Chosen by the app.` |
| slider 0–3 | `Accents` | — |
| segmented 1/2/3 | `Max. paints` | `Applies at once, without re-analysing the photo.` |
| segmented 1/2/3 | `Max. coats` | — |
| button | `Paint box` | `54 paints selected.` / `7 of 8 base paints chosen.` |
| segmented | `Areas` | — |
| slider 0–10 | `Simplify areas` | — |
| slider 0–200 | `Saturation` | value `200%` |
| slider 50–200 | `Contrast` | value `100%` |
| button | `Reset saturation and contrast` | disabled while both are 100 |
| group `More` | `AI help` · `Account` · `Privacy settings` + footer links (phone) | — |

`Variety` replaces `Details`. `Details` named three things at once in this app — the variety slider,
a close-up (`Detail 2`, `Pick a detail`) and the AI's "details to keep" — and that is one too many.
After the rename, `Detail` means a close-up of the picture and nothing else. The copy that moves with
it: the group hint above, `control__label`, the AI dialog's `Details to keep` (unchanged, it is the
AI's own word for subject matter), and `docs/backlog.md` if it names the slider.

### 12.6 Errors and busy

| Case | Where | Copy |
|---|---|---|
| Analysis failed | `app__notice` (`role="alert"`) and `plan__status` | `analysis.error` |
| Photo failed to load | `app__notice` and `picture__readout` | `analysis.error` · `The photo could not be loaded.` |
| Collection failed | `app__notice` and `source__status` | `collection.error` |
| Account failed | `app__notice` and the account dialog | `account.error` |
| AI failed | `app__notice` and above the ask button | `analysis.aiError` |
| Nothing to print | `source__status`; `Print / PDF` disabled | `Nothing to print yet.` |
| Free plan, save | `source__status`; `Save` enabled, raises the plan dialog | `Saving pictures is part of the paid plan.` |
| Free plan, ninth paint | `paintbox__count`; the chip reads `Pro` | `8 of 54 — the free plan allows 8` + `More paints` |

---

## 13. Destructive actions and the confirm pattern

Round 1 defined `--c-danger` and `button--danger` and then defined no confirmation anywhere, so a
builder would have shipped none, with `New photo` and `Sample` eight pixels from `Save` above the
picture the painter taps all day.

`confirm` is one block on the shared `dialog--text` chrome. It is raised by `pro`-style
imperative code from the component that owns the action; it never appears without a user gesture.

```
dialog--text
  dialog__head    confirm title            (no Close button: the two buttons are the only exits)
  dialog__body    confirm__text            what is lost, in plain words
  dialog__foot    confirm__cancel (quiet, 56 px, autofocus)   <- 24 px gap ->   confirm__go (danger, 56 px)
```

`Cancel` is the safe default: it has focus on open, it answers `Escape`, and it answers a tap on the
backdrop. The two buttons are 24 px apart, not 8.

| Action | Raised when | Title | Text | Primary |
|---|---|---|---|---|
| `New photo` | the plan has hand-changed colours or a close-up that is not saved | `Replace this picture?` | `Your plan for "Meadow" has 3 colours you changed by hand. Loading another photo throws them away. Save it first if you want to keep it.` | `Replace the picture` |
| `Sample` | same | `Load the next sample?` | same, with `the next sample photo` | `Load the sample` |
| `Delete box` | always | `Delete the box "Travel set"?` | `The box and which paints are in it are deleted on this device. The paints themselves stay.` | `Delete the box` |
| `Delete` in the collection | always | `Delete "Meadow" from the collection?` | `The saved picture and its plan are deleted on this device. This cannot be undone.` | `Delete the picture` |
| `Clear` in the paint box | always | `Take every paint out of the box?` | `Nothing will be selected, and the plan will have no paints to mix from until you pick some again.` | `Clear the box` |
| `Forget key and consent` | always | `Forget the API key?` | `The key and your consent are removed from this device. The answer already on screen stays.` | `Forget the key` |
| `Delete account` | always | `Delete your account?` | `Your account, your plan and everything saved in it are deleted. This cannot be undone.` | `Delete the account` |

`Save`, `Print / PDF`, `Collection`, `Revert` and `Auto` never raise a confirmation: none of them
loses work. `Revert` and `Auto` are in the dialog foot with `Update mixes`, and nothing is lost until
`Update mixes` is tapped.

---

## 14. Accessibility

### 14.1 The plan row: tags and names

Three interactive things can sit in one plan row — the `Show` tick, the row, and the bar segments —
so the row cannot be a button containing buttons. `LayerList.vue` already solves this today and the
solution is kept rather than thrown away.

```html
<li class="plan__item plan__item--selected">
  <label class="plan__tick">                      <!-- layer mode only, outside the row button -->
    <input type="checkbox" checked>
    <span class="plan__tick-text">Show</span>     <!-- visible word -->
    <span class="visually-hidden">layer 3, 663 Sepia brown, in the picture</span>
  </label>
  <button class="plan__row" type="button" aria-pressed="true">
    <span class="plan__number">7</span>
    <span class="plan__swatch" role="img" aria-label="Base colour of mix 7"></span>
    <span class="plan__name">1 x 663 Sepia brown + 2 x 485 Indigo</span>
    <span class="plan__meta">4 washes · 23% of image · selected</span>
  </button>
  <div class="plan__sub">                         <!-- selected row only, outside the row button -->
    <div class="plan__bar" role="img"
         aria-label="Ratio: 1 part 663 Sepia brown to 2 parts 485 Indigo"></div>
    <ul class="plan__washes">
      <li><button class="plan__wash" type="button" aria-pressed="false">L</button></li>
    </ul>
    <label class="plan__painted"><input type="checkbox"><span>Painted</span></label>
  </div>
</li>
```

| Element | Tag | Accessible name | State |
|---|---|---|---|
| `plan__list` | `ul` | `Colours in this plan` / `Layers in this plan` | — |
| `plan__item` | `li` | — | — |
| `plan__row` | `button` | `Colour 7, 1 part 663 Sepia brown plus 2 parts 485 Indigo, 23 percent of the image, 4 washes` | `aria-pressed` for selected |
| `plan__row` (layer) | `button` | `Layer 3, 663 Sepia brown, 1 to 4 with water, 3 coats, 23 percent of the image` | `aria-pressed` for solo; `aria-current="step"` for the walk's current layer |
| `plan__tick` | `label` + `input` | `Show layer 3, 663 Sepia brown, in the picture` | `checked` |
| `plan__swatch` | `span` | `role="img"`, `Base colour of mix 7` / `Layer 3 as one stroke on white paper` | — |
| `plan__bar` | `div` | `role="img"`, `Ratio: 1 part 663 Sepia brown to 2 parts 485 Indigo` | — |
| `plan__wash` | `button` | `Wash L, light, 1 to 4 with water, 12 percent of the image` | `aria-pressed` |
| `plan__coat` | `button` | `Coat 3 of layer 2: open the step that paints it` | `aria-current="step"` |
| `plan__painted` | `label` + `input` | `Colour 7 is painted` | `checked` |
| `detail__recipe` | `button` | `Recipe 2 of 5: 1 part 663 Sepia brown plus 2 parts 485 Indigo, distance 2.1` | `aria-pressed` for chosen |
| `app__tab` | `button` | the label, including `Recipe 12` when a selection waits | `aria-current="page"` |
| `segmented__option` | `button` | the label | `aria-pressed` |

### 14.2 Live regions

- `picture__readout`: `aria-live="polite"`, `aria-atomic="true"`. It carries the busy state, the
  selection and the hover, so a non-sighted user learns that a tap landed and on what.
- `stage` has no separate status slot any more; `Analysing…` is the readout's top precedence.
- `app__notice`: `role="alert"`, so an error announces itself without the user hunting for a tab.
- `plan__status` (the recompute line): `aria-live="polite"`.
- Nothing else is a live region. Three polite regions on one page is already the limit of useful.

### 14.3 Focus order

Per breakpoint, DOM order equals visual order, which is what makes this cheap:

- phone: `app__bar`, `app__notice`, `stage__bar`, `picture__canvas`, `picture__readout`
  (not focusable), the active tab panel, `app__tabs` (in walk mode, `walk__nav` is inside the
  panel, just before the tabs).
- tablet: `app__bar`, `app__notice`, `stage__head`, `viewbar`, `stage__bar`, the canvas,
  `closeup`, the left column (`detail`, `plan`), the right column (`source`, `settings`),
  `app__footer`.
- wide / desktop: as tablet, with the rail in the order `source`, `detail`, `plan`, `settings`.

`picture__canvas` is reachable by keyboard (`tabindex="0"`) and `Enter` selects the area under a
visible cursor marker; this is an extra path, not the only one.

### 14.4 Dialogs

`<dialog>` with `showModal()`, as today. Focus moves to `dialog__title` (`tabindex="-1"`) on open and
**returns to the element that opened it** on close — the opener is stored in a local ref in the
component that calls `showModal()`. Focus is trapped by the element. `Escape` closes, which is what
`Cancel` does in `confirm`. `dialog__body` has `overscroll-behavior: contain` so the page behind does
not scroll.

### 14.5 Other

- `visually-hidden` is defined once in `scaffold.css` (clip-path, 1 px, not `display: none`).
- Every `switch`, `segmented` and `slider` has a programmatic label; no control is labelled by
  position alone.
- Colour is never the only carrier of state: section 7.2's last three rows and section 9.6's state
  list say what else carries it in each case.
- `prefers-reduced-motion` is honoured (section 6.3). `prefers-contrast: more` raises `--c-border`
  to `--c-border-strong` and `--c-copy-light` to `--c-copy`.

---

## 15. State, recompute and persistence

### 15.1 Hand-changed colours survive a slider, visibly

`src/stores/analysis.js:807-811` re-attaches an override by matching `group` and `letter` and
silently drops what it cannot match. Overruling the maths is the whole reason the painter is here, so
the behaviour is stated and reported rather than left to be discovered.

- Group `Plan`'s hint ends with: `Colours you changed by hand are carried over when the plan is
  worked out again, as long as the colour is still in the plan.`
- After every recompute that had overrides to carry, `plan__status` reports the outcome, once, until
  the next recompute: `18 of your 20 colours were kept. 2 could not be matched after this change and
  went back to the photo colour.` If all were kept: `All 20 colours you changed by hand were kept.`
- A row whose override survived keeps `changed by hand` in its meta.
- No store API changes: the message is derived in the component from the entry list before and after,
  using the existing `overridden` flag.

### 15.2 Sliders and steppers commit on idle

Round 1 said steppers "fire the same `change` handler as the slider, so the analysis re-runs once per
tap" and called that a feature. Taking `Colours` from 2 to 20 is eighteen worker runs on an iPad, with
the busy rule refusing to disable anything. The rule, which is also what makes tap feedback immediate:

- The value and `control__value` update **synchronously** on every tap and on every drag frame.
- `analyse()` is called **400 ms after the last change**, whether the change came from a drag, a tap
  on a stepper, or a key. One idle, one run.
- `picture__readout` shows `Analysing…` only when a run actually starts, not while the debounce is
  pending. A pending change shows nothing — the number has already moved, which is the feedback.
- `Max. paints` keeps today's cheaper path (`autoPaints` + `recomputeAllRecipes`) and carries the
  status line `Applies at once, without re-analysing the photo.`, so the difference in behaviour is
  stated rather than invisible.

### 15.3 What is remembered, and in which existing key

Store APIs may not change. The `layout` store already has a general persisted map with a generic
setter: `layout.move(name, position)` writes `positions[name]` and persists the whole object, and
`layout.toggle(name)` writes `collapsed[name]`. Both are reused, with documented keys, and
`floating.js` stops being the only writer of `positions`.

| What | Key | Written by |
|---|---|---|
| a folded settings group | `collapsed.method`, `.plan`, `.shapes`, `.photo` | `layout.toggle()` |
| a dismissed group hint | `collapsed['hints:method']`, `['hints:plan']`, `['hints:shapes']`, `['hints:photo']` | `layout.toggle()` |
| the walk's position | `positions.walk = { step: 7 }` | `layout.move('walk', …)` |
| which plan rows are painted | `positions.painted = { '7': true, 'A1': true }` | `layout.move('painted', …)` |
| the phone's active tab | **not persisted**; it resets to `Colours` / `Layers` on load |

`positions` keeps its name because renaming it is a store API change. A migration note says so, and
old `positions` entries written by `floating.js` (component names as keys) are ignored by the new
readers, which look only for `walk` and `painted`.

The walk reopens where it was left: on load, if `positions.walk.step` is a valid index into
`analysis.layers.steps`, the plan header's `Paint step by step` reads `Back to step 8 of 11` and one
tap resumes. Eleven steps take an afternoon with drying between them; the app should know where the
afternoon got to.

---

## 16. Print

The printed sheet is the only artefact that survives a wet studio, and round 1 spent no paragraph on
it.

- Type is pinned inside `@media print` (section 4.2), so the sheet is 14 px body whatever the screen
  ramp says and whatever the root font size is.
- `src/css/legend.css` and `src/css/layersheet.css` contain **zero** `rem` values today, so dropping
  the `html { font-size: 10px }` override cannot change them. Their sizes stay in px and mm.
  `@page { margin: 12mm }` stays.
- `display: none` in print: `app__bar`, `app__tabs`, `stage__bar`, `viewbar`, `picture__readout`,
  `closeup`, `settings`, `source`, `app__footer`, `app__notice`, every dialog, the consent banner.
  What prints: the picture, then the legend (mix mode) or the layer sheets (layer mode).
- `PrintLegend.vue` gains three things it needs and does not have:
  1. the wash key, printed once at the head of the legend: `W very watery · L light · M medium ·
     R rich · C concentrated`;
  2. the water ratio and the consistency word on each row, the same string as `plan__name`
     (`1:4 with water, like tea`);
  3. a blank 6 mm box with a 0.3 mm rule beside every number, to tick off what is painted.
- `LayerSheets.vue` gains the same tick box per step, and its `Then` line keeps `let it dry
  completely.`
- The legend's numbers are `--ff-copy` with `tabular-nums`, 14 px, which is what they are today.

---

## 17. CSS structure

Flat, cascade-ordered, no `base/ components/ layouts/` folders, no underscore prefixes. Entry
`src/css/site.css`:

```css
@import "reset.css";
@import "fonts.css";          /* @font-face, woff2 from /fonts/ */
@import "properties.css";     /* every token, light and dark, the ramp inside :root */
@import "typography.css";     /* the roles of section 8 */
@import "scaffold.css";       /* html 62.5%, body, box-sizing, .visually-hidden, dialog scroll lock */
@import "animations.css";     /* the one @keyframes the busy state uses */
@import "header.css";         /* app__bar */
@import "footer.css";         /* app__footer */
@import "forms.css";          /* input, select, switch, slider, segmented */
@import "tables.css";         /* the layer sheet table */
@import "ui.css";             /* button, card, link, plate, focus ring */
@import "components.css";
@import "print.css";          /* last, so its type block wins over the ramp */
```

`components.css` imports, in this order: `app.css`, `tabs.css`, `notice.css`, `stage.css`,
`picture.css`, `viewbar.css`, `showsheet.css`, `walk.css`, `closeup.css`, `plan.css`, `detail.css`,
`source.css`, `recipe.css`, `chip.css`, `swatch.css`, `settings.css`, `control.css`, `dialog.css`,
`paintbox.css`, `collection.css`, `ai.css`, `pro.css`, `account.css`, `gate.css`, `consent.css`,
`confirm.css`, `legend.css`, `layersheet.css`.

`src/main.js` imports `./css/site.css`. `src/css/main.css`, `base/`, `layouts/` and every
`components/_*.css` are deleted.

---

## 18. Migration notes per file

| File | What happens |
|---|---|
| `index.html` | Remove the emoji favicon data URI; link `public/favicon.svg` (section 8). Keep the viewport line with `viewport-fit=cover`. |
| `src/main.js` | Import `./css/site.css`. |
| `src/App.vue` | Becomes the shell: `app__bar`, `app__notice`, `app__main` with `app__stage` / `app__panels` or `app__rail`, `app__tabs` (phone), `app__footer`, the dialogs. The `hint` computed property becomes `picture__readout` content and moves into the stage. The two template branches on `analysis.layerMode` for sidebar contents disappear: the rail always renders `SourceCard`, `DetailCard`, `PlanList`, `SettingsPanel`. Add `activeTab` local state (`'plan' \| 'detail' \| 'settings' \| 'source'`, default `'plan'`), used only below 48rem. Add `notice` local state fed by `analysis.error`, `collection.error`, `account.error`. |
| `PaintingCanvas.vue` becomes `StagePicture.vue` | Drawing code unchanged: keep `SCALE`, `regionAtCanvasPixel`, `drawMixes`, `drawLayers`, `drawSketch` exactly as they are. Delete both `painting__zoom` buttons and their SVGs and the absolutely positioned `painting__status`. Delete `RecipeTip`; `onMove` writes to a `readout` ref. Add the tap-to-place frame, the 144 px minimum, the outside handles and the small-canvas fallback (section 6.2). Remove both `title` attributes. |
| New `StageBar.vue` | The one non-wrapping 48 px row of section 9.2, with the phone and tablet variants. |
| New `StageHead.vue` | Image name and `In collection`, ≥48rem only. |
| New `ViewBar.vue` | The view `segmented` plus `Outlines` / `Numbers` / `Guides`, ≥48rem; lifted out of `ControlsPanel`. |
| New `ShowSheet.vue` | The phone sheet of section 9.4, on the shared `dialog` chrome. |
| New `SourceCard.vue` | The image name, the two action groups of section 9.8, `collection.error`, the close-up strip on phone. Takes the top block of today's `ControlsPanel`. |
| `ControlsPanel.vue` becomes `SettingsPanel.vue` | Keeps only the four groups plus `More`. The photo actions, the view switch, the toggles and the AI block leave. Every `title=` is removed per section 11. `@dblclick` reset deleted; `Reset saturation and contrast` is a button. `controls__settings` (3 columns) and `controls__pair` (2 columns) are deleted. Add `settings__nav` (phone) and the per-group hint with its `Hide hints` button. |
| New `ControlSlider.vue` | label, value, minus, range, plus. Props `label`, `modelValue`, `min`, `max`, `step`, `unit`, `status`, `disabled`. Emits `update:modelValue` and a debounced `commit` (section 15.2). |
| New `ControlSegment.vue` | label, options, status; the same markup for `Method`, `Areas`, `Max. paints`, `Max. coats`. |
| `AiPanel.vue` becomes `AiDialog.vue` | Same content and copy, on the shared `dialog` chrome, opened from Setup group `More`. `analysis.setAi()` stays where it is. The two `choice.title` strings become `ai__hint`. |
| `PaletteList.vue` + `LayerList.vue` becomes `PlanList.vue` | One component, a `layerMode` branch for row data only. The `mixes` and `rows` computed properties move in unchanged. `palette__*` and `layers__*` class names become `plan__*`. Keep the `aria-pressed` button inside the `li`, the checkbox outside it and `role="img"` on the bar. The wash and coat bars render only for the selected row. Add `plan__painted` and `plan__status`. Remove six `title` attributes. |
| `EntryEditor.vue` + `LayerArea.vue` becomes `DetailCard.vue` | One component, two branches, one empty state. `useFloating` removed. The `scrollIntoView` watcher stays and targets the card in flow. Add `detail__washes` and `detail__match`. Remove two `title` attributes. |
| `floating.js` | Deleted. `layout.positions` is repurposed per section 15.3; the store is untouched. |
| `RecipeTip.vue` | Deleted. Its information is in `picture__readout` and `DetailCard`. |
| `RecipeLine.vue` | Kept. `full` is used by the detail card, `wide` by print. All bar text becomes a `plate`. Remove three `title` attributes. |
| `PaintChip.vue` | Kept. `description` stops feeding a `title` and feeds `paintbox__readout` through an emit; the chip gains its second plate line. `min-height: 6.4rem`. Add `chip--locked`. |
| `LayerSteps.vue` becomes `WalkPanel.vue` | Kept as a component; rendered in the stage at ≥48rem and in the `Step` tab on phone. The three `v.title` strings become `walk__hint`. The keyboard handler stays. `Previous` / `Next` sticky on phone. Reads and writes `positions.walk`. |
| `LayerStrip.vue` | Deleted. The plan list is reachable at every breakpoint. |
| `LayerSheets.vue` | Token names, `tables.css`, and the tick box of section 16. |
| `PrintLegend.vue` | The three additions of section 16. Must keep working. |
| `PaintBox.vue` | Content kept; wrapped in `dialog`; adds `paintbox__filter`, `paintbox__count`, `paintbox__readout`, `chip--locked`; the actions split into `dialog__head` (`Close`) and `dialog__foot` (`Update` / `Auto` / `Revert` / gap / `Clear`); `Delete box` separated by 24 px; `Clear` raises `confirm`. Remove two `title` attributes. |
| `CollectionDialog.vue` | On `dialog`; names wrap instead of truncating; `Delete` raises `confirm`. Remove two `title` attributes. |
| `ProDialog.vue`, `AccountDialog.vue` | On `dialog--text`; buttons to 48/56 px; `Delete account` raises `confirm`. |
| `AccountGate.vue` | Card at `--article-width`; the two statements become `switch` rows; `Continue` 56 px. |
| `ConsentBanner.vue` | Content unchanged; above the tab bar on phone; 48 px buttons. |
| `CloseupBar.vue` + `CloseupStrip.vue` becomes `CloseupTray.vue` | One component: the bar when a close-up is open, the strip when there are any. The 22 px cross becomes a 48 px `Remove` word button. Remove two `title` attributes. |
| `PanelToggle.vue` becomes `FoldButton.vue` | 48 px, the words `Hide` / `Show`, no SVG. Keys in `layout.collapsed` become `method`, `plan`, `shapes`, `photo`. Remove one `title` attribute. |
| New `ConfirmDialog.vue` | Section 13. One component, props `title`, `text`, `primary`; emits `confirm` and `cancel`. |
| `src/css/main.css`, `base/*`, `layouts/*`, `components/_*.css` | Deleted and replaced by section 17. No file keeps an underscore prefix. `--font-size`, `--good` and `--fair` disappear; `--rough` becomes `--c-danger`. |
| `src/stores/*`, `src/lib/*`, `src/workers/*` | **Not touched.** The only store usage that changes is which keys `layout.collapsed` and `layout.positions` hold. `contrastText()` and `chipStyle()` stay; the CSS stops reading `--chip-ink` (section 7.2). |

---

## 19. The brief's inventory, and where each item lives

| Feature | Where |
|---|---|
| Load photo | `source`, group `Start over`, `New photo` |
| Take photo | `source`, group `Start over`, `Take photo` (coarse pointer only) |
| Next sample | `source`, group `Start over`, `Sample` |
| Save to collection | `source`, group `This picture`, `Save` |
| Open collection, rename, delete | `source`, `Collection`, then the collection dialog |
| Print and PDF | `source`, group `This picture`, `Print / PDF` |
| Method Mix / Layer | Setup, group `Method` |
| Areas Organic / Geometric | Setup, group `Shapes` |
| Simplify | Setup, group `Shapes`, `Simplify areas` |
| Colours | Setup, group `Plan` |
| Variety (was `Details`) | Setup, group `Plan` |
| Max. paints | Setup, group `Plan` |
| Layers | Setup, group `Plan` (layer mode) |
| Accents | Setup, group `Plan` (layer mode) |
| Max. coats | Setup, group `Plan` (layer mode) |
| Saturation, Contrast | Setup, group `Photo` |
| Reset of both | Setup, group `Photo`, `Reset saturation and contrast` |
| View switch | `viewbar` at ≥48rem; the Show sheet on phone |
| Outlines, Numbers | `stage__bar` at ≥48rem; the Show sheet on phone |
| Guides | with the toggles, sketch view only |
| Fit / Full size | `stage__bar` at ≥48rem; the Show sheet on phone |
| Select an area and see its recipe | tap the picture, then `detail` (phone: `Recipe` tab) |
| Change a colour | `detail`, `Change colour` |
| Reset to photo colour | `detail`, `Back to photo colour` |
| Edit only the clicked area | `detail`, `Edit only the tapped area` |
| Alternative recipes | `detail`, `Recipes` |
| The colour list with washes | `plan` rows; the wash bar on the selected row; every wash with its dilution in `detail__washes` |
| Solo a layer | `plan`, tap the row |
| Tick layers | `plan`, the row's `Show` checkbox |
| Coats | `plan`, the coat bar on the selected row |
| The spot card | `detail` in layer mode (phone: `Spot` tab) |
| The step walk | `Paint step by step` in `stage__bar` (≥48rem) or the plan header (phone), then `walk` |
| Paint box: selection, pans, tubes, Auto, All/Invert/None, boxes, own paints, P/T | paint box dialog, from the plan header and from Setup group `Plan` |
| Close-ups: frame, thumbnails, return, remove | `Pick a detail` in `stage__bar` / `source`; `closeup` tray |
| AI: provider, model, key, consent, cost, ask, notes, forget | AI dialog, from Setup group `More` |
| Account: sign in, plan, export, delete | account dialog, from Setup group `More` |
| Plan dialog | raised by `pro.require()` |
| Consent banner | fixed at the bottom, above the tab bar on phone |
| Footer links | `app__footer`; on phone in Setup group `More` |

Nothing in the inventory is unaccounted for. Three things are removed as *components* with their
function kept: the floating recipe panel (function in `detail`), the pointer tooltip (function in
`picture__readout` and `detail`), and the four icon-only controls (function in words, section 10).
One component is removed outright, `LayerStrip.vue`, because the structure makes it redundant.
Nothing in the inventory moves below the second level.

---

## 20. Acceptance criteria

A build of this specification passes when all of these are true on a real device.

1. On an iPhone, at every scroll position, in both modes and with the walk open or closed, the
   picture is visible without scrolling, and the panel region shows at least 240 px of content
   (176 px on a 667-tall phone). Measured against the tables in section 5.1.
2. On an iPad in portrait and in landscape the sticky stage block is shorter than the viewport at
   every height in section 5.2 and 5.3, so it never stops sticking, and the panels below it have at
   least 240 px visible at rest in portrait.
3. No layout overflows its viewport at 320, 375, 390, 414, 667-tall, 768, 820, 844-tall, 1024, 1180,
   1280 and 1440 px, in both themes, in both modes, in portrait and landscape.
4. No label overlaps another at any of those sizes. `Saturation` and `Contrast` are on separate rows
   with their values in their own cells.
5. Every interactive element measures at least 48 × 48 px in the browser's layout box, primary
   actions at least 56 px tall, neighbouring targets at least 8 px apart, and a destructive button at
   least 24 px from a safe one.
6. Every colour pair in section 7.2 measures what the table says, and no text pair is under 4.5:1 and
   no control-edge pair under 3:1. The dark-mode primary button measures 13.73:1.
7. No text is drawn directly on a paint colour anywhere; every such label sits on a `--c-plate` plate
   at `--fs-small` or larger.
8. `grep -rn "<svg" src/components/` returns nothing. `grep -rn "title=" src/components/` returns
   nothing. No emoji and no symbol used as an icon exists in the markup, the CSS or the copy.
9. `grep -rn "border-left\|border-inline-start" src/css/` returns exactly one hit: the `segmented`
   option divider at 1 px, which is a divider inside one control, never an accent on a container.
   The only other directional rules in the design are `plan__number`'s 1 px `border-inline-end`
   (a column rule inside a row) and the 3 px `inset box-shadow` under an active segment and over an
   active tab, both of which are declared in sections 9.6, 9.10 and 9.1.
10. `grep -rn "rem" src/css/components/` returns nothing; every size comes from a token.
11. Nothing requires a double-click, a long press, a hover or a precise drag. A close-up can be made
    with single taps at every canvas size, and the handles never cover the frame.
12. Every slider can be set to an exact value with its steppers alone, and moving a slider from one
    end to the other queues exactly one analysis.
13. Every panel has one home per breakpoint. The only `position: fixed` elements are the phone app
    bar, the phone tab bar and the consent banner; dialogs use the top layer.
14. Every store-level error reaches `app__notice` with `role="alert"`, whichever tab is open.
15. A screen reader reads a plan row as section 14.1's name pattern, announces `Analysing…` and
    announces a selection. Focus returns to the opener when a dialog closes.
16. The print sheet and the layer sheets render at 14 px body type with the wash key, the water
    ratios and a tick box, in Chrome, Safari and Firefox.
17. `src/stores/**`, `src/lib/**` and `src/workers/**` are unchanged, and the app's behaviour in
    `npm test` is unchanged.

---

## 21. Answer to every `mustFix` of both critiques

So that nothing is silently dropped.

### Painter

| # | Answer |
|---|---|
| 1 | Phone budget rebuilt from pixels. Three bands became one (`stage__bar`), the view switch and the toggles went into the Show sheet, the canvas is capped at 36 svh **and** by a 240 px panel floor, and section 5.1a gives the sums for 734, 702, 553 and 763. Section 5.1b proves the recipe fits. |
| 2 | Phone landscape sized from the column, not the viewport: section 5.1d, with the app bar dropped, 48 px tabs, the readout moved into the panel column and a 320 px total that adds up. |
| 3 | `--c-corporate-ink` added (light `#ffffff`, dark `#1a1714`), measured at 15.76:1 and 13.73:1; `--c-danger-ink` likewise. Section 7.2 measures every ink-on-fill pair, not only text-on-surface. |
| 4 | `plan__swatch` is 4.8rem wide and the full row height (≥ 48 × 56), on a white plate, with its own grid column; `detail__field` is 80 px (60 px on a short phone); nothing coloured within 16 px; and both say in writing that the mix is drawn at wash strength on white paper, not at masstone. |
| 5 | Inverted. Selection renders the same recipe string as hover (section 9.3), and `tap again to clear` is gone — clearing is the `Clear selection` button in the detail card. |
| 6 | Phone walk specified and budgeted: section 5.1c. 26 svh canvas, the readout dropped, `Previous` / `Next` pinned above the tabs, and `Then: let it dry completely.` inside the first 164 px at every phone height. |
| 7 | Section 13: one confirm pattern, `Cancel` as the focused safe default, seven named actions that raise it, and the destructive photo actions split into their own `Start over` group 24 px from `This picture`. |

### UX critic

| # | Answer |
|---|---|
| 1 | Same as painter 1. Only the app bar, the stage bar, the canvas and a one-line readout are sticky; the view bar is not on the phone at all. The number is computed, not estimated. |
| 2 | Fixed at both tablet breakpoints: the app bar is in flow at ≥48rem, `stage__head` and the close-up strip are outside the sticky block, `--stage-chrome` is a single token (160 px) per breakpoint, the canvas is computed from it, and the sticky block is capped at 60 svh in portrait and 72 svh in landscape so it can never exceed the viewport. Sections 5.2 and 5.3 show the sums. Phone landscape: section 5.1d. |
| 3 | `--c-corporate-ink` and `--c-danger-ink` added and measured; the false sentence "Everything clears 4.5:1" is deleted and replaced by section 7.2; the active state now reads "one step **toward the surface**", which is correct in both themes. |
| 4 | Wash and coat segments get a 48 px hit area with a 40 px painted band (padding on the button, not the bar), so section 6 and section 20.5 agree. |
| 5 | Section 14: the tag and accessible name of every row element, the checkbox and the bars outside the row button, `role="img"` on both bars, `aria-pressed` / `aria-current`, `aria-live="polite"` on the readout and the recompute line, `role="alert"` on the notice, focus order per breakpoint, and focus return on dialog close. |
| 6 | Resolved by graft 4 plus words: selection is a field **and** a 2 px edge on all four sides **and** a bolder number **and** the word `selected`; `--current` is the words `painting now`; `--muted` is the words `Not needed for this picture` plus a hatched swatch; the tab's waiting selection is the label `Recipe 12`, not a 6 px dot. |
| 7 | `app__notice` is the single home for `analysis.error`, `collection.error`, `account.error` and `analysis.aiError`, with `role="alert"`, a `Hide` button and the owning tab named; a picture-load failure also replaces the readout. |
| 8 | Both have phone homes: the walk is the `Step` tab with a reduced canvas and pinned navigation (5.1c); the close-up strip lives in the `Source` card (9.13) and the open close-up is named in the readout. |

### The `shouldFix` items that changed the design

Adopted: stepper debounce (15.2); the water ratio promoted to the row's primary line (9.6, 12.3); the
plan number at `--fs-hl-small` (7.5, 9.6); the sticky `settings__nav` on the phone plus the honest
statement that Setup is a scroll (2.3, 9.9); the paint box filter, count and the explicit "the plan
does not update behind the dialog" (9.12); hand-changed colours reported after a recompute (15.1);
the close-up strip moved to `Source` (9.13); the fourth tab renamed `Source` (12.1); the printed sheet
given the wash key, the water ratios and a tick box (16); a `Painted` tick and a persisted walk
position (9.6, 15.3); `Variety` (12.5); every `title` string homed (11); text on paint put on a plate
with a size floor (7.2); safe areas written into the values (5.5); the close-up frame's minimum size
and its small-canvas fallback (6.2); the three contradictions settled (`Account` lives only in Setup
group `More`; the image name is `stage__head` at ≥48rem and `source__name` on the phone; the button
is called `Pick a detail` everywhere, and `stage__bar` never wraps); `detail__washes`, `plan__note`
and the banner and readout overflow rules defined (9.3, 9.6, 9.7); the free-plan chip and `Save`
designed (9.12, 12.6); the print ramp pinned (4.2).

Declined, with the reason: the two-column settings layout at ≥64rem is not "fixed", it is **deleted**
— one column at every width, because a rail that scrolls can afford the height and one layout is one
thing to get right. Round 1's open question about replacing the fourth phone tab with a button in the
app bar is also declined: the `Source` card now holds the close-up strip as well as six actions, which
is too much for a bar button, and three tabs would save 93 px of width that four tabs do not need.
