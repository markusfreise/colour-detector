# PRD: Colour Detector
**Version:** 1.0.0 · **Date:** 2026-10-10 · **Language:** EN · **Slug:** `colour-detector` · **Status:** In development (MVP built)

## 1. Project overview

| Field | Value |
|---|---|
| Project name | Colour Detector |
| Slug | `colour-detector` |
| Project type | WebApp (static SPA, client-side only) |
| Short description | Finds the main colours in a photo, works out how to mix each one from Markus' own watercolours, and shows the photo as flat, numbered colour areas ("paint by numbers"). |
| Target group | Markus (watercolour painter); later other painters with their own paint boxes |
| Project status | MVP implemented |
| Responsible | Markus Freise |
| Language | English (UI, code, comments, commits) |
| Hosting | **markus-freise.de/colour-detective** (static build, GitHub webhook pull + build). Decision 2026-10-10, deviates from the Batcave default – see §15 |

### Origin prompt
> find the main colours in the picture and find out from a pool of set watercolours which to use to get close to that colour. visualize by dividing the image into solid areas showing the mixed colour. add option to increase or reduce details and to remove or add watercolours or change the colour of an area. here is the chart with tables of all my watercolours from schmincke and michael harding (Notion: My Watercolour Stock). for the start hard code these. later we need the option to add or change colours from different vendors too via a ui.

## 2. Tech stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | **not needed** (v1) | All computation runs in the browser; no accounts, no shared data |
| Auth | not needed | Single user, nothing stored server-side |
| Roles | not needed | |
| Frontend | Vue 3 (Composition API, `<script setup>`) + Pinia | Reactive editor state; Vue as requested |
| Router | not needed (single screen) | Add Vue Router when settings/paint management get their own pages |
| Heavy work | Web Worker (segmentation) | Keeps UI responsive (k-means on ~270k px) |
| CSS | BEM, plain CSS files under `src/css/` | House standard, no utility classes |
| Database | not needed (v1) — `localStorage` for paint selection | Custom paints (TASK-11) also in localStorage + JSON import/export |
| Build | Vite 5 | `base: './'` so the build runs under any sub-path |
| Local env | `npm run dev` (Vite) | No services needed |
| Hosting | markus-freise.de (shared hosting) — static files + PHP webhook | §15 |
| Versioning | Git — GitHub private `markusfreise/colour-detector` | |
| Testing frontend | Vitest | Unit tests for colour maths, mixing, segmentation |
| Mobile / Desktop wrappers | not needed | Responsive web is enough |
| Helper apps | not needed | |

## 3. Project structure

```
colour-detector/
├── index.html
├── vite.config.js
├── package.json
├── public/
│   └── sample-cwm-idwal.webp      ← sample photo (Cwm Idwal, Snowdonia)
├── src/
│   ├── main.js · App.vue
│   ├── components/                ← PaintingCanvas, ControlsPanel, PaletteList,
│   │                                 EntryEditor, RecipeLine, PaintBox
│   ├── stores/                    ← Pinia: paints.js, analysis.js
│   ├── lib/                       ← pure logic: color.js, mixing.js, segment.js
│   ├── workers/segment.worker.js
│   ├── data/                      ← paints.js (stock), horadam-catalogue.js (140 colours)
│   ├── css/                       ← BEM: base/, layouts/, components/, main.css
│   └── __tests__/                 ← Vitest
├── deploy/                        ← webhook.php, deploy.sh, webhook-config.example.php
├── docs/backlog.md
├── .claude/commands/              ← /next-task, /prd-check, /deploy
├── _bootstrap/                    ← bootstrap-local.sh, bootstrap-server.sh
├── _project-assets                ← symlink to Dropbox (gitignored)
├── CLAUDE.md · README.md
└── PRD_ColourDetector_v1.0.0.md
```

## 4. Git workflow & repo

