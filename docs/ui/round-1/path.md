# Team "Guided path" — Round 1: foundation

Specification for the UI rework of Watercolourlove (TASK-40).
Binding input: `docs/ui/brief.md`. Where this document and the brief disagree, the brief wins.

Scope of this round: information architecture, the user's path, the layout at every breakpoint, the
touch model, the first/second level split, the unification of mix mode and layer mode, and the fate
of the floating recipe panel, the pointer tooltip and the settings panel. Tokens, type, component
states and copy are specified to the level a competent implementer can build from. Nothing under
`src/` is changed in this round.

---

## 1. The diagnosis the design answers to

Four concrete faults, each with a fix that is named later in this document.

1. **The root cause of the phone screenshot is one line of CSS.** `src/css/base/_reset.css` sets
   `body { font: var(--font-size)/1.45 var(--font) }` with `--font-size: 1.4rem` while `html` keeps
   the browser default of 16 px. So the app's body text renders at **22.4 px** and every label is set
   at headline size. Everything in `docs/ui/evidence/phone-settings-2026-10-12.png` — the overlap of
   "Saturation200%Contrast100%", "Max. paints" wrapping over two lines, "Simplify areas" running into
   its own slider — follows from that. Fix: `html { font-size: 62.5% }`, so `1rem = 10px` and every
   `rem` value in the project reads as px/10, matching the owner's `pxtorem()` habit and keeping the
   print sheet's existing `html { font-size: 10px }` trick behaving identically.
2. **One panel holds the whole app.** `ControlsPanel.vue` carries 15 controls and 7 buttons, with a
   `grid-template-columns: 4fr 4fr 3fr` that never collapses (`_controls.css`). Fix: it is dissolved
   into four named steps and a view bar; see §3.
3. **Meaning is hidden in `title=""`.** 34 occurrences across the components. On a touch device they
   never appear. Fix: §10 lists every one of them and where its text goes instead.
4. **Mix mode and layer mode are two parallel interfaces.** `PaletteList`/`LayerList`,
   `EntryEditor`/`LayerArea`, plus `LayerStrip` which exists only because the layers panel is
   unreachable on a narrow screen. Fix: §4.

---

## 2. Information architecture

### 2.1 Two surfaces, never more

- **The stage** — the picture, the controls that change what the picture *shows*, and one line of
  text that says what is under the finger. Always on screen, at every breakpoint, in every step.
- **The steps surface** — everything else, in four steps. A bottom sheet on phone and tablet
  portrait, a right rail on tablet landscape and desktop.

There is no third surface. Dialogs (paint box, collection, AI, account, plans) are modal and sit over
both.

### 2.2 The four steps

| # | Step | Label on the step bar | What is in it |
|---|---|---|---|
| 1 | Photo | `Photo` | Which picture, where it comes from, where it is kept, its details (close-ups) |
| 2 | Plan | `Plan` | Method, the three plan controls, the paint box, the second level, the AI result |
| 3 | Colours | `Colours` (mix) / `Layers` (layer) | The selection card, then the list of things to paint |
| 4 | Paint | `Paint` | Printing, the wash key, and in layer mode the step-by-step walk |

**The steps are tabs, not a wizard.** Every step is one tap from every other step at every breakpoint,
in any order, at any time. Nothing is disabled because an earlier step was not visited. The order is a
reading order, not a gate — that is the whole answer to "a wizard that gets in the way of an expert who
just wants the slider": the expert's slider is two taps from anywhere (`Plan`, then the slider), and
the sliders are the first thing in the `Plan` step, above the fold at every breakpoint.

Each step ends with one **forward offer**, a quiet full-width button: `Next: Plan`, `Next: Colours`,
`Next: Paint`. It is an offer, never a condition. The `Paint` step has none.

### 2.3 Where the app opens

On load (`analysis.loadSample(true)` in `App.vue`) the step is **Plan** and, on phone and tablet
portrait, the sheet is at **peek** height — so the first thing on screen is the picture, with the step
bar under it. The step the user was last on is kept for the session in `App.vue` state; it is not
persisted across reloads.

### 2.4 First level and second level

**First level** is what is visible without opening anything:

- Stage: the picture, the view switch, `Show`, `Zoom in on a part`, the readout line.
- Photo step: the picture's name, `Choose a photo`, `Take a photo`, `Next sample`, `Save to collection`,
  `Collection`, the details strip.
- Plan step: `Method`, the three plan controls, `Paint box`, `More settings`, the AI result card when
  there is one.
- Colours step: the selection card (when something is selected) and the list.
- Paint step: `Print or save a PDF`, the wash key, `Paint step by step` (layer mode).

**Second level** is one tap away, always behind a labelled button, never behind an icon or a hover:

| Second level | Reached from | Form |
|---|---|---|
| `More settings` (Areas, Simplify areas, Saturation, Contrast, Reset) | Plan step | Sheet/rail takes over the step body, titled `More settings`, with a `Back to the plan` button |
| `Show` (Outlines, Numbers, Guides) | Stage view bar | Popover on phone and tablet portrait; inline in the view bar from 1024 px landscape up |
| Paint box | Plan step and Colours step | Modal dialog (`PaintBox.vue`) |
| Collection | Photo step | Modal dialog (`CollectionDialog.vue`) |
| Your own AI | More settings | Modal dialog (new `AiDialog.vue`, body moved from `AiPanel.vue`) |
| Account, Manual, Privacy, Terms, Imprint, Privacy settings | Top bar `More` on phone and tablet portrait; the footer under the rail from 1024 px landscape up | Menu / links |
| Plans | Triggered by `pro.require()` | Modal dialog (`ProDialog.vue`) |

### 2.5 Feature inventory: where every item from the brief lives

Nothing from the brief's inventory is dropped.

| Feature | Home | Level |
|---|---|---|
| Load photo | Photo step, `Choose a photo` | 1 |
| Take photo | Photo step, `Take a photo` (coarse pointer only) | 1 |
| Next sample | Photo step, `Next sample` | 1 |
| Save to collection | Photo step, `Save to collection` / `Save changes` | 1 |
| Open collection, rename, delete | Photo step, `Collection`, opens the dialog | 2 |
| Print and PDF | Paint step, `Print or save a PDF` | 1 |
| Method Mix / Layer | Plan step, first control | 1 |
| Areas Organic / Geometric | More settings | 2 |
| Simplify areas | More settings | 2 |
| Colours | Plan step, slot 1 (mix) | 1 |
| Details (variety) | Plan step, slot 2 (mix) | 1 |
| Max. paints | Plan step, slot 3 (mix) | 1 |
| Layers | Plan step, slot 1 (layer) | 1 |
| Accents | Plan step, slot 2 (layer) | 1 |
| Max. coats | Plan step, slot 3 (layer) | 1 |
| Saturation, Contrast, reset of both | More settings, group `Photo adjustment` | 2 |
| View switch (Mixed paint / Photo colour / Photo / Sketch) | Stage view bar | 1 |
| Outlines, Numbers | Stage view bar, `Show` | 1 (≥1024 landscape) / 2 (below) |
| Guides | Same, visible only while the view is `Sketch` | as above |
| Select an area, see its recipe | Tap the picture; the Colours step opens with the selection card | 1 |
| Change a colour | Selection card, `Change colour` | 1 |
| Reset to photo colour | Selection card, `Back to the photo colour` | 1 |
| Edit only the clicked area | Selection card, `Give this area its own colour` | 1 |
| Alternative recipes | Selection card, `Other recipes` | 1 |
| Colour list with washes | Colours step | 1 |
| Solo a layer | Colours step, tap the layer row | 1 |
| Tick layers | Colours step, the tick in each row | 1 |
| Coats | Colours step, the coat bar in each row | 1 |
| The spot card | Colours step, selection card (layer variant) | 1 |
| The step walk | Paint step, `Paint step by step`, which starts walk mode | 1 |
| Paint box: selected paints, pans/tubes, Auto, All/Invert/None, several boxes, own paints, P/T marks | Paint box dialog | 2 |
| Close-ups: frame | Stage view bar, `Zoom in on a part` | 1 |
| Close-ups: thumbnails, return, remove | Photo step, `Details of this picture`; return also as a bar over the picture | 1 |
| AI: provider, model, key, consent, cost, ask, forget | AI dialog | 2 |
| AI: notes, mixes, details, final wash toggle | Plan step, AI result card | 1 |
| Account: sign in, plan, export, delete | Account dialog | 2 |
| Plan dialog | Modal, triggered | 2 |
| Consent banner | Fixed at the bottom, over everything | 1 |
| Footer links | Rail footer (≥1024 landscape) / `More` menu (below) | 1 / 2 |

---

## 3. The user's path

The path is the four steps, read in order on the first use and jumped through freely afterwards.

