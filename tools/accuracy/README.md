# Accuracy harness

Measures how true the flat picture is to the photo (TASK-75). The contest harness next door
(`tools/contest`) only counts calm: specks, ragged outlines and a mean dE, in which a lost
highlight costs next to nothing. This one counts what gets lost.

- `run.sh <repo path> <out dir>`: analyses the sample photos with that checkout's `src/lib` the way
  the app does at its default settings, and writes `metrics.txt`, `metrics.json` and one sheet per
  photo (the photo, Simplify shown as 0, Simplify shown as 3, and what is lost at 0: light things
  in magenta, dark ones in blue).
- `photos.py`: prepares the photos from `public/sample-*.webp` and, where there, `local-samples/`
  (needs Python with Pillow). `photos/` is not committed.
- `baseline.txt`: the figures of the code before TASK-75, the thing to beat.

## Figures

- lights kept / darks kept: small things that stand out from their surroundings in the photo
  (a lit window, a glint, an eye, a sign) and still show at least half of that contrast in the
  flat picture. The percentage weighs them by contrast and size, the count is in brackets.
- L dark / mid / light: the error of lightness (OKLab L x 100) in each band of the photo, with
  its direction in brackets (+ = painted lighter than the photo). Per band, so that a small band
  counts as much as a large one.
- pale: what is left of the steps of light inside the light band (modelling: 1 = all of it, 0 = as
  good as one flat colour, below 0 = worse than that), in how many colours (steps), and how much
  of the band is left as paper.
- areas, specks (under 40 px), dE: the calm figures, so that accuracy is not bought with unrest.

## Stages

Each photo is measured four times, so that a loss can be put down to its cause: `finest/target`
(what the palette can show at all), `finest/mixed` (what the paints and the water levels leave of
it), `s0/mixed` (what the calming leaves at the opening step) and `s3/mixed`.
