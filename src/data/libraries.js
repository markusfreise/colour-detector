// The paint libraries that come with the app: a series with its colour chart, so that entering a
// number fills in name and colour. Schmincke Horadam is the example every further series follows:
// a name as it is written on the tube, and a catalogue of { number, name, hex } (backlog TASK-37).
import { horadamCatalogue } from './horadam-catalogue.js'
import { winsorNewtonCatalogue } from './winsor-newton-catalogue.js'
import { michaelHardingCatalogue } from './michael-harding-catalogue.js'
import { HOUSE_VENDOR } from '../lib/paintbox.js'

export const PAINT_LIBRARIES = [
  { id: 'horadam', name: HOUSE_VENDOR, catalogue: horadamCatalogue },
  { id: 'winsor-newton-professional', name: 'Winsor & Newton Professional', catalogue: winsorNewtonCatalogue },
  // The name as the paints of the stock carry it, so that their numbers are found.
  { id: 'michael-harding', name: 'Michael Harding', catalogue: michaelHardingCatalogue },
]

/** The library of that series, however it is capitalised or spaced; null for a series of one's own. */
export function libraryByName(name) {
  const wanted = String(name ?? '').trim().toLowerCase()
  return PAINT_LIBRARIES.find((library) => library.name.toLowerCase() === wanted) ?? null
}
