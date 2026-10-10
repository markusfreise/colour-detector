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

/**
 * Group paints by form (pans, then tubes), then by colour-wheel family, sorted by number.
 * A paint owned as both pan and tube appears in both form groups.
 */
export function groupPaints(paints) {
  return PAINT_FORMS.map((form) => {
    const inForm = paints.filter((p) => p.forms.some((f) => f.includes(form.key)))
    const families = COLOUR_FAMILIES.map((family) => ({
      key: family,
      name: family[0].toUpperCase() + family.slice(1),
      paints: inForm.filter((p) => colourFamily(p.hex) === family).sort(byNumber),
    })).filter((f) => f.paints.length)
    return { ...form, paints: inForm, families }
  }).filter((g) => g.paints.length)
}
