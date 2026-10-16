// Writes the colour charts of the paint series that come with the app to server/mix/charts.json,
// where the account API hands them to Pro (api/charts). The charts in src/data/ stay the source:
// run `npm run charts` after changing one (a test checks that both agree).
import { writeFileSync } from 'node:fs'
import { chartsForServer } from '../src/data/charts.js'

writeFileSync(new URL('../server/mix/charts.json', import.meta.url), `${JSON.stringify(chartsForServer())}\n`)
console.log('Wrote server/mix/charts.json')
