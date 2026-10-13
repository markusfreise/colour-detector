// Paint box presentation: number formatting and grouping by form and colour family.
import { COLOUR_FAMILIES, colourFamily } from './color.js'

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

/** Short form label: "P" for pan, "T" for tube, "S" for the travel box, "P/T" when owned as both. */
export function paintForms(paint) {
  return PAINT_FORMS.filter((form) => paint.forms.some((f) => f.includes(form.key)))
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
