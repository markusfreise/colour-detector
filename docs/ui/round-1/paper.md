# Watercolourlove — UI specification, round 1

Team "Paper and pigment" · UX lead · 2026-10-12 · for `feature/TASK-40-ui-refactor`

Binding input: `docs/ui/brief.md`. This round fixes the information architecture, the user's path, the
layout at every breakpoint, the touch model, the token set, the type, the component states and the
copy. It is design only: nothing under `src/` is changed by this document.

The position of this team: the picture is the work. The software is the plan sheet around it. Controls
are set type in a narrow rail or in sheets that are summoned and dismissed; colour appears where colour
is the subject (the picture, the swatches, the recipe bars) and nowhere else. The risk that comes with
that position is a beautiful screen that hides a function, so every control in the inventory is named
below with the surface it lives on and the breakpoints it is visible at, and nothing is reachable only
by hover, double click, long press or drag.

---

## 1. The eight decisions of this round

1. **The shell does not scroll.** At every breakpoint the application is a fixed grid of the viewport
   height. The picture is always on screen. Only the rail body, the list and the sheets scroll inside
   themselves. The phone failure in `docs/ui/evidence/phone-settings-2026-10-12.png` (the picture
   scrolled off the top, a settings column a metre long) is made structurally impossible.
2. **Three levels, no more.** Level 1: the picture and the controls that change what the picture
   *shows*. Level 2: the rail with two tabs — the list (`Colours` / `Layers`) and `Plan`. Level 3:
   sheets that are summoned and dismissed — `Picture`, `Paints`, `More`, `AI help`, `Collection`,
   `Account`, `Unlock everything`.
3. **Mix mode and layer mode are one interface.** Same shell, same rail, same tabs, same row grammar,
   same card slot. Method is one control in `Plan`. Only the content of the surfaces changes, never
   their position or their number. Section 4 states this rule by rule.
4. **The floating recipe panel is abolished.** `floating.js` is not used. The recipe lives in the
   **card slot**, which is pinned at the top of the rail on wide screens and is a bottom sheet on
   narrow ones. It never covers the picture on a wide screen and never more than 72 % of the viewport
   on a narrow one.
5. **The pointer tooltip is abolished.** `RecipeTip.vue` is removed from the stage. Its information
   moves into the **readout line**, a permanently reserved single line under the picture that never
   shifts the layout. On a fine pointer, hovering an area fills the readout; on touch, tapping an area
   fills the readout and opens the card.
6. **The settings panel is split by the question it answers.** What the picture *shows* (view,
   outlines, numbers, guides, full size, frame, layer chips) belongs to the picture and sits under it
   at every breakpoint. What the picture *is* (method, colours/layers, details/accents, max.
   paints/coats, simplify, areas, saturation, contrast, AI) sits in the `Plan` tab in four named
   sections, one control per row, never a three-column grid.
7. **Picture handling is a sheet.** The seven action buttons (`New`, `Take photo`, `Sample`, `Save`,
   `Collection`, `Print / PDF`, plus the collection errors) become a list of full-width rows in the
   `Picture` sheet. Legal links, account, privacy settings and AI move into the `More` sheet.
8. **No icons.** Every control carries a word. The only drawn graphics in the interface are the
   picture, the swatches, the recipe bars and the favicon. This removes the two floating icon buttons
   over the image, the 28 px fold chevron and the 22 px close-up cross in one move.

---

## 2. Information architecture

### 2.1 The surfaces

| # | Surface | Block | Always present | Holds |
|---|---|---|---|---|
| 1 | Masthead | `masthead` | yes | picture name, saved marker, `Picture`, `More` |
| 2 | Note bar | `note` | only with a message | analysis error, account notice, consent |
| 3 | Stage | `stage` | yes | step bar, close-up bar, picture, readout, close-up strip |
| 4 | View bar | `viewbar` | yes | view switch, `Outlines`, `Numbers`, `Guides`, `Full size`, `Frame`, layer chips |
| 5 | Rail | `rail` | yes except phone (there: sheet) | tab row, card slot, tab body |
| 6 | Dock | `dock` | phone only | tabs `Colours`/`Layers`, `Plan`, button `Paints` |
| 7 | Sheets | `sheet` | summoned | `Picture`, `Paints`, `More`, `AI help`, `Collection`, `Account`, `Unlock everything`, the card on narrow screens |
| 8 | Gate | `gate` | before sign-in | sign-in and the two statements |
| 9 | Print sheets | `legend`, `layersheet` | print only | unchanged in substance |

### 2.2 The card slot

One slot, three possible contents, in this priority:

1. **Step card** — layer mode, while the painting walk is open.
2. **Spot card** — layer mode, a spot in the picture is chosen.
3. **Colour card** — mix mode, a colour is chosen.

Empty otherwise; the slot then takes no space at all. On iPad landscape and desktop the slot is pinned
above the tab body inside the rail. On phone and iPad portrait it is a bottom sheet (`sheet--card`)
that opens at a peek height and can be raised.

### 2.3 What is on level 1, 2 and 3

- **Level 1 (no tap needed):** the picture; what it shows; the readout; close-ups when they exist;
  the step bar while the walk runs; the masthead names.
- **Level 2 (one tap):** the colour list or the layer list; the plan; the selected colour, spot or
  step; the paint box; picture handling.
- **Level 3 (two taps):** AI help, account, plan purchase, collection item rename and delete, own
  paints form, box rename, legal pages.

Nothing from the brief's inventory sits deeper than level 3. Section 11 lists every item with its
surface.

---

## 3. The user's path

### 3.1 First run, phone

1. The app opens. The sample picture is already analysed and fills the middle of the screen; masthead
   above, view bar and dock below. No scrolling has happened and none is possible.
2. The painter taps an area of the picture. The area keeps its colour, the rest of the mix's picture
   stays as it is, the readout reads `Colour 7 · 12 % of image · 2 x 663 Sepia brown + 1 x 485 Indigo`,
   and the colour card rises from the bottom to its peek height (184 px) showing number, target, mix
   and the chosen recipe as one line. The picture is still visible above it.
3. Raising the card (drag the handle **or** tap `More`) shows the alternative recipes, `Change colour`,
   `Reset to photo` and `Edit only this area`. `Close` (48 px) dismisses it; so does tapping the
   picture.
4. `Colours` in the dock opens the full list as a sheet at 72 % height. Tapping a row selects that
   colour, closes the list sheet and leaves the card at peek height.
5. `Plan` in the dock opens the plan as a sheet. One control per row. Moving `Colours` from 20 to 12
   re-analyses; the readout reads `Analysing…` and a 2 px progress line runs at the top of the stage.
   The sheet stays open.
6. `Paints` in the dock opens the paint box full height.
7. `Picture` in the masthead opens the picture sheet: `New photo`, `Take a photo`, `Next sample`,
   `Save to collection`, `Collection`, `Print / PDF`.

### 3.2 iPad landscape, a mix session

Stage left, rail right. The painter works the plan in the `Plan` tab, switches to `Colours` to read
the list, taps an area in the picture — the card appears pinned at the top of the rail and the list
scrolls under it; nothing moves over the picture. The paint box opens as a centred sheet over the
whole app, is updated and closed; the recipes are recomputed on close exactly as today.

### 3.3 Layer mode, iPad portrait

`Plan` → `Method` → `Layer`. The rail tab is now called `Layers`; the list shows the washes in
painting order, then the accents under `Accents, painted last`. The layer chips row appears in the
view bar: tapping chip `3` shows only that layer, tapping `All` shows all. `Paint step by step` at the
top of the list opens the walk: a step bar appears above the picture with `Previous`, `Next`, `Close`,
the view switch becomes the three step views, and the step card fills the card slot with `Mix`,
`Paint`, `Then`.

---

## 4. Mix and layer as one interface

The two methods differ in what is planned, not in how it is operated. The rules:

