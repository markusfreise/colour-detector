# Manual

The Watercolourlove manual as static pages, in English and German, built from Markdown. The pages
are written into `public/`, so Vite copies them into every build and they deploy with the app:

| Address | Language | Source |
| --- | --- | --- |
| `manual/` | English | `chapters/en/NN-name.md` |
| `de/handbuch/` | German | `chapters/de/NN-name.md` |

Each chapter is a page of its own; `manual/all.html` and `de/handbuch/alles.html` hold every chapter
on one page, for print. The app links the manual of its language (`legalPage('manual')` in
`src/i18n/index.js`).

## Building

```bash
npm run dev                    # in the repository root: the screenshots are taken from the dev server
docs/manual/build.sh           # screenshots in both languages, then the pages
docs/manual/build.sh --pages   # only the pages; text and styles changed, screenshots stay
```

Then commit `public/manual/` and `public/de/handbuch/`. A single screenshot:
`node tools/screenshots.mjs overview paintbox` (both languages).

The tools are a package of their own (`package.json` here: marked, sass, playwright, sharp), apart
from the app's dependencies.

## Layout

| Path | Contents |
| --- | --- |
| `chapters/<lang>/NN-name.md` | Chapters. Front matter: `title`, `slug`, `lead`, `part`, optional `nav`. `slug: index` is the first page. The same `NN` in both languages is the same chapter; the language switch links them. |
| `topics/<lang>/NN-name.md` | Topic pages: one question painters search for, written for search engines, listed under "Topics" in the navigation apart from the chapters. Front matter: `title` (the whole `<title>`), `nav`, `slug`, `lead`, `description` (meta), `date`, optional `updated`. A section `## Questions and answers` (German `## Fragen und Antworten`) with `### question` per answer, also written out as FAQPage data; `<!-- cta -->` places the button to the app. Same `NN` = same topic in both languages. |
| `shots.mjs` | Every screenshot: which sample, settings, method, open panels, clicks, the part to cut out, the number markers |
| `shots.json` | Size and marker positions per language and screenshot, written by `tools/screenshots.mjs` |
| `tools/screenshots.mjs` | Takes the screenshots with Playwright (2x, WebP) into `public/manual/img/<lang>/` |
| `tools/check.mjs` | Run after the build: every link, picture and anchor of the manual exists, every page is its own canonical, hreflang en/de/x-default agree in both directions |
| `tools/build.mjs` | Markdown to HTML, `public/manual/manual.css` from `scss/`, and `photos.md` |
| `scss/` | Styles of the manual; reset, functions and tokens come from `resources/scss` |
| `photos.md` | Written by the build: the photos of the painting process still to take |
| `shoot-notes.md` | How to photograph the painting process |

## Writing

- `![Caption](shot:<id>)` shows a screenshot of `shots.mjs`, in the language of the page. A numbered
  list right under it explains its markers, in the order of `markers` in `shots.mjs`.
- `![Caption](photo:<name>)` shows `public/manual/photos/<name>.webp` (or .jpg, .png). Until the file
  is there, the page shows an empty frame that says a photo follows, and `photos.md` lists it.
- `> **Tip:** ...`, `> **Note:** ...`, `> **Caution:** ...` become boxes; in German
  `> **Tipp:** ...`, `> **Gut zu wissen:** ...`, `> **Achtung:** ...`.
- Links between chapters as `slug.html` or `slug.html#anchor`; anchors are made from the headings
  (umlauts written out). On the page with every chapter they are turned into anchors.
- UI names in bold, exactly as the app shows them (German from `src/i18n/de.js`). English "you",
  German "du". No emoji.
- When the interface changes: adapt `shots.mjs` if needed, run `build.sh`, and read the chapters that
  show the changed screens.
