// Close-ups: a part of the picture chosen with the pointer, analysed as a picture of its own.

// A drag shorter than this share of a side is a slip of the hand, not a choice.
export const MIN_SIDE = 0.04
// A small part is enlarged for the analysis, up to this factor: beyond it there is nothing more to find.
export const MAX_ENLARGE = 4

/**
 * The rectangle between two points of a drag, as shares of the picture (0..1).
 * @param {{x:number, y:number}} a  where the drag began
 * @param {{x:number, y:number}} b  where it ended
 * @param {number} smallest  the least share of a side that counts (0 while the frame is only drawn)
 * @returns {{x:number, y:number, w:number, h:number}|null} null when it is too small
 */
export function closeupRect(a, b, smallest = MIN_SIDE) {
  const clamp = (v) => Math.min(1, Math.max(0, v))
  const x0 = clamp(Math.min(a.x, b.x)), x1 = clamp(Math.max(a.x, b.x))
  const y0 = clamp(Math.min(a.y, b.y)), y1 = clamp(Math.max(a.y, b.y))
  if (x1 - x0 < smallest || y1 - y0 < smallest) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Where a close-up lies in the source picture, and the size it is analysed at.
 * @param {number} sourceWidth   pixels of the source picture
 * @param {number} sourceHeight
 * @param {{x:number, y:number, w:number, h:number}} rect  shares of the picture
 * @param {number} workPixels  pixels an analysis works on
 * @returns {{sx:number, sy:number, sw:number, sh:number, width:number, height:number}}
 */
export function closeupSize(sourceWidth, sourceHeight, rect, workPixels) {
  const sx = Math.round(rect.x * sourceWidth), sy = Math.round(rect.y * sourceHeight)
  const sw = Math.max(1, Math.min(sourceWidth - sx, Math.round(rect.w * sourceWidth)))
  const sh = Math.max(1, Math.min(sourceHeight - sy, Math.round(rect.h * sourceHeight)))
  const scale = Math.min(MAX_ENLARGE, Math.sqrt(workPixels / (sw * sh)))
  return { sx, sy, sw, sh, width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) }
}