1. **Photo.** The app opens with a sample already analysed, so the first screen is never empty. The
   user either keeps it, presses `Next sample`, or chooses their own photo.
2. **Plan.** `Method` first, then the three controls that decide how much work the painting is. Every
   change re-analyses; the picture dims while it does and the readout says `Analysing…` or
   `Planning layers…`.
3. **Colours.** The list of what to paint. Tapping a row or an area of the picture fills the selection
   card at the top of the step.
4. **Paint.** Print the sheet, or in layer mode walk the steps with the picture showing one step at a
   time.

### 3.1 The one rule that keeps the two surfaces in step

**Tapping the picture always moves the steps surface to `Colours` and raises it to `half`.** That is
the only automatic navigation in the app. Reason: a tap on an area is a question about a colour, and
the answer is in the selection card. There is no other place the answer could be.

The reverse is not automatic: changing the step never changes the picture.

### 3.2 Walk mode (layer mode only)

`Paint step by step` puts the app into **walk mode**. In walk mode:

- The view bar is replaced by the **walk bar** (same height, same place).
- The steps surface drops to `peek` on phone and tablet portrait, so the picture is as large as it
  gets; the step body shows the step instructions. On rail breakpoints the rail stays and shows them.
- Leaving walk mode (`Close` in the walk bar, or `analysis.goToStep(null)`) restores the view bar and
  the previous sheet height.

---

## 4. Mix mode and layer mode become one interface

The method is a property of the plan, not a different application. Four decisions.

### 4.1 One set of plan controls, three fixed slots

The Plan step always shows the same three rows in the same order, in the same shapes. Only the labels,
ranges and store keys change. The panel never reflows when the method is switched.

| Slot | Shape | Mix | Layer |
|---|---|---|---|
| 1 "how many" | slider | `Colours` 2–32, `settings.colours` | `Layers` 2–6, `settings.layerCount` |
| 2 "how fine" | slider | `Details` 0–10, `settings.variety` | `Accents` 0–3, `settings.layerAccents` |
| 3 "per area" | segmented 1 / 2 / 3 | `Max. paints`, `settings.maxPaints` | `Max. coats`, `settings.maxCoats` |

`Simplify areas` is slot 4 and lives in `More settings` in both modes, writing `settings.simplify` or
`settings.layerSimplify` as `ControlsPanel.vue` already decides via `simplifyKey`.

### 4.2 One list block

`PaletteList.vue` and `LayerList.vue` stay two Vue files (their data logic is genuinely different) but
render **the same BEM block**, `.colourlist`, from one stylesheet `src/css/components/colourlist.css`.
Identical geometry, identical row heights, identical swatch sizes, identical bars. A painter who
learns one learns the other.

Row anatomy, both modes:

```
[ tick or number, 4.8rem ][ swatch 4.0rem ][ name and meta, 1fr ][ share, right ]
[ the bar: recipe parts (mix) or coats (layer), full width under the row         ]
```

- Mix: column 1 is the mix number (`1`, `2`…); the bar is the recipe bar; a second bar below it holds
  the washes when there is more than one.
- Layer: column 1 is a tick with the layer number inside it (`1`, `A1`…); the bar is the coat bar, and
  is omitted when the layer has one coat.

### 4.3 One selection card

`EntryEditor.vue` (mix) and `LayerArea.vue` (layer) render **the same block**, `.selection`, from
`src/css/components/selection.css`: the same header, the same two-swatch comparison, the same
subtitle, the same list below.

| | Mix | Layer |
|---|---|---|
| Title | `Colour 6L` | `This spot` |
| Comparison left | `Photo colour` + hex | `Photo` + hex |
| Comparison right | `Your mix` + hex | `Layered` + match word |
| Actions | `Change colour`, `Back to the photo colour`, `Give this area its own colour` | none |
| List subtitle | `Other recipes` | `Layers on this spot` |
| Empty | `No paints selected in the paint box.` | `Leave the paper white.` |

### 4.4 One place for what is painted next

`LayerSteps.vue` (above the picture) and the implicit mix path (numbers on the picture, print sheet)
both become the **Paint step**. `LayerStrip.vue` is deleted: it exists only because the layer list is
unreachable on a narrow screen, and in this design the layer list is one tap away at every width.

---

## 5. The floating panel, the pointer tooltip, the settings panel

### 5.1 The floating recipe panel: removed

`EntryEditor.vue`'s `position: fixed` behaviour (`_editor.css` `@media (min-width: 1101px)`) and
`src/components/floating.js` are **deleted**. Reasons, in order: it covers the picture, which is the
subject; it is dragged by a 1-pixel-tolerance header, which the brief bans; its position is persisted
per device in `layout.positions`, so a panel parked off-screen on a laptop reappears wrongly on the
iPad; and the selection card is exactly the content of the `Colours` step, where it now lives.

`useLayoutStore().positions` stops being written. The store API is unchanged; the key simply goes
unused. `layout.collapsed` also stops being written: there are no fold buttons left (see §5.3).

### 5.2 The pointer tooltip: replaced by the readout line

`RecipeTip.vue` and `src/css/components/_tip.css` are **deleted**. Nothing that follows a pointer can
exist in an app whose primary device has no pointer.

Its job is taken by the **readout** — one line of text, fixed height `2.4rem`, directly under the view
bar, present at every breakpoint, never moving, never overlapping the picture. It shows, in this
order of precedence:

1. `analysis.error` — in `--c-danger`.
2. `analysis.busy` — `Analysing…` (mix) or `Planning layers…` (layer).
3. Framing is armed — `Tap the picture where the detail should be, or drag a frame.`
4. Walk mode — `Step 3 of 9: Layer 2 of 5, Indigo, coat 1 of 2` (the existing `title` computed in
   `LayerSteps.vue`, prefixed with the step counter).
5. A fine pointer is over an area (mouse only) — mix: `Colour 6L — 2 x 663 Sepia brown + 1 x 498 Delft blue — 12 % of the image`;
   layer: `Layer 3, Indigo — 2 coats here`.
6. Something is selected — the same sentence for the selection.
7. Otherwise, the mode hint — mix: `Tap an area to see how it is mixed.`; layer, nothing selected:
   `Tap a layer to see it alone. Tap the picture to see what a spot gets.`; layer, one layer solo:
   `Paint the coloured areas with this wash. Tap the layer again to see all.`; layer, solo with
   numbers and more than one coat: `Numbers are coats: paint every numbered area once, then the 2s again when dry.`

Rules 5 and 6 produce the same sentence shape, so hover is a convenience and never a requirement.
The hint strings in rules 7 are the ones already computed in `App.vue`'s `hint`, with "Click" changed
to "Tap" and the frame-button sentence dropped (the frame button carries its own label now).

### 5.3 The settings panel: dissolved

`ControlsPanel.vue` is deleted as a component. Its contents move as follows.

| Was in `ControlsPanel.vue` | Goes to |
|---|---|
| `controls__image-name`, `controls__saved` | Photo step header, and the top bar on phone |
| New, Take photo, Sample, Save, Collection | Photo step, `library.css` |
| Print / PDF | Paint step |
| Method | Plan step |
| Areas | More settings |
| Simplify areas | More settings |
| Show + Outlines / Numbers / Guides | Stage view bar |
| View switch | Stage view bar |
| Colours / Layers, Details / Accents, Max. paints / Max. coats | Plan step, slots 1–3 |
| Saturation, Contrast, Reset | More settings, `Photo adjustment` |
| `AiPanel` | AI dialog, with the answer surfacing as the Plan step's AI result card |
| `PanelToggle` | Deleted. 28 px is half the minimum target, and the steps already do the folding. |
| `analysis.error`, `collection.error` | The readout (`analysis.error`) and a `.notice` block in the owning step (`collection.error`) |

---

## 6. Layout

### 6.1 Breakpoints

```css
/* phone            */ @media (max-width: 599px)
/* tablet portrait  */ @media (min-width: 600px) and (max-width: 1023px),
                       @media (min-width: 1024px) and (orientation: portrait)
/* tablet landscape */ @media (min-width: 1024px) and (orientation: landscape)
/* desktop          */ @media (min-width: 1366px) and (orientation: landscape)
```

The `orientation` clause is not decoration: an iPad Pro 12.9" in portrait is 1024 px wide and must get
the portrait layout, not the rail. The type ramp keeps the house breakpoints 1024 / 1280 / 1440 and is
independent of this (§8.3).

### 6.2 The frame, all breakpoints

```css
.app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100dvh;
  padding:
    env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: var(--c-background);
  overflow: hidden;
}
```

The page itself never scrolls. Scrolling happens inside the stage (rarely), inside the step body, and
inside dialogs. This is what keeps the picture on screen on a phone.

### 6.3 Phone (≤ 599 px)

Vertical bands, top to bottom:

