// Writes the paint stock, the Horadam colour chart and the sample photos into the app's resources.
// The web app's data files stay the single source: run this after changing them (npm run app:data).
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { stockPaints } from '../../src/data/paints.js'
import { horadamCatalogue } from '../../src/data/horadam-catalogue.js'

const out = new URL('../Resources/Data/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('paints.json', out), JSON.stringify(stockPaints))
writeFileSync(new URL('horadam.json', out), JSON.stringify(horadamCatalogue))
for (const file of ['sample-cwm-idwal.webp', 'sample-street-dusk.webp']) {
  copyFileSync(new URL(`../../public/${file}`, import.meta.url), new URL(file, out))
}
console.log(`Exported ${stockPaints.length} paints and ${horadamCatalogue.length} chart colours.`)