| Element | Mix mode | Layer mode | Rule |
|---|---|---|---|
| Rail tab 2 | `Colours` | `Layers` | same position, same tab, name follows the method |
| List row | mix: number, base swatch, paints, meta, recipe bar, wash bar | layer: tick, number, swatch, paint name, meta, coat bar | one block `list`, same grammar: number, swatch, title, meta, bar |
| List head | `20 colours in 14 mixes` | `7 layers, 2 accents, 12 steps · match: excellent` | one `list__count` line |
| Card | `Colour 7` | `This spot` / `Step 3 of 12` | one slot, section 2.2 |
| Picture, isolating one thing | tap an area: its mix stays, the rest goes to paper white | tap a chip: only that layer | both are "show one thing"; both reset by tapping `All` (layer) or tapping the blank part (mix) |
| Plan section 2 | Colours, Details, Max. paints | Layers, Accents, Max. coats | same three rows, same order, same control types |
| Plan rows shared | Simplify areas, Areas | Simplify areas, Areas | identical; the store key differs (`simplify` / `layerSimplify`) and the interface does not say so |
| View switch | `Mixed paint`, `Photo colour`, `Photo`, `Sketch` | `Layered paint`, `Photo`, `Sketch` | same control, fewer options |
| Step walk | not offered | `Paint step by step` at the top of the list | only addition of layer mode, and it is announced in the list it belongs to |
| Paint box | selected paints for mixing | base paints | same sheet, heading and note change |
| Print | `legend` | `layersheet` | unchanged |

`LayerStrip.vue` stops being a narrow-screen special case: the layer chips are part of the view bar at
**every** breakpoint, because "which layer am I looking at" is the same question as "what does the
picture show". `LayerSteps.vue` stops owning a second view switch: while the walk runs, the view bar's
switch *is* the step view switch.

---

## 5. Layout

### 5.1 Breakpoints

| Name | Range | Shape |
|---|---|---|
| Phone | ≤ 767 px | one column, dock at the bottom, rail content in sheets |
| Phone landscape | ≤ 767 px **and** height ≤ 520 px | as phone, reduced chrome (5.6) |
| iPad portrait | 768–1023 px | one column, rail docked as a bottom panel |
| iPad landscape | 1024–1279 px | two columns, rail 36 rem |
| Desktop | 1280–1439 px | two columns, rail 40 rem |
| Wide | ≥ 1440 px | two columns, rail 44 rem, stage picture capped |

Media queries are written on `min-width` from the phone base upward, except the two height rules.

### 5.2 Common shell rules

```
html { font-size: 62.5%; }                 /* 1rem = 10px, see 7.3 */
body { margin: 0; background: var(--c-background); color: var(--c-copy); overscroll-behavior: none; }
.app {
  display: grid;
  height: 100dvh;
  overflow: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
```

- Nothing in the shell uses `position: sticky` any more.
- Every scrolling region sets `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch`.
- No scrolling region is shorter than 24 rem; where a region would be shorter it is given
  `min-height: 24rem` and the region above it gives way.
- Safe-area insets are applied once, on `.app`, plus `padding-bottom` on `.dock` and on every sheet.

### 5.3 Phone (≤ 767 px)

```
.app { grid-template-rows: auto auto minmax(0, 1fr) auto auto; }
/* masthead · note · stage · viewbar · dock */
```

| Part | Height | Rules |
|---|---|---|
| `masthead` | 5.6 rem | padding inline 1.6 rem; picture name `--fs-medium` 600, truncated with ellipsis; `Picture` and `More` as text buttons 4.8 rem tall, 0.8 rem apart |
| `note` | auto, min 4.8 rem | only when there is a message |
| `stage` | fills | `display: grid; grid-template-rows: auto auto minmax(0,1fr) auto auto` = step bar · close-up bar · picture · readout · close-up strip |
| `stage__picture` | fills | `display: grid; place-items: center; padding: 0.8rem 1.6rem; overflow: hidden`. With `Full size` on: `overflow: auto; place-items: start center; touch-action: pan-x pan-y` |
| `stage__canvas` | — | `max-width: 100%; max-height: 100%;` in fit mode; `max-width: none; max-height: none` in full-size mode |
| `stage__readout` | 4.0 rem fixed | one line, `--fs-small`, `--c-copy-light`, `text-overflow: ellipsis`, never empty, never two lines (`white-space: nowrap; overflow: hidden`) |
| `viewbar` | 4.8 rem + 0.8 rem + 4.8 rem | two rows: the view switch full width, then the toggle row |
| `viewbar__toggles` | 4.8 rem | `display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0.8rem` — 4 cells (`Outlines`, `Numbers`, `Full size`, `Frame`), or 3 in sketch view (`Guides`, `Full size`, `Frame`) |
| `viewbar__layers` | 4.8 rem, layer mode only | horizontal strip of chips 4.8 × 4.8 rem, gap 0.8 rem, `overflow-x: auto`, last item `All` |
| `dock` | 6.4 rem + safe area | `display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0.8rem; padding: 0.8rem 1.6rem` |

Reserved chrome at 390 × 844 px: 56 + 40 + 96 + 8 + 64 = 264 px, leaving about 560 px for the picture.
In layer mode add 56 px for the chip row.

Sheets on the phone:

```
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-sheet);
  max-height: min(72dvh, 68rem); border-radius: var(--radius) var(--radius) 0 0;
  background: var(--c-white); border-top: 1px solid var(--c-border); box-shadow: var(--shadow);
  padding-bottom: env(safe-area-inset-bottom); }
.sheet--full { max-height: calc(100dvh - 5.6rem); }        /* paint box, collection */
.sheet--card { max-height: min(72dvh, 52rem); }
.sheet__head { height: 5.6rem; }                            /* title left, Close right */
.sheet__body { overflow-y: auto; overscroll-behavior: contain; padding: 0 1.6rem 1.6rem; }
```

The card sheet opens at `height: 18.4rem` (peek) and is raised to its maximum by the handle drag or by
the `More` button in its head; `Close` collapses it. The scrim `shade` is `var(--c-shade)` and covers
only the area the sheet does not — the picture stays legible behind it.

### 5.4 iPad portrait (768–1023 px)

```
.app { grid-template-rows: auto auto minmax(0, 1fr) auto auto; }
/* masthead · note · stage · viewbar · rail(bottom panel) */
```

- `masthead` 6.4 rem. `Watercolourlove` is set above the picture name at `--fs-mini`, 600, letter
  spacing 0.06 em, uppercase; the picture name under it at `--fs-medium`.
- `viewbar` becomes one row: the view switch takes `minmax(0, 1fr)`, the toggles sit to its right as
  auto-width cells, gap 0.8 rem, all 4.8 rem tall. The layer chip row stays a second row.
- The **rail is a bottom panel**: `height: clamp(28rem, 38dvh, 40rem)`, `border-top: 1px solid
  var(--c-border)`, `background: var(--c-white)`.
  - `rail__head` 5.6 rem: the two tabs on the left, `Paints` as a quiet button on the right.
  - `rail__card` directly under the head when the slot is filled; `max-height: 50 %` of the panel,
    scrolls inside itself, minimum 24 rem — if it cannot have 24 rem, it opens as `sheet--card`
    instead (one rule, written once in `rail.css`).
  - `rail__body` fills the rest and scrolls.
- No dock. The dock's three targets are the rail head.
- Sheets are centred: `left: 50 %; transform: translateX(-50%); width: min(72rem, 100 % - 3.2rem);
  bottom: 0; max-height: 86dvh;` corners rounded top only.

Picture area at 834 × 1112 px: 1112 − 64 − 96 − 40 − 320 ≈ 590 px tall, full width. That is the
primary studio view in portrait and it shows the picture and the colour list at the same time.

### 5.5 iPad landscape (1024–1279 px)