| Band | Height | Content |
|---|---|---|
| Top bar | `5.6rem` | Picture name (truncated, `--fs-copy`, weight 600), `More` button `4.8 x 4.8rem` at the right |
| Close-up bar | `4.8rem`, only when `analysis.closeupId != null` | `Back to the whole picture` button, `Detail 2` |
| Picture | `1fr`, min `28dvh` | The canvas, centred, `object-fit` by `max-height: 100%` |
| View bar | `5.6rem` | Horizontally scrollable view segmented control, then `Show`, then `Zoom in on a part` |
| Readout | `2.4rem` | §5.2 |
| Sheet | overlay | §6.7 |

- Side gutter: `1.6rem` on every band.
- The picture band gets `padding-bottom: var(--sheet-peek)` so that nothing is hidden behind the sheet
  at peek height.
- The sheet **overlays** the picture at `half` and `full`; the picture is never resized by the sheet.
  Reason: resizing the stage re-lays-out the canvas, and the canvas is redrawn pixel by pixel in
  `PaintingCanvas.vue` — an expensive reflow on every sheet drag. The overlay model avoids it entirely.
- `More` opens a menu (`menu.css`): `Account`, `Manual`, `Privacy`, `Terms`, `Imprint`,
  `Privacy settings`. Rows `5.6rem` tall, full width, `--fs-copy`.

### 6.4 Tablet portrait (600–1023 px, and ≥1024 px portrait)

Same bands, with these differences:

| | Value |
|---|---|
| Side gutter | `2.4rem` |
| Top bar | `6.4rem`; app name (`--fs-medium`, weight 650), then the picture name in `--c-copy-light`, then `More` |
| View bar | `5.6rem`, no horizontal scroll (all four views fit) |
| Picture min height | `32dvh` |
| Sheet peek / half / full | `8.8rem` / `48dvh` / `calc(100dvh - 24rem)` |
| Step body column | `max-width: 68rem`, centred |
| Colour list | two columns at ≥ 820 px: `grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap)` |
| Paint box grid | `repeat(auto-fill, minmax(16rem, 1fr))` |

### 6.5 Tablet landscape (≥ 1024 px, landscape)

Two columns, no sheet.

```css
.app__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--rail-width);
  gap: var(--gap-15x);
  min-height: 0;
  padding-inline: var(--gap-15x);
}
```

| | Value |
|---|---|
| `--rail-width` | `42rem` |
| Top bar | `6.4rem`: app name, picture name, `Account` button at the right |
| Stage | Column 1. Picture centred, `max-height: 100%`; view bar and readout below it, left-aligned to the picture's column |
| Rail | Column 2, full height: step bar (`5.6rem`, fixed at the top), step body (`overflow-y: auto; overscroll-behavior: contain`), footer links (`4.8rem`, fixed at the bottom) |
| `Show` | Inline in the view bar as three switch pills, not a popover |
| Hover | Enabled: the readout fills from the pointer (§5.2 rule 5) |

The rail body is the only nested scroll region in the app and is always taller than 240 px, as the
brief requires.

### 6.6 Desktop (≥ 1366 px, landscape)

As tablet landscape, with:

| | Value |
|---|---|
| `--rail-width` | `48rem` |
| `.app` max width | `var(--max-width)` = `176rem`, centred, with `padding-inline: var(--gap-2x)` |
| Stage picture | `max-width: 110rem` |
| Top bar | `7.2rem`; app name `--fs-hl-small`, tagline `Find the main colours in a photo and mix them from your watercolours.` in `--c-copy-light` `--fs-small`, `Account` at the right |
| Colour list | two columns from 1600 px total width up |

### 6.7 The sheet (phone and tablet portrait only)

```css
.sheet {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 30;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
  border-radius: var(--radius) var(--radius) 0 0;
  box-shadow: var(--shadow);
  transition: height 180ms ease;
  padding-bottom: env(safe-area-inset-bottom);
}
.sheet--peek { height: var(--sheet-peek); }
.sheet--half { height: var(--sheet-half); }
.sheet--full { height: var(--sheet-full); }
```

Rows: the **grip row**, the **step bar**, the **step body**.

- Grip row, `2.4rem`: a bar `4.8rem x 0.4rem`, `--c-border-strong`, radius `0.2rem`, centred. The whole
  row is a drag handle with `touch-action: none`, and it is also the hit area of the non-drag
  fallback: a plain **tap** on the grip row cycles the three heights: peek, half, full, back to peek. The row's hit area is
  the full width at `4.8rem` tall (the visible bar is smaller than its target).
- Step bar, `6.4rem` on phone, `6.4rem` on tablet portrait: pinned, visible at every sheet height, so
  the four steps are reachable even at peek.
- Step body: `overflow-y: auto; overscroll-behavior: contain; padding: var(--gap) var(--gap) var(--gap-2x)`.
  At `peek` the body is `height: 0` and `visibility: hidden`.

Values: `--sheet-peek: 8.8rem` (phone) / `10.4rem` (tablet portrait, grip 2.4 + step bar 6.4 + 1.6);
`--sheet-half: 46dvh` / `48dvh`; `--sheet-full: calc(100dvh - 20rem)` / `calc(100dvh - 24rem)`.

The sheet never becomes a full-screen takeover: the picture stays visible at every height. Exception:
dialogs, which are full modals.

### 6.8 The step bar

```
.steps            display: flex; height: 6.4rem (sheet) / 5.6rem (rail)
.steps__tab       flex: 1 1 0; min-width: 0; min-height: 100%;
                  display: grid; place-items: center; gap: 0.2rem
.steps__label     --fs-small, weight 600
.steps__count     --fs-mini, --c-copy-light, tabular
.steps__tab--current  colour --c-copy; a 0.3rem bar of --c-corporate on the
                  bottom edge (sheet) or the inner edge (rail)
```

Counts shown under the label: `Photo` none; `Plan` none; `Colours` the number of mixes
(`analysis.mixCount`) or painted layers; `Paint` the number of steps in layer mode, none in mix mode.

---

## 7. Touch model (acceptance criteria)

| Rule | Value | Where it is enforced |
|---|---|---|
| Minimum hit area | `4.8rem x 4.8rem` (`--touch`) | `ui.css`: every `button`, `a.button`, `label.switch`, `.steps__tab`, `.segmented__option` gets `min-height: var(--touch)` |
| Primary action height | `5.6rem` (`--touch-primary`) | `.button--primary`, `.slider` row, segmented controls |
| Gap between neighbouring targets | `0.8rem` (`--touch-gap`) minimum | every `gap:` in a row of controls |
| Hover | never required | §10 removes every `title`; `:hover` only ever repeats something already visible |
| Double-click | nowhere | the saturation/contrast reset becomes a `Reset` button (§9.6) |
| Precise drag | never the only way | frame: tap fallback (§7.2); sheet: tap-to-cycle on the grip (§6.7); floating panel: gone |
| Slider thumb | `3.2rem` | `.slider__input::-webkit-slider-thumb` |
| Slider track | `1.2rem` tall inside a `5.6rem` row | `.slider__input::-webkit-slider-runnable-track` |
| Exact value without dragging | `−` and `+` steppers, `4.8 x 4.8rem`, at both ends of every slider | `.slider__step` |
| Nested scroll regions | none under `24rem` tall | the rail body and dialog bodies are the only ones |
| Safe areas | respected on `.app`, `.sheet`, `.consent`, every `dialog` | §6.2 |
| Tap feedback | within one frame | `:active { transform: translateY(1px); background: … }` on every control; no transition on `:active` |

### 7.1 Sliders

```css
.slider              { display: grid; grid-template-columns: var(--touch) minmax(0, 1fr) var(--touch);
                       align-items: center; gap: var(--touch-gap); }
.slider__head        { grid-column: 1 / -1; display: flex; justify-content: space-between;
                       align-items: baseline; gap: var(--gap-05x); min-height: 2.8rem; }
.slider__label       { font-weight: 600; }
.slider__value       { font-variant-numeric: tabular-nums; color: var(--c-copy-light); }
.slider__step        { min-width: var(--touch); min-height: var(--touch); }
.slider__input       { -webkit-appearance: none; appearance: none; width: 100%;
                       height: var(--touch-primary); background: transparent; touch-action: pan-y; }
.slider__hint        { grid-column: 1 / -1; color: var(--c-copy-light); font-size: var(--fs-small); }
```

Track and thumb:

