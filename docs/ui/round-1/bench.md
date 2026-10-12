# Round 1 — Studio bench — UX foundation

Team: Studio bench. Round 1 of 5. Author: UX lead.
Binding input: `docs/ui/brief.md`. Code read: `src/App.vue`, `src/components/*`, `src/css/**`,
`src/stores/analysis.js`, `src/stores/paints.js`, `src/stores/layout.js`,
`docs/ui/evidence/phone-settings-2026-10-12.png`, `docs/screenshot.png`.

This round is design only. No file under `src/` was changed.

A note on one character: ` · ` (middle dot) is used as a separator inside meta lines, as the app
already does. It is punctuation, not an icon and not decoration. No other non-alphanumeric
character carries meaning anywhere in this design. All icons are drawn SVG.

---

## 1. Stance and the two risks

The app is a workbench. The painter opens it again and again, knows where things are, and works
with gloved or wet hands next to a sheet of paper. Everything needed while painting stays on one
surface. Density is allowed where it buys speed; it is paid for with strong grouping and quiet
surfaces.

Two risks this specification has to answer, concretely, not in prose:

1. **A control panel that overwhelms.** Today `ControlsPanel.vue` is one box with fifteen controls,
   seven buttons and the whole AI section. The answer is not "fold it away". The answer is that
   controls which belong to the picture (which view, outlines, numbers, guides, steps, detail frame)
   move onto the picture, and the rest is split into five named groups with one control per row and
   a visible hint. Nothing is hidden behind hover.
2. **A phone layout that is the desktop one stacked.** The phone gets its own structure: the picture
   is sticky at the top of the viewport at every scroll position, and the second level is a tab bar
   at the bottom, not a kilometre of scroll. The screenshot
   (`docs/ui/evidence/phone-settings-2026-10-12.png`) shows the failure to beat: the picture is off
   screen, three columns of settings overlap each other, seven buttons take a third of the height.

---

## 2. Information architecture

### 2.1 Four places, and only four

| Place | What is in it | Where it is |
|---|---|---|
| **Stage** | The picture, what is drawn on it, which part of it, the photo it came from | Top on phone and iPad portrait, left on iPad landscape and desktop |
| **Plan** | The list: the colours of a mix plan, or the layers of a layer plan | `Colours` / `Layers` tab on phone, left panel column on iPad portrait, rail on landscape and desktop |
| **Detail** | What is selected: one colour with its recipes, or one spot with its layers | `Recipe` / `Spot` tab on phone, above the plan everywhere else |
| **Setup** | Everything that changes how the plan is computed, plus the doors to the second level | `Settings` tab on phone, right panel column on iPad portrait, below the plan in the rail |

There is no fifth place and no floating window. Every panel has one fixed home at every breakpoint.

### 2.2 One plan model: how mix mode and layer mode become one interface

Today mix mode and layer mode are two parallel sets of components
(`PaletteList` vs `LayerList`, `EntryEditor` vs `LayerArea`, plus `LayerStrip` which exists only
because the layer list sits too far down the page). This design replaces the pair with **one plan**
that has two kinds of row.

> A **plan** is an ordered list of **steps to paint**. In mix mode a step is a mixed colour (a mix
> with its washes). In layer mode a step is a layer (a wash with its coats). Both have: a number, a
> swatch, a paint line, a meta line, and a bar underneath that splits the step into its parts.

The same block (`plan`) renders both. The differences are declared once, here:

| Slot | Mix mode | Layer mode |
|---|---|---|
| Plan title | `Colours` | `Layers` |
| Plan count line | `20 colours in 12 mixes` | `5 layers, 2 accents, 11 steps · match: good` |
| Row leading control | none | `Show` checkbox (24 px box in a 48 px row cell) |
| Row number | mix number, e.g. `7` | layer number `1`…`5`, accents `A1`…`A3` |
| Row swatch | base colour of the mix | the wash on white paper |
| Row name | `1 x 663 Sepia brown + 2 x 485 Indigo` | `663 Sepia brown` |
| Row meta | `4 washes · 23% of image · changed` | `1:4 with water, like tea · 3 coats · 23% · for the darks` |
| Row bar 1 | recipe bar, one segment per paint | none |
| Row bar 2 | wash bar, one button per wash (`W L M R C`) | coat bar, one button per coat |
| Tap on the row | select this mix; the picture shows only its washes | solo this layer; the picture shows only it |
| Tap on a bar segment | select that wash | jump to the step that paints that coat |
| Detail card | `Colour 7` with target, mix, recipes | `This spot` with photo, layered, layers on it |
| Header action | `Paint box` | `Paint box`, `Show all layers` |

Switching the method therefore does not switch the interface. It swaps the contents of the plan
rows, the detail card and three rows in Setup. The layout, the row anatomy, the selection model and
all touch targets are identical. `LayerStrip.vue` disappears because its reason to exist (the layer
list is unreachable while looking at the picture) no longer holds at any breakpoint.

### 2.3 First level and second level

**First level** — on screen or one tap away, on every device, without scrolling past anything:

the picture · fit / full size · pick a detail · the view switch · outlines · numbers · guides (in
sketch view) · the step walk (layer mode) · the plan list · the selected colour or spot with its
recipe · the plan sliders (Colours/Layers, Details/Accents, Simplify, Max. paints/Max. coats) ·
Areas · Saturation · Contrast · the reset of both · the photo actions (New photo, Take photo,
Sample, Save, Collection, Print / PDF) · the door to the paint box.

**Second level** — one tap from the first level, behind a labelled button, never behind hover,
never behind a gesture:

| Second level | Opened by | Kind |
|---|---|---|
| Paint box | `Paint box` in the plan header and in Setup group "Plan" | modal dialog |
| Collection | `Collection` in the photo actions | modal dialog |
| AI help | `Open AI settings` in Setup group "AI help" | modal dialog |
| Account | `Account` in the app bar (phone: end of the Settings tab) | modal dialog |
| Plans and purchase | raised by `pro.require()` as today | modal dialog |
| Privacy settings | footer link (phone: end of the Settings tab) | banner |
| Manual, Privacy, Terms, Imprint | footer links (phone: end of the Settings tab) | pages |

Nothing else is below the first level. In particular: no settings behind an accordion that is
closed by default, and no action that exists only in a context menu, a long press or a tooltip.

---

## 3. The user's path

### 3.1 First run (any device)

1. The app opens with the sample photo already analysed (`analysis.loadSample(true)` stays as it is).
2. The stage shows the picture with numbered areas. The readout line under it reads
   `Tap an area to see its recipe.`
3. The plan shows twenty colours. The detail card shows its empty state:
   `Nothing selected. Tap an area in the picture, or a colour in the list.`
4. One tap on the picture fills the detail card. No panel moves, nothing floats, nothing covers the
   picture.

### 3.2 Planning (desktop or iPad landscape, before painting)

Load a photo in the stage header, set `Colours` and `Simplify areas` in Setup while watching the stage,
open `Paint box`, tick what is on the table, `Update mixes`, then walk the plan list, tap the colours
that look wrong, change one with `Change colour` or pick another recipe in the detail card, then
`Save`, then `Print / PDF`.

### 3.3 Painting, phone at the easel (the case the current build fails)

The painter has the picture on paper and the phone in a stand.

1. Open the app. The picture is at the top, sticky; it never scrolls away.
2. Tap area `12` on the picture. The `Recipe` tab badge lights; tap `Recipe`: the recipe fills the
   panel region under the picture — both are on screen at once.
3. Tap `Colours` to compare the neighbouring numbers; the picture stays where it is.
4. Nothing in this loop needs Settings, so Settings is never in the way.

### 3.4 Painting, iPad landscape (layer mode)