```
.app { grid-template-columns: minmax(0, 1fr) 36rem; grid-template-rows: auto auto minmax(0, 1fr); }
.masthead { grid-column: 1 / -1; }
.note     { grid-column: 1 / -1; }
.stage    { grid-column: 1; }
.rail     { grid-column: 2; grid-row: 2 / -1; border-left: 1px solid var(--c-border); }
```

- The 1 px rail division is a structural edge of a full-height column, not a left-border accent on a
  card; the banned pattern (`border-left: 4px solid …` as decoration on cards, panels, callouts,
  quotes) appears nowhere in this specification.
- `viewbar` sits at the bottom of the stage column, one row, as in 5.4.
- `rail__head` 5.6 rem, `rail__card` max 45 % of the rail height (min 24 rem), `rail__body` scrolls.
- Sheets become centred dialogs: `width: min(88rem, 100 % - 6.4rem); max-height: min(88dvh, 92rem);
  top: 50 %; left: 50 %; transform: translate(-50 %, -50 %); border-radius: var(--radius)`, over a
  `shade`. The paint box uses `width: min(96rem, 100 % - 6.4rem)`.

### 5.6 Desktop (1280–1439) and wide (≥ 1440)

- Rail 40 rem, at ≥ 1440 44 rem.
- `.app { max-width: var(--max-width); margin-inline: auto; }` with `--max-width: 168rem`; above that
  width the page is centred and the surplus is background.
- `stage__picture` caps the drawing: `--width-picture: 112rem` at ≥ 1280, `124rem` at ≥ 1440; the
  canvas never grows past it, so a 27-inch screen does not stretch a 900 px photo.
- Hover states exist from `(hover: hover)` upward and add nothing that touch does not have.
- The readout additionally shows the hovered colour on a fine pointer (section 9.4).

### 5.7 Print

`print.css` keeps today's substance: the shell is unwound to block flow, `masthead`, `viewbar`,
`rail`, `dock`, `sheet`, `shade`, `note`, `stage__readout` and `stage__steps` are `display: none`, the
canvas is centred at `max-height: 150mm`, then `legend` (mix) or `layersheet` (layer) prints. The
`html { font-size: 10px }` hack of today disappears: `62.5 %` already makes 1 rem = 10 px, so the
print sheet keeps the metrics it was fitted with and `print.css` sets only `@page { margin: 12mm }`.

---

## 6. The touch model

These are acceptance criteria, not intentions.

| Rule | Value | Where it is enforced |
|---|---|---|
| Minimum hit area | 4.8 × 4.8 rem (48 px) | `ui.css`: every `.button`, `.toggle`, `.tab`, `.segmented__option`, `.dock__tab`, `.list__item`, `.chip--paint`, `.closeup__thumb` gets `min-height: var(--size-touch)` and `min-width: var(--size-touch)` |
| Primary actions | 5.6 rem tall | `.button--primary`, `.dock__tab`, `.tab`, `.sheet__head .button`, `Previous` / `Next` in the step bar |
| Gap between neighbouring targets | ≥ 0.8 rem | every control row uses `gap: var(--gap-05x)`; segmented controls are the one exception and are therefore drawn as one control with 1 px internal rules and a minimum option width of 7.2 rem |
| Hover | never carries meaning | no `title` attribute is used as the only carrier of information anywhere; see section 10 for the replacement text of every current `title` |
| Double click | not used | the saturation and contrast reset becomes the visible button `Back to the photo as it is` |
| Drag | always has a non-drag path | close-up framing: `Frame` → tap the picture places a frame at 40 % of the picture centred on the tap → `Use this part`; the card sheet: drag the handle **or** tap `More`; full-size picture: drag to move **or** switch `Full size` off |
| Sliders | thumb 3.2 rem, track 0.6 rem, row 4.8 rem, plus a `Less` / `More` stepper of 4.8 × 4.8 rem each and a value in tabular figures | `forms.css` `.slider` |
| Checkboxes | the whole 4.8 rem row is the target | `.check` |
| Nested scrolling | no region under 24 rem; `overscroll-behavior: contain` | 5.2 |
| Tap feedback | `:active` within 0 ms: background `--c-accent`, no movement | `ui.css` |
| Keyboard | every control is a real `button`, `input` or `a`; `focus-visible` ring everywhere | 9.1 |
| Pointer events | `touch-action: none` only on the framing surface while framing is on | `stage.css` |

---

## 7. Tokens

File `src/css/properties.css`. Plain CSS, house names, no Sass.

### 7.1 Colour — light

```css
:root {
  --c-background: #f2efe8;   /* the page: unbleached paper */
  --c-white:      #ffffff;   /* raised surfaces: rail, sheets, cards, the picture's own paper */
  --c-copy:       #23201c;
  --c-copy-light: #655e55;
  --c-head:       #14120f;
  --c-border:     #ded7c9;
  --c-corporate:      #2f3a40;  /* the one interactive ink: active tab, chosen option, focus ring */
  --c-corporate-hover:#1b2328;
  --c-accent:     #e6e1d4;   /* quiet selected fill behind copy */
  --c-danger:     #a0352a;
  --c-success:    #2f6b45;
  --c-attention:  #8a6410;   /* addition: the middle of the three match grades */
  --c-shade:      rgba(35, 32, 28, 0.32);  /* addition: the scrim behind a sheet */
}
```

### 7.2 Colour — dark

```css
@media (prefers-color-scheme: dark) {
  :root {
    --c-background: #191816;
    --c-white:      #232120;   /* the token keeps its house name; in dark it is the raised surface */
    --c-copy:       #ece7dc;
    --c-copy-light: #a79e91;
    --c-head:       #f8f4ea;
    --c-border:     #38342f;
    --c-corporate:      #cfd8dc;
    --c-corporate-hover:#ffffff;
    --c-accent:     #2f2b27;
    --c-danger:     #e39186;
    --c-success:    #8cc3a1;
    --c-attention:  #d6b05f;
    --c-shade:      rgba(0, 0, 0, 0.55);
  }
}
```

Contrast, measured against the surface each token is used on: copy on `--c-white` 15.0:1 light /
13.4:1 dark; `--c-copy-light` on `--c-background` 5.6:1 / 5.9:1; `--c-white` on `--c-corporate`
10.2:1; `--c-background` on `--c-corporate` in dark 11.1:1. Every one clears WCAG AA at body size and
AAA at `--fs-copy` and above, which is what sunlight on a studio table needs.

