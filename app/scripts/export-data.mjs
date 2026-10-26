// Writes the paint stock, the paint libraries and the sample photos into the app's resources.
// The web app's data files stay the single source: run this after changing them (npm run app:data).
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { stockPaints } from '../../src/data/paints.js'
import { PAINT_LIBRARIES } from '../../src/data/libraries.js'

const out = new URL('../Resources/Data/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('paints.json', out), JSON.stringify(stockPaints))
writeFileSync(new URL('libraries.json', out), JSON.stringify(PAINT_LIBRARIES))
// The Horadam chart on its own was replaced by libraries.json.
rmSync(new URL('horadam.json', out), { force: true })
// The app has samples of its own besides, kept in Resources/Data only: sample-albert-memorial-london,
// sample-menai-bridge-wales and sample-piccadilly-circus-tube (Session.samples).
// sample-llyn-idwal.webp is not copied: the app keeps it at 2000 px, the pixels the reference
// values in Tests/LayerTests.swift were made from; the web app's copy is scaled down to 1024 px.
const samples = ['sample-bielefeld.webp', 'sample-rooftops-dusk.webp', 'sample-winter-fields.webp', 'sample-old-town-snow.webp', 'sample-red-train.webp', 'sample-woman-white-wall.webp']
for (const file of samples) {
  copyFileSync(new URL(`../../public/${file}`, import.meta.url), new URL(file, out))
}
const colours = PAINT_LIBRARIES.reduce((sum, library) => sum + library.catalogue.length, 0)
console.log(`Exported ${stockPaints.length} paints, ${PAINT_LIBRARIES.length} libraries with ${colours} colours and ${samples.length} samples.`)
