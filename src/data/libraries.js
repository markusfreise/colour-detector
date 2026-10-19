// The paint libraries that come with the app: a series with its colour chart, so that entering a
// number fills in name and colour. Schmincke Horadam is the example every further series follows:
// a name as it is written on the tube, and a catalogue of { number, name, hex } (backlog TASK-37).
// From TASK-57 a colour may carry more, from the maker's own chart: `names` in other languages
// ({ fr, de, en, ... }), `pigments` (Colour Index names) and `transparency` (TRANSPARENCY). A colour
// whose value the chart does not give reliably has `hex: null` and says why in `unverified`: its
// number fills in the name, the colour is set by hand. Sources: docs/libraries.md.
// The charts themselves are not part of the app in the browser (TASK-55): src/data/charts.js has
// them, the account API hands them out (api/charts, stores/charts.js): the common colours to
// everybody, a maker's chart with a plan. Here are only the libraries and what to say of them.
import { HOUSE_VENDOR } from '../lib/paintbox.js'

// `source`: where the chart comes from, the maker's own publication; `gaps`: colours of the range
// that no public chart of the maker has (both listed in docs/libraries.md). `free`: for everybody;
// the others are the charts of known makers, with a plan (`brand_charts`).
export const MAKER_LIBRARIES = [
  { id: 'horadam', name: HOUSE_VENDOR, source: 'Official Schmincke Horadam colour chart' },
  {
    id: 'winsor-newton-professional',
    name: 'Winsor & Newton Professional',
    source: 'Official Winsor & Newton Professional Watercolour colour chart (colart.s3.amazonaws.com, 2026)',
  },
  // The name as the paints of the stock carry it, so that their numbers are found.
  { id: 'michael-harding', name: 'Michael Harding', source: 'michaelharding.co.uk/watercolours (2026-10-15)' },
  {
    id: 'sennelier',
    name: "Sennelier L'Aquarelle",
    source:
      "Sennelier colour chart ColorChart-ENG-WATERCOLOR.pdf (2012) and list of granulating colours (2022), both linked from sennelier-colors.com, L'Aquarelle page",
    gaps: 'Sennelier counts 110 colours (2022); the 12 added since the chart of 2012 are on no public chart of theirs.',
  },
]

// The name is a key of the text tables: shown in the language of the app, stored in English.
export const COMMON_LIBRARY = {
  id: 'common',
  name: 'Common colours',
  // The German name, as the app shows it: typed into the paint form, it finds the library too.
  aliases: ['Gängige Farben'],
  free: true,
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

/** The colour of a library's chart (`catalogue`, from the charts store) with that number, however it is spaced or capitalised; null if none. */
export function chartColour(library, number) {
  const wanted = String(number ?? '').trim().toLowerCase()
  if (!library || !wanted) return null
  return (library.catalogue ?? []).find((c) => c.number.toLowerCase() === wanted) ?? null
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