```css
.slider__input::-webkit-slider-runnable-track {
  height: 1.2rem; border-radius: 0.6rem; border: 1px solid var(--c-border);
  background: linear-gradient(to right, var(--c-corporate) var(--fill, 0%), var(--c-surface-sunk) var(--fill, 0%));
}
.slider__input::-webkit-slider-thumb {
  -webkit-appearance: none; width: 3.2rem; height: 3.2rem; margin-top: -1.1rem;
  border-radius: 50%; background: var(--c-surface); border: 2px solid var(--c-corporate);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.slider__input::-moz-range-track { /* same as the webkit track */ }
.slider__input::-moz-range-progress { height: 1.2rem; border-radius: 0.6rem; background: var(--c-corporate); }
.slider__input::-moz-range-thumb { /* same as the webkit thumb, no margin-top */ }
.slider__input:focus-visible { outline: 3px solid var(--c-corporate); outline-offset: 0.4rem; border-radius: 0.6rem; }
```

`--fill` is written inline by the component as a percentage of the range; it is presentation only and
changes no store.

Steppers: left button `−`, label `Fewer`; right button `+`, label `More` — both as `aria-label`, with
the glyph as the visible text. They change the value by `step` and call the same `@change` handler the
slider calls, so an analysis runs once per tap.

### 7.2 Close-up framing without a drag

`Zoom in on a part` in the view bar arms framing (`framing = true`). While armed:

- The readout says `Tap the picture where the detail should be, or drag a frame.`
- The button reads `Cancel the detail` and is in its `--on` state.
- **Drag** behaves as today (`startFrame` / `moveFrame` / `endFrame` in `PaintingCanvas.vue`).
- **Tap** (pointerdown and pointerup within 10 px and 400 ms, which `endFrame` already detects as "too
  small a frame") now creates a frame centred on the tap, `0.40` of the picture's shorter side on
  each axis, clamped to the picture's bounds, and calls `analysis.addCloseup(rect)`. This replaces the
  current silent "the choice stays open for another try".

### 7.3 Removing a close-up

The 22 px `closeup__remove` is deleted. The details strip (Photo step) has a header row:

```
Details of this picture                         [ Remove… ]
```

`Remove…` is a toggle. While it is on, each tile shows a full-width `4.8rem` button under it reading
`Remove detail 2`, the tiles themselves do nothing on tap, and the toggle reads `Done`. Tiles are
`8.8rem x 8.8rem`, radius `--radius-medium`, gap `1.2rem`, with the detail number in the bottom-left
corner on a `rgba(0,0,0,0.65)` plate, `--fs-small`, weight 700.

---

## 8. Design tokens

All tokens live in `src/css/properties.css`, on `:root`, as plain CSS custom properties. House naming.
Three names are added to the house list because the app needs them and they belong to the same
families: `--c-surface`, `--c-surface-sunk`, `--c-border-strong`, `--c-selected`.

### 8.1 Colour, light

```css
:root {
  --c-background:       #f3f0e9;
  --c-surface:          #ffffff;
  --c-surface-sunk:     #eae6dc;
  --c-copy:             #221f1c;
  --c-copy-light:       #5f574d;
  --c-head:             #141210;
  --c-border:           #ded7ca;
  --c-border-strong:    #b4ab9b;
  --c-corporate:        #1f4f7a;
  --c-corporate-hover:  #163c5e;
  --c-selected:         #e2ecf4;
  --c-accent:           #8a5a2b;
  --c-danger:           #a63a2c;
  --c-success:          #2f6b43;
  --c-white:            #ffffff;
}
```

### 8.2 Colour, dark

Applied twice, so the prototype's theme switch works and the system preference still works:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* the block below */ }
}
:root[data-theme="dark"] { /* the block below */ }
```

```css
  --c-background:       #171614;
  --c-surface:          #201f1c;
  --c-surface-sunk:     #2a2823;
  --c-copy:             #ece7dd;
  --c-copy-light:       #a79e91;
  --c-head:             #f6f2ea;
  --c-border:           #35322d;
  --c-border-strong:    #4e4a43;
  --c-corporate:        #8db9dd;
  --c-corporate-hover:  #a9cce8;
  --c-selected:         #22303c;
  --c-accent:           #d09a62;
  --c-danger:           #e4867a;
  --c-success:          #7fbf95;
  --c-white:            #ffffff;
```

`--c-white` keeps its meaning in both themes: it is the colour of **paper**, used for the blank canvas
and for the printed sheet, never for a surface. Surfaces use `--c-surface`.

Saturated colour appears only in: the canvas, swatches, chips, the recipe bar, the wash bar, the coat
bar. `--c-accent` appears in exactly two places (§9.9): the "changed by hand" marker and the accent
layer group marker. `--c-danger` and `--c-success` appear only in messages.

### 8.3 Type

```css
:root {
  --ff-copy:  "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ff-head:  var(--ff-copy);
  --ff-fixed: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --fs-mini:      1.2rem;
  --fs-small:     1.4rem;
  --fs-copy:      1.6rem;
  --fs-medium:    1.8rem;
  --fs-large:     2.0rem;
  --fs-hl-small:  2.2rem;
  --fs-hl-medium: 2.8rem;
  --fs-hl-large:  3.6rem;
}
@media (max-width: 599px) {
  :root { --fs-mini: 1.1rem; --fs-small: 1.3rem; --fs-medium: 1.7rem; --fs-large: 1.9rem;
          --fs-hl-small: 2.0rem; --fs-hl-medium: 2.4rem; --fs-hl-large: 2.8rem; }
}
@media (min-width: 1024px) {
  :root { --fs-copy: 1.7rem; --fs-medium: 1.9rem; --fs-large: 2.1rem;
          --fs-hl-small: 2.3rem; --fs-hl-medium: 3.0rem; --fs-hl-large: 3.8rem; }
}
@media (min-width: 1280px) {
  :root { --fs-hl-large: 4.0rem; }
}
@media (min-width: 1440px) {
  :root { --fs-copy: 1.8rem; --fs-medium: 2.0rem; --fs-large: 2.2rem;
          --fs-hl-small: 2.4rem; --fs-hl-medium: 3.2rem; --fs-hl-large: 4.4rem; }
}
```

`--fs-copy` is never stepped below `1.6rem` (= 16 px): iOS zooms the page when a focused input is
smaller than that, and `_input.css` currently patches around it. With the base fixed, the patch goes.

Roles:

| Role | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| App name | `--fs-hl-small` | 650 | 1.2 | `-0.01em` |
| Step body title (`Plan`, `More settings`, `Colours`) | `--fs-large` | 650 | 1.25 | `-0.005em` |
| Card title (`Colour 6L`, `This spot`, `Paint box`) | `--fs-medium` | 650 | 1.3 | 0 |
| Subtitle (`Other recipes`, `Photo adjustment`) | `--fs-copy` | 650 | 1.35 | 0 |
| Body / labels | `--fs-copy` | 400 (labels 600) | 1.5 | 0 |
| Meta, hints, captions | `--fs-small` | 400 | 1.4 | 0 |
| Micro (bar labels, wash letters) | `--fs-mini` | 700 | 1 | `0.01em` |
| Numbers in lists and bars | inherit | 700 | inherit | `font-variant-numeric: tabular-nums` |

`body { font-variant-numeric: tabular-nums; }` is set globally in `typography.css`: the app is full of
three-digit paint numbers, percentages and ratios, and nothing in it benefits from proportional
figures.

### 8.4 Typeface: IBM Plex Sans

**Chosen: IBM Plex Sans** (variable, weight axis 400–650 used; self-hosted woff2 in `public/fonts/`).

Justification on legibility, against two alternatives:

- *IBM Plex Sans.* Its capital `I` carries crossbars and its lowercase `l` carries a tail, so in a
  list that contains `Indigo`, `Ivory black` and `Ultramarine finest` the stems cannot be confused at
  arm's length. Its `1` has a full flag and a foot serif, which keeps `1`, `7` and `l` apart at
  `--fs-mini` inside a 1.6 rem-tall recipe bar — the smallest text in the app and the one that carries
  mixing ratios. Apertures on `c`, `e`, `s` and `a` stay open, so the counters do not fill in under a
  studio lamp or in sunlight at reduced effective contrast. Tabular figures are available and are
  switched on globally. The weight axis gives 400 and 650 from one file.
- *Inter.* Rejected on two grounds, one of them legibility: its default capital `I` is a bare stem,
  identical in shape to lowercase `l`, which is precisely the confusion this paint list produces; and
  it is the default face of exactly the genre the owner named ("not like another vibe coded webapp").
- *Atkinson Hyperlegible Next.* The strongest candidate on character disambiguation — it was designed
  for it. Rejected on fit: its letterforms are noticeably wider, and the colour list has to hold
  `Ivory black + Titanium gold ochre` in a column that is 24 rem wide on a phone. Plex sets the same
  string about 6 % narrower at equal x-height. Keep it as the documented fallback if a user-testing
  round finds Plex's figures insufficient.

Delivery:

```css
/* src/css/fonts.css */
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/ibm-plex-sans-var.woff2") format("woff2-variations");
  font-weight: 400 650;
  font-style: normal;
  font-display: swap;
}
```

If the variable build cannot be used, ship exactly two static files,
`ibm-plex-sans-400.woff2` and `ibm-plex-sans-600.woff2`, as two `@font-face` rules. No italic is
shipped: the app has no italic text after `.recipe__paper` and `.tip__paper` are restyled (§9.8).

No request ever goes to Google Fonts from the app — the consent banner forbids third-party assets.
The prototype may link Google Fonts; the app may not.

### 8.5 Spacing, size, radius, shadow, motion

```css
:root {
  --gap:        1.6rem;
  --gap-025x:   calc(var(--gap) * 0.25);   /*  4px */
  --gap-05x:    calc(var(--gap) * 0.5);    /*  8px */
  --gap-075x:   calc(var(--gap) * 0.75);   /* 12px */
  --gap-15x:    calc(var(--gap) * 1.5);    /* 24px */
  --gap-2x:     calc(var(--gap) * 2);      /* 32px */
  --gap-3x:     calc(var(--gap) * 3);      /* 48px */

  --m-vert:      2.4rem;
  --m-vert-slim: 1.6rem;
  --m-vert-2x:   4.8rem;

  --max-width:     176rem;
  --article-width:  68rem;
  --rail-width:     42rem;

  --touch:         4.8rem;
  --touch-primary: 5.6rem;
  --touch-gap:     0.8rem;

  --sheet-peek:  8.8rem;
  --sheet-half:  46dvh;
  --sheet-full:  calc(100dvh - 20rem);

  --radius:        1.2rem;
  --radius-medium: 0.8rem;
  --radius-small:  0.6rem;

  --shadow:      0 1.2rem 3.2rem rgba(24, 18, 10, 0.18);
  --shadow-flat: 0 0.1rem 0 var(--c-border);

  --speed:      140ms;
  --speed-slow: 220ms;
  --ease:       cubic-bezier(0.2, 0, 0, 1);
}
```

Dark mode overrides `--shadow: 0 1.2rem 3.2rem rgba(0, 0, 0, 0.55)`.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

No element in the app has a shadow except: the sheet, a `dialog`, the `More` menu, the `Show` popover,
and the consent banner. Cards are separated by `1px solid var(--c-border)` and by space, never by a
shadow. There is no `border-left` accent anywhere; the only edge accent in the design is the
`0.3rem` bar on the **bottom** edge of the current step tab, and the inner edge of the current tab in
the rail.

### 8.6 Favicon

`index.html`'s emoji favicon is deleted. `public/favicon.svg` replaces it, referenced as
`<link rel="icon" href="/favicon.svg" type="image/svg+xml">`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#f3f0e9"/>
  <rect x="5"  y="6" width="6" height="20" rx="2" fill="#1f4f7a"/>
  <rect x="13" y="6" width="6" height="20" rx="2" fill="#8a5a2b"/>
  <rect x="21" y="6" width="6" height="20" rx="2" fill="#2f6b43"/>
</svg>
```

