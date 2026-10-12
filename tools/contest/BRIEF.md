# Smoother colour areas: shared brief

Project: ~/Sites/colour-detector (Vue web app "Colour Detector"). It turns a photo into flat, numbered
colour areas that a watercolour painter fills in, each area in a mix of their paints. Read CLAUDE.md
in the repo first; the pipeline is in src/lib/segment.js (`segmentImage`), with src/lib/mixes.js
(mixes are joined down to the wanted number afterwards) and src/stores/analysis.js as the caller.

## The complaint
The colour areas are restless: ragged outlines, thousands of specks, mottled zones in noisy or busy
photos (JPEG noise, grass, fog, hair, skin under 200% saturation). The owner wants the areas "way
smoother" and suggested blurring first or a different way to find good medians in noisy pictures.
Measured on the current code: at the default settings (20 colours, Simplify 0) a picture has
1,400 to 2,500 areas, a quarter to half of them specks under 40 pixels. Worse, at Simplify 4 the
family photo has 15,331 areas, 14,689 of them specks, more than at Simplify 0: the merging of
small regions does not finish in noisy zones. That is a bug as well as a look.

## What good looks like
- Areas with calm, smooth outlines that a brush can follow; hardly any specks.
- The subject stays readable and small things that matter survive: eyes and mouths in the family
  and portrait photos, the profile of the face in the meadow photo, the yellow spire in the street
  photo, the caption box in the stage photo.
- Colours stay close to the photo; the picture must not turn into a few blobs.
- Default settings (Simplify 0) must already look calm. Simplify 1..10 still makes it calmer step by step.
- The other features keep working: `geometric`, `anchors` (given mix colours), `focus` (boxes in which
  areas stay fine), layer mode (src/lib/layers.js uses boxBlur, majorityFilter, mergeSmallRegions,
  connectedComponents from segment.js).

## Hard rules
- Web logic only (src/lib, tests in src/__tests__). No new dependencies. Pure, deterministic code:
  the same input must give the same output.
- Keep the shape of what `segmentImage` returns and its options.
- app/Sources/Core is a Swift port of src/lib that is checked against reference values. Do not touch
  app/. Do not change the behaviour of functions that src/lib/layers.js or src/lib/geometric.js call
  (boxBlur, majorityFilter, mergeSmallRegions, connectedComponents, colourBins, toOklabPixels,
  labelAnchors): if you need them to behave differently, add a new function and use it from
  segmentImage. `npm test` must stay green; change an expectation only where the old one tested the
  restless behaviour, and say so.
- Speed: segmentImage runs in a web worker on about 480,000 pixels. Stay under about 1.5 times the
  current time per picture, and under 2 seconds in any case.
- Simple arrays and loops, so that it can be ported to Swift line by line afterwards.
- English, plain words in comments, the density and tone of the surrounding code. No emojis or
  decorative Unicode symbols anywhere.
- Do not push, do not deploy, do not touch the dev server.

## Shared tools (do not edit them)
In /private/tmp/claude-501/-Users-markus-freise-Sites-colour-detector/858e9cb3-4e2a-4303-9380-7b1634b86d3a/scratchpad/smooth
(called SMOOTH below):
- `SMOOTH/run.sh <checkout path> <out dir>` renders six test photos the way the app shows them in
  mix mode (20 colours, saturation 200%, paints proposed, mixes planned), at Simplify 0 and 4, and
  writes `<name>-s0.png`, `<name>-s4.png`, `sheet-s0.png`, `sheet-s4.png` (all six side by side),
  `closeups-s0.png`, `closeups-s4.png` (busy parts enlarged) and `metrics.txt` / `metrics.json`.
- `SMOOTH/photos/` holds the photos (`sheet-photos.png` shows all six).
- `SMOOTH/baseline/` is the current code, rendered: the thing to beat.
- Figures in metrics: ms (time of segmentImage), areas (connected areas of one paint colour),
  specks (areas under 40 px), border (outline length per 1,000 px), ragged (outline length against
  discs of the same size; lower is smoother), dE (mean distance of the flat picture to the photo,
  lower is closer; about 1 is just noticeable).

## Added after round 1
- metrics.txt has two more rows, `family-s0-focus` and `family-s4-focus`: the family photo with
  `focus` boxes on the faces, as the app passes them once an AI plan names details. They give the
  number of areas and of specks (under 40 px) that touch the boxes. A focus box must never be more
  restless than the baseline at Simplify 0, and should keep eyes and mouths at Simplify 4.
- src/lib/sketch.js calls `segmentImage` (16 colours, Simplify 7) for the Sketch view. A change to
  segmentImage changes the sketch too: either keep the sketch on inputs that behave as before, or
  check it (`colouringSketch` on the photos) and say what you saw.
- The times in metrics.txt are noisy while three teams share the machine. Time important cases
  yourself, best of three, against ~/Sites/colour-detector (the code before this contest), also at
  Simplify 10, with `focus` and with `anchors`.
- Simplify 0..10 should never raise the number of areas from one step to the next.

## Added after round 2
- Smooth drawing. The app draws the areas from a label map at twice the working size, pixel by
  pixel, so any outline that is not level or upright is a staircase, whatever the algorithm does.
  The harness now has a hook for this: if src/lib/smooth.js exports
  `upscaleAreas(labels, width, height, scale)` returning an Int32Array of `width * scale` by
  `height * scale` labels (the same label values, outlines drawn as smooth curves instead of
  enlarged pixel steps), the harness draws its pictures from that. A team that adds it must also
  make the app draw from it (src/components/PaintingCanvas.vue, mix mode; clicking an area and the
  numbers must still work), so that the app shows what the harness shows. The figures in
  metrics.txt are still measured on the label map at working size.
- Pathological input must stay under 2 seconds too: pure RGB noise and 1 px checkerboards at
  800 x 600, at Simplify 0, 4 and 10 and with focus.
