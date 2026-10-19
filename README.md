# Watercolourlove

Finds the main colours in a photo, works out how to mix each one from your own watercolours, and shows the photo as flat, numbered colour areas — a paint-by-numbers plan for a watercolour.

![Watercolourlove with the sample photo, the colour list and the recipes for one colour](docs/screenshot.png)

All analysis runs in the browser and the photo stays on your machine. The web app asks visitors to sign in by e-mail link and offers a free version and Pro (see "Accounts" below); the account service only stores the e-mail address, the consent and the plan. Pictures, paint boxes and the collection stay in the browser.

Visit statistics (Google Analytics) are optional and off by default: without a measurement ID in `src/config.js` nothing is loaded and no banner appears. With an ID, a consent banner asks first, and the Analytics script is only requested after "Accept".

## Native app

The iOS, iPadOS and macOS app is also called **Watercolourlove** and lives in [`app/`](app/README.md): SwiftUI, with the colour and mixing logic ported from `src/lib/`.

## Features

- **Colour areas:** the photo is reduced to 2–32 mixes and drawn as flat, numbered areas. Small but distinct colours (lips in a portrait, a red roof) keep a mix of their own instead of being lost among the shades of a large background. A second slider simplifies the shapes into bigger, calmer areas.
- **Washes:** "Colours" counts mixes. A mix is painted in up to five washes, from very watery to concentrated, so colours that differ only in strength do not use up a mix each. On the picture a wash carries the number of its mix and a letter for the water level (W very watery, L light, M medium, R rich, C concentrated), for example 6L and 6R. In the list every mix shows its base colour, a bar with the paints in the proportions of the recipe, and a bar with its washes. Selecting a mix or a wash blanks the rest of the picture, so only the areas of that mix remain.
- **Simplify areas:** 0 to 12 on the slider, starting at 0; with Pro it goes down to -2, where the areas follow the photo ever more closely (internally -4 to 10, `SIMPLIFY_ZERO` in `lib/segment.js`).
- **Saturation and contrast:** adjust the photo before it is analysed. Saturation starts at 200%, which brings out the colours a painter would exaggerate anyway.
- **Details** (formerly Variety): decides which colours share a mix when there are more than you asked for. Low keeps the picture as a whole as close as possible; high lets small areas of another hue keep their own mix while similar large colours share one.
- **Layer mode:** a second method next to mixing, for glazing. A few base paints from the paint box become layers, each painted with one prepared wash over the dry layer before, from light to dark; an area gets one to three coats of a wash, and greens, oranges and darks come from the layers adding up. Up to three accents put a strong wash on small areas last: first for a colour the washes miss, then for the darks. Tick layers on and off to see what each one does, click a layer to see it alone with its coats as numbers, walk through the painting order step by step, or click a spot to see which layers it gets. The base paints are proposed by the app or chosen in the paint box, apart from the paints selected for mixing. Printing gives the finished picture and one sheet per layer.
- **Geometric areas:** an option for both methods. Instead of following the outlines in the photo, every area becomes a polygon with a few straight edges; the polygons are laid over each other from large to small, and in layer mode the shapes of the layers overlap each other. "Simplify areas" makes the edges longer and the shapes fewer.
- **Values:** a mode of mix mode. The picture is analysed in grey and split into up to 24 values; each value is painted with a paint or a mix of the palette, whatever its hue, with the water that brings it to the lightness of the value.
- **Close-ups (Pro):** "Detail" in the picture's tools lets you drag a frame over a part of the picture; that part is cut from the photo at full size and analysed as a picture of its own. Close-ups stay as thumbnails under the picture; "Back" returns to the whole picture. They are not saved with a picture in the collection yet.
- **AI help (optional, your own key; not shown in the interface at the moment, the code is still there):** an AI model (Claude or OpenAI) looks at a small copy of the picture and says what matters in it: the colours to mix, the paints for them and the paints to glaze with, the small details that carry the picture (eyes, a mouth, a highlight) and the main subjects, plus a few sentences of advice. The app then works out the areas, the recipes and the layers from those choices as usual. Where the details are, the areas stay fine however much the rest is simplified; the fine dark shapes there become a final wash, painted last with a fine brush; and in the Sketch view the lines of the main subjects are firm and the rest light or left out. The panel also shows how close the picture is to the photo with and without the AI's choices. It asks only when you press the button, shows what a call is expected to cost and what it did cost, and keeps the answer for the picture.
- **Recipes:** for every colour, up to five ways to mix it from the paints in the palette — which paints, in what ratio, how much water, and how close the mix gets. A tap on an area opens a card with the colour's number, its share of the picture and the recommended recipe; "Full breakdown" shows target against mix and every recipe. On a computer the recipe also follows the pointer.
- **Palette and paint boxes:** the palette is the set of paints a picture is mixed from; it sits at the top of the paint box and is saved with the picture. Below it are the paint boxes, named sets of paints, starting as Schmincke Pans, Schmincke Tubes, Travelbox and one box per further series. Click a chip to move it into the palette or out of it. A + at the end of a box opens a colour search (series, number or name, over the stock and, with Pro, the colour charts of Schmincke Horadam, Winsor & Newton Professional and Michael Harding) and a form for a colour of one's own. Each box can be renamed, have colours removed, be exported as JSON and be deleted; "New paint box" and "Import paint box" add more (Pro). At least one box stays. "Auto" lets the app pick the paints that suit each picture, from the boxes ticked "Use for Auto" (all but the travel box at first); it switches off as soon as you select paints by hand.
- **Collection (Pro):** save pictures in the browser with their settings, palette and colour changes; open, rename and delete them.
- **Limits:** restrict mixes to one, two or three paints.
- **Recolour:** in the full breakdown of a colour, pick a different target colour, choose between the alternative recipes, or detach a single area from the others that share its colour.
- **Print / PDF (Pro):** prints the picture followed by every colour with its chosen mix; pick "Save as PDF" in the print dialog for a PDF.
- **Export as JPG (Pro):** saves the picture as it is drawn, in the view shown.
- **Views:** mixed paint, photo colour, overlay (the photo at half strength over the paint), the original photo, and the template to print (areas empty, outlines and numbers in light blue), with outlines and numbers on or off. The pencil sketch is hidden for now until it is reworked (TASK-39).
- **Languages and appearance:** English and German, light, dark or automatic.
- **Samples:** five photos of the author's own to try the app with.

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

