// Every printed page carries the picture's name and when it was printed, so that sheets printed
// apart can be put together again. It goes into the bottom margin of each page (an @page rule
// written when printing starts, see components/printStamp.js), with the page number beside it.

/** "Underground · 24 Oct 2026, 14:03": the name of the picture and the time, in the app's language. */
export function printStamp(name, when, region) {
  const time = when.toLocaleString(region, { dateStyle: 'medium', timeStyle: 'short' })
  return [name, time].filter(Boolean).join(' · ')
}

/** The @page rule: the stamp at the bottom left of every page, "page / pages" at the bottom right. */
export function printStampRule(stamp) {
  // A CSS string takes the same escapes for quotes and backslashes as JSON.
  const text = JSON.stringify(stamp)
  const look = 'font: 8pt system-ui, sans-serif; color: #6b6660;'
  return `@page { @bottom-left { content: ${text}; ${look} } @bottom-right { content: counter(page) " / " counter(pages); ${look} } }`
}
