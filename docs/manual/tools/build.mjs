// Builds the manual as static pages, in English and in German:
//   public/manual/<slug>.html           English, index.html is the introduction
//   public/de/handbuch/<slug>.html      German
//   .../all.html, .../alles.html        every chapter on one page, for print
//   public/manual/manual.css            from scss/site.scss, tokens from resources/scss
//   public/manual/manual.js             lightbox.js: the pictures at full size over the page
//
// Sources are chapters/<lang>/NN-name.md with front matter (title, slug, lead, part; nav optional).
// The same NN in both languages is the same chapter: the language switch links them.
// Topics are topics/<lang>/NN-name.md: pages about one question painters search for, listed apart
// from the chapters ("Topics" in the navigation). Front matter: title (the <title>, whole), nav,
// slug, lead, description (meta), date (first published; updated optional). Each has a section
// "## Questions and answers" (German "## Fragen und Antworten") with one "### question" per
// answer, which also becomes the FAQPage data, and <!-- cta --> where the button to the app goes.
//   ![Caption](shot:<id>)   a screenshot of shots.mjs; a numbered list right under it explains
//                           its markers
//   ![Caption](photo:<name>) a photo of the painting process, public/manual/photos/<name>.webp;
//                           until it is there, a frame that says a photo follows
//   > **Tip:** / **Note:** / **Caution:** (German: Tipp, Gut zu wissen, Achtung) become boxes.
//
// Every page names itself as canonical and both languages plus x-default (English) as alternates.
//
// For search engines and language models it also writes, from the chapters and the pages in public/:
//   public/llms.txt                     what the site is, with every page and chapter (llmstxt.org)
//   public/llms-full.txt, public/de/llms-full.txt   the whole manual as Markdown
//   public/sitemap.xml                  every page except the noindex ones and public/preview/
//   public/robots.txt                   pointing to the sitemap

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import * as sass from 'sass'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ROOT = path.resolve(HERE, '../..')
const PUBLIC = path.join(ROOT, 'public')
const ASSETS = path.join(PUBLIC, 'manual')
const SITE = 'https://watercolourlove.de'
const META = JSON.parse(fs.readFileSync(path.join(HERE, 'shots.json'), 'utf8'))

