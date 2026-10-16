// The colour charts of the paint series that come with the app, as the server hands them out
// (server/mix/charts.json, see tools/export-charts.mjs). Not part of the app in the browser: it
// asks the account API for them (api/charts), and only with Pro.
import { horadamCatalogue } from './horadam-catalogue.js'
import { winsorNewtonCatalogue } from './winsor-newton-catalogue.js'
import { michaelHardingCatalogue } from './michael-harding-catalogue.js'

/** { charts: { <library id>: [{ number, name, hex }] } } */
export function chartsForServer() {
  return {
    charts: {
      horadam: horadamCatalogue,
      'winsor-newton-professional': winsorNewtonCatalogue,
      'michael-harding': michaelHardingCatalogue,
    },
  }
}