Two additions to the house set are declared above: `--c-attention` (the match quality has three
grades — `--c-success`, `--c-attention`, `--c-danger` — and today's `--fair` has no house name) and
`--c-shade`. Everything else uses only the house names.

### 7.3 Type

```css
:root {
  --ff-copy:  'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --ff-head:  var(--ff-copy);
  --ff-fixed: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;   /* hex codes only */

  --fs-mini: 1.2rem;  --fs-small: 1.4rem;  --fs-copy: 1.6rem;
  --fs-medium: 1.8rem; --fs-large: 2.0rem;
  --fs-hl-small: 2.0rem; --fs-hl-medium: 2.4rem; --fs-hl-large: 2.8rem;
}
@media (min-width: 768px) {
  :root { --fs-mini: 1.3rem; --fs-small: 1.5rem; --fs-copy: 1.7rem; --fs-medium: 1.9rem;
          --fs-large: 2.2rem; --fs-hl-small: 2.2rem; --fs-hl-medium: 2.6rem; --fs-hl-large: 3.2rem; }
}
@media (min-width: 1024px) {
  :root { --fs-medium: 2.0rem; --fs-large: 2.3rem; --fs-hl-small: 2.3rem;
          --fs-hl-medium: 2.8rem; --fs-hl-large: 3.6rem; }
}
@media (min-width: 1280px) {
  :root { --fs-large: 2.4rem; --fs-hl-small: 2.4rem; --fs-hl-medium: 3.0rem; --fs-hl-large: 4.0rem; }
}
@media (min-width: 1440px) { :root { --fs-hl-large: 4.4rem; } }
```

`html { font-size: 62.5% }` makes 1 rem = 10 px, so every value above reads as the pixel size it is.
This is the fix for the brief's complaint that "1.2rem = 12px looks odd": from now on it *is* 12 px by
construction. The ramp steps at 768 as well as at the house breakpoints 1024 / 1280 / 1440, because
the primary device sits below 1024 and the body size has to reach 17 px there; this is a deliberate
deviation and the only one.

Body size is `--fs-copy`: 16 px on the phone, 17 px from the iPad up. The phone screenshot's fault —
labels set at headline size — comes from a base of 1.4 rem that never stepped down; here the base is
set once and the ramp only ever grows.

### 7.4 Space, radius, shadow, size

```css
:root {
  --gap: 1.6rem;
  --gap-025x: calc(var(--gap) * 0.25);   /* 4 */
  --gap-05x:  calc(var(--gap) * 0.5);    /* 8 */
  --gap-15x:  calc(var(--gap) * 1.5);    /* 24 */
  --gap-2x:   calc(var(--gap) * 2);      /* 32 */
  --gap-3x:   calc(var(--gap) * 3);      /* 48 */

  --m-vert: 2.4rem; --m-vert-slim: 1.6rem; --m-vert-2x: 4.8rem;

  --max-width: 168rem;
  --article-width: 72rem;
  --width-rail: 36rem;        /* 1024+; 40rem at 1280+, 44rem at 1440+ */
  --width-picture: 112rem;    /* 1280+; 124rem at 1440+ */
  --width-sheet: 88rem;

  --radius: 1.2rem;           /* sheets, rail panel, cards */
  --radius-medium: 0.8rem;    /* buttons, segmented controls, inputs */
  --radius-small: 0.4rem;     /* swatches, chips, bars */

  --shadow: 0 0.2rem 2.4rem rgba(35, 32, 28, 0.18);
  --shadow-flat: 0 0.1rem 0 var(--c-border);

  --size-touch: 4.8rem;
  --size-touch-lg: 5.6rem;
  --size-thumb: 3.2rem;
  --size-swatch: 4.0rem;
  --size-swatch-small: 2.4rem;

  --z-rail: 2; --z-dock: 20; --z-shade: 29; --z-sheet: 30; --z-banner: 40;

  --speed: 180ms;
}
@media (prefers-color-scheme: dark) { :root { --shadow: 0 0.2rem 2.4rem rgba(0, 0, 0, 0.55); } }
@media (prefers-reduced-motion: reduce) { :root { --speed: 1ms; } }
```

`--width-rail`, `--width-picture`, `--width-sheet`, `--size-*`, `--z-*` and `--speed` are layout
tokens added in house style (lowercase, hyphenated, prefixed by kind). They are listed here so no
implementer invents a second naming scheme.

---

## 8. Typography

### 8.1 The face: Source Sans 3 (variable, weight axis 200–900)

Self-hosted at `public/fonts/source-sans-3.woff2` (weight axis, Latin subset) and
`public/fonts/source-sans-3-italic.woff2` is **not** shipped — the interface uses no italics.
`fonts.css`:

```css
@font-face {
  font-family: 'Source Sans 3';
  src: url('/fonts/source-sans-3.woff2') format('woff2-variations');
  font-weight: 200 900;
  font-style: normal;
  font-display: swap;
}
```

Weights used: 400 (copy, meta), 600 (labels, active tab, titles), 700 (numbers in a swatch or a bar).
No third file, no second family.

### 8.2 Why this face and not the two obvious alternatives

Judged on legibility at arm's length on a tablet, with three-digit paint numbers everywhere.

- **Source Sans 3** has a large x-height against a moderate cap height (x/cap ≈ 0.72), open apertures
  on `a c e s`, a `1` with both a flag and a foot serif, a `7` without a bar, and a `I` with
  crossbars — so `1 / 7 / l / I` stay apart at 14 px, which is the size the paint numbers are set at
  in a list row. Its lining figures are available as true tabular (`tnum`), so a column of 663 / 485 /
  208 aligns without the implementer resorting to a monospace fallback. One variable file carries 400
  and 600, so the weight contrast that the rail's hierarchy depends on costs no second request.
- **Inter** is rejected on two grounds, not on taste: its default spacing is tuned for 16 px and
  tightens perceptibly at the 12–14 px meta sizes this interface uses most, and its `1` has no foot
  serif, which in a glanced three-digit number next to a wet brush is the difference that matters.
  That it is also the default face of the kind of application the owner does not want to resemble is
  a second, lesser reason.
- **IBM Plex Sans** has excellent tabular figures but a narrower lowercase and flatter bowls; at 17 px
  seen from 60–80 cm its `e a o` close up faster than Source Sans's, and its distinctly engineered
  tone pulls the page towards a dashboard, which is the opposite of a plan sheet.

A serif (Literata, Source Serif 4) was considered for the editorial tone this team argues for and
dropped: at `--fs-mini` and `--fs-small`, where most of this interface's text actually lives (meta
lines, percentages, dilutions), serifs cost more legibility under glare than the tone is worth. The
editorial quality is carried by spacing, measure and restraint instead.

### 8.3 Roles

| Role | Size | Weight | Line height | Letter spacing | Used for |
|---|---|---|---|---|---|
| Page title | `--fs-hl-small` | 600 | 1.2 | −0.01em | gate title, sheet titles |
| Section title | `--fs-medium` | 600 | 1.25 | 0 | rail card title, plan section headings, paint box group titles |
| Eyebrow | `--fs-mini` | 600 | 1.2 | 0.08em, uppercase | `Watercolourlove` in the masthead, plan section labels |
| Copy | `--fs-copy` | 400 | 1.5 | 0 | list titles, sheet body text, notes |
| Control label | `--fs-copy` | 600 | 1.2 | 0 | slider labels, toggle labels, tab labels |
| Value | `--fs-copy` | 600 | 1.2 | 0, `tabular-nums` | slider values, counts, percentages |
| Meta | `--fs-small` | 400 | 1.35 | 0 | list meta line, hints, readout |
| Micro | `--fs-mini` | 600 | 1.1 | 0.02em, `tabular-nums` | numbers inside swatches, recipe bars, wash letters |
| Hex | `--fs-small` | 400 | 1.2 | 0.02em, `--ff-fixed` | hex codes in the colour card |

`typography.css` sets `font-variant-numeric: tabular-nums` on `.value`, `.list__number`,
`.list__meta`, `.recipe`, `.slider__value`, `.chip__strong` and every percentage. Headings carry no
margin of their own; vertical rhythm is `--m-vert-slim` between controls and `--m-vert` between plan
sections.

---

## 9. Components, states and copy

States are specified once, here, and apply to every block that uses the class.

### 9.1 Shared states

| State | Rule |
|---|---|
| default | as described per block |
| hover (`@media (hover: hover)`) | background `--c-accent`; no movement, no shadow change |
| active (`:active`) | background `--c-accent`; `--c-corporate` text; applied with no transition so the feedback is immediate |
| focus-visible | `outline: 2px solid var(--c-corporate); outline-offset: 2px; border-radius: inherit`. Never removed, never replaced by a shadow |
| disabled | `opacity: 0.4; cursor: default`; still focusable only if it is a real control that explains itself; otherwise `disabled` |
| selected / pressed (`aria-pressed="true"`, `--active`) | background `--c-corporate`, text `--c-white` (dark mode: text `--c-background`), weight 600 |
| busy | the control keeps its size and shows its busy word (`Asking…`, `Analysing…`); the stage shows `stage__progress`, a 2 px indeterminate line in `--c-corporate` |

### 9.2 `button` (ui.css)

