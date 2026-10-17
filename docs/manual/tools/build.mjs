// Builds the manual as static pages, in English and in German:
//   public/manual/<slug>.html           English, index.html is the introduction
//   public/de/handbuch/<slug>.html      German
//   .../all.html, .../alles.html        every chapter on one page, for print
//   public/manual/manual.css            from scss/site.scss, tokens from resources/scss
//
// Sources are chapters/<lang>/NN-name.md with front matter (title, slug, lead, part; nav optional).
// The same NN in both languages is the same chapter: the language switch links them.
//   ![Caption](shot:<id>)   a screenshot of shots.mjs; a numbered list right under it explains
//                           its markers
//   ![Caption](photo:<name>) a photo of the painting process, public/manual/photos/<name>.webp;
//                           until it is there, a frame that says a photo follows
//   > **Tip:** / **Note:** / **Caution:** (German: Tipp, Gut zu wissen, Achtung) become boxes.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import * as sass from 'sass'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ROOT = path.resolve(HERE, '../..')
const PUBLIC = path.join(ROOT, 'public')
const ASSETS = path.join(PUBLIC, 'manual')
const META = JSON.parse(fs.readFileSync(path.join(HERE, 'shots.json'), 'utf8'))

// Per language: where it goes, how it reaches the shared files, and the words of the frame.
const LANGS = {
  en: {
    out: path.join(PUBLIC, 'manual'),
    assets: '',
    app: '../',
    all: 'all',
    words: {
      manual: 'Manual',
      chapter: (n, total) => (total ? `Chapter ${n} of ${total}` : `Chapter ${n}`),
      chapters: 'Chapters',
      whole: 'All chapters on one page',
      prev: 'Previous',
      next: 'Next',
      toApp: 'Open the app',
      zoom: 'Open the picture at full size',
      photoFollows: 'Photo follows',
      other: 'Deutsch',
      footer: 'Watercolourlove by Markus Freise. Questions:',
      allTitle: 'Watercolourlove manual: all chapters',
      allLead: 'The whole Watercolourlove manual on one page.',
      notes: { Tip: 'tip', Note: 'info', Caution: 'warn' },
    },
  },
  de: {
    out: path.join(PUBLIC, 'de/handbuch'),
    assets: '../../manual/',
    app: '../../',
    all: 'alles',
    words: {
      manual: 'Handbuch',
      chapter: (n, total) => (total ? `Kapitel ${n} von ${total}` : `Kapitel ${n}`),
      chapters: 'Kapitel',
      whole: 'Alle Kapitel auf einer Seite',
      prev: 'Zurück',
      next: 'Weiter',
      toApp: 'Zur App',
      zoom: 'Bild in voller Größe öffnen',
      photoFollows: 'Foto folgt',
      other: 'English',
      footer: 'Watercolourlove von Markus Freise. Fragen an',
      allTitle: 'Watercolourlove Handbuch: alle Kapitel',
      allLead: 'Das ganze Handbuch zu Watercolourlove auf einer Seite.',
      notes: { Tipp: 'tip', 'Gut zu wissen': 'info', Achtung: 'warn' },
    },
  },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ------------------------------------------------------------ Reading

function readChapters(lang) {
  const dir = path.join(HERE, 'chapters', lang)
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .sort()
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
      if (!match) throw new Error(`${lang}/${file}: front matter missing`)
      const front = Object.fromEntries(
        match[1].split('\n').filter(Boolean).map((line) => {
          const i = line.indexOf(':')
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
        }),
      )
      for (const key of ['title', 'slug', 'lead', 'part']) {
        if (!front[key]) throw new Error(`${lang}/${file}: "${key}" missing in the front matter`)
      }
      return { file, number: file.slice(0, 2), ...front, body: match[2] }
    })
}

// ------------------------------------------------------------ Markdown

function photoFile(name) {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    if (fs.existsSync(path.join(ASSETS, 'photos', `${name}.${ext}`))) return `photos/${name}.${ext}`
  }
  return null
}

