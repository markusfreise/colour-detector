// The pictures behind signing in (AccountGate.vue): every sample and the watercolour of the
// background as the app paints them with the three showcase paints, numbered areas and all. The
// sign-in shows these pictures instead of running the app, which only goes to signed-in users.
//
// Needs the app on a dev server with mixing (npm run dev in the repository root with the PHP API,
// or MIX_REFERENCE=1 npm run dev). Writes resources/showcase/<name>.webp; run it again after a
// change to the analysis, the mixing or the samples.
//
//   node tools/showcase.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { showcasePaints } from '../../../src/data/showcase.js'
import { SAMPLES } from '../../../src/data/samples.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT = path.join(ROOT, 'resources/showcase')
const APP = process.env.SHOWCASE_APP ?? 'http://127.0.0.1:5173/'

const pictures = [{ file: 'background.webp', url: '/resources/background.webp', name: 'Watercolour' }, ...SAMPLES.map((s) => ({ file: s.file, url: `/${s.file}`, name: s.name }))]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(APP)
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('analysis'), null, { timeout: 30000 })
for (const picture of pictures) {
  const data = await page.evaluate(
    async ([picture, paints]) => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const analysis = pinia._s.get('analysis')
      pinia._s.get('paints').startShowcase(paints)
      analysis.settings.mode = 'mix'
      analysis.settings.view = 'mixed'
      await analysis.loadFromSource(picture.url, picture.name, { sample: true, hash: null })
      // Until the mixes are there and drawn.
      for (let i = 0; i < 600 && (analysis.busy || analysis.mixing || !analysis.entries.length); i++) await new Promise((r) => setTimeout(r, 100))
      if (analysis.error) throw new Error(analysis.error)
      await new Promise((r) => setTimeout(r, 600))
      return document.querySelector('.painting canvas').toDataURL('image/png')
    },
    [picture, showcasePaints],
  )
  const target = path.join(OUT, picture.file)
  await sharp(Buffer.from(data.split(',')[1], 'base64')).webp({ quality: 80 }).toFile(target)
  console.log(`${picture.name} -> ${path.relative(ROOT, target)}`)
}
await browser.close()
