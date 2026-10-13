// Writes the paint stock, the Horadam colour chart and the sample photos into the app's resources.
// The web app's data files stay the single source: run this after changing them (npm run app:data).
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { stockPaints } from '../../src/data/paints.js'
import { horadamCatalogue } from '../../src/data/horadam-catalogue.js'

const out = new URL('../Resources/Data/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('paints.json', out), JSON.stringify(stockPaints))
writeFileSync(new URL('horadam.json', out), JSON.stringify(horadamCatalogue))
// sample-llyn-idwal.webp is not copied: the app keeps it at 2000 px, the pixels the reference
// values in Tests/LayerTests.swift were made from; the web app's copy is scaled down to 1024 px.
for (const file of ['sample-bielefeld.webp', 'sample-rooftops-dusk.webp', 'sample-winter-fields.webp', 'sample-old-town-snow.webp']) {
  copyFileSync(new URL(`../../public/${file}`, import.meta.url), new URL(file, out))
}
console.log(`Exported ${stockPaints.length} paints and ${horadamCatalogue.length} chart colours.`)