| Modifier | Look | Used for |
|---|---|---|
| `button--primary` | fill `--c-corporate`, text `--c-white`, 5.6 rem tall, radius `--radius-medium` | `Continue`, `Update mixes`, `Use this part`, `Save this picture` |
| `button--quiet` | surface `--c-background`, 1 px `--c-border`, text `--c-copy`, 4.8 rem | most actions |
| `button--plain` | no border, no fill, text `--c-copy-light` underlined, 4.8 rem | `Close`, `Hide`, legal links, `Delete account` |
| `button--danger` | text `--c-danger`, 1 px `--c-danger` | `Yes, delete my account` |

No icon-only buttons exist.

### 9.3 `segmented` (ui.css)

One control, options flush, 1 px internal rules in `--c-border`, outer 1 px border, radius
`--radius-medium`, every option `min-height: var(--size-touch)`, `min-width: 7.2rem`, label
`--fs-copy` 600, `flex: 1 1 0`. Active option: fill `--c-corporate`, text `--c-white`.
**Never more than four options**, and at ≤ 374 px viewport width a four-option control drops to
`--fs-small` instead of wrapping. Used for: Method, Areas, Max. paints, Max. coats, the view switch,
the step view switch, AI off/on, provider, boxes.

### 9.4 `stage`

- `stage__canvas`: `cursor: crosshair` only on a fine pointer; `cursor: default` on coarse.
- `stage__progress`: 0.2 rem, top of the stage, only while `analysis.busy`.
- `stage__frame`: the close-up frame, 2 px `--c-corporate` outline with a `--c-shade` outside, two
  corner handles of 4.8 × 4.8 rem (top-left, bottom-right).
- `stage__readout` content, in priority:

| Condition | Text |
|---|---|
| analysis busy, mix | `Analysing…` |
| analysis busy, layer | `Planning layers…` |
| framing on, no frame yet | coarse: `Tap the picture where the detail is, or drag a frame.` · fine: `Drag a frame over the part to zoom in on.` |
| framing on, frame placed | `Move the corners, then take this part.` |
| full size on | `Full size. Drag the picture to move it.` |
| sketch view | `The sketch to transfer to paper.` |
| mix, a colour selected | `Colour 7 · 12 % of image · 2 x 663 Sepia brown + 1 x 485 Indigo` |
| mix, a colour hovered (fine pointer only) | the same line for the hovered colour |
| mix, nothing selected | coarse: `Tap an area to see its recipe.` · fine: `Click an area to see its recipe.` |
| layer, step walk open | `Step 3 of 12 · Layer 2 of 5, Sepia brown, coat 1 of 2` |
| layer, spot chosen | `This spot: 3 coats in all. Layers 1, 2 and 4.` |
| layer, one layer solo | `Layer 3 alone. Tap All to see the picture.` |
| layer, nothing chosen, layers exist | coarse: `Tap the picture to see what a spot gets.` · fine: `Click the picture to see what a spot gets.` |
| no layers planned | `No base paints chosen. Open Paints.` |

The two pointer variants are written as two strings and swapped by `window.matchMedia('(pointer:
coarse)')`, which the code already uses for `hasCamera`.

### 9.5 `viewbar`

- View switch — `segmented`, copy per mode and width:

| Mode | ≤ 767 px | ≥ 768 px |
|---|---|---|
| mix | `Paint` · `Colour` · `Photo` · `Sketch` | `Mixed paint` · `Photo colour` · `Photo` · `Sketch` |
| layer | `Paint` · `Photo` · `Sketch` | `Layered paint` · `Photo` · `Sketch` |
| step walk open | `Where` · `Wash` · `So far` | `Where to paint` · `This wash` · `So far` |

- Toggles — `toggle` block, `aria-pressed`, label-only, 4.8 rem: `Outlines`, `Numbers`,
  `Guides` (sketch view only, in place of `Outlines`/`Numbers`), `Full size`, `Frame`.
- `Frame` pressed opens framing; while framing, two buttons appear in the toggle row in place of
  `Full size` and `Frame`: `Use this part` (`button--primary`) and `Cancel`.
- Layer chips — `viewbar__layers`: one chip per painted layer, background the layer's colour at its
  top coat, label the layer number (`1`…`7`, `A1`…), text colour from `contrastText`, 4.8 rem square,
  `aria-pressed` for solo; last item `All` as a `button--quiet`.

### 9.6 `rail` and `tabs`

- `rail__head`: `tab` × 2 and the `Paints` button. A tab is 5.6 rem tall, `--fs-medium`, 600 when
  active with a 2 px `--c-corporate` underline flush to the bottom of the head, 400 and
  `--c-copy-light` when not. Tab labels: `Colours` / `Layers`, `Plan`.
- `rail__card`: see 9.7.
- `rail__body`: the tab content, padding `var(--gap)`, `overflow-y: auto`.

### 9.7 `card` (the slot)

Head: title (`--fs-medium`, 600) left, `Close` (`button--plain`) right; on a sheet, a 4.0 rem drag
handle above the head and a `More` button that raises it.

**Colour card** (mix):

```
Colour 7
[ swatch 4.0rem ] #6e5e47   Target
[ swatch 4.0rem ] #6f5b48   Your mix          Match: excellent
Change colour            Reset to photo
Edit only this area
Recipes
  (list of up to 5 recipe rows, the chosen one marked selected)
```

Copy: `Target`, `Your mix`, `Match: excellent` / `good` / `rough` (from `matchQuality`),
`Change colour`, `Reset to photo` (only when the colour was changed), `Edit only this area` (only when
the clicked area shares its colour with others), `Recipes`,
`Same mix as 6, 8 – only the amount of water differs.`, empty state
`No paints in the box. Open Paints and choose what you own.`

**Spot card** (layer): title `This spot`; `Photo` / `Layered` swatch pair; `Match: excellent`;
subtitle `Layers on this spot`; rows `3  [swatch]  Sepia brown  2 coats`; empty
`Leave the paper white.`; note `Not painted here: 2, 5.` A row with coats is a button that opens the
step that paints it; a row without coats is not a button.

**Step card** (layer): title `Step 3 of 12`; line
`Layer 2 of 5, Sepia brown, coat 1 of 2`; the wash chip
`One stroke on white paper` / `2 coats on white paper`; then three labelled lines:

```
Mix     1:3 with water, like tea.
Paint   the areas in full colour, 14 % of the picture.
Then    let it dry completely.        (last step: you are done.)
```

Warning line when a step has more than 30 shapes:
`32 separate shapes in this step. A higher "Simplify areas" gives fewer and bigger ones.`

### 9.8 `list` (both modes)

```
.list__item { display: grid; grid-template-columns: 4.0rem var(--size-swatch) minmax(0, 1fr);
  column-gap: var(--gap-05x); row-gap: var(--gap-025x); padding: var(--gap-05x);
  min-height: var(--size-touch-lg); border-radius: var(--radius-medium); }
```

- `list__number` right-aligned, 700, `--fs-copy`, tabular.
- `list__swatch` 4.0 rem square, `--radius-small`, 1 px inset border `rgba(0,0,0,0.18)`.
- `list__title` `--fs-copy`, paint numbers in 700.
- `list__meta` `--fs-small`, `--c-copy-light`, one line, ellipsis.
- `list__bar` (recipe ratio) spans columns 2–3, height 2.0 rem, radius `--radius-small`; segments carry
  their parts in `--fs-mini` 700.
- `list__washes` (mix) / `list__coats` (layer): buttons 4.8 rem tall, flush inside one bar, each
  labelled with its wash letter or `2 coats`.
- Selected item: background `--c-accent`; the number turns `--c-corporate` and 700.
- Layer rows additionally carry `list__tick`, a 4.8 rem checkbox cell at the far left; the grid becomes
  `4.8rem 4.0rem var(--size-swatch) minmax(0,1fr)`.
- The whole title block is one button; the tick and each wash/coat segment are separate buttons, all
  ≥ 4.8 rem and ≥ 0.8 rem apart from each other where they are not inside a single bar.