function render(chapter, lang, used, missing) {
  const { words, assets } = LANGS[lang]
  const headings = []
  const ids = new Set()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens)
        let id = slugify(html)
        for (let i = 2; ids.has(id); i++) id = `${slugify(html)}-${i}`
        ids.add(id)
        if (depth === 2) headings.push({ id, text: html.replace(/<[^>]+>/g, '') })
        if (depth === 1) return `<h1 class="chapter__title">${html}</h1>\n`
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${html}</h${depth}>\n`
      },
      image({ href, text }) {
        if (href.startsWith('photo:')) {
          const name = href.slice(6)
          const file = photoFile(name)
          if (!file) {
            missing.add(name)
            if (lang === 'en') PHOTOS.push({ name, chapter: `${chapter.number} ${chapter.title}`, caption: text })
            return `<figure class="photo photo--missing"><div class="photo__frame"><span class="photo__note">${words.photoFollows}</span></div><figcaption>${esc(text)}</figcaption></figure>`
          }
          return `<figure class="photo"><div class="photo__frame"><img src="${assets}${file}" alt="${esc(text)}" loading="lazy"></div><figcaption>${esc(text)}</figcaption></figure>`
        }
        if (!href.startsWith('shot:')) return `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy">`
        const id = href.slice(5)
        const meta = META[`${lang}/${id}`]
        if (!meta) throw new Error(`${lang}/${chapter.file}: screenshot "${id}" missing in shots.json`)
        used.add(id)
        const markers = meta.markers
          .map((m) => `<span class="shot__marker" style="left:${m.x}%;top:${m.y}%" aria-hidden="true">${m.n}</span>`)
          .join('')
        const src = `${assets}img/${lang}/${id}.webp`
        // Taken at 2x; a small part is shown no wider than it was on screen.
        const narrow = meta.width < 760 ? ` style="--shot-width:${meta.width}px"` : ''
        return (
          `<figure class="shot${meta.markers.length ? ' shot--markers' : ''}"${narrow}>` +
          `<div class="shot__frame"><a class="shot__zoom" href="${src}" title="${words.zoom}"><img src="${src}" width="${meta.width}" height="${meta.height}" alt="${esc(text)}" loading="lazy"></a>${markers}</div>` +
          `<figcaption>${esc(text)}</figcaption></figure>`
        )
      },
      paragraph({ tokens }) {
        const html = this.parser.parseInline(tokens)
        return html.startsWith('<figure') ? `${html}\n` : `<p>${html}</p>\n`
      },
      blockquote({ tokens }) {
        const html = this.parser.parse(tokens)
        const label = /^<p><strong>([^<:]+):?<\/strong>/.exec(html)?.[1]?.replace(/:$/, '')
        const kind = words.notes[label] ?? 'info'
        return `<aside class="note note--${kind}">${html}</aside>\n`
      },
    },
  })
  let html = marked.parse(chapter.body)
  html = html.replace(/(<\/figure>\s*)<ol>/g, '$1<ol class="legend">')
  html = html.replace(/<table>/g, '<div class="table-wrap"><table class="table">').replace(/<\/table>/g, '</table></div>')
  return { html, headings }
}

// ------------------------------------------------------------ Pages

function nav(lang, chapters, current, single) {
  const { words, all } = LANGS[lang]
  let part = null
  const items = chapters
    .map((c, i) => {
      const href = single ? `#${c.slug}` : `${c.slug}.html`
      const active = c.slug === current?.slug
      const sub =
        active && !single && c.headings.length
          ? `<ul class="nav__sub">${c.headings.map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`).join('')}</ul>`
          : ''
      const head = c.part !== part ? `<li class="nav__part">${esc(c.part)}</li>` : ''
      part = c.part
      return `${head}<li class="nav__item${active ? ' nav__item--active' : ''}"><a href="${href}"${active ? ' aria-current="page"' : ''}><span class="nav__number">${i + 1}</span>${esc(c.nav ?? c.title)}</a>${sub}</li>`
    })
    .join('')
  const whole = single ? '' : `<p class="nav__whole"><a href="${all}.html">${words.whole}</a></p>`
  return `<nav class="nav" aria-label="${words.chapters}"><details class="nav__details" open><summary class="nav__summary">${words.chapters}${current ? `: ${esc(current.nav ?? current.title)}` : ''}</summary><ol class="nav__list">${items}</ol>${whole}</details></nav>`
}

function page(lang, { title, description, body, navHtml, other }) {
  const { words, assets, app } = LANGS[lang]
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="${assets}manual.css">
<link rel="alternate" hreflang="${lang === 'en' ? 'de' : 'en'}" href="${other}">
<script>
  // Dark or light as chosen in the app, else as the system says.
  try { const p = JSON.parse(localStorage.getItem('colour-detector:preferences') || '{}'); if (p.theme === 'light' || p.theme === 'dark') document.documentElement.dataset.theme = p.theme } catch {}
  // On a phone the chapter list starts folded; on a wider screen it is always open.
  document.addEventListener('DOMContentLoaded', () => { if (matchMedia('(max-width: 1023px)').matches) document.querySelector('.nav__details')?.removeAttribute('open') })
</script>
</head>
<body>
<header class="header">
  <div class="header__inner wrap">
    <a class="header__brand" href="index.html"><span class="header__logo" role="img" aria-label="Watercolourlove">${LOGO}</span><span class="header__label">${words.manual}</span></a>
    <nav class="header__links">
      <a class="header__link" href="${other}" hreflang="${lang === 'en' ? 'de' : 'en'}" lang="${lang === 'en' ? 'de' : 'en'}">${words.other}</a>
      <a class="header__app" href="${app}">${words.toApp}</a>
    </nav>
  </div>
</header>
<div class="layout wrap">
  <aside class="layout__nav">${navHtml}</aside>
  <main class="layout__main content">
${body}
  </main>
</div>
<footer class="footer">
  <div class="wrap footer__inner">
    <span>${words.footer} <a href="mailto:support@markus-freise.de">support@markus-freise.de</a></span>
  </div>
</footer>
</body>
</html>
`
}