`Paint step by step` in the stage toolbar, then the step bar replaces the view bar under the picture:
`Step 3 of 11`, the wash to mix, where to paint, what to do next, and `Previous` / `Next` as 56 px
buttons. The plan list stays in the rail, with the current layer marked. `Close` returns the view
bar.

---

## 4. Layout per breakpoint

Breakpoints (the house ramp 1024/1280/1440 plus 768, which is needed because iPad portrait is a
primary device):

| Name | Range | Device |
|---|---|---|
| phone | `< 48rem` (768 px) | iPhone portrait and landscape |
| tablet | `48rem – 63.999rem` (768–1023) | iPad portrait |
| wide | `64rem – 79.999rem` (1024–1279) | iPad landscape, small laptop |
| desktop | `>= 80rem` (1280) | laptop and desktop; one more step at `>= 90rem` (1440) |

All vertical measures use `dvh` with a `vh` fallback line before it, because the iOS toolbars move.

### 4.1 Phone (`< 48rem`)

```
+--------------------------------------+  app__bar      3.25rem, position: fixed, top
| Watercolourlove            Account   |
+--------------------------------------+
| Meadow (sample)        Fit  Detail   |  stage__tools  3rem row, inside the stage card
|                                      |
|            P I C T U R E             |  picture       canvas, max-height 42dvh
|                                      |
| Mixed paint | Photo colour | Photo.. |  viewbar       3rem, horizontally scrollable
| Outlines  Numbers                    |  viewbar       3rem toggles row
| 12 · 23% of image · 1 x 663 Sepia... |  picture__readout 2.75rem, never empty
+--------------------------------------+  <- end of the sticky region
|                                      |
|   panel region: the active tab       |  scrolls under the sticky stage
|                                      |
+--------------------------------------+
| Colours | Recipe | Settings | Photo  |  app__tabs     3.5rem + safe-area, fixed, bottom
+--------------------------------------+
```

Rules:

- `.app__bar` `position: fixed; inset: 0 0 auto 0; height: 3.25rem; background: var(--c-surface);
  border-bottom: 1px solid var(--c-border); padding-inline: var(--gap);` It holds the app name
  (`--fs-medium`, 600) and the `Account` button (48 px). The tagline is not rendered below `64rem`.
- `.app__main { padding: calc(3.25rem + var(--gap-05x)) var(--gap-05x)
  calc(3.5rem + var(--gap) + env(safe-area-inset-bottom)); }`
- `.app__stage { position: sticky; top: 3.25rem; z-index: 2; background: var(--c-background); }`
  The stage card has `padding: var(--gap-05x)` so the canvas is as large as the screen allows.
- `.picture__canvas { max-height: 42dvh; width: auto; max-width: 100%; margin-inline: auto; }`
- Full-size mode (`picture--full`): the stage takes the whole space between bar and tabs
  (`--picture-max: calc(100dvh - 3.25rem - 3.5rem - 6rem)`), the panel region is `display: none`,
  the canvas pane gets `overflow: auto; touch-action: pan-x pan-y pinch-zoom;` and the toolbar
  button reads `Fit`. This is the only state in which a panel is hidden, and it is always one
  labelled tap away from coming back.
- `.app__tabs` is a four-item row, each `flex: 1 1 0; min-height: 3.5rem;` label `--fs-small`, 600
  when active. The active tab has `background: var(--c-corporate-soft); color: var(--c-corporate);`
  and a `2px` top rule in `--c-corporate`. No icons: four words fit at 375 px (93 px per tab).
- Tab labels are mode-dependent: `Colours | Recipe | Settings | Photo` in mix mode,
  `Layers | Spot | Settings | Photo` in layer mode.
- The `Recipe` / `Spot` tab shows a dot (`6px`, `--c-corporate`) after the label when something is
  selected and that tab is not active. No number, no badge count.
- Phone landscape (`< 48rem` and `orientation: landscape`): the stage and the panel region sit side
  by side, `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`, the canvas gets
  `max-height: calc(100dvh - 3.25rem - 3.5rem - 2rem)`, the tab bar stays.

What the phone fixes, point by point against the screenshot:

| Screenshot defect | Fix |
|---|---|
| Three-column settings grid that does not collapse | Setup is one control per row below `64rem`; there is no settings grid on phone at all |
| `Saturation200%Contrast100%` | Every control row is `label / value / stepper / slider` on its own row, value right-aligned in its own cell with `min-width: 4ch` |
| "Max. paints" wrapping away from its control | The segmented control sits on the row below its label, full width, three 48 px options |
| Seven action buttons in two ragged rows | Photo actions live in their own tab, as a single column of 56 px rows |
| The picture scrolled off the top | The stage is sticky; the picture is the only element that is always visible |
| 1.4rem base never stepped down | The type scale starts at 16 px on the phone and steps **up**, not down (section 6.2) |

### 4.2 iPad portrait (`48rem – 63.999rem`)

```
+-------------------------------------------------------------+ app__bar 3.5rem sticky
+-------------------------------------------------------------+
| stage card: name + photo actions | Fit | Pick a detail       |  sticky, top: 3.5rem
|                     P I C T U R E  (max-height 48dvh)        |
| view bar · toggles · readout · close-up strip                |
+------------------------------+------------------------------+
| detail card                  | settings: Method             |
| plan card                    | settings: Plan / Shapes /    |
|                              | Photo / AI help              |
+------------------------------+------------------------------+
| footer links                                                 |
+-------------------------------------------------------------+
```

- `.app__main { padding: calc(3.5rem + var(--gap)) var(--gap) var(--gap); }`
- `.app__panels { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--gap); align-items: start; }`
- Left column: `detail`, then `plan`. Right column: `settings`.
- The photo actions move from a tab into the stage card header: a right-aligned wrap row of six
  48 px buttons under the image name.
- No tab bar. The settings groups are all open; the fold buttons exist and persist their state.
- Canvas `max-height: 48dvh`.

### 4.3 iPad landscape (`64rem – 79.999rem`) and desktop (`>= 80rem`)

```
+--------------------------------------------------------------------------+
| Watercolourlove   Find the main colours in a photo ...          Account   |
+---------------------------------------------+----------------------------+
| name · In collection · actions · Fit · Pick  | detail card                |
|                                              |                            |
|                 P I C T U R E                | plan card                  |
|                                              |   (the long one)           |
| view bar · toggles                           |                            |
| readout line                                 | settings card              |
| close-up strip                               |   Method                   |
+---------------------------------------------+ |   Plan                   |
| footer links                                 | |   Shapes / Photo / AI    |
+--------------------------------------------------------------------------+
```

- `.app__main { display: grid; grid-template-columns: minmax(0, 1fr) var(--rail);
  gap: var(--gap); align-items: start; max-width: var(--max-width); margin-inline: auto;
  padding: var(--gap); }`
- `--rail`: `24rem` at `>= 64rem`, `26rem` at `>= 80rem`, `28rem` at `>= 90rem`.
- `.app__stage { position: sticky; top: var(--gap); }` — as today, but the stage now also carries
  the view bar, the readout and the close-up strip, so the picture and everything drawn on it stay
  together.
- `.picture__canvas { max-height: calc(100dvh - 16rem); }`; in layer mode with the step bar open,
  `calc(100dvh - 22rem)`.
- The rail is in page flow and scrolls with the page. There is no nested scroll container, so the
  "no scroll region under 240 px" rule cannot be broken.
- When a selection is made and the detail card is above the fold, nothing moves. When it is out of
  view (long page, scrolled down), the rail scrolls it into view with
  `scroll-margin-top: calc(var(--gap) + 3.5rem)`.
- The tagline is rendered only at `>= 64rem`.

---

## 5. Touch model

These are acceptance criteria, not guidance.