| Field | Value |
|---|---|
| Host | GitHub (private) |
| Name | `colour-detector` |
| Remote | `git@github.com:markusfreise/colour-detector.git` |
| Checkout server | `~/colour-detector` on the markus-freise.de host (branch `main`, outside the web root) |
| Checkout local | `~/Sites/colour-detector` |

| Branch | Purpose |
|---|---|
| `main` | Live – every push triggers the webhook deploy |
| `develop` | Working branch – first checkout |
| `feature/TASK-xx-name` | Features, branch off `develop` |
| `hotfix/name` | Urgent fixes off `main` |

Commit convention: `<type>(TASK-xx): <summary>` — types feat, fix, chore, refactor, test, docs. One step = one commit.

> The MVP was built in a Claude Code cloud session on branch `claude/clever-pascal-144jx5`; merge it into `develop` and `main` to go live.

## 5. Environments & configuration

| | local | prod |
|---|---|---|
| URL | http://localhost:5173 | https://markus-freise.de/colour-detective/ |
| Build | `npm run dev` | `npm ci && npm run build` via `deploy/deploy.sh` |
| Config | none | `webhook-config.php` in the web root (secret, repo path, branch, log file) – never committed |

No `.env` is needed: the app has no secrets and no API. Local is fully self-sufficient.

## 6. Auth & permissions
**Not needed** — the app has no login. The deploy webhook is protected by GitHub's HMAC-SHA256 signature (`X-Hub-Signature-256`).

## 7. User stories & use cases

### Actors
- Painter (Markus)

### User stories

| ID | As a… | I want to… | so that… | Priority |
|---|---|---|---|---|
| US-01 | painter | load a photo (or the sample) | I can plan a painting from it | High |
| US-02 | painter | see the photo reduced to its main colours as flat, numbered areas | I understand the value/colour structure | High |
| US-03 | painter | get a mixing recipe from *my* paints for every colour (paints, ratio, water) | I know what to put on the palette | High |
| US-04 | painter | increase/decrease detail (number of colours, area simplification) | I can choose between a loose sketch and a detailed study | High |
| US-05 | painter | switch paints on/off | I can plan with a limited palette or what I have with me | High |
| US-06 | painter | click an area and change its colour | I can paint it warmer/cooler/different than the photo | High |
| US-07 | painter | change only one clicked area instead of all areas of that colour | I can accent single shapes | Medium |
| US-08 | painter | choose between alternative recipes | I can prefer paints I like or avoid granulating ones | Medium |
| US-09 | painter | limit mixes to 1, 2 or 3 paints | mixes stay clean | Medium |
| US-10 | painter | add or edit paints from other vendors in the UI | the tool grows with my paint box | Later (TASK-11) |
| US-11 | painter | export a printable paint-by-number sheet with legend | I can use it at the desk | Later (TASK-12) |

### UC-01: Plan a painting
- Precondition: app open, paints selected
- Flow: load photo → app segments it (worker) → palette with recipes appears → adjust colours/simplify → click area → inspect/choose recipe or recolour → read recipe list
- Exceptions: unreadable file → error message in controls panel; no paints enabled → editor shows "No paints selected"

## 8. Data model

No database. Data structures (JS):

**Paint** (`src/data/paints.js`)
```js
{ id: 'schmincke-horadam-494', vendor: 'Schmincke', line: 'Horadam Aquarell',
  number: '494', name: 'Ultramarine finest', nameDe: 'Ultramarin feinst',
  hex: '#243f8f',            // reference colour at strength 1 (mid-strength wash on white)
  forms: ['whole pan'],      // pans/tubes owned
  source: 'chart' | 'estimate',
  enabled: true,             // default selection
  note: '…' }                // stock-list conflicts to check
```
Stock = 53 Schmincke Horadam + 1 Michael Harding paint (from Notion "My Watercolour Stock", three tables merged; duplicates across pans/tubes merged into `forms`). Colours sampled from the official Horadam colour chart on that Notion page; 5 paints not on the chart are estimates (flagged `est.` in the UI).