Three paint strokes. No emoji, no letterform, no gradient.

### 8.7 Icons

Icons are allowed in exactly five places, all of them accompanied by a text label or an
`aria-label` that is the same words: the view bar's `Zoom in on a part`, the sheet grip, the
`More` button, the dialog `Close`, and the slider steppers (`−` and `+` as text, not icons).
All drawn inline as `viewBox="0 0 24 24"`, `fill: none`, `stroke: currentColor`,
`stroke-width: 1.75`, `stroke-linecap: round`, `width/height: 2.4rem`, `aria-hidden="true"`.
Nothing else in the app is an icon. No icon ever carries meaning on its own.

---

## 9. Component inventory and states

### 9.1 Universal states

Every interactive block implements all of these. They are written once, in `ui.css`, and inherited.

| State | Rule |
|---|---|
| default | as specified per block |
| hover (fine pointer only, `@media (hover: hover) and (pointer: fine)`) | background one step toward `--c-surface-sunk`; never a size or position change |
| active | `background: var(--c-surface-sunk)`, `transform: translateY(1px)`, no transition |
| focus-visible | `outline: 3px solid var(--c-corporate); outline-offset: 2px; border-radius: inherit` |
| disabled | `opacity: 0.45; cursor: default; pointer-events: none` on the inner content, but the element keeps its size so the layout does not jump |
| selected / pressed | `background: var(--c-selected); color: var(--c-corporate); font-weight: 600`, plus `box-shadow: inset 0 0 0 2px var(--c-corporate)` |
| busy | `cursor: progress` on the stage; the picture at `opacity: 0.55`; a `0.3rem` indeterminate bar of `--c-corporate` across the top edge of the picture; the readout carries the word |

### 9.2 `.button`

```
.button              min-height: var(--touch); padding: 0 var(--gap-075x);
                     border-radius: var(--radius-medium); border: 1px solid transparent;
                     font-weight: 600; white-space: nowrap; display: inline-flex;
                     align-items: center; justify-content: center; gap: var(--gap-05x)
.button--primary     background: var(--c-corporate); colour: var(--c-white);
                     min-height: var(--touch-primary)
.button--secondary   background: var(--c-selected); colour: var(--c-corporate)
.button--quiet       background: transparent; border-colour: var(--c-border); colour: var(--c-copy)
.button--danger      background: transparent; border-colour: var(--c-danger); colour: var(--c-danger)
.button--block       width: 100%
```

`--primary` appears at most once per step. `--danger` appears only on the second press of a delete.

### 9.3 `.segmented`

```
.segmented           display: flex; min-height: var(--touch-primary);
                     border: 1px solid var(--c-border); border-radius: var(--radius-medium);
                     overflow: hidden; background: var(--c-surface)
.segmented__option   flex: 1 1 0; min-width: 7.2rem; min-height: 100%; padding-inline: var(--gap-05x);
                     border: 0; border-left: 1px solid var(--c-border); background: transparent;
                     colour: var(--c-copy-light); font-weight: 500
.segmented__option:first-child  border-left: 0
.segmented__option--active      background: var(--c-selected); colour: var(--c-corporate);
                                font-weight: 650; box-shadow: inset 0 0 0 2px var(--c-corporate)
.segmented--scroll   overflow-x: auto; scrollbar-width: none   /* the view bar on a phone */
```

The `border-left` between options is a 1 px divider inside a control, not a left-border accent on a
card; it is explicitly permitted and does not carry colour.

### 9.4 `.switch` (Outlines, Numbers, Guides, layer ticks, consent checkboxes)

A full row, not a bare checkbox.

```
.switch              display: flex; align-items: center; justify-content: space-between;
                     gap: var(--gap-05x); min-height: var(--touch); width: 100%;
                     padding-inline: var(--gap-05x); border-radius: var(--radius-medium); cursor: pointer
.switch__label       font-weight: 500
.switch__box         flex: none; width: 5.2rem; height: 3.2rem; border-radius: 1.6rem;
                     border: 1px solid var(--c-border-strong); background: var(--c-surface-sunk);
                     position: relative; transition: background var(--speed) var(--ease)
.switch__box::after  content: ""; position: absolute; inset-block: 0.3rem; left: 0.3rem;
                     width: 2.4rem; border-radius: 50%; background: var(--c-surface);
                     box-shadow: 0 1px 2px rgba(0,0,0,0.3); transition: transform var(--speed) var(--ease)
.switch__input:checked + .switch__box          background: var(--c-corporate); border-colour: var(--c-corporate)
.switch__input:checked + .switch__box::after   transform: translateX(2.0rem)
.switch__input                                 position: absolute; width: 1px; height: 1px; opacity: 0
.switch__input:focus-visible + .switch__box    outline: 3px solid var(--c-corporate); outline-offset: 2px
```

In a layer row the switch is the compact variant `.switch--tick`: the box is `3.2 x 3.2rem`, square,
radius `--radius-small`, with the layer number printed inside it in `--fs-small` weight 700; checked
is `--c-corporate` background with `--c-white` number. Its hit area is padded out to `4.8 x 4.8rem`.

### 9.5 `.card`

```
.card         background: var(--c-surface); border: 1px solid var(--c-border);
              border-radius: var(--radius); padding: var(--gap)
.card__head   display: flex; align-items: center; justify-content: space-between;
              gap: var(--gap-05x); min-height: var(--touch); margin-bottom: var(--gap-05x)
.card__title  font-size: var(--fs-medium); font-weight: 650
.card + .card margin-top: var(--gap)
.card--picked border-colour: var(--c-corporate)   /* the selection card only */
```

### 9.6 Plan step, exact contents

