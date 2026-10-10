// Paint box presentation: number formatting and grouping by form and colour family.
import { COLOUR_FAMILIES, colourFamily } from './color.js'

export const PAINT_FORMS = [
  { key: 'pan', name: 'Pans' },
  { key: 'tube', name: 'Tubes' },
]

/** Vendor number with at least three digits, e.g. "45" -> "045"; prefixed numbers ("W311") stay as they are. */
export function paintNumber(number) {
  const n = String(number)
  return /^\d+$/.test(n) ? n.padStart(3, '0') : n
}

function byNumber(a, b) {
  const na = parseInt(String(a.number).replace(/\D/g, ''), 10)
  const nb = parseInt(String(b.number).replace(/\D/g, ''), 10)
  return (na || 0) - (nb || 0) || String(a.number).localeCompare(String(b.number))
}

/** Paints in colour-wheel order, by number inside each family. */
export function sortPaints(paints) {
  const rank = (p) => COLOUR_FAMILIES.indexOf(colourFamily(p.hex))
  return [...paints].sort((a, b) => rank(a) - rank(b) || byNumber(a, b))
}

/**
 * Group paints by form (pans, then tubes); inside a group by colour-wheel family, then number.
 * A paint owned as both pan and tube appears in both groups.
 */
export function groupPaints(paints) {
  return PAINT_FORMS.map((form) => ({
    ...form,
    paints: sortPaints(paints.filter((p) => p.forms.some((f) => f.includes(form.key)))),
  })).filter((g) => g.paints.length)
}
