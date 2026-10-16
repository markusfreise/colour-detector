// How recipes are named on screen. The recipes themselves come from the mixing service.

// Letter for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
export const WASH_LETTERS = [
  { letter: 'W', label: 'very watery' },
  { letter: 'L', label: 'light' },
  { letter: 'M', label: 'medium' },
  { letter: 'R', label: 'rich' },
  { letter: 'C', label: 'concentrated' },
]

/** Match quality label for a ΔE (OKLab ×100) value. */
export function matchQuality(dE) {
  if (dE < 2) return 'excellent'
  if (dE < 5) return 'good'
  if (dE < 10) return 'fair'
  return 'rough'
}