```
Plan                                            (step body title, --fs-large)

Method
[ Mix            | Layer           ]            .segmented, two options
Mix: one mixed colour per area, painted once.   .field__hint, shown under the control,
Layer: a few thin washes, each painted over       the sentence of the chosen method only
the dry one before.

Colours                             20          slot 1, .slider
[ − ][=============O------------][ + ]
More colours means more detail and more mixing. .slider__hint

Details                              5          slot 2, .slider
[ − ][==========O-----------------][ + ]
Higher keeps small patches of their own hue
instead of folding them into a neighbour.

Max. paints                                     slot 3
[  1  |  2  |  3  ]
How many paints one mix may use.

[ Paint box ]                                   .button--secondary --block
[ More settings ]                               .button--quiet --block

[ Next: Colours ]                               .button--quiet --block
```

Layer mode replaces slots 1–3 with:

```
Layers                               5
[ − ][==========O-----------------][ + ]
Washes; accents and second coats are extra steps.
(or, when the paints were chosen by hand:)
Chosen by hand. Auto in the paint box picks again.

Accents                              3
[ − ][========================O---][ + ]
Accents are small strong touches painted last:
first for a colour the washes miss, then for the darks.

Max. coats
[  1  |  2  |  3  ]
How often one wash may be painted over itself.
```

`More settings` opens, in place of the step body:

```
More settings                        [ Back to the plan ]

Areas
[ Organic        | Geometric      ]
Organic: areas follow the outlines in the photo.
Geometric: shapes with straight edges, laid over each other from large to small.

Simplify areas                       4
[ − ][==========O-----------------][ + ]
Higher gives fewer and bigger shapes to paint.

Photo adjustment
Saturation                        200 %
[ − ][===================O--------][ + ]
Contrast                          100 %
[ − ][==============O-------------][ + ]
[ Back to the photo as it is ]                  .button--quiet, shown only when
                                                saturation or contrast is not 100

Your own AI
An AI model looks at the picture and says what matters in it: the colours to mix,
the paints, the small details to keep and to paint last, and the main shapes for
the sketch. The app works out the areas and the recipes from that.
[ Set up your own AI ]                          .button--quiet --block, opens AiDialog
```

### 9.7 Stage: view bar, readout, picture

```
.viewbar       display: flex; align-items: center; gap: var(--touch-gap);
               min-height: var(--touch-primary); padding-inline: var(--gap)
.viewbar__views  flex: 1 1 auto; min-width: 0     /* .segmented, .segmented--scroll below 1024 */
.viewbar__show   flex: none                       /* button "Show" below 1024 landscape */
.viewbar__switches flex: none; display: flex; gap: var(--touch-gap)  /* ≥1024 landscape, inline */
.viewbar__frame  flex: none                       /* button "Zoom in on a part" */
.readout       min-height: 2.4rem; padding-inline: var(--gap); font-size: var(--fs-small);
               colour: var(--c-copy-light); overflow: hidden; text-overflow: ellipsis;
               white-space: nowrap
.readout--error  colour: var(--c-danger)
.picture       position: relative; display: grid; place-items: center; min-height: 0;
               padding: var(--gap)
.picture__canvas  max-width: 100%; max-height: 100%; width: auto; height: auto;
                  border-radius: var(--radius-medium); background: var(--c-white);
                  touch-action: manipulation
.picture__canvas--busy   opacity: 0.55
.picture__canvas--framing  touch-action: none; cursor: crosshair
.picture__progress  position: absolute; top: var(--gap); inset-inline: var(--gap); height: 0.3rem;
                    border-radius: 0.15rem; background: var(--c-corporate);
                    animation: progress 1.1s linear infinite   /* animations.css */
.picture__frame    as today, kept
```

View labels: mix `Mixed paint`, `Photo colour`, `Photo`, `Sketch`. Layer `Layered paint`, `Photo`,
`Sketch`. Unchanged from `ControlsPanel.vue`'s `views`.

The two floating icon buttons stacked over the image (`painting__zoom`,
`painting__zoom--frame` in `_painting.css`) are **removed from the image**. Zoom-to-fit is removed as a
control entirely: the picture is always fitted to its band, because the band is now a known height at
every breakpoint and the page does not scroll. (The "full size" case is served by the close-up, which
is the better answer to "I want to see it bigger": it re-analyses that part at full resolution.)
`Zoom in on a part` moves into the view bar as a labelled button.

### 9.8 Colours step, exact contents

```
Colours    20 in 12 mixes            [ Paint box ]      header row, .card__head

[ selection card, when something is selected ]

L light · M medium · R rich · S strong          the wash key, .colourlist__key,
                                                shown only when a mix has more than one wash

 1  [swatch]  Ultramarine finest                23 %
              1 mix · light
             [======= 1 x 663 =======|== 1 x 498 ==]
             [  L  |  M  |  R  ]

 2  [swatch]  663 Sepia brown + 498 Delft blue  14 %
              3 washes · changed
             [=== 2 x 663 ===|= 1 x 498 =]
             [  L  |  M  |  R  ]
```

Row metrics: `min-height: 7.2rem`; number column `4.8rem`, right-aligned, weight 700; swatch
`4.0 x 4.0rem`, radius `--radius-small`, `1px solid rgba(0,0,0,0.14)`; name `--fs-copy`; meta
`--fs-small --c-copy-light`; share right-aligned, tabular. Recipe bar `2.0rem` tall; wash bar
`3.2rem` tall with each wash button at least `4.8rem` wide and its hit area padded to `4.8rem` tall.
Selected row: `background: var(--c-selected)`, `box-shadow: inset 0 0 0 2px var(--c-corporate)`.

Layer mode header: `Layers    5 layers, 2 accents, 9 steps · match: excellent   [ All ] [ Paint box ]`,
and the rows as §4.2. The accent group keeps its subtitle `Accents, painted last`, set as a
`.colourlist__group-title` in `--c-accent`.

Empty states:

- Mix, no paints: `No paints selected. Open the paint box and choose the paints you own.` with
  `[ Paint box ]`.
- Layer, no base paints: `No base paints chosen. Open the paint box and pick up to 6, or let the app choose.`
  with `[ Paint box ] [ Let the app choose ]`.
- Layer notes, kept verbatim from `LayerList.vue`: `Not needed for this picture: …`,
  `No layer for …: it adds too little here. Swap it in the paint box.`,
  `13 % of the picture is out of reach of these paints. Compare with Photo, or swap a paint.` (in
  `--c-danger`), `Ticks only change what the picture shows. Change the paints in the paint box.`

`.recipe__paper` and the layer `none` row drop their `font-style: italic` and use `--c-copy-light`
instead, so no italic file has to ship.

### 9.9 Selection card, exact contents

```
Colour 6L                                   [ Close ]

[ #6e5e47        ]   [ #6f5b48        ]
  Photo colour         Your mix

[ Change colour ]  [ Back to the photo colour ]
[ Give this area its own colour ]

Same mix as 6L, 6M – only the amount of water differs.

Other recipes
[ recipe row ] x up to 5, the chosen one selected
```

- The two comparison swatches are `.chip`, `min-height: 7.2rem`, the hex printed in the contrast
  colour the existing `chipStyle()` already computes.
- `Change colour` wraps the native `<input type="color">`; the input is visually hidden and the whole
  `5.6rem` button is the label.