// Per language: where it goes, how it reaches the shared files, and the words of the frame.
const LANGS = {
  en: {
    out: path.join(PUBLIC, 'manual'),
    base: 'manual/',
    assets: '',
    app: '../',
    all: 'all',
    words: {
      manual: 'Manual',
      chapter: (n, total) => (total ? `Chapter ${n} of ${total}` : `Chapter ${n}`),
      chapters: 'Chapters',
      topics: 'Topics',
      topic: 'Topic',
      faq: 'Questions and answers',
      cta: {
        title: 'Try it with your own reference',
        text: 'Open a photo, and Watercolourlove finds the colours that matter and works out a recipe for each: which paints, in what ratio, with how much water. Free to try with an e-mail address; the photo stays on your device.',
        button: 'Open the app',
      },
      whole: 'All chapters on one page',
      prev: 'Previous',
      next: 'Next',
      toApp: 'Open the app',
      zoom: 'Open the picture at full size',
      lightbox: { close: 'Close', prev: 'Previous picture', next: 'Next picture' },
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
    base: 'de/handbuch/',
    assets: '../../manual/',
    app: '../../',
    all: 'alles',
    words: {
      manual: 'Handbuch',
      chapter: (n, total) => (total ? `Kapitel ${n} von ${total}` : `Kapitel ${n}`),
      chapters: 'Kapitel',
      topics: 'Themen',
      topic: 'Thema',
      faq: 'Fragen und Antworten',
      cta: {
        title: 'Probier es mit deinem eigenen Foto',
        text: 'Öffne ein Foto, und Watercolourlove findet die Farben, auf die es ankommt, und rechnet für jede ein Rezept aus: welche Farben, in welchem Verhältnis, mit wie viel Wasser. Kostenlos ausprobieren mit einer E-Mail-Adresse; das Foto bleibt auf deinem Gerät.',
        button: 'App öffnen',
      },
      whole: 'Alle Kapitel auf einer Seite',
      prev: 'Zurück',
      next: 'Weiter',
      toApp: 'Zur App',
      zoom: 'Bild in voller Größe öffnen',
      lightbox: { close: 'Schließen', prev: 'Bild davor', next: 'Nächstes Bild' },
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

function readChapters(lang, kind = 'chapters', required = ['title', 'slug', 'lead', 'part']) {
  const dir = path.join(HERE, kind, lang)
  if (!fs.existsSync(dir)) return []
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
      for (const key of required) {
        if (!front[key]) throw new Error(`${lang}/${file}: "${key}" missing in the front matter`)
      }
      return { file: `${kind}/${file}`, number: file.slice(0, 2), kind, ...front, body: match[2] }
    })
}

const readTopics = (lang) => readChapters(lang, 'topics', ['title', 'nav', 'slug', 'lead', 'description', 'date'])

/** The questions and answers of a topic, as plain text for the FAQPage data. */
function faq(topic, lang) {
  const heading = `## ${LANGS[lang].words.faq}`
  const start = topic.body.indexOf(`\n${heading}\n`)
  if (start < 0) throw new Error(`${lang}/${topic.file}: section "${heading}" missing`)
  const section = topic.body.slice(start + heading.length + 2).split(/\n## /)[0]
  const plain = (md) =>
    md
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  const items = section
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [question, ...answer] = block.split('\n')
      return { question: plain(question), answer: plain(answer.join('\n')) }
    })
  if (items.length < 3) throw new Error(`${lang}/${topic.file}: fewer than three questions under "${heading}"`)
  return items
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
  let firstShot = null
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
        firstShot ??= id
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
  html = html.replace(/<!-- cta -->\n?/g, cta(lang))
  return { html, headings, firstShot }
}

/** The way into the app, on a topic page. */
function cta(lang) {
  const { title, text, button } = LANGS[lang].words.cta
  return `<aside class="cta"><p class="cta__title">${esc(title)}</p><p class="cta__text">${esc(text)}</p><a class="cta__button" href="${SITE}/">${esc(button)}</a></aside>\n`
}

// ------------------------------------------------------------ Pages

function nav(lang, chapters, topics, current, single) {
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
  // The topics apart from the chapters, unnumbered: they are not part of the book's order.
  const topicItems = topics
    .map((t) => {
      const active = t.slug === current?.slug
      return `<li class="nav__item${active ? ' nav__item--active' : ''}"><a href="${t.slug}.html"${active ? ' aria-current="page"' : ''}>${esc(t.nav)}</a></li>`
    })
    .join('')
  const topicList = topics.length ? `<p class="nav__part nav__part--topics">${words.topics}</p><ul class="nav__list nav__list--topics">${topicItems}</ul>` : ''
  const label = current?.kind === 'topics' ? words.topics : words.chapters
  return `<nav class="nav" aria-label="${words.chapters}"><details class="nav__details" open><summary class="nav__summary">${label}${current ? `: ${esc(current.nav ?? current.title)}` : ''}</summary><ol class="nav__list">${items}</ol>${topicList}${whole}</details></nav>`
}

function page(lang, { title, description, body, navHtml, other, canonical, alternates, data }) {
  const { words, assets, app } = LANGS[lang]
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="${assets}manual.css">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${alternates.en}">
<link rel="alternate" hreflang="de" href="${alternates.de}">
<link rel="alternate" hreflang="x-default" href="${alternates.en}">
${data ? `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n` : ''}<script>
  // Dark or light as chosen in the app, else as the system says.
  try { const p = JSON.parse(localStorage.getItem('colour-detector:preferences') || '{}'); if (p.theme === 'light' || p.theme === 'dark') document.documentElement.dataset.theme = p.theme } catch {}
  // On a phone the chapter list starts folded; on a wider screen it is always open.
  document.addEventListener('DOMContentLoaded', () => { if (matchMedia('(max-width: 1023px)').matches) document.querySelector('.nav__details')?.removeAttribute('open') })
</script>
</head>
<body data-lightbox-close="${words.lightbox.close}" data-lightbox-prev="${words.lightbox.prev}" data-lightbox-next="${words.lightbox.next}">
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
<script src="${assets}manual.js"></script>
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

// ------------------------------------------------------------ For crawlers

const url = (rel) => `${SITE}/${rel}`
const chapterUrl = (lang, c) => url(`${LANGS[lang].base}${c.slug === 'index' ? '' : `${c.slug}.html`}`)

/** A chapter as plain Markdown: links made absolute, screenshots and photos as their captions. */
function markdown(lang, c) {
  return c.body
    .replace(/!\[([^\]]*)\]\(shot:[^)]+\)/g, (_, text) => `*Screenshot: ${text}*`)
    .replace(/!\[([^\]]*)\]\(photo:[^)]+\)/g, (_, text) => `*Photo: ${text}*`)
    .replace(/\]\(([a-z0-9-]+)\.html(#[^)]*)?\)/g, (_, slug, hash) => `](${url(`${LANGS[lang].base}${slug === 'index' ? '' : `${slug}.html`}`)}${hash ?? ''})`)
    .trim()
}

/** Every page of public/ that may be indexed, as its address. */
function pages() {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      const rel = path.relative(PUBLIC, file).split(path.sep).join('/')
      if (entry.isDirectory()) {
        if (rel !== 'preview') walk(file)
      } else if (entry.name.endsWith('.html') && !/<meta name="robots" content="[^"]*noindex/.test(fs.readFileSync(file, 'utf8'))) {
        found.push(rel.replace(/(^|\/)index\.html$/, '$1'))
      }
    }
  }
  walk(PUBLIC)
  return ['', ...found.sort()]
}