function pager(lang, chapters, i) {
  const { words } = LANGS[lang]
  const link = (c, rel, label) =>
    c ? `<a class="pager__link pager__link--${rel}" href="${c.slug}.html" rel="${rel}"><span class="pager__label">${label}</span><span class="pager__title">${esc(c.title)}</span></a>` : '<span></span>'
  return `<nav class="pager" aria-label="${words.chapters}">${link(chapters[i - 1], 'prev', words.prev)}${link(chapters[i + 1], 'next', words.next)}</nav>`
}

/** For the page with every chapter: anchors made unique per chapter, links to chapters turned into anchors. */
function localize(html, chapter, slugs) {
  return html
    .replace(/ id="([^"]+)"/g, (_, id) => ` id="${chapter.slug}--${id}"`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${chapter.slug}--${id}"`)
    .replace(/href="([a-z0-9-]+)\.html(?:#([^"]+))?"/g, (whole, slug, id) => (slugs.has(slug) ? `href="#${id ? `${slug}--${id}` : slug}"` : whole))
}

// ------------------------------------------------------------ Building

let LOGO = ''
const PHOTOS = []

/** The photos still to take, for whoever shoots them: docs/manual/photos.md. */
function photoList() {
  const lines = [
    '# Photos to take',
    '',
    'Written by `tools/build.mjs`: every `photo:` in the chapters that has no file yet. Save each photo as',
    '`public/manual/photos/<name>.webp` (or .jpg), landscape 3:2, about 2400 px wide, and build again.',
    'The same photo serves the English and the German page.',
    '',
    '| Name | Chapter | What it shows |',
    '| --- | --- | --- |',
    ...PHOTOS.filter((p, i) => PHOTOS.findIndex((q) => q.name === p.name) === i).map((p) => `| \`${p.name}\` | ${p.chapter} | ${p.caption.replace(/\|/g, '/')} |`),
    '',
  ]
  fs.writeFileSync(path.join(HERE, 'photos.md'), lines.join('\n'))
}

function build() {
  LOGO = fs.readFileSync(path.join(ROOT, 'resources/logo.svg'), 'utf8').replace(/fill="black"/g, 'fill="currentColor"').replace(/<svg /, '<svg aria-hidden="true" ')
  const books = Object.fromEntries(Object.keys(LANGS).map((lang) => [lang, readChapters(lang)]))
  const report = []

  for (const [lang, chapters] of Object.entries(books)) {
    const { out, words, all } = LANGS[lang]
    const otherLang = lang === 'en' ? 'de' : 'en'
    const otherBook = books[otherLang]
    const otherBase = lang === 'en' ? '../de/handbuch/' : '../../manual/'
    const counterpart = (c) => {
      const twin = otherBook.find((o) => o.number === c.number)
      return `${otherBase}${twin ? twin.slug : 'index'}.html`
    }

    const slugs = new Set(chapters.map((c) => c.slug))
    const used = new Set()
    const missing = new Set()
    for (const c of chapters) Object.assign(c, render(c, lang, used, missing))
    fs.mkdirSync(out, { recursive: true })
    // Pages of an earlier build that no chapter makes any more.
    for (const f of fs.readdirSync(out)) if (f.endsWith('.html') && f !== `${all}.html` && !slugs.has(f.replace(/\.html$/, ''))) fs.rmSync(path.join(out, f))

    chapters.forEach((c, i) => {
      const body =
        `<article class="chapter"><p class="chapter__kicker"><span>${esc(c.part)}</span><span>${words.chapter(i + 1, chapters.length)}</span></p>\n` +
        c.html.replace(/(<h1 class="chapter__title">[\s\S]*?<\/h1>\n)/, `$1<p class="chapter__lead">${esc(c.lead)}</p>\n`) +
        `${pager(lang, chapters, i)}</article>`
      fs.writeFileSync(
        path.join(out, `${c.slug}.html`),
        page(lang, { title: `${c.title} | Watercolourlove ${words.manual}`, description: c.lead, body, navHtml: nav(lang, chapters, c, false), other: counterpart(c) }),
      )
    })

    const whole = chapters
      .map((c, i) => `<section class="chapter" id="${c.slug}"><p class="chapter__kicker"><span>${esc(c.part)}</span><span>${words.chapter(i + 1)}</span></p>\n${localize(c.html, c, slugs)}</section>`)
      .join('\n')
    fs.writeFileSync(
      path.join(out, `${all}.html`),
      page(lang, { title: words.allTitle, description: words.allLead, body: whole, navHtml: nav(lang, chapters, null, true), other: `${otherBase}${LANGS[otherLang].all}.html` }),
    )
    report.push(`${lang}: ${chapters.length} chapters, ${used.size} screenshots${missing.size ? `, photos to come: ${[...missing].join(', ')}` : ''}`)
  }

  const css = sass.compile(path.join(HERE, 'scss/site.scss'), {
    loadPaths: [path.join(ROOT, 'resources/scss')],
    style: 'compressed',
  }).css
  fs.writeFileSync(path.join(ASSETS, 'manual.css'), css)
  photoList()
  console.log(report.join('\n'))
}

build()
