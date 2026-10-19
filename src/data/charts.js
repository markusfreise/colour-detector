// The colour charts of the paint series that come with the app, as the server hands them out
// (server/mix/charts.json, see tools/export-charts.mjs). Not part of the app in the browser: it
// asks the account API for them (api/charts): the common colours for everybody, the makers'
// charts only with a plan (`brand_charts`).
import { horadamCatalogue } from './horadam-catalogue.js'
import { winsorNewtonCatalogue } from './winsor-newton-catalogue.js'
import { michaelHardingCatalogue } from './michael-harding-catalogue.js'
import { sennelierCatalogue } from './sennelier-catalogue.js'
import { commonColours } from './common-catalogue.js'
import { MAKER_LIBRARIES, COMMON_LIBRARY, chartColour } from './libraries.js'

const MAKER_CHARTS = {
  horadam: horadamCatalogue,
  'winsor-newton-professional': winsorNewtonCatalogue,
  'michael-harding': michaelHardingCatalogue,
  sennelier: sennelierCatalogue,
}

/** The common colours with the value of the maker's chart each one names in `from`. */
export function resolveCommon(colours, libraries) {
  return colours.map(({ number, name, de, pigments, from: [id, ref] }) => {
    const shown = chartColour(libraries.find((library) => library.id === id), ref)
    if (!shown?.hex) throw new Error(`Common colour ${number} ${name}: no colour ${ref} in ${id}`)
    return { number, name, names: { de }, hex: shown.hex, pigments }
  })
}

/** Every library with its chart (`catalogue`), the common colours first, as PAINT_LIBRARIES. */
export function librariesWithCharts() {
  const makers = MAKER_LIBRARIES.map((library) => ({ ...library, catalogue: MAKER_CHARTS[library.id] }))
  return [{ ...COMMON_LIBRARY, catalogue: resolveCommon(commonColours, makers) }, ...makers]
}

/** { charts: { <library id>: [{ number, name, hex, ... }] }, free: [<library id>] } */
export function chartsForServer() {
  const libraries = librariesWithCharts()
  return {
    charts: Object.fromEntries(libraries.map((library) => [library.id, library.catalogue])),
    free: libraries.filter((library) => library.free).map((library) => library.id),
  }
}