function crawlFiles(books, topics) {
  const topicList = (lang) => topics[lang].map((t) => `- [${t.nav}](${chapterUrl(lang, t)}): ${t.description}`)
  const list = (lang) => {
    let part = ''
    return books[lang].flatMap((c) => {
      const head = c.part !== part ? ['', `### ${c.part}`, ''] : []
      part = c.part
      return [...head, `- [${c.title}](${chapterUrl(lang, c)}): ${c.lead}`]
    })
  }
  const llms = [
    '# Watercolourlove',
    '',
    '> Watercolourlove is a tool for painters who work from photos, made for professionals and ambitious amateurs: it identifies the colours in a reference that matter and works out how to mix each one from the paints you own, which paints, in what ratio, with how much water.',
    '',
    `A web app at ${SITE}/ (free account with just an e-mail address; prepaid picture packs or Pro for more), also for iPhone, iPad and Mac. The focus is recognising colours and their mixes: colour areas, recipes from your own paints, blocking of light and shadow, values, layer mode for glazing, close-ups, and calibrating the paints to your own swatches. Printouts with a grid and numbered areas are secondary aids. It knows 40 common colours and, with Pro, the colour charts of Schmincke Horadam, Winsor & Newton Professional, Michael Harding and Sennelier L'Aquarelle. Everything is worked out on the device: photos are never uploaded, and pictures, paint boxes and collection stay in the browser. The manual, in English and German, explains the app and painting with watercolour.`,
    '',
    '## About',
    '',
    `- [About Watercolourlove](${url('about/')}): recognising colours and mixing them, the tools for reading a reference, what it costs`,
    `- [Über Watercolourlove](${url('de/ueber/')}): the same in German`,
    `- [Prices](${url('pricing/')}): free, prepaid picture packs, Pro monthly, yearly or lifetime`,
    `- [Watercolourlove for iPhone, iPad and Mac](${url('app/')}): the native app, with support and privacy`,
    '',
    '## Manual',
    ...list('en'),
    '',
    '## Handbuch (Deutsch)',
    ...list('de'),
    '',
    ...(topics.en.length ? ['## Topics', '', ...topicList('en'), ''] : []),
    ...(topics.de.length ? ['## Themen (Deutsch)', '', ...topicList('de'), ''] : []),
    '## Optional',
    '',
    `- [The whole manual as Markdown](${url('llms-full.txt')})`,
    `- [Das ganze Handbuch als Markdown](${url('de/llms-full.txt')})`,
    `- [The whole manual on one page](${url('manual/all.html')})`,
    '',
  ]
  fs.writeFileSync(path.join(PUBLIC, 'llms.txt'), llms.join('\n'))

  for (const [lang, file, title] of [['en', 'llms-full.txt', 'Watercolourlove manual'], ['de', 'de/llms-full.txt', 'Watercolourlove Handbuch']]) {
    const text = books[lang].map((c) => `<!-- ${chapterUrl(lang, c)} -->\n\n${markdown(lang, c)}`).join('\n\n---\n\n')
    fs.writeFileSync(path.join(PUBLIC, file), `# ${title}\n\n> ${books[lang][0].lead}\n\n${text}\n`)
  }

  const urls = pages().map((rel) => `  <url><loc>${esc(url(rel))}</loc></url>`)
  fs.writeFileSync(
    path.join(PUBLIC, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  )
  fs.writeFileSync(path.join(PUBLIC, 'robots.txt'), `User-agent: *\nDisallow: /preview/\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${url('sitemap.xml')}\n`)
  return urls.length
}

/** Structured data of a topic: the article and its questions and answers. */
function topicData(lang, t) {
  const address = chapterUrl(lang, t)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: t.html.match(/<h1 class="chapter__title">([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, ''),
        description: t.description,
        inLanguage: lang,
        url: address,
        mainEntityOfPage: address,
        ...(t.firstShot ? { image: url(`manual/img/${lang}/${t.firstShot}.webp`) } : {}),
        datePublished: t.date,
        dateModified: t.updated ?? t.date,
        author: { '@type': 'Person', name: 'Markus Freise' },
        publisher: { '@type': 'Organization', name: 'Watercolourlove', url: `${SITE}/` },
      },
      {
        '@type': 'FAQPage',
        url: address,
        inLanguage: lang,
        mainEntity: faq(t, lang).map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  }
}

function build() {
  LOGO = fs.readFileSync(path.join(ROOT, 'resources/logo.svg'), 'utf8').replace(/fill="black"/g, 'fill="currentColor"').replace(/<svg /, '<svg aria-hidden="true" ')
  const books = Object.fromEntries(Object.keys(LANGS).map((lang) => [lang, readChapters(lang)]))
  const topics = Object.fromEntries(Object.keys(LANGS).map((lang) => [lang, readTopics(lang)]))
  const report = []

  for (const [lang, chapters] of Object.entries(books)) {
    const { out, words, all } = LANGS[lang]
    const otherLang = lang === 'en' ? 'de' : 'en'
    const otherBase = lang === 'en' ? '../de/handbuch/' : '../../manual/'
    // The page of the other language with the same number: the language switch and hreflang.
    const twin = (c) => (c.kind === 'topics' ? topics : books)[otherLang].find((o) => o.number === c.number)
    const counterpart = (c) => `${otherBase}${twin(c)?.slug ?? 'index'}.html`
    const alternates = (c) => {
      const other = twin(c) ?? books[otherLang][0]
      return { [lang]: chapterUrl(lang, c), [otherLang]: chapterUrl(otherLang, other) }
    }

    const slugs = new Set(chapters.map((c) => c.slug))
    for (const t of topics[lang]) {
      if (slugs.has(t.slug) || t.slug === all) throw new Error(`${lang}/${t.file}: slug "${t.slug}" is taken by a chapter`)
    }
    const pageSlugs = new Set([...slugs, ...topics[lang].map((t) => t.slug)])
    const used = new Set()
    const missing = new Set()
    for (const c of [...chapters, ...topics[lang]]) Object.assign(c, render(c, lang, used, missing))
    fs.mkdirSync(out, { recursive: true })
    // Pages of an earlier build that no chapter or topic makes any more.
    for (const f of fs.readdirSync(out)) if (f.endsWith('.html') && f !== `${all}.html` && !pageSlugs.has(f.replace(/\.html$/, ''))) fs.rmSync(path.join(out, f))

    chapters.forEach((c, i) => {
      const body =
        `<article class="chapter"><p class="chapter__kicker"><span>${esc(c.part)}</span><span>${words.chapter(i + 1, chapters.length)}</span></p>\n` +
        c.html.replace(/(<h1 class="chapter__title">[\s\S]*?<\/h1>\n)/, `$1<p class="chapter__lead">${esc(c.lead)}</p>\n`) +
        `${pager(lang, chapters, i)}</article>`
      fs.writeFileSync(
        path.join(out, `${c.slug}.html`),
        page(lang, {
          title: `${c.title} | Watercolourlove ${words.manual}`,
          description: c.lead,
          body,
          navHtml: nav(lang, chapters, topics[lang], c, false),
          other: counterpart(c),
          canonical: chapterUrl(lang, c),
          alternates: alternates(c),
        }),
      )
    })

    for (const t of topics[lang]) {
      const body =
        `<article class="chapter topic"><p class="chapter__kicker"><span>${words.topic}</span></p>\n` +
        t.html.replace(/(<h1 class="chapter__title">[\s\S]*?<\/h1>\n)/, `$1<p class="chapter__lead">${esc(t.lead)}</p>\n`) +
        `</article>`
      fs.writeFileSync(
        path.join(out, `${t.slug}.html`),
        page(lang, {
          title: t.title,
          description: t.description,
          body,
          navHtml: nav(lang, chapters, topics[lang], t, false),
          other: counterpart(t),
          canonical: chapterUrl(lang, t),
          alternates: alternates(t),
          data: topicData(lang, t),
        }),
      )
    }

    const whole = chapters
      .map((c, i) => `<section class="chapter" id="${c.slug}"><p class="chapter__kicker"><span>${esc(c.part)}</span><span>${words.chapter(i + 1)}</span></p>\n${localize(c.html, c, slugs)}</section>`)
      .join('\n')
    fs.writeFileSync(
      path.join(out, `${all}.html`),
      page(lang, {
        title: words.allTitle,
        description: words.allLead,
        body: whole,
        navHtml: nav(lang, chapters, topics[lang], null, true),
        other: `${otherBase}${LANGS[otherLang].all}.html`,
        canonical: url(`${LANGS[lang].base}${all}.html`),
        alternates: { [lang]: url(`${LANGS[lang].base}${all}.html`), [otherLang]: url(`${LANGS[otherLang].base}${LANGS[otherLang].all}.html`) },
      }),
    )
    report.push(`${lang}: ${chapters.length} chapters, ${topics[lang].length} topics, ${used.size} screenshots${missing.size ? `, photos to come: ${[...missing].join(', ')}` : ''}`)
  }

  const css = sass.compile(path.join(HERE, 'scss/site.scss'), {
    loadPaths: [path.join(ROOT, 'resources/scss')],
    style: 'compressed',
  }).css
  fs.writeFileSync(path.join(ASSETS, 'manual.css'), css)
  fs.copyFileSync(path.join(HERE, 'lightbox.js'), path.join(ASSETS, 'manual.js'))
  photoList()
  report.push(`crawlers: llms.txt, llms-full.txt (en, de), sitemap.xml with ${crawlFiles(books, topics)} pages, robots.txt`)
  console.log(report.join('\n'))
}

build()
