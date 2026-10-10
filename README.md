# Colour Detector

**Live:** https://markus-freise.de/colour-detective/

Finds the main colours in a photo, works out how to mix each one from your own watercolours, and shows the photo as flat, numbered colour areas — like a paint-by-numbers plan for a watercolour.

- **Detail controls:** number of colours (2–32) and area simplification (0–10)
- **Recipes** from your paint box: which paints, in what ratio, how much water, how close (ΔE)
- **Paint box:** switch paints on/off (remembered in the browser), limit mixes to 1–3 paints
- **Recolour:** click an area, pick a new colour, choose between alternative recipes, or detach a single area

The paint stock is hard-coded in `src/data/paints.js` (Schmincke Horadam pans + tubes, Michael Harding), taken from the Notion page "My Watercolour Stock". The colours were sampled from the official Horadam colour chart. A UI for adding paints from other vendors is planned (backlog TASK-11).

Spec: [`PRD_ColourDetector_v1.0.0.md`](PRD_ColourDetector_v1.0.0.md) · Backlog: [`docs/backlog.md`](docs/backlog.md)

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest
npm run build   # → dist/
```

## How the mixing works

Watercolour is a transparent glaze on white paper, so each paint is modelled as a filter: its reference colour gives a per-channel absorbance `A = −ln(reflectance)`, and a mix of paints with amounts `aᵢ` reflects `exp(−Σ aᵢ·Aᵢ)` (Beer–Lambert). Finding a recipe is a non-negative least-squares fit in absorbance space over all 1-, 2- and 3-paint combinations, followed by a perceptual refinement in OKLab. The total amount maps to the water level (very watery wash … concentrated).

## Deploy (markus-freise.de/colour-detective)

Pushing to `main` triggers a GitHub webhook. `webhook.php` checks the signature and starts `deploy/deploy.sh` (git pull → `npm ci` → `npm run build` → rsync `dist/` into the web root).

One-time setup on the server (SSH):

```bash
git clone https://github.com/markusfreise/colour-detector.git ~/colour-detector   # private repo: deploy key + SSH URL
bash ~/colour-detector/_bootstrap/bootstrap-server.sh /path/to/markus-freise.de/colour-detective
```

The script creates `webhook-config.php` with a random secret, runs the first build and prints the values for GitHub → Settings → Webhooks:

| Field | Value |
|---|---|
| Payload URL | `https://markus-freise.de/colour-detective/webhook.php` |
| Content type | `application/json` |
| Secret | printed by the script |
| Events | Just the push event |

Requirements on the host: git, Node ≥ 18 with npm (nvm is picked up), rsync, PHP with `exec()` enabled.