## How the layers work

In layer mode every base paint is a filter of its own: a dried wash filters the light, and the next wash over it filters it again. So the absorbances of separate layers add up without the common limit that holds inside one wet mix, while the coats of one paint still share that paint's limit. The app picks the paints, the strength of each wash and the coats per area so that the picture comes as close as possible for the work it costs: a coat or a step that brings too little is left out, and a neutral paint is kept off clean colour. Each layer's areas are smoothed on their own, so every layer has calm shapes to paint. The paint-to-water guide for a wash assumes that the reference swatch is one part paint to four parts water; like the depth limits, that is an estimate until it is checked against real swatches.

## AI help

The AI panel is not part of the interface at the moment; `AiPanel.vue`, `lib/ai.js` and the `ai` store are still in the code.

The AI does not draw the areas: a language model cannot do that reliably. It makes the decisions a painter makes by eye (what in the picture deserves a colour of its own, which paints suit it), and the app does the measuring.

What is sent, and only when you press "Ask about this picture": a JPEG of the picture scaled down to 560 pixels on its longer side, rebuilt from pixels so that it carries no file data such as place, date or camera; the ids, names and colours of the paints to choose from; and your key. The request goes straight from your browser to the provider. There is no server of this app in between, and the app's author never sees the picture or the key. The provider processes the request under its own terms, on your account.

The key is kept in the page's memory, and in the browser's storage only if you tick "Remember the key on this device". Consent is asked per provider and can be withdrawn with "Forget key and consent".

Cost with Claude, at the prices of October 2026, for one picture (about 1,800 tokens in, 900 out; a model that thinks first uses more): Haiku 5.5 about 0.06 US cents, Sonnet 5.5 about 1.3 cents, Opus 5.5 about 2.5 cents. For OpenAI the model is typed in and no price is assumed.

## The paint stock

The stock is hard-coded in `src/data/paints.js`: 53 Schmincke Horadam Aquarell paints (pans and tubes) and one Michael Harding tube. Each paint has a `hex` value, which is its colour at strength 1 on white paper. No paint is used stronger than that: water only makes a paint lighter, and a darker colour needs a second paint. Most values were sampled from the official Horadam colour chart; a few are estimates and are marked as such in the data.

