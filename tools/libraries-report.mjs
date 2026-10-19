// Writes docs/libraries.md: the paint libraries that come with the app, where each chart comes
// from, and the colours whose value the chart does not give reliably. Run `npm run libraries`
// after changing a library (a test checks that the file agrees).
import { writeFileSync } from 'node:fs'
import { librariesWithCharts } from '../src/data/charts.js'
import { librariesReport } from '../src/lib/librariesReport.js'

writeFileSync(new URL('../docs/libraries.md', import.meta.url), librariesReport(librariesWithCharts()))
console.log('Wrote docs/libraries.md')
