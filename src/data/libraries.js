// The paint libraries that come with the app: a series with its colour chart, so that entering a
// number fills in name and colour. Schmincke Horadam is the example every further series follows:
// a name as it is written on the tube, and a chart of { number, name, hex } (backlog TASK-37).
// The charts come with Pro, from the account API (stores/charts.js); src/data/charts.js has them.
import { HOUSE_VENDOR } from '../lib/paintbox.js'

export const PAINT_LIBRARIES = [
  { id: 'horadam', name: HOUSE_VENDOR },
  { id: 'winsor-newton-professional', name: 'Winsor & Newton Professional' },
  // The name as the paints of the stock carry it, so that their numbers are found.
  { id: 'michael-harding', name: 'Michael Harding' },
]

/** The library of that series, however it is capitalised or spaced; null for a series of one's own. */
export function libraryByName(name) {
  const wanted = String(name ?? '').trim().toLowerCase()
  return PAINT_LIBRARIES.find((library) => library.name.toLowerCase() === wanted) ?? null
}
