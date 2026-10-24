// The paint libraries that come with the app: a series with its colour chart, so that entering a
// number fills in name and colour. Schmincke Horadam is the example every further series follows:
// a name as it is written on the tube, and a catalogue of { number, name, hex } (backlog TASK-37).
// From TASK-57 a colour may carry more, from the maker's own chart: `names` in other languages
// ({ fr, de, en, ... }), `pigments` (Colour Index names) and `transparency` (TRANSPARENCY). A colour
// whose value the chart does not give reliably has `hex: null` and says why in `unverified`: its
// number fills in the name, the colour is set by hand. Sources: docs/libraries.md.
import { horadamCatalogue } from './horadam-catalogue.js'
import { horadamSupergranulationCatalogue } from './horadam-supergranulation-catalogue.js'
import { winsorNewtonCatalogue } from './winsor-newton-catalogue.js'
import { michaelHardingCatalogue } from './michael-harding-catalogue.js'
import { sennelierCatalogue } from './sennelier-catalogue.js'
import { commonColours } from './common-catalogue.js'
import { HOUSE_VENDOR } from '../lib/paintbox.js'

// `source`: where the chart comes from, the maker's own publication; `gaps`: colours of the range
// that no public chart of the maker has (both listed in docs/libraries.md). `free`: for everybody;
// the others are the charts of known makers, with a plan (`brand_charts`).
const MAKER_LIBRARIES = [
  {
    id: 'horadam',
    name: HOUSE_VENDOR,
    catalogue: horadamCatalogue,
    source:
      'Official Schmincke Horadam colour chart; names, pigments and opacity from the colour cards of schmincke.de, Horadam Aquarell page (2026-10-23)',
  },
  // A series of its own on the tubes: mixtures of pigments that part on the paper.
  {
    id: 'horadam-supergranulation',
    name: 'Schmincke Horadam Supergranulation',
    catalogue: horadamSupergranulationCatalogue,
    source: 'Colour cards of schmincke.de, Horadam Aquarell page (2026-10-23): names, pigments, opacity and the swatch each colour is measured on',
  },
  {
    id: 'winsor-newton-professional',
    name: 'Winsor & Newton Professional',
    catalogue: winsorNewtonCatalogue,
    source: 'Official Winsor & Newton Professional Watercolour colour chart (colart.s3.amazonaws.com, 2026)',
  },
  // The name as the paints of the stock carry it, so that their numbers are found.
  { id: 'michael-harding', name: 'Michael Harding', catalogue: michaelHardingCatalogue, source: 'michaelharding.co.uk/watercolours (2026-10-15)' },
  {
    id: 'sennelier',
    name: "Sennelier L'Aquarelle",
    catalogue: sennelierCatalogue,
    source:
      "Sennelier colour chart ColorChart-ENG-WATERCOLOR.pdf (2012) and list of granulating colours (2022), both linked from sennelier-colors.com, L'Aquarelle page",
    gaps: 'Sennelier counts 110 colours (2022); the 12 added since the chart of 2012 are on no public chart of theirs.',
  },
]

/** The common colours with the value of the maker's chart each one names in `from`. */
export function resolveCommon(colours, libraries) {
  return colours.map(({ number, name, de, pigments, from: [id, ref] }) => {
    const shown = chartColour(libraries.find((library) => library.id === id), ref)
    if (!shown?.hex) throw new Error(`Common colour ${number} ${name}: no colour ${ref} in ${id}`)
    return { number, name, names: { de }, hex: shown.hex, pigments }
  })
}

// The name is a key of the text tables: shown in the language of the app, stored in English.
export const COMMON_LIBRARY = {
  id: 'common',
  name: 'Common colours',
  // The German name, as the app shows it: typed into the paint form, it finds the library too.
  aliases: ['Gängige Farben'],
  free: true,
  catalogue: resolveCommon(commonColours, MAKER_LIBRARIES),
  source: 'The colours most makers have, by their usual name and pigment; each shown as one of the maker charts below shows it (src/data/common-catalogue.js)',
}

export const PAINT_LIBRARIES = [COMMON_LIBRARY, ...MAKER_LIBRARIES]

/** Whether the colours of that library may be used: the common colours always, a maker's chart with a plan. */
export function libraryOpen(library, charts) {
  return Boolean(library && (library.free || charts))
}

// How much of the paper a paint covers, as the makers' charts mark it.
export const TRANSPARENCY = { T: 'Transparent', ST: 'Semi-transparent', SO: 'Semi-opaque', O: 'Opaque' }

/** The library of that series, however it is capitalised or spaced; null for a series of one's own. */
export function libraryByName(name) {
  const wanted = String(name ?? '').trim().toLowerCase()
  return PAINT_LIBRARIES.find((library) => [library.name, ...(library.aliases ?? [])].some((n) => n.toLowerCase() === wanted)) ?? null
}

/** The colour of a library's chart with that number, however it is spaced or capitalised; null if none. */
export function chartColour(library, number) {
  const wanted = String(number ?? '').trim().toLowerCase()
  if (!library || !wanted) return null
  return library.catalogue.find((c) => c.number.toLowerCase() === wanted) ?? null
}

/** All the names a chart colour goes by, for the search. */
export function chartNames(colour) {
  return [colour.name, ...Object.values(colour.names ?? {})]
}

/** What a maker's chart says of a colour besides its name: pigments and transparency, in words of `t`. */
export function chartDetails(colour, t = (text) => text) {
  const details = []
  if (colour.pigments?.length) details.push(colour.pigments.join(' '))
  if (TRANSPARENCY[colour.transparency]) details.push(t(TRANSPARENCY[colour.transparency]))
  return details
}
