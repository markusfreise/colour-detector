# Colour Detector

Finds the main colours in a photo, works out how to mix each one from your own watercolours, and shows the photo as flat, numbered colour areas — a paint-by-numbers plan for a watercolour.

![Colour Detector with the sample photo, the colour list and the recipes for one colour](docs/screenshot.png)

Everything runs in the browser. There is no backend, no account and no upload: the photo never leaves your machine.

Visit statistics (Google Analytics) are optional and off by default: without a measurement ID in `src/config.js` nothing is loaded and no banner appears. With an ID, a consent banner asks first, and the Analytics script is only requested after "Accept".

## Native app

The iOS, iPadOS and macOS app is called **Tintmap** and lives in [`app/`](app/README.md): SwiftUI, with the colour and mixing logic ported from `src/lib/`.

## Features

- **Colour areas:** the photo is reduced to 2–32 mixes and drawn as flat, numbered areas. Small but distinct colours (lips in a portrait, a red roof) keep a mix of their own instead of being lost among the shades of a large background. A second slider simplifies the shapes into bigger, calmer areas.
- **Washes:** "Colours" counts mixes. A mix is painted in up to five washes, from very watery to concentrated, so colours that differ only in strength do not use up a mix each. On the picture a wash carries the number of its mix and a letter for the water level (W very watery, L light, M medium, R rich, C concentrated), for example 6L and 6R. In the list every mix shows its base colour, a bar with the paints in the proportions of the recipe, and a bar with its washes. Selecting a mix or a wash blanks the rest of the picture, so only the areas of that mix remain.
- **Saturation and contrast:** adjust the photo before it is analysed. Saturation starts at 200%, which brings out the colours a painter would exaggerate anyway.
- **Variety:** decides which colours share a mix when there are more than you asked for. Low keeps the picture as a whole as close as possible; high lets small areas of another hue keep their own mix while similar large colours share one.
- **Recipes:** for every colour, up to five ways to mix it from the paints in your box — which paints, in what ratio, how much water, and how close the mix gets.
- **Paint boxes:** keep a box for every set of paints you own, and add paints of any brand to the library.
- **Collection:** save pictures in the browser with their settings and colour changes; open, rename and delete them.
- **Paint box:** every paint is a chip in its own colour. The paints you have selected sit in a box at the top; the rest are listed below, under Pans and Tubes, each sorted by colour family and number. Click a chip to move it between the two. "Auto" lets the app pick the paints that suit each picture; it is on for a new paint box and switches off as soon as you select paints by hand. The selection is remembered in the browser.
- **Limits:** restrict mixes to one, two or three paints.
- **Recolour:** click an area, pick a different target colour, choose between the alternative recipes, or detach a single area from the others that share its colour.
- **Print / PDF:** prints the picture followed by every colour with its chosen mix; pick "Save as PDF" in the print dialog for a PDF.
- **Views:** mixed paint, photo colour or the original photo, with outlines and numbers on or off.

## Match quality

Each recipe shows a number and a rating, for example `0.8 • excellent`. The number is ΔE, the distance between the target colour and the mixed colour in the OKLab colour space, multiplied by 100. It has no unit; one step is roughly the smallest difference the eye can notice, and white against black is about 100.

| ΔE | Rating |
|---|---|
| below 2 | excellent |
| below 5 | good |
| below 10 | fair |
| 10 and above | rough |

## How the mixing works

Watercolour is a transparent glaze on white paper, so each paint is modelled as a filter: its reference colour gives a per-channel absorbance `A = −ln(reflectance)`, and a mix of paints with amounts `aᵢ` reflects `exp(−d(S)/S · Σ aᵢ·Aᵢ)` with `S = Σ aᵢ` (Beer–Lambert). `d` is the depth a wash reaches with that much paint in it: 1 at amount 1, levelling off for a thick layer, because paint approaches its masstone and does not keep getting darker and more saturated. The limit holds for the mix as a whole, so three bright paints do not add up to black; it is 1.6 for a bright paint and up to 4 for greys, blacks and earths. Both numbers are estimates; the stock holds one colour per paint, not its masstone. Finding a recipe is a non-negative least-squares fit in absorbance space over all 1-, 2- and 3-paint combinations, followed by a perceptual refinement in OKLab. The total amount maps to the water level, from a very watery wash to concentrated.

## The paint stock

The stock is hard-coded in `src/data/paints.js`: 53 Schmincke Horadam Aquarell paints (pans and tubes) and one Michael Harding tube. Each paint has a `hex` value, which is its colour at strength 1 — a mid-strength wash on white paper, not the masstone. Most values were sampled from the official Horadam colour chart; a few are estimates and are marked as such in the data.

Further paints of any brand can be added in the paint box ("Your own paints"); they are stored in the browser.

## Develop

Requires Node 18 or newer.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest
npm run build   # → dist/
```

The build uses a relative base path, so `dist/` works from any folder on any static host.

## Project layout

| Path | Contents |
|---|---|
| `src/lib/` | Pure logic, framework-free and tested: colour maths, mixing model, segmentation, mix planning, paint grouping |
| `src/stores/` | Pinia stores: `paints` (stock and enabled set) and `analysis` (image, settings, areas, recipes) |
| `src/components/` | Vue 3 components (`<script setup>`) |
| `src/workers/` | Web Worker for the segmentation |
| `src/css/` | Plain CSS, BEM, one file per block |
| `src/data/paints.js` | The paint stock |
| `deploy/` | GitHub webhook and deploy script for the server |
| `app/` | Native app Tintmap (SwiftUI, XcodeGen) |

Stack: Vue 3, Pinia, Vite 5, Vitest.

Spec: [`PRD_ColourDetector_v1.0.0.md`](PRD_ColourDetector_v1.0.0.md) · Backlog: [`docs/backlog.md`](docs/backlog.md)

## Deploy

The app is meant to run at https://markus-freise.de/colour-detective/. That address is not set up yet (TASK-09 in the backlog).

The intended flow: pushing to `main` triggers a GitHub webhook. `webhook.php` checks the signature and starts `deploy/deploy.sh` (git pull → `npm ci` → `npm run build` → rsync `dist/` into the web root).

One-time setup on the server (SSH):

```bash
git clone git@github.com:markusfreise/colour-detector.git ~/colour-detector   # private repo: needs a deploy key
bash ~/colour-detector/_bootstrap/bootstrap-server.sh /path/to/markus-freise.de/colour-detective
```

The script creates `webhook-config.php` with a random secret, runs the first build and prints the values for GitHub → Settings → Webhooks:

| Field | Value |
|---|---|
| Payload URL | `https://markus-freise.de/colour-detective/webhook.php` |
| Content type | `application/json` |
| Secret | printed by the script |
| Events | Just the push event |

Requirements on the host: git, Node 18 or newer with npm (nvm is picked up), rsync, `flock`, and PHP with `exec()` enabled. `webhook-config.php` holds the secret and is never committed.
