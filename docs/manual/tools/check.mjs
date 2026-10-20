// Checks the built manual (public/manual/, public/de/handbuch/) and fails when something is broken:
//   - every link and picture of a page points to a file that exists, and an #anchor to an id there
//   - every page names itself as canonical
//   - hreflang en, de and x-default are there, and the page of the other language names this page
//     back (the pairs agree in both directions)
// Links to other hosts are not followed. Run by build.sh after the build.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ROOT = path.resolve(HERE, '../..')
const PUBLIC = path.join(ROOT, 'public')
const SITE = 'https://watercolourlove.de'
const DIRS = ['manual', 'de/handbuch']

const files = DIRS.flatMap((dir) =>
  fs
    .readdirSync(path.join(PUBLIC, dir))
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(PUBLIC, dir, f)),
)

const addressOf = (file) => `${SITE}/${path.relative(PUBLIC, file).split(path.sep).join('/').replace(/(^|\/)index\.html$/, '$1')}`

/** The file an address of this site is served from; the root is the app, outside public/. */
function fileOf(address) {
  const rel = address.slice(SITE.length + 1)
  if (rel === '') return path.join(ROOT, 'index.html')
  const file = path.join(PUBLIC, rel)
  return rel.endsWith('/') || (fs.existsSync(file) && fs.statSync(file).isDirectory()) ? path.join(file, 'index.html') : file
}

const cache = new Map()
function read(file) {
  if (!cache.has(file)) {
    const html = fs.readFileSync(file, 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    cache.set(file, {
      html,
      lang: /<html lang="([^"]+)"/.exec(html)?.[1],
      canonical: /<link rel="canonical" href="([^"]+)">/.exec(head)?.[1],
      alternates: Object.fromEntries([...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]])),
      ids: new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])),
    })
  }
  return cache.get(file)
}

const errors = []
let links = 0
for (const file of files) {
  const page = read(file)
  const self = addressOf(file)
  const where = path.relative(PUBLIC, file)

  // Links and pictures; the head's own links are checked below as canonical and alternates.
  const body = page.html.slice(page.html.indexOf('<body'))
  for (const [, attr, value] of body.matchAll(/ (href|src)="([^"]*)"/g)) {
    if (/^(mailto:|tel:|data:|javascript:)/.test(value)) continue
    if (/^https?:\/\//.test(value) && !value.startsWith(`${SITE}/`)) continue
    links++
    const [target, anchor] = value.split('#')
    const address = target === '' ? self : new URL(target, self).href.replace(/\?.*$/, '')
    const goal = fileOf(address)
    if (!fs.existsSync(goal)) {
      errors.push(`${where}: ${attr} "${value}" points to nothing`)
      continue
    }
    if (anchor && goal.endsWith('.html') && !read(goal).ids.has(anchor)) errors.push(`${where}: anchor "#${anchor}" of "${value}" is missing`)
  }

  if (page.canonical !== self) errors.push(`${where}: canonical is "${page.canonical}", not "${self}"`)
  const alt = page.alternates
  for (const lang of ['en', 'de', 'x-default']) if (!alt[lang]) errors.push(`${where}: hreflang "${lang}" missing`)
  if (alt[page.lang] !== self) errors.push(`${where}: hreflang "${page.lang}" is "${alt[page.lang]}", not the page itself`)
  if (alt['x-default'] && alt['x-default'] !== alt.en) errors.push(`${where}: x-default is not the English page`)
  for (const lang of ['en', 'de']) {
    if (!alt[lang] || lang === page.lang) continue
    const twin = fileOf(alt[lang])
    if (!fs.existsSync(twin)) {
      errors.push(`${where}: hreflang "${lang}" points to nothing (${alt[lang]})`)
      continue
    }
    const back = read(twin).alternates[page.lang]
    if (back !== self) errors.push(`${where}: its ${lang} page ${alt[lang]} names "${back}" as ${page.lang}, not this page`)
  }
}

if (errors.length) {
  console.error(`check: ${errors.length} problems in ${files.length} pages\n${errors.map((e) => `  ${e}`).join('\n')}`)
  process.exit(1)
}
console.log(`check: ${files.length} pages, ${links} links and pictures, canonical and hreflang pairs all fine`)