- `Back to the photo colour` appears only when `entry.overridden`.
- `Give this area its own colour` appears only when a region is selected and shares its entry with
  others (today's `sharedAreas > 1`).
- A colour changed by hand carries the word `changed` in its meta line, in `--c-accent`. That is one
  of the two places `--c-accent` is used.
- Layer variant as §4.3; its rows (`Layers on this spot`) are `4.8rem` tall and tap through to
  `analysis.goToStep`.

### 9.10 Paint step, exact contents

```
Paint

[ Print or save a PDF ]                         .button--primary --block

Mix mode:
What the numbers mean
L light · M medium · R rich · S strong
Paint the biggest areas first: colour 1 covers the most of the picture.
The Sketch view gives the outlines to trace onto paper.

Layer mode:
[ Paint step by step ]                          .button--primary --block
9 steps, light to dark. Let each one dry before the next.
```

Walk bar (replaces the view bar in walk mode):

```
[ Previous ]  Step 3 of 9      [ Where to paint | This wash | So far ]  [ Next ]  [ Close ]
```

On phone the walk bar is two rows of `5.6rem`: row 1 `[ Previous ][ Step 3 of 9 ][ Next ]`, row 2 the
three-way view segmented control and `Close`. The step's instructions (`Mix`, `Paint`, `Then`) stay in
the step body as a definition list, with the wash chip above them; the shape warning
`31 separate shapes in this step. A higher "Simplify areas" gives fewer and bigger ones.` stays, in
`--c-danger`.

### 9.11 Dialogs

One block, `dialog.css`, for `PaintBox`, `CollectionDialog`, `AiDialog`, `AccountDialog`, `ProDialog`.

```
.dialog           width: min(92rem, calc(100vw - var(--gap-2x)));
                  max-height: calc(100dvh - var(--gap-2x));
                  padding: 0; border: 1px solid var(--c-border); border-radius: var(--radius);
                  background: var(--c-surface); colour: var(--c-copy); box-shadow: var(--shadow)
.dialog::backdrop background: rgba(18, 14, 8, 0.5)
.dialog__head     position: sticky; top: 0; z-index: 1; display: flex; align-items: center;
                  justify-content: space-between; gap: var(--gap-05x); min-height: var(--touch-primary);
                  padding: var(--gap-05x) var(--gap); background: var(--c-surface);
                  border-bottom: 1px solid var(--c-border)
.dialog__body     padding: var(--gap); overflow-y: auto; overscroll-behavior: contain
.dialog__foot     position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: var(--touch-gap);
                  justify-content: flex-end; padding: var(--gap-05x) var(--gap);
                  padding-bottom: max(var(--gap-05x), env(safe-area-inset-bottom));
                  background: var(--c-surface); border-top: 1px solid var(--c-border)
```

On a phone (`max-width: 599px`) every dialog is `width: 100vw; max-width: none; height: 100dvh;
border-radius: 0` — a full-screen page with its own head and foot. This is the only place in the app
where the picture leaves the screen, and it is always a deliberate, labelled detour.

Paint box chips become `.chip--paint`: `min-height: 5.6rem`, grid `repeat(auto-fill, minmax(16rem, 1fr))`,
gap `1.2rem`. Today's `112px x 46px` fails both the size and the spacing rule.

### 9.12 Blocks that keep their behaviour and get the new tokens only

`ConsentBanner` (`.consent`), `AccountGate` (`.gate`), `ProDialog` (`.plans`), `AccountDialog`
(`.account`), `PrintLegend` (`.legend`), `LayerSheets` (`.sheets`). Their structure is unchanged in
round 1; they take the new tokens, the `4.8rem` target floor, and the removal of every `title`.
The consent banner sits at `z-index: 40`, above the sheet, with
`bottom: calc(var(--sheet-peek) + var(--gap))` on phone and tablet portrait so it never covers the
step bar.

---

## 10. Every `title` that must become visible text

The brief forbids meaning that depends on hover. Each row below is a `title=""` in the current code and
where its words go.

| File | `title` today | Where the words go now |
|---|---|---|
| `ControlsPanel` | `Choose a photo` | The button already reads `Choose a photo` |
| `ControlsPanel` | `Load the next sample photo` | Hint under the Photo step buttons: `Next sample loads the following example photo.` |
| `ControlsPanel` | `Mix every colour on the palette and paint each area once` | `.field__hint` under `Method`: `Mix: one mixed colour per area, painted once.` |
| `ControlsPanel` | `Glaze a few paints over each other, light to dark` | same hint, layer sentence |
| `ControlsPanel` | `Areas follow the outlines in the photo` | `.field__hint` under `Areas`, both sentences always visible |
| `ControlsPanel` | `Areas as polygons with a few straight edges that overlap` | same |
| `ControlsPanel` | `Quarters and diagonals, to transfer the sketch to paper` | `Show` popover, under the `Guides` row |
| `ControlsPanel` | `How often one wash may be painted over itself` | `.field__hint` under `Max. coats` |
| `ControlsPanel` | `Saturation and contrast back to the photo as it is` | The button reads `Back to the photo as it is` |
| `PaintingCanvas` | `Show the picture in full size` / `Fit the picture to the window` | Control removed (§9.7) |
| `PaintingCanvas` | `Zoom in on a part of the picture` | Button label `Zoom in on a part` |
| `PaintingCanvas` | `Drag a frame over the part to zoom in on. Click here to cancel.` | Readout: `Tap the picture where the detail should be, or drag a frame.`; button label `Cancel the detail` |
| `PanelToggle` | `Show …` / `Hide …` | Component deleted |
| `PaletteList` | `Base colour of the mix: #6e5e47` | The hex is printed in the selection card; nothing on the swatch |
| `PaletteList` | `1.5 x 663 Sepia brown` on a bar part | The bar part prints `1.5 x 663` when it has room; the full line is in the row's name and in the selection card |
| `PaletteList` | `6L: medium, 12% of image` on a wash | The wash button prints its letter; the row meta prints `3 washes`; the readout prints the full sentence on selection |
| `LayerList` | `One stroke on white paper. An estimate from one swatch: test the wash on a scrap first.` | A standing note at the foot of the layer list: `Swatch colours are estimates from one stroke on white paper. Test the wash on a scrap first.` |
| `LayerList` | `Show layer 2 in the picture` | The tick's `aria-label`; the column header reads `Show` |
| `LayerList` | `2 coats on 31% of the image. Click to see the step that paints coat 2.` | The coat bar prints `2 coats`; the Paint step says `Tap a coat to jump to its step.` |
| `LayerList` | `Show only this layer. It brings the picture 1.3 closer to the photo.` | Row meta gains `brings 1.3 closer` when the gain is ≥ 0.05 |
| `LayerArea` | `Distance to the photo: 2.4` | Printed next to the match word: `Match: excellent (2.4)` |
| `LayerArea` | `This layer leaves the spot unpainted` | The row already prints `none`; disabled rows get `--c-copy-light` |
| `LayerArea` | `Show the step that paints this` | Subtitle: `Layers on this spot — tap one to jump to its step.` |
| `PaintChip` | `Schmincke Horadam · Sepiabraun · colour estimated` | Printed as a second line on the chip in `--fs-mini`, and in full in the paint box's selected list |
| `PaintBox` | `Let the app choose the base paints for this picture` | Hint under the head: `Auto lets the app choose the paints that suit this picture.` |
| `PaintBox` | `Let Auto choose from Pans` | The switch's own label reads `Use for Auto` and the group name is next to it |
| `CloseupStrip` | `Show detail 2` / `Remove detail 2` | Tile prints `2`; the remove button reads `Remove detail 2` (§7.3) |
| `RecipeLine` | `Mixed: #6f5b48 · rich` | Printed in the chip, which already has the room at `--fs-small` |
| `RecipeLine` | paint name on a chip | Printed; chips no longer truncate at phone width because the recipe list is single-column there |
| `CollectionDialog` | `Open Cwm Idwal` | The name is printed under the thumbnail; the tile's `aria-label` keeps the sentence |

`aria-label` stays wherever a control's visible text is shorter than its meaning. The rule removed is
`title`, not accessible naming.

---

## 11. CSS file structure

`src/css/main.css`, `src/css/base/`, `src/css/layouts/` and `src/css/components/_*.css` are deleted.
New entry `src/css/site.css`, flat, cascade-ordered, no underscores, one block per file.
`src/main.js` imports `./css/site.css`.

```css
/* src/css/site.css */
@import "reset.css";
@import "fonts.css";
@import "properties.css";
@import "typography.css";
@import "scaffold.css";
@import "animations.css";
@import "header.css";
@import "footer.css";
@import "forms.css";
@import "tables.css";
@import "ui.css";
@import "components.css";
@import "print.css";
```

```css
/* src/css/components.css */
@import "components/stage.css";
@import "components/picture.css";
@import "components/viewbar.css";
@import "components/readout.css";
@import "components/sheet.css";
@import "components/rail.css";
@import "components/steps.css";
@import "components/menu.css";
@import "components/library.css";
@import "components/plan.css";
@import "components/slider.css";
@import "components/segmented.css";
@import "components/switch.css";
@import "components/card.css";
@import "components/colourlist.css";
@import "components/selection.css";
@import "components/recipe.css";
@import "components/bar.css";
@import "components/chip.css";
@import "components/swatch.css";
@import "components/walk.css";
@import "components/closeup.css";
@import "components/dialog.css";
@import "components/paintbox.css";
@import "components/collection.css";
@import "components/ai.css";
@import "components/account.css";
@import "components/gate.css";
@import "components/plans.css";
@import "components/consent.css";
@import "components/notice.css";
@import "components/empty.css";
@import "components/legend.css";
@import "components/sheets.css";
```

`ui.css` holds `.button`, the universal states of §9.1 and the `min-height: var(--touch)` floor.
`forms.css` holds `.input`, `.field`, `.field__label`, `.field__hint`, `select`, `textarea`.
`tables.css` holds the one table in the app, `.sheets__table`.
`header.css` holds `.topbar`; `footer.css` holds `.railfoot` and `.menu`'s link list styling.
`scaffold.css` holds `.app`, the grid of §6.2, `box-sizing`, the scroll lock and the breakpoint frame.

`print.css` keeps today's rules with three changes: `html { font-size: 10px }` is no longer needed
(the base is already 10 px) and is deleted; `.sheet, .rail, .steps, .viewbar, .readout, .topbar,
.menu, .consent, .dialog` join the hidden list; `.picture__canvas { max-height: 150mm }` keeps its
value.

---

## 12. Migration notes, file by file

### Vue components

| File | What happens |
|---|---|
| `src/App.vue` | Rewritten as the frame of §6: `.topbar`, `.app__main`, `.stage` (picture, view bar, readout), and either `.sheet` or `.rail` by breakpoint. Holds the new local state `step` (`'photo' \| 'plan' \| 'colours' \| 'paint'`), `sheetState` (`'peek' \| 'half' \| 'full'`), `moreOpen`, `showOpen`, `menuOpen`, `hover`. Watches `analysis.selectedRegion` and `analysis.layerPoint`: on a change it sets `step = 'colours'` and raises the sheet to `half` (§3.1). The `hint` computed moves into the readout's precedence list (§5.2). The footer renders only at ≥1024 landscape; below that its links move into the `More` menu. `isNative` still hides it. |
| `src/components/ControlsPanel.vue` | **Deleted.** Split into `PhotoStep.vue`, `PlanStep.vue`, `MoreSettings.vue`, `PaintStep.vue`, `ViewBar.vue` per §5.3. The handlers `onFile`, `print`, `resetAdjustment`, `setMaxCoats`, `setMaxPaints`, `setGeometric` move with the control that calls them. `resetAdjustment` loses its `@dblclick` binding and keeps only the button. |
| `src/components/PaintingCanvas.vue` | Keeps all drawing code unchanged. Removes: the two `painting__zoom` buttons, the `fit` ref, `RecipeTip` and its import. `onMove` stops producing a floating tip and instead emits `hover` (entry index or null) to `App.vue`, and only when `matchMedia('(pointer: fine)').matches`. `endFrame` gains the tap fallback of §7.2. `painting__status` is deleted; its text moves to the readout. Classes renamed `painting*` to `picture*`. |
| `src/components/RecipeTip.vue` | **Deleted** with `_tip.css`. |
| `src/components/floating.js` | **Deleted.** No component imports it afterwards. |
| `src/components/PanelToggle.vue` | **Deleted.** No fold buttons remain. |
| `src/components/LayerStrip.vue` | **Deleted** (§4.4). |
| `src/components/CloseupBar.vue` | Merged into the stage as `.closeup-bar`, rendered by `App.vue` above the picture; label changed to `Back to the whole picture`. |
| `src/components/CloseupStrip.vue` | Moves into `PhotoStep.vue` as `Details of this picture`; gains the `Remove…` / `Done` toggle and the `4.8rem` remove buttons of §7.3; the 22 px corner button is deleted. |
| `src/components/PaletteList.vue` | Keeps its `mixes` computed unchanged. Template rewritten to the `.colourlist` block of §4.2/§9.8; the header's `Show paint box` becomes `Paint box`; `PanelToggle` removed; the wash key moves to `.colourlist__key` and is repeated in the Paint step. |
| `src/components/LayerList.vue` | Keeps its `rows`, `groups`, `countText`, `unused` computeds unchanged. Template rewritten to the same `.colourlist` block; `.editor__subtitle` for the accent group becomes `.colourlist__group-title`; every `title` resolved per §10. |
| `src/components/EntryEditor.vue` | Keeps its logic. Loses `useFloating` entirely and with it `panel`, `style`, `dragging`, `startDrag`, `floats`, and the `scrollIntoView` watcher (the step switch of §3.1 replaces it). Template rewritten to `.selection` (§9.9). |
| `src/components/LayerArea.vue` | Keeps its logic. Template rewritten to the same `.selection` block. |
| `src/components/LayerSteps.vue` | Keeps its `step`, `title`, `mixText`, `paintText`, `last` computeds and the arrow-key handler. Split: the bar renders into the stage as `.walk` (§9.10), the instructions render into the Paint step body. The `Paint step by step` entry button moves to the Paint step. |
| `src/components/AiPanel.vue` | Becomes `AiDialog.vue`: the same form inside a `.dialog`, opened from `More settings`. The answer part (`current.plan.notes`, `ai__mixes`, `Details to keep`, the final-wash switch, the token/cost line, `matchText`) is extracted into `AiResult.vue` and rendered as a `.card` in the Plan step, so the result is on the first level while the setup is on the second. |
| `src/components/PaintBox.vue` | Structure unchanged; restyled onto `.dialog` and `.chip--paint` (§9.11). The action row moves into `.dialog__foot` so `Update mixes` is always reachable without scrolling. The `Really delete?` two-press pattern stays and gains `.button--danger` on the second press. |
| `src/components/PaintChip.vue` | `title` removed; vendor line and note printed as a second line in `--fs-mini`. Minimum size `16rem x 5.6rem`. |
| `src/components/RecipeLine.vue` | Logic unchanged. `recipe--full` is deleted with `RecipeTip`. At phone width `.recipe__paints` becomes one column; the `emptySlots` padding is dropped below 600 px (empty dashed slots waste a third of the width there). |
| `src/components/CollectionDialog.vue` | Restyled onto `.dialog`; thumbnails `minmax(18rem, 1fr)`; `Rename` / `Delete` rows at `4.8rem`. |
| `src/components/ProDialog.vue` | Restyled onto `.dialog`, block renamed `.plans`. Copy unchanged. |
| `src/components/AccountDialog.vue` | Restyled onto `.dialog`. Copy unchanged. |
| `src/components/AccountGate.vue` | Restyled with the new tokens; the two consent rows become `.switch` rows at `4.8rem`; `Continue` becomes `.button--primary --block`. |
| `src/components/ConsentBanner.vue` | Restyled; `Decline` and `Accept` become `.button--quiet` and `.button--secondary`, both `4.8rem`, `0.8rem` apart; `z-index: 40`; bottom offset clears the sheet. |
| `src/components/PrintLegend.vue` | Unchanged except class prefix and tokens. Must keep printing identically — it is the sheet the painter carries to the table. |
| `src/components/LayerSheets.vue` | Unchanged except class prefix (`.layersheet` to `.sheets`, to free the name `.sheet`) and tokens. |
| `src/components/layerView.js` | Unchanged. It draws pixels, not UI. |

New files: `PhotoStep.vue`, `PlanStep.vue`, `MoreSettings.vue`, `PaintStep.vue`, `ViewBar.vue`,
`StepBar.vue`, `Sheet.vue`, `Readout.vue`, `AiDialog.vue`, `AiResult.vue`, `MoreMenu.vue`,
`SliderField.vue` (the §7.1 slider with steppers, used seven times).

### Stores and logic

Unchanged: `src/lib/**`, `src/stores/analysis.js`, `paints.js`, `collection.js`, `account.js`,
`pro.js`, `consent.js`, `ai.js`. No action, getter or state field is renamed, added or removed.

`src/stores/layout.js` keeps its API but is no longer called: `collapsed` and `positions` go unused
once `PanelToggle` and `floating.js` are gone. Removing the store is a separate task and is not part
of this rework.

### Other

| File | What happens |
|---|---|
| `index.html` | The emoji favicon line is replaced by `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`. `<meta name="theme-color" content="#f3f0e9" media="(prefers-color-scheme: light)">` and the `#171614` dark counterpart are added, so the iPad's browser chrome matches the app. |
| `public/favicon.svg` | New, §8.6. |
| `public/fonts/ibm-plex-sans-var.woff2` | New, self-hosted. |
| `src/main.js` | `import './css/site.css'` instead of `./css/main.css`. |

---

## 13. What the prototype must show

For the round-1 prototype agent, built from this document alone:

1. Four device widths that behave: 390, 834, 1194, 1512 CSS px, the last two in landscape.
2. The light/dark switch driving `:root[data-theme]` per §8.2.
3. Screen switch: Stage, Colours with a recipe, Plan, More settings, Paint box, Layer mode, one dialog.
4. Realistic content: 20 colours in 12 mixes, paint numbers `663`, `498`, `230`, `208`, `526`, a
   three-paint recipe with a wash bar, a seven-layer plan with two accents and nine steps, 54 paints
   in the box.
5. Every target measurable at `48 px` or more, with `8 px` between neighbours.
6. No emoji, no decorative unicode, no left-border accent, no utility class, BEM names, house tokens.

---

## 14. Open decisions for round 2

These are deliberately left for the next round and are listed so nobody assumes they were forgotten.

1. The exact behaviour of the picture when the sheet is at `full` on a phone: overlay (specified here)
   versus a short slide of the picture. Needs a hand on a device.
2. Whether `Max. paints` and `Max. coats` deserve a fourth option (`4`) now that the control has room.
3. Whether the Paint step should offer a tick-off list of mixes in mix mode, which would be a new
   feature rather than a move, and therefore a backlog task of its own.
4. The paint box's `All / Invert / None` controls, which exist in the brief's inventory but not in the
   current `PaintBox.vue` (only `Auto`, `Revert`, `Clear`). Round 2 decides whether to build them or
   to correct the inventory.