Counts above the list (`list__count`, `--fs-small`, `--c-copy-light`):
mix `20 colours in 14 mixes` · layer `7 layers, 2 accents, 12 steps · match: excellent`.

Wash key, shown only when a mix has more than one wash: `Washes: L light · M medium · R rich` (letters
and labels from `WASH_LETTERS`, unchanged).

### 9.9 `plan`

One control per row, full width, never a grid of columns. Sections, each with an eyebrow heading:

```
METHOD
  [ Mix | Layer ]
  Mix: one mixed colour per area, painted once.
  Layer: a few thin washes, each painted over the dry one before.

THE PLAN
  Colours              20        [ Less ] [ ========o======== ] [ More ]
  More colours, more areas to paint.
  Details               5        [ Less ] [ ====o============ ] [ More ]
  0 keeps the picture closest to the photo. 10 lets small areas keep their own mix.
  Max. paints                    [ 1 | 2 | 3 ]
  Paints in one mix.
  Simplify areas        4        [ Less ] [ ===o============= ] [ More ]
  Higher gives fewer, bigger, calmer shapes.
  Areas                          [ Organic | Geometric ]
  Organic: areas follow the outlines in the photo.

THE PHOTO
  Saturation         200 %       [ Less ] [ ===========o===== ] [ More ]
  Contrast           100 %       [ Less ] [ ======o========== ] [ More ]
  [ Back to the photo as it is ]           (only when one of them is not 100 %)

AI HELP
  Off. The app chooses the colours and the paints itself.
  [ Open AI help ]
```

In layer mode `THE PLAN` reads `Layers` / `Accents` / `Max. coats` / `Simplify areas` / `Areas`, with
the hints:

- `Layers` (Auto): `Washes; accents and second coats are extra steps.`
- `Layers` (by hand): `Chosen by hand. Auto in the paint box picks again.`
- `Accents`: `Accents: small strong touches painted last, first for a colour the washes miss, then for the darks.`
- `Max. coats`: `How often one wash may be painted over itself.`
- `Areas` (geometric): `Geometric: shapes with straight edges, laid over each other from large to small.`

AI status line: `Off. The app chooses the colours and the paints itself.` /
`On. Not asked about this picture yet.` / `On. Answered for this picture.`

Foot of the tab: `Every change here plans the picture again.`

### 9.10 `slider` (forms.css)

```
.slider            { display: grid; grid-template-columns: minmax(0,1fr) auto; row-gap: var(--gap-05x); }
.slider__label     { font-weight: 600; }
.slider__value     { justify-self: end; font-weight: 600; font-variant-numeric: tabular-nums; }
.slider__row       { grid-column: 1 / -1; display: grid;
                     grid-template-columns: var(--size-touch) minmax(0,1fr) var(--size-touch);
                     gap: var(--gap-05x); align-items: center; }
.slider__step      { width: var(--size-touch); height: var(--size-touch); }   /* Less and More */
.slider__input     { height: var(--size-touch); appearance: none; background: transparent; }
```

Track 0.6 rem, radius `--radius-small`, filled part `--c-corporate`, rest `--c-border`. Thumb
`--size-thumb` (3.2 rem), `--c-white` fill, 2 px `--c-corporate` border, radius 50 %, no shadow.
`::-webkit-slider-thumb` and `::-moz-range-thumb` both specified. The `Less` and `More` buttons move
the value by one step of the input's `step` attribute and are the exact-value path required by the
brief; they are labelled with those words, never with a symbol, and carry
`aria-label="Fewer colours"` / `aria-label="More colours"` naming the control they belong to.
`@change` re-analyses, as today; the steppers fire `@change` on each press.

### 9.11 `toggle` and `check`

