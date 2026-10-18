// docs/libraries.md as text, from the paint libraries (tools/libraries-report.mjs writes it).

/** @param {Array<{name: string, source: string, gaps?: string, catalogue: object[]}>} libraries */
export function librariesReport(libraries) {
  const lines = [
    '# Paint libraries',
    '',
    'The colour charts that come with the app (`src/data/libraries.js`): the common colours for everybody,',
    'the makers\' charts with Pro. Written by',
    '`npm run libraries` from the data: do not edit by hand. How each chart was read is in the',
    'header of its catalogue file and, for the newer ones, in `tools/charts/`.',
    '',
    '| Library | Colours | With a colour | Pigments | Transparency | Source |',
    '|---|---|---|---|---|---|',
  ]
  for (const library of libraries) {
    const c = library.catalogue
    const count = (test) => c.filter(test).length
    lines.push(
      `| ${library.name} | ${c.length} | ${count((x) => x.hex)} | ${count((x) => x.pigments?.length)} | ${count((x) => x.transparency)} | ${library.source} |`,
    )
  }
  const gaps = libraries.filter((library) => library.gaps)
  if (gaps.length) lines.push('', '## Not in the charts', '')
  for (const library of gaps) lines.push(`- ${library.name}: ${library.gaps}`)
  lines.push('', '## Unverified colours', '', 'Their number fills in the name; the colour is set by hand.', '')
  const unverified = libraries.flatMap((library) => library.catalogue.filter((c) => c.unverified).map((c) => ({ library, c })))
  if (!unverified.length) lines.push('None.')
  for (const { library, c } of unverified) lines.push(`- ${library.name} ${c.number} ${c.name}: ${c.unverified}`)
  return `${lines.join('\n')}\n`
}
