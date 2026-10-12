# Watercolourlove

Finds the main colours in a photo, mixes each from Markus' own watercolours and shows the photo as flat, numbered colour areas.

**Spec:** `PRD_ColourDetector_v1.0.0.md` — if code and PRD disagree, the PRD wins.
**Backlog:** `docs/backlog.md` — tasks with stable IDs.

## Coordinates

| | |
|---|---|
| Name | Watercolourlove (until 2026-10-12: Colour Detector; repo, folder, slug and storage keys keep the old name) |
| Slug | `colour-detector` |
| Preview | https://watercolourlove.markus-freise.de (Mittwald, synced by hand; a real domain follows) |
| Live | https://markus-freise.de/colour-detective/ (push to `main` → webhook → build) |
| Repo | git@github.com:markusfreise/colour-detector.git |
| Local | ~/Sites/colour-detector |
| Assets | `_project-assets` (symlink into Dropbox, not in the repo) |
| Paint source | Notion "My Watercolour Stock" |
| Asana | https://app.asana.com/1/11248644850981/project/1219377120447222 |
| Notion | https://app.notion.com/p/3f572b1856a18108b71ae7fcb81b6ee4 |

## Language

Project language is **English**: UI text, error messages, code comments, commit messages. German paint names live only in `nameDe`.

## Tech stack

Vue 3 (Composition API, `<script setup>`) · Pinia · Vite 5 · Vitest · Web Worker · SCSS (BEM). No backend, no router, no Axios.

## Where things are

- `src/lib/` – pure logic (colour maths, mixing model, segmentation). Keep it framework-free and tested.
- `src/stores/` – `paints` (stock + enabled set, localStorage) and `analysis` (image, settings, segmentation, palette entries).
- `src/data/paints.js` – hard-coded stock. `hex` = colour at strength 1, and since 2026-10-12 the darkest the paint is ever used: more of one paint than strength 1 does not exist (`MAX_AMOUNT` in `lib/mixing.js`). Darker needs a second paint. The stock values come from the Horadam chart, which shows a mid-strength wash, so dark paints are recorded lighter than they are at full strength.
- `deploy/` – `webhook.php` + `deploy.sh` for the live server.
- `app/` – native app **Tintmap** (SwiftUI, iOS/iPadOS/macOS, bundle ID `de.markusfreise.tintmap`). `app/Sources/Core/` is a port of `src/lib/`: change both sides together. Details in `app/README.md`.

## Conventions

- **Branches:** `main` (= live) ← `develop` ← `feature/TASK-xx-name`. No stage.
- **Commits:** `<type>(TASK-xx): <summary>` — feat, fix, chore, refactor, test, docs. One step = one commit.
- **CSS:** SCSS in the house structure under `resources/scss/` (entry `site.scss`, tokens in `properties.scss`, PRD §12). BEM (`block__element--modifier`), one file per block in `resources/scss/components/`, px values through `pxtorem()`, no scoped styles.
- **Vue:** Composition API, Pinia for state. Large typed arrays/images via `markRaw`.
- **Tests:** Vitest in `src/__tests__/` — `npm test`.

## Workflow

1. Take the lowest open task in `docs/backlog.md` whose dependencies are done
2. Branch `feature/TASK-xx-name` off `develop`
3. Implement, write tests, get `npm test` and `npm run build` green
4. Commit with the TASK ID, mark the backlog row done
5. Only then start the next task

## On batcave

Agents also work in a checkout on batcave (LXC 114, `/var/www/watercolourlove`), so that long runs go on while the Mac is off.

- **Push at once:** every change made on batcave is committed and pushed to the working branch right away. Nothing stays only in that checkout; before starting, pull.
- **Dev instance:** https://watercolourlove.croeso.de serves `dist/` of that checkout: run `npm run build` to show a change there. Never name this address in public texts.
- **Deploy to the public host:** only Markus starts it, with the deploy webhook (`deploy/remote-deploy.sh` builds what is pushed and publishes it). Agents do not call it.

## Not without asking

- Pushing to `main` (that is a live deploy)
- Adding dependencies not listed in PRD §2
- Changing the mixing model's meaning of `hex` (strength 1 = the paint at its darkest) – it affects every recipe
- Committing `webhook-config.php` or any secret