The colour charts of Schmincke Horadam, Winsor & Newton Professional (116 colours) and Michael Harding (136 colours) are in `src/data/` (`libraries.js`): entering a number of one of those series fills in name and colour. Further paints of any brand can be added to a paint box as colours of one's own; they are stored in the browser.

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
| `src/lib/` | Pure logic, framework-free and tested: colour maths, mixing model, segmentation, geometric areas, the sketch, mix planning, layer mode (glazing), AI requests and answers, paint grouping |
| `src/stores/` | Pinia stores: `paints` (stock, paint boxes, palette), `analysis` (image, settings, areas, recipes, close-ups), `collection`, `account`, `pro` (free limits), `preferences`, `consent`, `layout` and `ai` (provider, key, consent) |
| `src/components/` | Vue 3 components (`<script setup>`) |
| `src/workers/` | Web Worker for the segmentation |
| `resources/scss/` | SCSS, BEM: entry `site.scss`, tokens in `properties.scss`, one file per block in `components/` |
| `src/data/paints.js` | The paint stock |
| `docs/manual/` | The manual in English and German: chapters in Markdown, screenshots taken from the app, built into `public/manual/` and `public/de/handbuch/` (see its README) |
| `deploy/` | GitHub webhook and deploy script for the server |
| `app/` | Native app Watercolourlove (SwiftUI, XcodeGen) |

Stack: Vue 3, Pinia, Vite 5, Vitest.

Spec: [`PRD_ColourDetector_v1.0.0.md`](PRD_ColourDetector_v1.0.0.md) · Backlog: [`docs/backlog.md`](docs/backlog.md)

## Deploy

The app runs at https://watercolourlove.de (Mittwald, web root `~/html/_sites/watercolourlove`). A push to `main` deploys it: a GitHub webhook calls `webhook.php` in the web root, which checks the signature and starts `deploy/deploy.sh` in the checkout `~/colour-detector` (fetch `main` → `npm ci` → tests → `npm run build` → rsync `dist/` into the web root, `server/` into `api/`). The checkout lives outside the web root, so a failed build leaves the site as it was; `.htaccess`, `webhook.php`, `webhook-config.php` and `api/config.php` in the web root are kept. The log is `~/colour-detector-deploy.log`.

One-time setup on the host (SSH), once the checkout exists (`git clone -b main git@github.com:markusfreise/colour-detector.git ~/colour-detector`, private repo: read-only deploy key, `core.sshCommand` set to use it):

```bash
# build settings, not in the repo: VITE_ACCOUNT_API is required, VITE_GA_ID optional
nano ~/colour-detector/.env.production.local
bash ~/colour-detector/_bootstrap/bootstrap-server.sh ~/html/_sites/watercolourlove https://watercolourlove.de
```

The script checks the host, creates `webhook-config.php` with a random secret (only if it is missing), runs the first deploy and prints the values for GitHub → Settings → Webhooks:

| Field | Value |
|---|---|
| Payload URL | `https://watercolourlove.de/webhook.php` |
| Content type | `application/json` |
| Secret | printed by the script |
| Events | Just the push event |

Requirements on the host: git, Node 18 or newer with npm (nvm is picked up), rsync, `flock`, and PHP with `exec()` enabled. `webhook-config.php` holds the secret and is never committed. A deploy by hand: `bash ~/colour-detector/deploy/deploy.sh ~/colour-detector ~/html/_sites/watercolourlove main`.

Before this, batcave built `main` and copied it over (`deploy/remote-deploy.sh`, started by a manual hook); it is switched off once the GitHub webhook works.

## Accounts (optional)

The web app asks visitors to sign in (e-mail link; sign-up is open, an optional invitation code gives a lifetime licence) and offers Pro through Stripe: 4.99 EUR a month, 29.99 EUR a year or 79 EUR once, German VAT included. A free account mixes from up to eight paints in one paint box and cannot save pictures, print, export, use close-ups, add paint boxes, use the manufacturers' colour charts or simplify below 0; Pro lifts all of that. The app from the App Store has its own purchase and does not sign in. Pictures still stay in the browser; the account service in `server/` only stores an e-mail address, the consent and the plan. It is off unless the build sets `VITE_ACCOUNT_API`, and it is skipped on `localhost` unless the address has `?login`. Setup: `server/README.md`. Drafts of the privacy policy, terms and imprint are in `public/privacy`, `public/terms` and `public/imprint`.