`toggle` is a `button` with `aria-pressed`; it is **not** a switch graphic. `check` is a real
checkbox, 2.4 rem box, 2 px `--c-border`, checked: fill `--c-corporate` with a drawn 2 px tick path
in `--c-white` (an SVG inside the control's own CSS, not a unicode character), the whole row 4.8 rem
and clickable.

### 9.12 `sheet`

Head 5.6 rem: title (`--fs-hl-small`, 600) left, `Close` (`button--plain`) right. Opening: translate
from 100 % to 0 over `--speed`, ease-out; closing the reverse. Escape closes; a tap on the `shade`
closes; `Close` closes. Focus moves to the head on open and back to the opener on close. The paint
box keeps today's rule that closing applies pending changes.

### 9.13 `paintbox`

- Head: title `Paint box` / `Paint box: base paints`, then the action row:
  `Auto`, `Revert` (mix only), `Clear`, `Update mixes` / `Update layers` (`button--primary`,
  disabled until something changed), `Close`.
- Boxes row: a `segmented` of box names, then `New box`, `Rename`, `Delete box` (confirms in place:
  `Really delete?`).
- Layer note: `Layer mode paints with a few base paints, one layer each (4 of 7). They are kept apart
  from the paints selected for mixing.` plus, when full: `7 layers at most: remove one before adding
  another.`
- Groups: `Selected paints` / `Base paints`, then `Pans`, `Tubes`, then `Your own paints`. Each
  group head carries the checkbox `Use for Auto`.
- `chip--paint`: 5.6 rem tall, `min-width: 15rem`, grid
  `auto-fill minmax(15rem, 1fr)`, gap 0.8 rem. Layout inside: swatch 4.0 rem square, then the number
  (700) and the name (`--fs-small`, two lines maximum). Selected chips carry the selected state of
  9.1 (fill `--c-corporate`); the pan/tube mark is the word `Pan` or `Tube` at `--fs-mini` under the
  name, not a letter nobody can decode. In use in a recipe: the meta word `in use`.
- Empty states: `No paints selected. Tap a paint below to add it.` /
  `No base paints chosen. Tap a paint below to add it, or press Auto.` / `All of these are selected.` /
  `Add paints of any brand that are not in the list above.`
- Own paints form: fields `Brand`, `Number`, `Name`, `Form` (`Pan` / `Tube`), `Colour`; note
  `Pick the colour of a medium wash on white paper, not the colour straight from the pan or tube.
  Schmincke Horadam numbers fill in name and colour.`; buttons `Add paint` / `Save paint`, `Cancel`.
- The brief's inventory item "All / Invert / None" is covered by the existing actions and keeps their
  names: `Auto` (let the app choose), `Revert` (back to the stored selection), `Clear` (none). No new
  behaviour is introduced in this round.

### 9.14 `closeup`

- Bar above the picture while a close-up is open: `Base picture` (`button--quiet`, 4.8 rem),
  the text `Detail 2`, `Remove` (`button--plain`, 4.8 rem). `Remove` removes the close-up on screen
  and returns to the base picture. There is no per-thumbnail cross.
- Strip under the readout: thumbnails 9.6 × 6.4 rem, radius `--radius-small`, number bottom-left in
  `--fs-mini` 700 on a `--c-shade` plate; the whole thumbnail is one button; gap 0.8 rem; horizontal
  scroll with `overscroll-behavior: contain`. Active thumbnail: 2 px `--c-corporate` outline.

### 9.15 `dock` (phone only)

Three cells: tab `Colours` / `Layers`, tab `Plan`, button `Paints`. Tabs carry `aria-pressed` and the
selected state when their sheet is open; `Paints` never looks selected. 5.6 rem tall inside a 6.4 rem
bar, 0.8 rem apart.

### 9.16 `masthead`

Left: eyebrow `Watercolourlove` (≥ 768 px only), then the picture name at `--fs-medium` 600,
truncated; the marker `In collection` at `--fs-mini` next to it when `analysis.savedId` is set.
Right: `Picture`, `More`, both `button--quiet`, 4.8 rem.

### 9.17 `note`

Full-width bar under the masthead, `--c-accent` background, `--fs-small`, 4.8 rem minimum, with a
`Hide` button where the message is dismissible. Modifier `note--danger`: text `--c-danger`, 1 px
`--c-danger` border, background `--c-white`. Carries `analysis.error`, `collection.error` and
`account.notice`. No left-border accent, no icon.

### 9.18 `consent`

Fixed at the bottom, above the dock, `z-index: var(--z-banner)`, `--c-white`, 1 px top border, body
text `--fs-small`, two buttons `Decline` and `Accept` at 5.6 rem, side by side, 0.8 rem apart. Copy
unchanged: title `Analytics cookies`, the existing paragraph.

### 9.19 `ai` (sheet)

Title `AI help`. Sections in this order: the switch `Off | On` with the existing explanation
paragraph; `Provider` (segmented); `Model` (select or text input); `Your API key` (password input)
with the hint `Stays in this browser and is sent only to {company}.` and the link `Get a key`;
the checkbox `Remember the key on this device`; the consent checkbox with its existing full sentence;
the button `Ask about this picture` / `Ask again` / `Asking…` with the cost estimate under it; then
the answer: notes, mixes, `Details to keep`, the final-wash checkbox, the sketch sentence, the match
sentence, the token and cost line; finally `Forget key and consent`. All copy unchanged from
`AiPanel.vue`; only the container and the control blocks change.

### 9.20 `collection`, `account`, `pro`, `gate`

All four use `sheet` (the gate uses the full page). Copy unchanged from the current components.
Layout rules:

- Collection: grid of items, `repeat(auto-fill, minmax(16rem, 1fr))`, thumbnail 16:10 as one button,
  name under it, `Rename` and `Delete` as `button--plain` 4.8 rem, delete confirms in place. Head:
  `Save this picture` / `Save changes` (`button--primary`) and `Close`. Empty state unchanged.
- Account, Pro, Gate: a single column of `--article-width`, controls 5.6 rem, the destructive action
  last and separated by `--m-vert`.

---

## 10. Every `title` that carries meaning, and where its text goes

The brief forbids hover-only meaning. These are the current `title` attributes that say something and
their new home. A `title` may remain only where it repeats a visible label.

| Current carrier | New home |
|---|---|
| `painting__zoom` (fit/full) | the toggle `Full size`, plus the readout line `Full size. Drag the picture to move it.` |
| `painting__zoom--frame` | the toggle `Frame`, plus the readout line while framing |
| Method options (`Mix every colour…`, `Glaze a few paints…`) | the two hint lines under the Method control |
| Areas options | the hint line under the Areas control |
| `Max. coats` title | the hint `How often one wash may be painted over itself.` |
| Saturation/contrast `Reset` title | the button `Back to the photo as it is` |
| Palette base swatch (`Base colour of the mix: #…`) | the colour card's `Target` / `Your mix` lines |
| Palette wash (`L: medium, 12 % of image`) | the wash key line plus the card's recipe rows |
| Palette recipe segment (`2 x 663 Sepia brown`) | printed in the segment and in full in the card |
| Layer row (`Show only this layer…`) | the list meta line plus the readout `Layer 3 alone. Tap All to see the picture.` |
| Layer coat segment | the segment is labelled `2 coats` and the step card says the rest |
| Layer swatch (`One stroke on white paper…`) | the card's wash chip text and the note `Colours are an estimate from one swatch: test the wash on a scrap first.` under the list |
| `PaintChip` description (vendor, German name, estimate, note) | the paint box chip shows brand line and `Pan` / `Tube`; the rest appears in the chip's second line at `--fs-mini`: `Schmincke Horadam · Sepiabraun · colour estimated` |
| `PanelToggle` (`Show the colours`) | the component is removed |
| `CloseupStrip` remove (`Remove detail 2`) | the `Remove` button in the close-up bar |
| `RecipeTip` as a whole | the readout line and the colour card |
| Step view options | the three step hints move under the switch as one line: `Where to paint: the paper after this step. This wash: only what is painted now. So far: everything up to here.` |

---

## 11. Feature inventory — where everything lives

| Feature | Surface | Phone | iPad portrait | iPad landscape | Desktop |
|---|---|---|---|---|---|
| Load photo | `Picture` sheet → `New photo` | yes | yes | yes | yes |
| Take photo | `Picture` sheet → `Take a photo` (coarse pointer only) | yes | yes | yes | — |
| Next sample | `Picture` sheet → `Next sample` | yes | yes | yes | yes |
| Save to collection | `Picture` sheet → `Save to collection` / `Save changes` | yes | yes | yes | yes |
| Open collection | `Picture` sheet → `Collection` → collection sheet | yes | yes | yes | yes |
| Rename, delete a saved picture | collection sheet item | yes | yes | yes | yes |
| Print / PDF | `Picture` sheet → `Print / PDF` | yes | yes | yes | yes |
| Method Mix / Layer | `Plan` → Method | yes | yes | yes | yes |
| Areas Organic / Geometric | `Plan` → The plan | yes | yes | yes | yes |
| Simplify | `Plan` → The plan | yes | yes | yes | yes |
| Colours | `Plan` → The plan (mix) | yes | yes | yes | yes |
| Details (variety) | `Plan` → The plan (mix) | yes | yes | yes | yes |
| Max. paints | `Plan` → The plan (mix) | yes | yes | yes | yes |
| Layers | `Plan` → The plan (layer) | yes | yes | yes | yes |
| Accents | `Plan` → The plan (layer) | yes | yes | yes | yes |
| Max. coats | `Plan` → The plan (layer) | yes | yes | yes | yes |
| Saturation, Contrast, reset | `Plan` → The photo | yes | yes | yes | yes |
| View switch | view bar | yes | yes | yes | yes |
| Outlines, Numbers | view bar | yes | yes | yes | yes |
| Guides | view bar, sketch view only | yes | yes | yes | yes |
| Fit / full size | view bar → `Full size` | yes | yes | yes | yes |
| Select an area, see its recipe | picture → card slot | sheet | sheet | rail | rail |
| Change a colour | colour card → `Change colour` | yes | yes | yes | yes |
| Reset to photo colour | colour card → `Reset to photo` | yes | yes | yes | yes |
| Edit only the clicked area | colour card → `Edit only this area` | yes | yes | yes | yes |
| Alternative recipes | colour card → `Recipes` | yes | yes | yes | yes |
| Colour list with washes | rail tab `Colours` | sheet | panel | rail | rail |
| Solo a layer | view bar chips | yes | yes | yes | yes |
| Show all layers | view bar `All` | yes | yes | yes | yes |
| Tick layers | `Layers` list, tick column | sheet | panel | rail | rail |
| Coats | `Layers` list, coat bar | yes | yes | yes | yes |
| The spot card | card slot | sheet | sheet | rail | rail |
| Step walk | `Layers` list → `Paint step by step`; step bar on the stage; step card in the slot | yes | yes | yes | yes |
| Paint box, selected paints, pans/tubes, Auto/Revert/Clear, boxes, own paints, Pan/Tube marks | `Paints` sheet | dock | rail head | rail head | rail head |
| Close-up: frame | view bar → `Frame` | yes | yes | yes | yes |
| Close-up: thumbnails, return, remove | close-up bar and strip on the stage | yes | yes | yes | yes |
| AI panel, all of it | `AI help` sheet, from `Plan` → `Open AI help` and from `More` | yes | yes | yes | yes |
| Account: sign in, plan, export, delete | `More` → `Account` | yes | yes | yes | yes |
| Plan purchase | `More` → `Unlock everything`, and automatically when a limit is hit | yes | yes | yes | yes |
| Consent banner | `consent`, bottom | yes | yes | yes | yes |
| Manual, Privacy, Terms, Imprint, Privacy settings | `More` sheet, section `About` | yes | yes | yes | yes |

---

## 12. File structure

`src/main.js` imports `./css/site.css`. The folders `base/`, `layouts/` and the underscore prefixes
go. `site.css` is the only entry and holds nothing but `@import`, in cascade order:

```
@import './reset.css';
@import './fonts.css';
@import './properties.css';
@import './typography.css';
@import './scaffold.css';
@import './animations.css';
@import './header.css';     /* masthead */
@import './footer.css';     /* dock, about list */
@import './forms.css';      /* field, slider, stepper, check, input, select */
@import './tables.css';     /* the print legend's table-like rows */
@import './ui.css';         /* button, segmented, toggle, swatch, chip, note, shade */
@import './components.css';
@import './print.css';
```

`components.css` imports one file per block:

```
components/stage.css      components/viewbar.css   components/rail.css
components/tabs.css       components/card.css      components/list.css
components/recipe.css     components/plan.css      components/sheet.css
components/paintbox.css   components/collection.css components/account.css
components/pro.css        components/consent.css   components/ai.css
components/gate.css       components/closeup.css   components/steps.css
components/legend.css     components/layersheet.css
```

Twenty blocks against today's twenty-six files, with four blocks (`panel`, `controls`, `palette`,
`editor`, `layers`, `layerstrip`, `tip`, `field`, `input`, `swatch`, `chip`, `button`) folded into
`ui.css`, `forms.css`, `list.css` and `card.css`.

