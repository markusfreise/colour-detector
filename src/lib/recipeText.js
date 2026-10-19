// How recipes are named on screen. The recipes themselves come from the mixing service.

// Letter for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
export const WASH_LETTERS = [
  { letter: 'W', label: 'very watery' },
  { letter: 'L', label: 'light' },
  { letter: 'M', label: 'medium' },
  { letter: 'R', label: 'rich' },
  { letter: 'C', label: 'concentrated' },
]

// Where the water levels of a wash begin, as fullness: paper, W, L, M, R, C, and the swatch itself.
export const WASH_LIMITS = [0.02, 0.1, 0.25, 0.5, 0.8, 1]

// A value study needs more steps of water than five: with `fine` every level is split in this many.
const WASH_FINE = 5

/**
 * @param {number} strength  the fullness of a recipe (its paint with least water, at most 1)
 * @param {boolean} [fine]  the level and its step within it, W1 to C5 (value mode)
 */
export function washLetter(strength, fine = false) {
  if (strength <= WASH_LIMITS[0]) return ''
  let level = 0
  while (level < WASH_LETTERS.length - 1 && strength >= WASH_LIMITS[level + 1]) level++
  const { letter } = WASH_LETTERS[level]
  // Only on request: the function is also handed to `map`, whose index is no request.
  if (fine !== true) return letter
  // Steps of water are even on a log scale.
  const lo = Math.log(WASH_LIMITS[level]), hi = Math.log(WASH_LIMITS[level + 1])
  const step = Math.min(WASH_FINE - 1, Math.max(0, Math.floor(((Math.log(strength) - lo) / (hi - lo)) * WASH_FINE)))
  return `${letter}${step + 1}`
}

/** Match quality label for a ΔE (OKLab ×100) value. */
export function matchQuality(dE) {
  if (dE < 2) return 'excellent'
  if (dE < 5) return 'good'
  if (dE < 10) return 'fair'
  return 'rough'
}