| Element | Hit area | Notes |
|---|---|---|
| Button, default | `min-height: 3rem` (48), `min-width: 3rem`, padding-inline `var(--gap-05x)` ×2 | |
| Button, primary action of a screen or dialog | `min-height: 3.5rem` (56) | `New photo`, `Update mixes`, `Previous`, `Next`, `Continue` |
| Segmented option | `min-height: 3rem`, `min-width: 4rem` | |
| Checkbox row (`switch`) | whole row `min-height: 3rem`, box 1.5rem | the label is part of the target |
| Slider | `height: 3rem` hit area, track 0.625rem, thumb 1.875rem (30) | |
| Stepper (`minus` / `plus`) | `3rem x 3rem` | one step per tap |
| Tab | `min-height: 3.5rem` | |
| Plan row | `min-height: 3.5rem`, whole row tappable | |
| Wash / coat segment | `height: 2.5rem`, `min-width: 3rem` | |
| Paint chip | `min-height: 3.5rem`, `min-width: 9rem` | whole chip is the label of its checkbox |
| Close-up thumbnail | `height: 5.5rem` | |
| Close-up remove | `3rem x 3rem` | replaces today's 22 px button |
| Fold button | `3rem x 3rem` | replaces today's 28 px `PanelToggle` |
| Dialog close | `3rem x 3rem` | |
| Gap between neighbouring targets | `>= 0.5rem` (8) | enforced by the gap of every flex and grid container that holds controls |

Gestures and their fallbacks:

| Today | Problem | This design |
|---|---|---|
| Hover tooltip on the canvas (`RecipeTip`) | invisible on touch | a readout line under the picture, always rendered, filled by hover on a fine pointer and by the selection otherwise |
| `title="…"` on about forty controls | invisible on touch | every one becomes a visible hint line, a caption or a visible label (section 9) |
| Double-click on a slider resets it | not reachable on touch | a visible button `Reset saturation and contrast` in Setup group "Photo" |
| Drag the floating recipe panel | precise drag, covers the page | the panel does not float; no drag at all |
| Drag a frame for a close-up | precise drag | the drag stays and gets `touch-action: none`; the fallback is: arm `Pick a detail`, then a single tap places a frame of 40 % of the shorter side centred on the tap; four 48 px corner handles adjust it; a bar confirms with `Use this detail` / `Cancel` |
| Arrow keys walk the steps | keyboard only | `Previous` / `Next` buttons, 56 px, always visible; the key handler stays as an extra |

Feedback and focus:

- `:active` on every control: `transform: none`, `background` one step darker
  (`--c-surface-sunken` for quiet controls, `--c-corporate-hover` for primary), applied within
  `0ms` — no transition on the active state.
- `:focus-visible`: `outline: 2px solid var(--c-corporate); outline-offset: 2px;` plus
  `box-shadow: 0 0 0 4px var(--c-surface);` where the control sits on a coloured field (paint
  chips, wash segments), so the ring reads on any swatch.