---

## 13. Migration notes, file by file

Nothing in `src/stores/` or `src/lib/` changes. No store property, getter or action is renamed; the
layout store keeps its API, but `collapsed` and `positions` stop being read (folding is replaced by
tabs, floating by the card slot).

| File | What happens |
|---|---|
| `index.html` | the emoji favicon goes; `<link rel="icon" href="/favicon.svg">` to a drawn 32 × 32 SVG: three flat areas in `#f2efe8`, `#d8cfbc`, `#2f3a40` with the numeral 1 cut out of the dark one. Add `<meta name="theme-color">` for both schemes. |
| `src/main.js` | import `./css/site.css` instead of `./css/main.css` |
| `src/App.vue` | becomes the shell: `masthead`, `note`, `stage` (with `CloseupBar`, `PaintingCanvas`, `StageReadout`, `CloseupStrip`, `LayerSteps` bar), `viewbar`, then either `rail` (≥ 768 px) or `dock` + sheets (< 768 px). The `app__hint` computed moves into the readout rules of 9.4. `app__footer` moves into the `More` sheet. New local state: which rail tab is open, which sheet is open. Breakpoint is read once with `matchMedia` and kept reactive. |
| `PaintingCanvas.vue` | the two floating icon buttons go (to the view bar); `RecipeTip` import goes; `onMove` stops positioning a tooltip and instead sets the hovered entry for the readout; framing gains the tap path and the two corner handles; the status paragraph goes (readout). Drawing code, `SCALE`, `drawMixes`, `drawLayers`, `drawSketch`, `regionAtCanvasPixel` are untouched. |
| `ControlsPanel.vue` | **split**. Picture actions and the collection error → `PictureSheet.vue`. Method, the plan sliders, areas, saturation, contrast → `PlanPanel.vue`. View switch, outlines, numbers, guides → `ViewBar.vue`. The `AiPanel` import → the AI sheet. The `@dblclick` resets and the three-column `controls__settings` grid are deleted. |
| `AiPanel.vue` | unchanged logic, new container `sheet` and the control blocks of 9.10–9.11; the `controls__error` class becomes `note note--danger`. |
| `PaletteList.vue` | becomes `ColourList.vue` using the `list` block; the panel header becomes the rail count line; `PanelToggle` goes; the wash key keeps its text; rows gain the touch sizes of 9.8. |
| `EntryEditor.vue` | becomes `ColourCard.vue`; `useFloating` and the `startDrag` handler are deleted; the `editor--dragging` class goes; the `scrollIntoView` watcher goes (the slot is always visible or opens as a sheet). |
| `floating.js` | no longer imported. It may stay on disk until a clean-up task removes it; nothing may import it. |
| `RecipeTip.vue` | deleted. Its content is covered by the readout and the colour card. |
| `RecipeLine.vue` | kept, restyled: the `full` variant becomes the only variant in the card; `wide` stays for the print sheet; the empty-slot padding (`emptySlots`) is dropped in the card and kept in print. |
| `PaintChip.vue` | kept; the `title` description becomes a visible second line; size and selected state per 9.13. |
| `LayerList.vue` | becomes `LayerList.vue` on the `list` block, same rows as the colour list; `Paint step by step` moves here from `LayerSteps`; the three notes stay. |
| `LayerArea.vue` | becomes the spot card content in the card slot; markup to `card`. |
| `LayerSteps.vue` | splits: the bar (`Previous`, `Next`, `Close`, step title) stays on the stage; the step view switch moves into the view bar; the `Mix` / `Paint` / `Then` lines and the shape warning move into the step card. The arrow-key handler stays. |
| `LayerStrip.vue` | kept but promoted: it is the `viewbar__layers` row at every breakpoint, not a narrow-screen fallback; chips grow to 4.8 rem. |
| `LayerSheets.vue`, `PrintLegend.vue` | logic unchanged; classes move to `layersheet.css` and `legend.css`; they must keep working after the `62.5 %` root change (they already assume 1 rem = 10 px in print). |
| `PaintBox.vue` | container becomes `sheet--full` / centred dialog; the action row and the groups per 9.13; chips and own-paint rows get the touch sizes. Logic, including the apply-on-close rule, unchanged. |
| `CollectionDialog.vue` | container becomes `sheet`; grid per 9.20. |
| `ProDialog.vue`, `AccountDialog.vue`, `AccountGate.vue` | containers become `sheet` / `gate`; one visual language, same copy, controls at 5.6 rem. |
| `ConsentBanner.vue` | same copy, new `consent` block, buttons at 5.6 rem. |
| `CloseupBar.vue` | gains `Remove`; stays above the picture. |
| `CloseupStrip.vue` | the 22 px cross is deleted; thumbnails per 9.14. |
| `PanelToggle.vue` | deleted; `layout.toggle` is no longer called. |
| `src/css/main.css`, `base/`, `layouts/`, `components/_*.css` | deleted, replaced by section 12. |
| `src/__tests__/` | no test touches the DOM classes today; if one does after the rework, it is updated with the component it covers. |

---

## 14. Acceptance checks for this design

1. On a 390 × 844 px phone, in both modes and in every view, the picture is visible without scrolling,
   and no control row wraps.
2. No two labels collide at any width from 320 px upward; the plan has one control per row below
   1024 px.
3. Every interactive element measures at least 48 × 48 px in the browser's box model, and neighbouring
   targets are at least 8 px apart, except inside a segmented control.
4. Switching off every pointing device except touch leaves every function reachable; no information is
   lost when `title` attributes are ignored.
5. Nothing responds only to a double click, a long press or a drag.
6. Light and dark both pass AA at every text size, measured on the surface the text sits on.
7. Mix mode and layer mode use the same surfaces in the same places; a screenshot of each, with the
   list hidden, differs only in content.
8. No emoji, no decorative unicode character, no icon-only control, no `border-left` accent, no utility
   class, no scoped style anywhere in the result.

---

## 15. Open questions for round 2

1. Phone landscape under 520 px of height is specified as reduced chrome; it may be better to drop the
   view bar's second row into the `Plan` sheet there. Needs a device test.
2. `Details` (mix) and `Accents` (layer) sit in the same row position but mean different things. If the
   owner finds that confusing in use, `Details` can move under `Colours` as a sub-row.
3. The close-up strip costs 80 px of phone height whenever a close-up exists. An alternative is to show
   it only while the `Frame` toggle is pressed.
4. Whether `More` is the right name for the sheet that holds account, AI and the legal links, or whether
   account deserves its own masthead button on wide screens.
5. Whether the colour list on the phone should be a sheet at all, or a third of the screen under the
   picture, as on iPad portrait. That trade (picture height against list visibility) wants the owner's
   hands on the prototype.
