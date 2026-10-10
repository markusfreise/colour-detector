// Colour-space helpers: sRGB <-> linear RGB <-> OKLab, plus perceptual distance.

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function srgbToLinear(v) {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, c * 255))
}

export function rgbToLinear([r, g, b]) {
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
}

export function linearToRgb([r, g, b]) {
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]
}

export function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function hexToOklab(hex) {
  return linearToOklab(rgbToLinear(hexToRgb(hex)))
}

export function oklabToHex(lab) {
  return rgbToHex(linearToRgb(oklabToLinear(lab)))
}

// Euclidean distance in OKLab, scaled ×100 so 1 unit ≈ a just-noticeable difference.
export function deltaE(labA, labB) {
  const dL = labA[0] - labB[0]
  const da = labA[1] - labB[1]
  const db = labA[2] - labB[2]
  return Math.sqrt(dL * dL + da * da + db * db) * 100
}

// Black or white text, whichever reads better on the given background.
export function contrastText(hex) {
  return hexToOklab(hex)[0] > 0.68 ? '#1d1b18' : '#ffffff'
}

// Base colours of the colour wheel, in wheel order; 'neutral' collects greys, blacks and other low-chroma paints.
export const COLOUR_FAMILIES = ['yellow', 'orange', 'red', 'violet', 'blue', 'green', 'neutral']

// Colour-wheel family of a colour, from its OKLCh hue angle.
export function colourFamily(hex) {
  const [, a, b] = hexToOklab(hex)
  if (Math.hypot(a, b) < 0.04) return 'neutral'
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  if (hue < 35) return 'red'
  if (hue < 80) return 'orange'
  if (hue < 110) return 'yellow'
  if (hue < 200) return 'green'
  if (hue < 285) return 'blue'
  if (hue < 345) return 'violet'
  return 'red'
}

// CSS custom properties for a chip filled with the given colour (see _chip.css).
export function chipStyle(hex) {
  return hex ? { '--chip-colour': hex, '--chip-ink': contrastText(hex) } : {}
}