**Catalogue** (`src/data/horadam-catalogue.js`): all 140 Horadam colours (number, German name, sampled hex) for the paint-management UI (TASK-11).

**Palette entry** (store `analysis.entries[]`): `{ id, sourceHex, targetHex, overridden, share, recipes[], chosen }`
**Recipe**: `{ paints: [{paintId, amount, share}], parts: [3, 1], strength, dilution, hex, deltaE }`
**Segmentation**: `{ width, height, regionMap: Int32Array, regions: [{id, cluster, size, anchorX, anchorY, anchorDist}], clusters: [{index, hex, pixelCount}] }` plus `regionEntry: Int32Array` (region → palette entry).

Persistence: `localStorage['colour-detector:enabled-paints']` = array of paint ids.

## 9. API endpoints
**Not needed** — no backend. Only server endpoint: `POST /colour-detective/webhook.php` (GitHub push webhook, §15).

## 10. UI/UX

Single screen, two columns (stacked under 900 px):

**Stage (left):** canvas showing the segmented image. Views: *Mixed paint* (each area filled with the predicted colour of its recipe), *Photo colour* (area average), *Photo*. Optional outlines and numbers (number = palette entry). Click an area → selects its colour, others are faded.

**Sidebar (right):**
1. **Controls** – image name, Upload photo, Sample; sliders *Colours* (2–32) and *Simplify areas* (0–10); *Max. paints per mix* (1/2/3); view switch; outlines/numbers toggles.
2. **Colour editor** (when selected) – target vs. mix swatches, colour picker *Change colour*, *Reset to photo*, *Edit only the clicked area*, list of up to 5 recipes (click to choose). Recipe line: parts (e.g. 3× / 1×), paint swatch, name, number, dilution label, ΔE + quality.
3. **Colours** – numbered list: photo colour | mix swatch, paints, % of image.
4. **Paint box** – grouped by vendor/line, checkbox per paint, all/none per group, Reset, *Update mixes*. Used paints bold; `est.` and `!` flags with tooltip notes.

