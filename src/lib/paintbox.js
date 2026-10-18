// Paint box presentation: number formatting and grouping by form and colour family.
import { COLOUR_FAMILIES, colourFamily, hueGroup } from './color.js'

// The series the stock is built on, as it is written on the tube: its paints are grouped by form,
// every other series gets a group of its own.
export const HOUSE_VENDOR = 'Schmincke Horadam'

// `byPlace`: the group keeps the order of the box (row and column, "A1" to "C6") instead of the colour wheel.
export const PAINT_FORMS = [
  { key: 'pan', name: `${HOUSE_VENDOR} Pans`, label: 'P' },
  { key: 'tube', name: `${HOUSE_VENDOR} Tubes`, label: 'T' },
  { key: 'travelbox', name: 'Travelbox', label: 'S', byPlace: true },
]

/** Vendor number with at least three digits, e.g. "45" -> "045"; prefixed numbers ("W311") stay as they are. */
export function paintNumber(number) {
  const n = String(number)
  return /^\d+$/.test(n) ? n.padStart(3, '0') : n
}

// The forms a paint of one's own can come in, as the paint form offers them.
export const OWN_FORMS = [
  { key: 'pan', name: 'Pan', label: 'P' },
  { key: 'tube', name: 'Tube', label: 'T' },
  { key: 'liquid', name: 'Liquid', label: 'L' },
  { key: 'other', name: 'Other', label: 'O' },
]

/** The form a box file or a form names, as one of OWN_FORMS; anything else is a pan. */
export function ownForm(form) {
  return OWN_FORMS.some((f) => f.key === form) ? form : 'pan'
}

/** The name of the form a paint of one's own comes in, in English ("Liquid"). */
export function formName(paint) {
  return OWN_FORMS.find((f) => f.key === ownForm(paint.forms?.[0])).name
}

/** Short form label: "P" for pan, "T" for tube, "S" for the travel box, "P/T" when owned as both. */
export function paintForms(paint) {
  const forms = [...PAINT_FORMS, ...OWN_FORMS.filter((f) => !PAINT_FORMS.some((p) => p.key === f.key))]
  return forms
    .filter((form) => paint.forms.some((f) => f.includes(form.key)))
    .map((form) => form.label)
    .join('/')
}

function byNumber(a, b) {
  const na = parseInt(String(a.number).replace(/\D/g, ''), 10)
  const nb = parseInt(String(b.number).replace(/\D/g, ''), 10)
  return (na || 0) - (nb || 0) || String(a.number).localeCompare(String(b.number))
}

/** The series on offer, for the autocomplete of the paint form: the ones in use and the libraries. */
export function seriesNames(paints, libraries = []) {
  const names = new Set([HOUSE_VENDOR, ...libraries.map((library) => library.name), ...paints.map((p) => p.vendor).filter(Boolean)])
  return [...names].sort((a, b) => a.localeCompare(b))
}

/** Paints in colour-wheel order, by number inside each family. */
export function sortPaints(paints) {
  const rank = (p) => COLOUR_FAMILIES.indexOf(colourFamily(p.hex))
  return [...paints].sort((a, b) => rank(a) - rank(b) || byNumber(a, b))
}

// Groups Auto leaves alone until they are ticked: the travel box is a set of its own.
export const AUTO_OFF_DEFAULT = ['travelbox']

const comes = (paint, form) => paint.forms.some((f) => f.includes(form.key))
const vendorKey = (paint) => `vendor:${paint.vendor || 'Other'}`

/** Keys of the groups a paint is listed in: its forms for Schmincke, the travel box, or its brand. */
export function paintGroupKeys(paint) {
  const placed = PAINT_FORMS.filter((form) => form.byPlace && comes(paint, form))
  if (placed.length) return placed.map((form) => form.key)
  if (paint.vendor !== HOUSE_VENDOR) return [vendorKey(paint)]
  return PAINT_FORMS.filter((form) => !form.byPlace && comes(paint, form)).map((form) => form.key)
}

/**
 * Group paints: Schmincke pans, Schmincke tubes, the travel box, then one group per other brand.
 * Inside a group by colour-wheel family, then number; the travel box keeps the places in the box.
 * A paint owned as both pan and tube appears in both groups.
 * `shown` leaves paints out of the lists without dropping their group (the paint box hides selected paints).
 */
export function groupPaints(paints, shown = null) {
  const keyed = paints.map((paint) => ({ paint, keys: paintGroupKeys(paint) }))
  const byPlace = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
  const vendors = [...new Set(keyed.flatMap((k) => k.keys).filter((key) => key.startsWith('vendor:')))].sort((a, b) => a.localeCompare(b))
  const groups = [...PAINT_FORMS, ...vendors.map((key) => ({ key, name: key.slice('vendor:'.length) }))]
  return groups
    .map((group) => {
      const own = keyed.filter((k) => k.keys.includes(group.key)).map((k) => k.paint)
      const listed = shown ? own.filter(shown) : own
      return { ...group, size: own.length, paints: group.byPlace ? listed.sort(byPlace) : sortPaints(listed) }
    })
    .filter((group) => group.size)
}

/** The paints of a paint box in their order: the travel box by its places, every other by colour. */
export function sortBoxPaints(box, paints) {
  if (box.id !== 'travelbox') return sortPaints(paints)
  return [...paints].sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }))
}

const colourKey = (vendor, number) => `${String(vendor ?? '').trim().toLowerCase()}|${String(number).trim().toLowerCase()}`

/**
 * The colours of a series as the dialog that adds colours to a box lists them, by number: each
 * colour of the chart (`catalogue`, empty without the charts), as the paint already known with that
 * number where there is one, and the known paints of the series that are not on it.
 * `name(paint)` gives a paint's name in the language shown; `locale` picks the chart's names.
 * Returns [{ key, vendor, number, name, hex, paintId, search }]: `paintId` null for a colour that is
 * on the chart only, `hex` null for one whose value the chart does not give reliably.
 */
export function seriesColours(vendor, catalogue, paints, name = (p) => p.name, locale = 'en') {
  const known = new Map(paints.map((p) => [colourKey(p.vendor, p.number), p]).filter(([key]) => key.startsWith(colourKey(vendor, ''))))
  const listed = new Set()
  const colours = []
  for (const colour of catalogue) {
    const key = colourKey(vendor, colour.number)
    const paint = known.get(key)
    listed.add(key)
    const shown = paint ? name(paint) : (colour.names?.[locale] ?? colour.name)
    const words = [vendor, colour.number, shown, colour.name, ...Object.values(colour.names ?? {}), ...(colour.pigments ?? []), paint?.nameDe ?? '']
    colours.push({ key, vendor, number: colour.number, name: shown, chartName: colour.name, nameDe: colour.names?.de ?? '', hex: paint?.hex ?? colour.hex, paintId: paint?.id ?? null, search: words.join(' ').toLowerCase() })
  }
  for (const [key, paint] of known) {
    if (listed.has(key)) continue
    const words = [vendor, paint.number, name(paint), paint.name, paint.nameDe ?? '']
    colours.push({ key, vendor, number: paint.number, name: name(paint), chartName: paint.name, hex: paint.hex, paintId: paint.id, search: words.join(' ').toLowerCase() })
  }
  return colours.sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }))
}

/** The colours with every word of `query` in their series, number or names, and of the hue group `hue` (or any). */
export function filterColours(colours, query = '', hue = null) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean)
  return colours.filter((c) => (!hue || (c.hex && hueGroup(c.hex) === hue)) && words.every((w) => c.search.includes(w)))
}
