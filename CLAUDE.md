# Colour Detector

Finds the main colours in a photo, mixes each from Markus' own watercolours and shows the photo as flat, numbered colour areas.

**Spec:** `PRD_ColourDetector_v1.0.0.md` — if code and PRD disagree, the PRD wins.
**Backlog:** `docs/backlog.md` — tasks with stable IDs.

## Coordinates

| | |
|---|---|
| Slug | `colour-detector` |
| Live | https://markus-freise.de/colour-detective/ (push to `main` → webhook → build) |
| Repo | git@github.com:markusfreise/colour-detector.git |
| Local | ~/Sites/colour-detector |
| Assets | `_project-assets` (symlink into Dropbox, not in the repo) |
| Paint source | Notion "My Watercolour Stock" |
| Asana | <URL> |
| Notion | <URL> |

## Language

Project language is **English**: UI text, error messages, code comments, commit messages. German paint names live only in `nameDe`.

## Tech stack

Vue 3 (Composition API, `<script setup>`) · Pinia · Vite 5 · Vitest · Web Worker · BEM CSS. No backend, no router, no Axios.

## Where things are

- `src/lib/` – pure logic (colour maths, mixing model, segmentation). Keep it framework-free and tested.
- `src/stores/` – `paints` (stock + enabled set, localStorage) and `analysis` (image, settings, segmentation, palette entries).
- `src/data/paints.js` – hard-coded stock. `hex` = colour at strength 1 (mid-strength wash), **not** masstone.
- `deploy/` – `webhook.php` + `deploy.sh` for the live server.

## Conventions

- **Branches:** `main` (= live) ← `develop` ← `feature/TASK-xx-name`. No stage.
- **Commits:** `<type>(TASK-xx): <summary>` — feat, fix, chore, refactor, test, docs. One step = one commit.
- **CSS:** BEM (`block__element--modifier`), one file per block in `src/css/components/`, no scoped styles, no utility classes.
- **Vue:** Composition API, Pinia for state. Large typed arrays/images via `markRaw`.
- **Tests:** Vitest in `src/__tests__/` — `npm test`.

## Workflow

1. Take the lowest open task in `docs/backlog.md` whose dependencies are done
2. Branch `feature/TASK-xx-name` off `develop`
3. Implement, write tests, get `npm test` and `npm run build` green
4. Commit with the TASK ID, mark the backlog row done
5. Only then start the next task

## Not without asking

- Pushing to `main` (that is a live deploy)
- Adding dependencies not listed in PRD §2
- Changing the mixing model's meaning of `hex` (strength-1 reference) – it affects every recipe
- Committing `webhook-config.php` or any secret