## 11. Frontend architecture
- Vue 3 Composition API, Pinia stores `paints` (catalogue + enabled set) and `analysis` (image, settings, segmentation, palette entries).
- Large typed arrays/images are `markRaw` to keep them out of Vue reactivity; a `renderVersion` counter triggers canvas redraws.
- Pipeline: image → working copy of about 480,000 pixels → saturation and contrast → worker `segmentImage()` → `applySegmentation()` → `findRecipes()` per entry.
- **Depth limit** (`lib/mixing.js`, `depth`): a paint's absorbance grows with `1.6·(1 − e^(−a/τ))`, scaled so amount 1 still gives `hex`; a thick layer levels off at 1.6 times the reference (estimated masstone).
- **Washes:** *Colours* counts mixes. `clusterWashes` (`lib/segment.js`) treats a mix as a direction of absorbance and assigns each colour to the mix whose best wash comes closest (OKLab, lightness counting half); each mix is then split by strength into up to five washes. The analysis is asked for about twice the wanted number of mixes. `planMixes` (`lib/mixes.js`) then brings in the paints: mixes with the same recipe are joined, and the pair that is cheapest to paint as one is joined until the wanted number is left. *Variety* (0–10) sets the cost: at 0 the miss times the area it covers, at 10 the miss in hue alone, so small areas of another hue keep their mix. Finally each colour goes to the mix that reaches it best. The store derives the washes with `washRecipe` (all amounts scaled by one factor); washes of a mix on the same water level become one colour. Labels are mix number plus water level (W, L, M, R, C), e.g. 6L. A recipe is picked for the whole mix.
- **Saturation / contrast** (`lib/color.js`, `adjustImage`): applied in OKLab to the working pixels before segmentation; 100% = unchanged.
- **Segmentation** (`lib/segment.js`): box blur → clustering into mixes and washes on the colour histogram in OKLab (seeded → deterministic; a colour's weight is its pixel count^0.4, so small colourful parts keep a mix of their own) → majority filter → connected components → merge regions below a size threshold (grows with *Simplify*) → label anchors via chamfer distance transform.
- **Mixing** (`lib/mixing.js`): Beer–Lambert model of transparent watercolour on white paper. Per paint absorbance `A = −ln(reflectance)` from its reference colour; mix reflectance `exp(−Σ aᵢ·Aᵢ)`; `aᵢ` = amount relative to reference strength (→ ratio and water). Recipe search = non-negative least squares over all singles, pairs and shortlisted triples, refined by pattern search on OKLab ΔE; one extra ΔE-point penalty per additional paint to prefer simple mixes; "paper white" is a valid answer.
- No Vue Router, no Axios (no API).

## 12. CSS architecture (BEM)
Blocks: `app`, `panel`, `button`, `segmented`, `field`, `swatch`, `painting`, `controls`, `palette`, `editor`, `recipe`, `paintbox`. One file per block under `src/css/components/`, variables + reset in `base/`, layout in `layouts/_app.css`. Light/dark via `prefers-color-scheme`. No scoped styles.

## 13. Native app wrapper (Monaca / Electron)
**Not needed.**

## 14. Swift helper apps
**Not needed.**

## 15. Hosting & deployment

**Decision (2026-10-10):** hosted at **https://markus-freise.de/colour-detective/** instead of `colour-detector.croeso.de` on Batcave. The app is purely static, so it needs no LXC, no database and no Caddy route. Batcave remains an option later (TODO-03).

| Environment | Branch | Path |
|---|---|---|
| local | `develop` | `~/Sites/colour-detector` |
| prod | `main` | web root `…/markus-freise.de/colour-detective/`, checkout `~/colour-detector` |

**Deployment:** GitHub push webhook → `webhook.php` (in the web root) checks the HMAC signature and the branch, then starts `deploy/deploy.sh` in the background: `git fetch` + `reset --hard origin/main` → `npm ci` → `npm run build` → `rsync --delete dist/` into the web root (keeping `webhook.php` and `webhook-config.php`). A lock file prevents overlapping deploys; output goes to a log outside the web root.

**One-time setup:** `_bootstrap/bootstrap-server.sh` (see README). Requirements on the host: git, Node ≥ 18 + npm (nvm is picked up), rsync, PHP `exec()` allowed.

**Rollback:** `git -C ~/colour-detector reset --hard <good-commit> && bash deploy/deploy.sh …` (or revert on `main` and push).

## 16. Testing
- Vitest unit tests in `src/__tests__/`: colour conversions, mixing (identity, yellow+blue=green, exact-paint detection, paper for white, maxPaints, landscape colours within ΔE 6), segmentation (two-colour split, speckle merging, connected components).
- `npm test` must be green before merging to `main`.
- Manual check: sample image analyses in < 5 s, clicking an area opens the editor.

## 17. Task backlog

| ID | Phase | Title | Acceptance criteria | Depends on | Status |
|---|---|---|---|---|---|
| TASK-01 | Setup | Set up Vite + Vue 3 + Pinia + Vitest project | `npm run build` and `npm test` succeed | – | Done |
| TASK-02 | Data model | Hard-code paint stock and Horadam catalogue | 54 stock paints from Notion, merged forms, conflicts noted; 140-colour catalogue | TASK-01 | Done |
| TASK-03 | Backend | Implement colour maths and mixing engine | Recipes for any target; exact paint found with ΔE < 0.5; yellow+blue → green | TASK-01 | Done |
| TASK-04 | Backend | Implement segmentation in a Web Worker | Two-colour image → 2 regions; speckles merged; UI stays responsive | TASK-01 | Done |
| TASK-05 | Frontend | Build canvas view (mixed/photo colour/photo, outlines, numbers, click-select) | Clicking an area selects its colour; views switch without re-analysis | TASK-04 | Done |
| TASK-06 | Frontend | Build controls (upload, colours, simplify, max paints) | Slider change re-analyses; max paints limits recipes | TASK-05 | Done |
| TASK-07 | Frontend | Build palette list and colour editor (recolour, alternatives, edit single area) | Picker changes area colour and recipe; detaching affects only the clicked area | TASK-03, TASK-05 | Done |
| TASK-08 | Frontend | Build paint box with enable/disable persisted in localStorage | Selection survives reload; Update mixes recomputes recipes | TASK-02 | Done |
| TASK-09 | Release | Deploy via GitHub webhook to markus-freise.de/colour-detective | Push to `main` updates the live site within ~2 min; bad signature → 403 | TASK-01 | Code done – server setup open |
| TASK-10 | Data model | Verify paint colours against own swatches and fix stock-list conflicts | Notes for 218/360/512/515 resolved; 336 identified; estimates replaced | TASK-02 | Open |
| TASK-11 | Frontend | Paint management UI: add/edit/delete paints (any vendor), pick from Horadam catalogue, JSON import/export | Custom paint usable in recipes after reload | TASK-08 | Open |
| TASK-12 | Frontend | Export printable paint-by-number sheet (outlines + numbers + recipe legend) as PNG/PDF | A4 print shows all numbered areas and recipes | TASK-07 | Open |
| TASK-13 | Frontend | Save/restore a session (image + settings + recolours) | Reload restores the last session | TASK-07 | Open |
| TASK-14 | Backend | Calibrate paints from a photo of own swatch card (wash + masstone per paint) | Calibrated colours replace estimates; mixing uses two-point absorbance | TASK-10 | Open |
| TASK-15 | Backend | Move recipe computation into the worker | No main-thread task > 100 ms on 32 colours | TASK-03 | Open |
| TASK-16 | Test | Component tests with @vue/test-utils | Editor and paint box covered | TASK-07, TASK-08 | Open |

## 18. Project register

| Field | Value |
|---|---|
| Slug | `colour-detector` |
| Live URL | https://markus-freise.de/colour-detective/ |
| Git remote | git@github.com:markusfreise/colour-detector.git |
| Server | markus-freise.de host · web root `…/colour-detective/` · checkout `~/colour-detector` |
| Batcave | not used (static app, see §15) |
| Local | ~/Sites/colour-detector |
| Assets | …/Dropbox-Personal/Coding/colour-detector/ → symlink `_project-assets` |
| Paint source | Notion "My Watercolour Stock" |
| Asana | https://app.asana.com/1/11248644850981/project/1219377120447222 |
| Notion | https://app.notion.com/p/3f572b1856a18108b71ae7fcb81b6ee4 |

## 19. Open points / TODOs

| ID | Topic | Priority | Status |
|---|---|---|---|
| TODO-01 | Stock list conflicts: tube "218 Gelborange" (218 = Transparent orange, Yellow orange = 222), pan "360 Permanentrot" (360 = Permanent red orange), tube "512 Chromoxidgrün frg." (frg. = 511), tube "515 Maigrün" (May green = 524). App currently trusts the **number**. | High | Open |
| TODO-02 | Pan "336 Chinacrido…" – no Horadam 336 exists; probably 368 Quinacridone violet. Disabled until checked. | Medium | Open |
| TODO-03 | Vendor cross-check of colour values: vendor sites were not reachable from the build environment; values come from the official Horadam chart (mid-strength wash). 933, 972, 974 and MH W311 (Quinacridone bronze) are estimates. | Medium | Open |
| TODO-04 | Confirm Node/npm and PHP `exec()` are available on the markus-freise.de host; otherwise switch to a GitHub Action that builds and uploads `dist/`. | High | Open |
| TODO-05 | Granulation/opacity flags per paint (e.g. avoid granulating paints for smooth washes). | Low | Open |
