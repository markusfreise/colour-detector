// Takes the screenshots of the manual: opens the app on the dev server (npm run dev in the
// repository root), plays every shot of shots.mjs in English and in German, writes the pictures
// as WebP to public/manual/img/<lang>/<id>.webp and the places of the number markers to shots.json.
//
//   node tools/screenshots.mjs                 # every shot, both languages
//   node tools/screenshots.mjs overview paintbox  # only these
//
// The app is driven through its Pinia stores where clicking would be fragile (loading a sample,
// settings, the method), and by clicks where the manual shows a click (dialogs, cards).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { shots } from '../shots.mjs'
import de from '../../../src/i18n/de.js'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(ROOT, 'public/manual/img')
const META = path.join(HERE, 'shots.json')
const APP = process.env.MANUAL_APP ?? 'http://127.0.0.1:5173/'
export const LANGUAGES = ['en', 'de']

/** The text of the app in that language: German from the app's own table, as on screen. */
const translator = (lang) => (text) => (lang === 'de' ? (de[text] ?? text) : text)

async function box(locator, what) {
  const first = locator.first()
  await first.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
    throw new Error(`${what}: not visible`)
  })
  return first.boundingBox()
}

/** Helpers that run in the page: the stores, and waiting until the analysis is done. */
function pageTools(page) {
  return {
    store: (name, fn, arg) =>
      page.evaluate(
        ([name, fn, arg]) => {
          const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
          const store = pinia._s.get(name)
          // eslint-disable-next-line no-new-func
          return new Function('store', 'arg', `return (${fn})(store, arg)`)(store, arg)
        },
        [name, fn.toString(), arg],
      ),
    idle: async () => {
      await page.waitForFunction(
        () => {
          const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia
          const analysis = pinia?._s.get('analysis')
          return analysis && !analysis.busy && !document.querySelector('.painting__status')
        },
        null,
        { timeout: 90000 },
      )
      await page.waitForTimeout(700)
    },
  }
}

async function shoot(browser, shot, lang) {
  const viewport = { width: 1440, height: 900, ...shot.viewport }
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  const layout = { collapsed: { controls: true, palette: true, ...shot.collapsed }, positions: {} }
  await context.addInitScript(
    ([lang, layout]) => {
      localStorage.setItem('colour-detector:preferences', JSON.stringify({ language: lang, theme: 'light' }))
      localStorage.setItem('colour-detector:layout', JSON.stringify(layout))
    },
    [lang, layout],
  )
  const page = await context.newPage()
  const t = translator(lang)
  const tools = pageTools(page)
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  if (shot.sample !== null) {
    if (shot.settings) await tools.store('analysis', (s, settings) => Object.assign(s.settings, settings), shot.settings)
    await tools.store('analysis', (s, index) => s.loadSample(index), shot.sample ?? 1)
    await tools.idle()
    if (shot.mode) {
      await tools.store('analysis', (s, mode) => s.setMode(mode), shot.mode)
      await tools.idle()
    }
  }
  if (shot.prepare) await shot.prepare(page, { t, ...tools })
  await page.waitForTimeout(shot.wait ?? 600)

  let clip
  const size = page.viewportSize()
  if (shot.target) {
    const b = await box(shot.target(page, t), `${shot.id}: target`)
    const pad = shot.padding ?? 16
    const x = Math.max(0, b.x - pad)
    const y = Math.max(0, b.y - pad)
    clip = { x, y, width: Math.min(size.width, b.x + b.width + pad) - x, height: Math.min(size.height, b.y + b.height + pad) - y }
  } else {
    clip = { x: 0, y: 0, width: size.width, height: size.height }
  }

  const markers = []
  for (const [i, marker] of (shot.markers ?? []).entries()) {
    const spec = typeof marker === 'function' ? { at: 'tl', locate: marker } : marker
    const b = await box(spec.locate(page, t), `${shot.id}: marker ${i + 1}`)
    const [ax, ay] = { tl: [0, 0], tr: [1, 0], l: [0, 0.5], r: [1, 0.5], c: [0.5, 0.5], bl: [0, 1], br: [1, 1], t: [0.5, 0], b: [0.5, 1] }[spec.at ?? 'tl']
    const [ox, oy] = { tl: [-6, -6], tr: [6, -6], l: [-22, 0], r: [22, 0], c: [0, 0], t: [0, -18], b: [0, 18], bl: [-6, 6], br: [6, 6] }[spec.at ?? 'tl']
    const px = b.x + b.width * ax + (spec.dx ?? ox)
    const py = b.y + b.height * ay + (spec.dy ?? oy)
    const pct = (v, start, len) => Math.round(Math.min(97, Math.max(3, ((v - start) / len) * 100)) * 100) / 100
    markers.push({ n: i + 1, x: pct(px, clip.x, clip.width), y: pct(py, clip.y, clip.height) })
  }

  const png = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })
  fs.mkdirSync(path.join(OUT, lang), { recursive: true })
  await sharp(png).webp({ quality: 82 }).toFile(path.join(OUT, lang, `${shot.id}.webp`))
  await context.close()
  return { width: Math.round(clip.width), height: Math.round(clip.height), markers }
}

async function main() {
  const only = process.argv.slice(2)
  const list = only.length ? shots.filter((s) => only.includes(s.id)) : shots
  const unknown = only.filter((id) => !shots.some((s) => s.id === id))
  if (unknown.length) throw new Error(`Unknown shots: ${unknown.join(', ')}`)

  const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {}
  const browser = await chromium.launch()
  let failed = 0
  for (const shot of list) {
    for (const lang of LANGUAGES) {
      try {
        meta[`${lang}/${shot.id}`] = await shoot(browser, shot, lang)
        console.log(`OK      ${lang}/${shot.id}`)
      } catch (error) {
        failed++
        console.log(`FAILED  ${lang}/${shot.id}: ${error.message.split('\n')[0]}`)
      }
    }
  }
  await browser.close()
  const sorted = Object.fromEntries(Object.keys(meta).sort().map((k) => [k, meta[k]]))
  fs.writeFileSync(META, JSON.stringify(sorted, null, 2) + '\n')
  if (failed) process.exitCode = 1
}

main()