- Busy: the canvas drops to `opacity: 0.5`, the status slot in the stage toolbar reads `Analysing…`
  or `Planning layers…`, and controls that re-run the analysis are not disabled (they queue; that
  is today's behaviour).
- `env(safe-area-inset-*)` is respected on the app bar (top), the tab bar (bottom) and the main
  padding (left/right), as today.

---

## 6. Tokens

House names. Plain CSS custom properties in `properties.css`, all of them on `:root`, dark mode
redefined under `@media (prefers-color-scheme: dark)`. No Sass.

### 6.1 Colour

Four tokens beyond the house list are needed and are named in the same system:
`--c-surface`, `--c-surface-sunken`, `--c-corporate-soft`, `--c-overlay`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--c-background` | `#efece6` | `#161412` | the page |
| `--c-surface` | `#ffffff` | `#201d1a` | cards, dialogs, bars |
| `--c-surface-sunken` | `#f7f5f1` | `#2a2622` | inset rows, hovered rows, sliders' track |
| `--c-copy` | `#221f1c` | `#ece6dd` | body text |
| `--c-copy-light` | `#655d54` | `#a79d91` | meta lines, hints, captions |
| `--c-head` | `#141210` | `#fbf7f1` | headings |
| `--c-border` | `#d9d2c7` | `#39332d` | all 1 px rules |
| `--c-corporate` | `#1f4f73` | `#8fbfe3` | selection, active segment, focus ring, primary button |
| `--c-corporate-hover` | `#163b57` | `#b3d6f0` | primary button hover and active |
| `--c-corporate-soft` | `#e3ecf3` | `#22323f` | selected row background, active tab |
| `--c-accent` | `#8a5a2b` | `#d3a06a` | "changed" marks only |
| `--c-danger` | `#a33327` | `#e4867a` | errors, destructive confirmations |
| `--c-success` | `#2f6b43` | `#76b98e` | "In collection", saved states |
| `--c-white` | `#ffffff` | `#ffffff` | ink on a dark saturated swatch; never a surface |
| `--c-overlay` | `rgba(20, 18, 16, 0.5)` | `rgba(0, 0, 0, 0.62)` | dialog backdrop |

Contrast, measured against the surface each token sits on: `--c-copy` 15.9:1 on white and 12.8:1 on
`#201d1a`; `--c-copy-light` 6.4:1 and 6.5:1; `--c-corporate` 8.6:1 and 8.8:1; `--c-danger` 6.3:1 and
6.0:1. Everything clears 4.5:1, which is what sunlight and a studio lamp need.

The only saturated things on screen stay the photo, the paint swatches, the wash bars and the paint
chips. `--c-corporate` appears on at most: the selected plan row, the active segment, the focus
ring, and one primary button per screen.

### 6.2 Type scale

`html { font-size: 100%; }` — 16 px, the browser default. The `1.4rem` base and the
`html { font-size: 10px }` print hack both go away; `print.css` sets its sizes in px (section 11).

| Token | base (phone) | `>= 48rem` | `>= 64rem` | `>= 90rem` | Role |
|---|---|---|---|---|---|
| `--fs-mini` | `0.75rem` 12 | `0.75rem` | `0.8125rem` 13 | `0.8125rem` | numbers inside bars, chip captions |
| `--fs-small` | `0.875rem` 14 | `0.9375rem` 15 | `0.9375rem` | `1rem` 16 | meta lines, hints, tab labels |
| `--fs-copy` | `1rem` 16 | `1.0625rem` 17 | `1.0625rem` | `1.125rem` 18 | body, labels, buttons |
| `--fs-medium` | `1.125rem` 18 | `1.1875rem` 19 | `1.25rem` 20 | `1.25rem` | plan numbers, values |
| `--fs-large` | `1.25rem` 20 | `1.3125rem` 21 | `1.375rem` 22 | `1.5rem` 24 | card titles |
| `--fs-hl-small` | `1.375rem` 22 | `1.5rem` 24 | `1.625rem` 26 | `1.75rem` 28 | dialog titles |
| `--fs-hl-medium` | `1.75rem` 28 | `1.875rem` 30 | `2rem` 32 | `2.25rem` 36 | gate title |
| `--fs-hl-large` | `2.25rem` 36 | `2.5rem` 40 | `2.75rem` 44 | `3rem` 48 | not used in the app; reserved |

The ramp is declared inside `:root` with media queries, as the house standard requires. The steps
are at least 1 px apart at the small end and clearly apart at the large end.

### 6.3 Spacing, radius, shadow, sizes

| Token | Value | Note |
|---|---|---|
| `--gap` | `1rem` (16) | base |
| `--gap-025x` | `calc(var(--gap) * 0.25)` 4 | inside a chip |
| `--gap-05x` | `calc(var(--gap) * 0.5)` 8 | between neighbouring targets (the minimum of the touch rules) |
| `--gap-15x` | `calc(var(--gap) * 1.5)` 24 | between settings groups |
| `--gap-2x` | `calc(var(--gap) * 2)` 32 | |
| `--gap-3x` | `calc(var(--gap) * 3)` 48 | |
| `--m-vert` | `1.5rem` 24 | between cards |
| `--m-vert-slim` | `0.75rem` 12 | between rows inside a card |
| `--m-vert-2x` | `3rem` 48 | above the footer |
| `--max-width` | `90rem` 1440 | the app's outer width |
| `--article-width` | `44rem` | dialog text columns |
| `--rail` | `24rem` / `26rem` / `28rem` | see 4.3 |
| `--radius` | `0.75rem` 12 | cards, dialogs |
| `--radius-medium` | `0.5rem` 8 | buttons, inputs, segmented |
| `--radius-small` | `0.25rem` 4 | chips, bars, swatches |
| `--shadow` | `0 1px 2px rgba(26, 22, 18, 0.08), 0 8px 24px rgba(26, 22, 18, 0.10)` | dialogs only |
| `--shadow-flat` | `0 1px 0 0 var(--c-border)` | sticky bars, instead of a drop shadow |
| `--touch` | `3rem` 48 | |
| `--touch-primary` | `3.5rem` 56 | |
| `--bar-height` | `3.25rem` 52 | phone app bar |
| `--tabs-height` | `3.5rem` 56 | |

Dark mode shadow: `--shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.45)`.

No drop shadow on cards, panels, rows, chips or buttons. Only dialogs and the consent banner carry
`--shadow`. Sticky bars carry `--shadow-flat`, which is a 1 px rule.

Transitions: `background-color 120ms linear`, `color 120ms linear`, `opacity 200ms linear` only.
Nothing moves, scales or slides. `@media (prefers-reduced-motion: reduce)` sets them to `0ms`.

---

## 7. Typography

**Chosen: IBM Plex Sans**, self-hosted as woff2 in `public/fonts/`, variable (`wght 400–600` axis
range subset), Latin + Latin-ext subset. Weights used: 400 and 600. Nothing else.

```
--ff-copy: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--ff-head: var(--ff-copy);
--ff-fixed: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;   /* hex values only */
```

Why, on legibility grounds, not taste:

- The app is full of three-digit paint numbers (`663`, `485`, `208`), area numbers, percentages and
  ratios, read at arm's length, often at an angle, sometimes through a smear. The characters that
  decide whether that works are `1 / l / I` and `0 / O`. In IBM Plex Sans the capital `I` carries
  crossbars, the digit `1` has both a flag and a foot, and the lowercase `l` is a plain stem — the
  three are unmistakably different shapes. That is the single most important property here.
- Rejected: **Inter**. It is the default of exactly the kind of app the owner does not want to look
  like, and more concretely its capital `I` is a bare stem identical to the lowercase `l`, so
  `485 Indigo` and a paint named with an `l` read alike at distance unless the optional alternate
  set is enabled with a feature setting, which is an extra failure point.
- Rejected: **Source Sans 3**. Humanist and pleasant, but its stems are lighter at the same optical
  size, which is the wrong direction under a studio lamp and in sunlight on a glossy iPad, and its
  capital `I` is also a bare stem.
- Figures: `font-variant-numeric: tabular-nums` is set on every element that holds a number in a
  column or a changing value (plan numbers, slider values, percentages, ratios, token counts). It
  is not set on running text.

Roles:

| Role | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| App name | `--fs-medium` | 600 | 1.2 | `-0.01em` |
| Card title | `--fs-large` | 600 | 1.25 | `-0.005em` |
| Dialog title | `--fs-hl-small` | 600 | 1.2 | `-0.01em` |
| Group title (Setup) | `--fs-copy` | 600 | 1.3 | `0.02em`, not uppercase |
| Control label | `--fs-copy` | 600 | 1.3 | `0` |
| Control value | `--fs-medium` | 600 | 1.2 | `0`, tabular |
| Body and buttons | `--fs-copy` | 400 (buttons 600) | 1.45 | `0` |
| Meta, hint, caption | `--fs-small` | 400 | 1.4 | `0` |
| Plan number | `--fs-medium` | 600 | 1 | `0`, tabular |
| Bar segment text | `--fs-mini` | 600 | 1 | `0`, tabular |
| Hex value | `--fs-small` | 400 | 1.2 | `0`, `--ff-fixed` |

No uppercase transforms anywhere. No italics except the existing `Leave the paper white`, which
becomes upright and is carried by its own line instead.

`index.html`: the emoji favicon is removed and replaced by a drawn SVG — a quartered square in
`#1f4f73`, `#8a5a2b`, `#efece6`, `#221f1c`, 4 px radius, no text, as `public/favicon.svg`.

---

## 8. Components

Every block below is one file in `src/css/components/`. BEM, modifier classes for state, no utility
classes, no scoped styles.

### 8.1 `app` — the shell

Elements: `app__bar`, `app__name`, `app__tagline`, `app__account`, `app__notice`, `app__main`,
`app__stage`, `app__panels`, `app__rail`, `app__tabs`, `app__tab`, `app__footer`,
`app__footer-link`.
Modifiers: `app--layer` (kept, as today), `app--picture-full` (phone, full-size picture).

States of `app__tab`: default, `app__tab--active`, `app__tab--marked` (a selection waits in that
tab), `:focus-visible`, `:active`.

### 8.2 `stage` — the picture and everything drawn on it

```
stage
  stage__head         name, state, photo actions           (>= 48rem)
  stage__tools        Fit/Full size, Pick a detail, status  (all)
  picture             the canvas and what is over it
  viewbar             which view, outlines, numbers, guides
  steps               the step walk (layer mode, replaces viewbar when open)
  picture__readout    one line, never empty
  closeup             the strip of details
```

`stage__tools` is a row: left the toggle `Fit` / `Full size`, then `Pick a detail`, then the status
slot right-aligned (`Analysing…`, `Planning layers…`, or empty). In layer mode a fourth button
`Paint step by step` sits after `Pick a detail`. All buttons are 48 px with text labels. There are
**no floating icon buttons over the image** any more; `painting__zoom` and
`painting__zoom--frame` disappear.

### 8.3 `picture`

Elements: `picture__pane`, `picture__canvas`, `picture__frame`, `picture__handle`,
`picture__banner`, `picture__readout`.
Modifiers: `picture--full`, `picture--busy`, `picture--framing`.

- `picture__pane` holds the canvas, has `background: var(--c-surface-sunken)`, `--radius-small`,
  and is the positioning context for the frame.
- `picture__canvas` keeps `cursor: crosshair` on fine pointers; on coarse pointers the cursor is
  irrelevant and `touch-action` is `manipulation`, or `none` while framing.
- `picture__banner` is the instruction bar inside the pane while framing: one line of copy and a
  `Cancel` button, `min-height: 3rem`, background `var(--c-surface)` at 92 % opacity. It is the only
  element ever drawn over the image, and it sits at the bottom edge, never over the middle.
- `picture__handle` are the four corner handles of a placed frame: `3rem` square, transparent fill,
  a 2 px white and 1 px dark outline so they read on any photo.
- `picture__readout` is a fixed-height line (`2.75rem`, `--fs-small`, `--c-copy-light`) directly
  under the viewbar. Space is reserved whether or not there is content, so nothing jumps.

Readout content, in order of precedence:

| Situation | Content |
|---|---|
| Pointer over an area (fine pointer, mix mode) | `12 · 23% of image · 1 x 663 Sepia brown + 2 x 485 Indigo` |
| A colour is selected | `Colour 12 selected · 23% of image · tap the picture again to clear` |
| A spot is selected (layer mode) | `Spot: 3 layers · match: good` |
| Nothing, mix mode | `Tap an area to see its recipe.` |
| Nothing, layer mode | `Tap a spot to see which layers cover it.` |
| Sketch view | `The sketch is the outline to transfer to paper. Nothing to pick here.` |
| Framing armed | `Drag a frame over the part you want, or tap once to place one.` |

### 8.4 `viewbar`

Elements: `viewbar__label`, `viewbar__group` (the segmented view switch), `viewbar__option`,
`viewbar__toggles`, `viewbar__toggle`.

Row 1: the label `Show` (`--fs-small`, `--c-copy-light`) and the segmented control with the view
options. Below `48rem` the segmented control takes the full width of its own row and scrolls
horizontally if four options do not fit (`overflow-x: auto; scroll-snap-type: x mandatory;` each
option `scroll-snap-align: start; min-width: 7rem;`). It never wraps into ragged rows.
Row 2: the toggles `Outlines`, `Numbers`, and `Guides` only while the view is `sketch`. Each toggle
is a 48 px tall `switch` with a 24 px box and its word.

### 8.5 `steps` — the painting walk (layer mode)

Elements: `steps__head`, `steps__title`, `steps__nav`, `steps__view`, `steps__lines`,
`steps__target`, `steps__warn`, `steps__close`.

Open state replaces the viewbar inside the stage.
Title: `Step 3 of 11: Layer 2 of 5, 663 Sepia brown, coat 1 of 2`.
`steps__nav`: `Previous` and `Next`, each `flex: 1`, `--touch-primary`, `--gap-05x` apart.
`steps__view`: the segmented `Where to paint | This wash | So far` — the three titles that are
tooltips today become the three hint lines under it, one at a time, matching the chosen option:

- `Where to paint`: `The paper after this step. What is painted now is in full colour, the rest faded.`
- `This wash`: `Only the areas painted now, filled with one stroke of this wash.`
- `So far`: `The paper with all layers up to and including this step.`

`steps__lines` keeps the three labelled lines `Mix`, `Paint`, `Then` with today's text.
`steps__warn` keeps today's text about too many shapes.

### 8.6 `plan` — the list (both modes)

Elements: `plan__head`, `plan__title`, `plan__count`, `plan__actions`, `plan__key`, `plan__list`,
`plan__item`, `plan__tick`, `plan__row`, `plan__number`, `plan__swatch`, `plan__name`,
`plan__meta`, `plan__bar`, `plan__part`, `plan__part-text`, `plan__sub`, `plan__wash`,
`plan__note`, `plan__empty`, `plan__empty-actions`.
Modifiers: `plan__item--selected`, `plan__item--current` (the layer of the open step),
`plan__item--muted` (a paint that got no layer), `plan__wash--selected`, `plan--layer`.

Row geometry (identical in both modes):

```
grid-template-columns: [tick] 3rem [number] 2.5rem [body] minmax(0, 1fr);
row-gap: var(--gap-025x);  column-gap: var(--gap-05x);
min-height: 3.5rem;  padding: var(--gap-05x);  border-radius: var(--radius-medium);
```

In mix mode the `tick` column is `0` wide and the grid starts at `number`. The bars span the body
column. The selected row gets `background: var(--c-corporate-soft)` and the number turns
`--c-corporate`; no left border, no outline on the row itself.

`plan__key` is the wash key, shown when any mix has more than one wash:
`W very watery · L light · M medium · R rich · C concentrated`.

### 8.7 `detail` — the selected colour or spot

Elements: `detail__head`, `detail__title`, `detail__close`, `detail__compare`, `detail__swatch`,
`detail__chip`, `detail__caption`, `detail__hex`, `detail__actions`, `detail__subtitle`,
`detail__washes`, `detail__recipes`, `detail__recipe`, `detail__note`, `detail__empty`.
Modifiers: `detail__recipe--chosen`, `detail--empty`.

- `detail__compare` is two cells side by side; each is a `3.5rem` tall colour field with its hex in
  `--ff-fixed` inside it and its caption under it. Mix mode: `Photo colour` / `Your mix`. Layer
  mode: `Photo` / `Layered`.
- `detail__actions`: `Change colour` (a 48 px label wrapping an `input[type=color]` whose own swatch
  is 3rem × 2.5rem), `Back to photo colour` (only when overridden),
  `Edit only the tapped area` (only when the clicked area shares its colour with others).
- `detail__recipe` is a selectable card, `min-height: 3.5rem`, the chosen one marked by
  `background: var(--c-corporate-soft)` and a 1 px `--c-corporate` border — not a left border.
- There is **no drag handle, no `position: fixed`, no z-index above the page**. `floating.js` is
  deleted.

### 8.8 `settings` and `control`

```
settings
  settings__group                 one of five, each with a fold button
    settings__group-head
      settings__group-title       Method / Plan / Shapes / Photo / AI help
      fold (button, 3rem)
    settings__group-body
      control  (one per row)
```

`control` anatomy, one row:

```
+---------------------------------------------+
| Colours                                  20 |   label (600) / value (tabular, right)
| [ - ] =======O---------------------- [ + ]  |   3rem stepper, slider, 3rem stepper
| More colours means more detail and more     |   hint, --fs-small, --c-copy-light
| mixes to prepare.                           |
+---------------------------------------------+
```

- `control__label`, `control__value`, `control__hint`, `control__field`, `control__step`.
- `slider`: `input[type=range]` with `accent-color: var(--c-corporate)`, explicit
  `::-webkit-slider-thumb` and `::-moz-range-thumb` of `1.875rem` (30) with a 2 px
  `--c-surface` ring and a 1 px `--c-border` outline, `::-webkit-slider-runnable-track` /
  `::-moz-range-track` `0.625rem` tall, `--radius-small`, `background: var(--c-surface-sunken)`.
  The input element itself is `height: 3rem` so the whole band is the hit area.
- Steppers apply exactly one `step` per tap, respect `min`/`max`, and are `disabled` at the ends.
  They fire the same `change` handler as the slider, so the analysis re-runs once per tap.
- `control--segment` replaces the slider row with a full-width `segmented` control
  (Method, Areas, Max. paints, Max. coats, AI off/on).
- At `>= 64rem` the groups "Shapes" and "Photo" lay their controls out in two columns
  (`grid-template-columns: 1fr 1fr; gap: var(--gap);`). Below that, one column, always. The
  three-column grid that produced `Saturation200%Contrast100%` does not exist at any width.

### 8.9 `segmented`, `switch`, `button`, `chip`, `swatch`, `recipe`

- `segmented`: `display: flex; border: 1px solid var(--c-border); border-radius: var(--radius-medium);
  overflow: hidden;` options `flex: 1 1 0; min-height: 3rem; min-width: 4rem;` dividers are
  `border-inline-start: 1px solid var(--c-border)` on every option but the first (this is a divider
  between equals, not an accent on a container, so it is not the banned left-border pattern).
  `segmented__option--active`: `background: var(--c-corporate-soft); color: var(--c-corporate);
  font-weight: 600;`. Disabled: `opacity: 0.45`, not clickable, with a hint line saying why.
- `switch`: a row label wrapping a native checkbox; `min-height: 3rem`; the box is `1.5rem` with
  `accent-color: var(--c-corporate)`.
- `button`: `--radius-medium`, `min-height: var(--touch)`, `font-weight: 600`.
  `button` (primary) = `--c-corporate` on `--c-white`; `button--secondary` = `--c-corporate-soft` on
  `--c-corporate`; `button--quiet` (replaces `button--ghost`) = transparent with a `--c-border`
  outline and `--c-copy` text — the current ghost uses `--ink-soft`, which is too weak in sunlight.
  `button--danger` = `--c-danger` on `--c-white`. `:disabled` = `opacity: 0.45; cursor: default;`.
- `chip`, `swatch`, `recipe` keep their current structure; the only changes are the token names,
  `--radius-small`, `min-height: 3.5rem` for anything tappable, and `--fs-mini` for text inside
  bars. `recipe` keeps its three layouts (`recipe--wide` for print, `recipe--full` for the detail
  card); the pointer-tip layout is dropped with `RecipeTip`.

### 8.10 `dialog` — shared chrome for all five dialogs

One block, used by `paintbox`, `collection`, `pro`, `account`, and the new `ai` dialog, so the
"three more separate visual languages" become one:

```
dialog                 width: min(60rem, calc(100vw - var(--gap)));
                       max-height: calc(100dvh - var(--gap));  padding: 0;
                       border: 1px solid var(--c-border); border-radius: var(--radius);
                       background: var(--c-surface); box-shadow: var(--shadow);
dialog::backdrop       background: var(--c-overlay);
dialog__head           sticky top, 1px bottom rule, holds the title and the close button
dialog__title          --fs-hl-small
dialog__close          3rem square, drawn SVG cross, aria-label "Close"
dialog__body           padding: var(--gap); overflow-y: auto; overscroll-behavior: contain;
dialog__foot           sticky bottom, holds the primary action (56 px) and secondary actions
```

On phone a dialog is full screen: `width: 100vw; height: 100dvh; max-height: none;
border-radius: 0; border: 0;` with the head and foot pinned and the body scrolling between them.

### 8.11 `paintbox`

Keeps its content, restructured into `dialog`:

- `dialog__head`: title `Paint box` (mix) / `Paint box: base paints` (layer), close button.
- First body row: the box switcher (`segmented` of box names, wrapping) and `New box`, `Rename`,
  `Delete box`.
- `paintbox__group` for `Selected paints` / `Base paints`, then `Pans`, `Tubes`, each vendor, then
  `Your own paints`. Each group head carries the `Use for Auto` switch.
- `paintbox__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--gap-05x); }` — chips `min-height: 3.5rem` (today 46 px, below the rule).
- `dialog__foot`: `Update mixes` / `Update layers` (primary, 56 px, disabled when nothing changed),
  `Auto`, `Revert`, `Clear`.
- The chip's tooltip text (`vendor line · German name · colour estimated · note`) becomes a second
  line inside the chip at `--fs-mini` for the vendor line, and a `paintbox__note` under the group
  for the estimate warning: `Colours marked "estimate" are guessed from the catalogue, not measured.`

### 8.12 `closeup`

- `closeup__bar` above the picture while a detail is open: `Detail 2` and
  `Back to the whole picture` (48 px).
- `closeup__strip` under the readout: thumbnails `5.5rem` tall, `--radius-small`, the active one
  outlined `2px --c-corporate`; number in the corner; a `3rem` square remove button at the top
  right of each thumb, always visible, `aria-label="Remove detail 2"`.
- Empty: the strip is not rendered; the `Pick a detail` button carries the whole affordance.

### 8.13 `ai` (now a dialog)

`Open AI settings` in Setup opens it. Sections, in order: `Off | On`, the explanation paragraph that
exists today, `Provider`, `Model`, `Your API key` with its hint, `Remember the key on this device`,
the consent paragraph with its checkbox, `Ask about this picture` (primary, 56 px) with the cost
estimate under it, then the answer: notes, mixes, details, the final-wash switch, the sketch line,
the match line, the token line, and `Forget key and consent`. No change to any copy; only the place
and the touch sizes change.

### 8.14 `consent`, `gate`, `pro`, `account`, `collection`

- `consent`: unchanged in content; buttons become 48 px, `Accept` is `button--secondary`, `Decline`
  is `button--quiet`, both equally reachable; the banner respects
  `padding-bottom: calc(var(--gap) + env(safe-area-inset-bottom))` and, on phone, sits above the tab
  bar (`bottom: calc(var(--tabs-height) + env(safe-area-inset-bottom))`).
- `gate`: one card, `--article-width`, the two statements as 48 px switch rows, `Continue` 56 px.
- `pro`, `account`, `collection`: moved onto the shared `dialog` chrome; their own blocks keep only
  what is specific (plan rows, the danger zone, the thumbnail grid). `collection__list` gets
  `minmax(11rem, 1fr)` cells and 48 px `Rename` / `Delete` buttons.

---

## 9. Copy

Every string. Sentence case, English, no exclamation marks, no emoji, no symbols as words.

### 9.1 Shell

| Place | Copy |
|---|---|
| App name | `Watercolourlove` (`Tintmap` in the native shell — `APP_NAME` unchanged) |
| Tagline (`>= 64rem`) | `Find the main colours in a photo and mix them from your watercolours.` |
| Account button | `Account` |
| Notice dismiss | `Hide` |
| Tabs, mix mode | `Colours` · `Recipe` · `Settings` · `Photo` |
| Tabs, layer mode | `Layers` · `Spot` · `Settings` · `Photo` |
| Footer | `Manual` · `Privacy` · `Terms` · `Imprint` · `Privacy settings` |

### 9.2 Stage

| Element | Copy |
|---|---|
| Photo actions | `New photo` · `Take photo` · `Sample` · `Save` · `Collection` · `Print / PDF` |
| Saved state | `In collection` |
| Fit toggle | `Full size` when fitted, `Fit` when at full size |
| Detail frame | `Pick a detail`; while armed, the same button reads `Cancel` |
| Framing banner | `Drag a frame over the part you want, or tap once to place one.` |
| Frame placed | `Use this detail` / `Cancel` |
| Frame too small | `That frame is too small. Try again.` |
| Step walk opener | `Paint step by step` |
| Status | `Analysing…` / `Planning layers…` |
| View options, mix | `Mixed paint` · `Photo colour` · `Photo` · `Sketch` |
| View options, layer | `Layered paint` · `Photo` · `Sketch` |
| View label | `Show` |
| Toggles | `Outlines` · `Numbers` · `Guides` |
| Guides hint (sketch view only) | `Quarters and diagonals, to transfer the sketch to paper.` |
| Close-up bar | `Detail 2` · `Back to the whole picture` |

### 9.3 Plan

| Element | Copy |
|---|---|
| Title | `Colours` / `Layers` |
| Count, mix | `20 colours in 12 mixes` (singular: `1 colour in 1 mix`) |
| Count, layer | `5 layers, 2 accents, 11 steps · match: good` |
| Actions | `Paint box` · `Show all layers` (layer mode, disabled when all are shown) |
| Wash key | `W very watery · L light · M medium · R rich · C concentrated` |
| Mix row meta | `4 washes · 23% of image · changed` |
| Mix row, one wash | `medium · 23% of image` |
| Mix row, no paints | `Paper white` |
| Layer row meta | `1:4 with water, like tea · 3 coats · 23% · for the darks` |
| Layer group title | `Accents, painted last` |
| Layer tick label | `Show layer 3 in the picture` (visually hidden text next to the box) |
| Layer notes | `Ticks only change what the picture shows. Change the paints in the paint box.` |
| Unused paints (auto) | `Not needed for this picture: 485 Indigo.` |
| Unused paints (by hand) | `No layer for 485 Indigo: it adds too little here. Swap it in the paint box.` |
| Out of reach | `14% of the picture is out of reach of these paints. Compare with Photo, or swap a paint.` |
| Empty, mix | `No paints selected in the paint box.` + `Open paint box` |
| Empty, layer | `No base paints chosen. Open the paint box and pick up to 8, or let the app choose.` + `Paint box` · `Choose for me` |

### 9.4 Detail

| Element | Copy |
|---|---|
| Title | `Colour 7` / `This spot` |
| Close | `Close` |
| Captions, mix | `Photo colour` / `Your mix` |
| Captions, layer | `Photo` / `Layered` |
| Match line (layer) | `Match: good` |
| Actions | `Change colour` · `Back to photo colour` · `Edit only the tapped area` |
| Subtitle, mix | `Recipes` |
| Subtitle, layer | `Layers on this spot` |
| Shared washes | `Same mix as 7L, 7M — only the amount of water differs.` |
| No recipes | `No paints selected in the paint box.` |
| Spot unpainted | `Leave the paper white.` |
| Spot skipped layers | `Not painted here: 2, 5.` |
| Empty, mix | `Nothing selected. Tap an area in the picture, or a colour in the list.` |
| Empty, layer | `Nothing selected. Tap a spot in the picture to see its layers.` |

### 9.5 Setup

| Group | Control | Label | Hint (always visible) |
|---|---|---|---|
| Method | segmented | `Method` | mix: `Mix: every area gets one mixed colour, painted once.` / layer: `Layer: a few thin washes, each painted over the dry one before.` |
| Plan | slider 2–32 | `Colours` | `More colours means more detail and more mixes to prepare.` |
| Plan | slider 2–8 | `Layers` | auto: `Washes; accents and second coats are extra steps.` / by hand: `Chosen by hand. Auto in the paint box picks again.` |
| Plan | slider 0–10 | `Details` | `0 keeps the picture as close to the photo as it can. 10 lets small areas of another hue keep their own mix.` |
| Plan | slider 0–3 | `Accents` | `Small strong touches painted last: first for a colour the washes miss, then for the darks.` |
| Plan | segmented 1/2/3 | `Max. paints` | `How many paints one mix may use.` |
| Plan | segmented 1/2/3 | `Max. coats` | `How often one wash may be painted over itself.` |
| Plan | button | `Paint box` | mix: `54 paints selected.` / layer: `7 of 8 base paints chosen.` |
| Shapes | segmented | `Areas` | organic: `Areas follow the outlines in the photo.` / geometric: `Shapes with straight edges, laid over each other from large to small.` |
| Shapes | slider 0–10 | `Simplify areas` | `Higher gives fewer and bigger shapes to paint.` |
| Photo | slider 0–200 step 5 | `Saturation` | value `200%` |
| Photo | slider 50–200 step 5 | `Contrast` | value `100%` |
| Photo | button | `Reset saturation and contrast` | `Both back to the photo as it is.` Disabled while both are 100. |
| Photo | — | — | group hint: `The painting is mixed from the photo with these values, not from the original.` |
| AI help | segmented `Off` / `On` | `AI help` | `An AI model looks at the picture and says what matters in it. Off: the app chooses on its own.` |
| AI help | button | `Open AI settings` | `Provider, model, your key and what is sent.` |

Phone only, at the end of the Settings tab, under a `3rem` space: `Account`, then the footer links.

### 9.6 Errors and busy

| Case | Copy |
|---|---|
| Analysis failed | the store's `analysis.error`, shown in a `--c-danger` line at the top of the plan card |
| Collection failed | the store's `collection.error`, in the stage head under the photo actions |
| AI failed | the store's `analysis.aiError`, in the AI dialog above the ask button |
| Nothing to print | `Print / PDF` is disabled; hint under the actions: `Nothing to print yet.` |

---

## 10. CSS structure

Flat, cascade-ordered, no `base/ components/ layouts/` folders, no underscore prefixes. Entry
`src/css/site.css`:

```
@import "reset.css";
@import "fonts.css";          /* @font-face, woff2 from /fonts/ */
@import "properties.css";     /* every token, light and dark */
@import "typography.css";     /* roles from section 7 */
@import "scaffold.css";       /* html, body, box-sizing, .app wrapper, scroll lock for dialogs */
@import "animations.css";     /* the two @keyframes used by the busy state */
@import "header.css";         /* app__bar */
@import "footer.css";         /* app__footer */
@import "forms.css";          /* input, select, checkbox, switch, slider */
@import "tables.css";         /* the layer sheet table */
@import "ui.css";             /* button, segmented, card, link, focus ring */
@import "components.css";     /* the blocks below */
@import "print.css";
```

`components.css` imports, in this order: `app.css`, `tabs.css`, `stage.css`, `picture.css`,
`viewbar.css`, `steps.css`, `closeup.css`, `plan.css`, `detail.css`, `recipe.css`, `chip.css`,
`swatch.css`, `settings.css`, `control.css`, `dialog.css`, `paintbox.css`, `collection.css`,
`ai.css`, `pro.css`, `account.css`, `gate.css`, `consent.css`, `legend.css`, `layersheet.css`.

`main.js` imports `./css/site.css` instead of `./css/main.css`.

`print.css` keeps today's behaviour (picture, then the legend or the layer sheets) with two changes:
the `html { font-size: 10px }` hack is dropped, and every size in `legend.css`, `layersheet.css` and
`print.css` is written in `px` or `mm` directly, which is what they already do. `@page { margin: 12mm }`
stays. The stage chrome, the tabs, the rail, the footer, the dialogs, the readout and the close-up
strip are `display: none` in print.

---

## 11. Migration notes per file

| File | What happens |
|---|---|
| `index.html` | Remove the emoji favicon data URI; link `public/favicon.svg` (section 7). Keep the viewport line with `viewport-fit=cover`. |
| `src/main.js` | Import `./css/site.css`. |
| `src/App.vue` | Becomes the shell only: `app__bar`, `app__notice`, `app__main` with `app__stage` / `app__panels` or `app__rail`, `app__tabs` (phone), `app__footer`, the dialogs. The `hint` computed property moves into the stage as `picture__readout` content. The two template branches on `analysis.layerMode` for sidebar contents disappear: the rail always renders `DetailCard`, `PlanList`, `SettingsPanel`. Add `activeTab` local state (`'plan' \| 'detail' \| 'settings' \| 'photo'`, default `'plan'`), used only below `48rem`. |
| `PaintingCanvas.vue` becomes `StagePicture.vue` | Drawing code unchanged. Remove both floating `painting__zoom` buttons and the absolutely positioned `painting__status`; they move to `StageTools.vue`. Remove `RecipeTip`; `onMove` now writes to a `readout` ref that the stage renders as a line. Add the tap-to-place close-up frame with corner handles next to the existing drag. Keep `SCALE`, `regionAtCanvasPixel`, `drawMixes`, `drawLayers`, `drawSketch` exactly as they are. |
| New `StageTools.vue` | The toolbar row: `Fit` / `Full size`, `Pick a detail`, `Paint step by step` (layer mode), status slot. |
| New `StageHead.vue` | Image name, `In collection`, the six photo actions (the top block of today's `ControlsPanel`), `collection.error`. On phone this component renders inside the `Photo` tab instead of the stage. |
| New `ViewBar.vue` | The `Show` segmented control plus `Outlines`, `Numbers`, `Guides` — lifted out of `ControlsPanel`. |
| `ControlsPanel.vue` becomes `SettingsPanel.vue` | Keeps only the five groups of section 8.8. The photo actions, the view switch, the toggles and the AI block leave. Every `title=` becomes a `control__hint`. `@dblclick` reset is deleted; `Reset saturation and contrast` is a button. The `controls__settings` 3-column grid and `controls__pair` 2-column grid are deleted. |
| New `ControlSlider.vue` | label, value, minus, range, plus, hint. Props: `label`, `modelValue`, `min`, `max`, `step`, `unit`, `hint`, `disabled`. Emits `update:modelValue` and `change`. |
| New `ControlSegment.vue` | label, options, hint; the same markup for Method, Areas, Max. paints, Max. coats, AI off/on. |
| `AiPanel.vue` becomes `AiDialog.vue` | Same content and copy, wrapped in the shared `dialog` chrome, opened from Setup. `analysis.setAi()` stays where it is. |
| `PaletteList.vue` + `LayerList.vue` becomes `PlanList.vue` | One component with a `layerMode` branch for row data only. The two `mixes` / `rows` computed properties move in unchanged; the template is one `plan__list`. `palette__*` and `layers__*` class names are replaced by `plan__*`. The group heading `Accents, painted last` stays. |
| `EntryEditor.vue` + `LayerArea.vue` becomes `DetailCard.vue` | One component, two content branches, one empty state. `useFloating` is removed from it. The `scrollIntoView` watcher stays but targets the card in flow. |
| `floating.js` | Deleted. `layout.positions` is no longer written; the store keeps the key for old saved data and simply ignores it (no store API change). |
| `RecipeTip.vue` | Deleted. Its information lives in `picture__readout` (one line) and in `DetailCard` (the full recipe). |
| `RecipeLine.vue` | Kept. `full` variant is now used by the detail card only; `wide` stays for print. Sizes move to the new tokens. |
| `PaintChip.vue` | Kept. `title` is removed: the vendor line becomes a second line in the chip, `min-height: 3.5rem`, `showForm` unchanged. |
| `LayerSteps.vue` becomes `StepBar.vue` | Kept as a component, rendered inside the stage in place of the view bar. The three `title=` strings on the view options become the one visible hint line under them. The keyboard handler stays. |
| `LayerStrip.vue` | Deleted. The plan list is reachable at every breakpoint. |
| `LayerSheets.vue` | Unchanged except token names and `tables.css`. |
| `PrintLegend.vue` | Unchanged except token names. It must keep working; `print.css` is rewritten without the `10px` root hack. |
| `PaintBox.vue` | Content unchanged; wrapped in `dialog`; chips and all buttons to the touch sizes; the actions row splits into `dialog__head` (Close) and `dialog__foot` (Update / Auto / Revert / Clear). |
| `CollectionDialog.vue`, `ProDialog.vue`, `AccountDialog.vue` | Wrapped in `dialog`; buttons to 48/56 px; own blocks keep only their specific parts. |
| `AccountGate.vue` | Card width `--article-width`; the two statements become `switch` rows; `Continue` 56 px. |
| `ConsentBanner.vue` | Unchanged content; sits above the tab bar on phone. |
| `CloseupBar.vue` + `CloseupStrip.vue` becomes `CloseupTray.vue` | One component: the bar when a detail is open, the strip when there are any. Remove button to 48 px. |
| `PanelToggle.vue` becomes `FoldButton.vue` | 48 px; used only by the five settings groups; keys in `layout.collapsed` become `method`, `plan`, `shapes`, `photo`, `ai`. |
| `src/css/main.css`, `base/*`, `layouts/*`, `components/_*.css` | All deleted and replaced by the flat structure of section 10. No file keeps an underscore prefix. |
| `src/stores/*`, `src/lib/*`, `src/workers/*` | Not touched. This is a presentation rework. The only store usage that changes is which keys `layout.collapsed` holds and that `layout.positions` stops being written. |

---

## 12. The brief's inventory, and where each item lives

| Feature | Where |
|---|---|
| Load photo | Stage head (`New photo`); phone: `Photo` tab |
| Take photo | Stage head (`Take photo`, coarse pointer only); phone: `Photo` tab |
| Next sample | Stage head (`Sample`); phone: `Photo` tab |
| Save to collection | Stage head (`Save`); phone: `Photo` tab |
| Open collection, rename, delete | `Collection` button, then collection dialog |
| Print and PDF | Stage head (`Print / PDF`); phone: `Photo` tab |
| Method Mix / Layer | Setup, group "Method" |
| Areas Organic / Geometric | Setup, group "Shapes" |
| Simplify | Setup, group "Shapes" |
| Colours | Setup, group "Plan" |
| Details (variety) | Setup, group "Plan" |
| Max. paints | Setup, group "Plan" |
| Layers | Setup, group "Plan" (layer mode) |
| Accents | Setup, group "Plan" (layer mode) |
| Max. coats | Setup, group "Plan" (layer mode) |
| Saturation, Contrast | Setup, group "Photo" |
| Reset of both | Setup, group "Photo", `Reset saturation and contrast` |
| View switch | Stage, view bar |
| Outlines, Numbers | Stage, view bar |
| Guides | Stage, view bar, only in sketch view |
| Select an area, see its recipe | Picture tap, then detail card (phone: `Recipe` tab) |
| Change a colour | Detail card, `Change colour` |
| Reset to photo colour | Detail card, `Back to photo colour` |
| Edit only the clicked area | Detail card, `Edit only the tapped area` |
| Alternative recipes | Detail card, `Recipes` list |
| Colour list with washes | Plan card, rows plus wash bar |
| Solo a layer | Plan card, tap the row |
| Tick layers | Plan card, the row's `Show` checkbox |
| Coats | Plan card, the coat bar under the row |
| The spot card | Detail card in layer mode (phone: `Spot` tab) |
| The step walk | Stage, `Paint step by step`, then the step bar |
| Paint box: selection, pans, tubes, Auto, All/Invert/None, boxes, own paints, P/T | Paint box dialog, opened from the plan header and from Setup group "Plan" |
| Close-ups: frame, thumbnails, return, remove | Stage: `Pick a detail`, close-up tray |
| AI: provider, model, key, consent, cost, ask, notes, forget | AI dialog, opened from Setup group "AI help" |
| Account: sign in, plan, export, delete | App bar `Account`, then account dialog; phone: end of the Settings tab |
| Plan dialog | Raised by `pro.require()` |
| Consent banner | Fixed at the bottom, above the tab bar on phone |
| Footer links | Footer; phone: end of the Settings tab |

Nothing in the inventory is unaccounted for. Two things are deliberately removed as *components*,
with their function kept: the floating recipe panel (function kept in the detail card) and the
pointer tooltip (function kept in the readout line and the detail card). One component is removed
outright, `LayerStrip.vue`, because the structure makes it redundant.

---

## 13. Acceptance criteria for this design

A build of this specification passes when all of these are true on a real device:

1. On an iPhone, at every scroll position and in both modes, the picture is visible without
   scrolling.
2. No label overlaps another at 320 px, 375 px, 390 px, 414 px, 768 px, 820 px, 1024 px, 1180 px,
   1280 px and 1440 px, in both light and dark mode, in both modes of the app.
3. Every interactive element measures at least 48 × 48 px in the browser's layout box, and primary
   actions at least 56 px tall. Neighbouring targets are at least 8 px apart.
4. No `title` attribute carries information that is not also visible as text.
5. Nothing requires a double-click, a long press, a hover or a precise drag. The close-up frame can
   be created with single taps.
6. Every slider can be set to an exact value with the stepper buttons alone.
7. No element has a `border-left` accent. No emoji and no symbol character used as an icon exists in
   the markup, the CSS or the copy.
8. Every panel has one home per breakpoint; nothing is `position: fixed` except the app bar, the tab
   bar, the consent banner and dialogs.
9. The print sheet and the layer sheets render as they do today.
10. `src/stores/**` and `src/lib/**` are unchanged.

---

## 14. Open questions for round 2

1. **Phone tab for `Photo`.** It holds six actions and the close-up list. If the owner's phone use
   is only "look something up", the tab could be replaced by a single `Photo` button in the app bar
   and three tabs instead of four (wider targets). Needs a decision from how he actually uses it.
2. **Sticky stage height on phone.** 42 dvh leaves roughly 300 px of panel on a 390 × 844 screen.
   Worth testing 38 dvh against 46 dvh with the real plan list.
3. **`Details` as the name of the variety slider** collides with close-ups, which the app also calls
   "Detail 2", and with the AI's "details to keep". One of the three should be renamed; my
   suggestion is the slider: `Variety`. Not changed here because it is copy the owner has lived
   with.
4. **Two columns for "Shapes" and "Photo" at `>= 64rem`** is the one place where density could tip
   into clutter. If round 2 finds it noisy, one column everywhere is the fallback and costs only
   vertical space in the rail.
5. **`Max. paints` applies without re-analysing** (it calls `autoPaints` + `recomputeAllRecipes`)
   while its neighbours re-run the analysis. The difference is invisible in the interface today. A
   shared busy indicator in the stage status slot may be enough, or the group may need a line.
