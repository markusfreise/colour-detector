// Geometric areas: every area of a label map becomes a polygon with a few straight edges.
// The polygons are laid over each other from the largest to the smallest, so they overlap the way
// flat shapes of paint do, and what no polygon covers goes to the nearest one.

import { connectedComponents, mergeSmallRegions } from './segment.js'

// A polygon much smaller than its area (a thin or winding shape) would lose the area: it stays as it is.
const MIN_COVER = 0.3
// The eight neighbours, clockwise on the screen, starting to the right.
const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]

/** How far an edge may leave the outline it replaces, in pixels: grows with the picture and with `simplify`. */
export function edgeTolerance(width, height, simplify = 0) {
  return Math.sqrt(width * height) * 0.008 * (1 + simplify / 4)
}

/** The smallest area that still gets a shape of its own in a geometric picture. */
export function geometricMinRegion(width, height, simplify = 0) {
  return Math.round(width * height * 0.0003 * (1 + simplify / 2))
}

// The outer outline of region `r` as pixel coordinates, walked clockwise from its first pixel.
function outline(regionMap, width, height, r, start) {
  const sx = start % width, sy = (start - sx) / width
  const xs = [sx], ys = [sy]
  const member = (x, y) => x >= 0 && y >= 0 && x < width && y < height && regionMap[y * width + x] === r
  let x = sx, y = sy, dir = 0, first = -1
  // Every pixel is passed a few times at most.
  for (let guard = regionMap.length * 4 + 8; guard > 0; guard--) {
    let found = -1
    for (let i = 0; i < 8; i++) {
      const d = (dir + 5 + i) % 8
      if (member(x + DX[d], y + DY[d])) { found = d; break }
    }
    if (found < 0) break // a single pixel
    // Back at the start and about to leave it the way it was left the first time: once around.
    if (x === sx && y === sy) {
      if (first < 0) first = found
      else if (found === first) break
    }
    x += DX[found]; y += DY[found]; dir = found
    xs.push(x); ys.push(y)
  }
  if (xs.length > 1) { xs.pop(); ys.pop() } // the start, reached again
  return { xs, ys }
}

// Douglas-Peucker on the part of the outline from index a to b: marks the points to keep.
function reduce(xs, ys, a, b, tolerance, keep) {
  const stack = [a, b]
  const n = xs.length
  while (stack.length) {
    const to = stack.pop(), from = stack.pop()
    const ax = xs[from % n], ay = ys[from % n], bx = xs[to % n], by = ys[to % n]
    const dx = bx - ax, dy = by - ay
    const length = Math.sqrt(dx * dx + dy * dy)
    let far = -1, most = tolerance
    for (let i = from + 1; i < to; i++) {
      const px = xs[i % n] - ax, py = ys[i % n] - ay
      const d = length ? Math.abs(px * dy - py * dx) / length : Math.sqrt(px * px + py * py)
      if (d > most) { most = d; far = i }
    }
    if (far < 0) continue
    keep[far % n] = 1
    stack.push(from, far, far, to)
  }
}

/**
 * Straightens the areas of a label map.
 * @param {Int32Array} labels  label per pixel
 * @param {number} tolerance  how far an edge may leave the outline, in pixels
 * @returns {Int32Array} a new label map
 */
export function straighten(labels, width, height, tolerance) {
  const { regionMap, regionCluster, regionSize } = connectedComponents(labels, width, height)
  const count = regionCluster.length
  const starts = new Int32Array(count).fill(-1)
  const minX = new Int32Array(count).fill(width), maxX = new Int32Array(count).fill(-1)
  const minY = new Int32Array(count).fill(height), maxY = new Int32Array(count).fill(-1)
  for (let p = 0; p < regionMap.length; p++) {
    const r = regionMap[p]
    const x = p % width, y = (p - x) / width
    if (starts[r] < 0) starts[r] = p
    if (x < minX[r]) minX[r] = x
    if (x > maxX[r]) maxX[r] = x
    if (y < minY[r]) minY[r] = y
    if (y > maxY[r]) maxY[r] = y
  }

  // A polygon per area, or none where the area keeps its own pixels.
  const polygons = new Array(count).fill(null)
  const order = new Float64Array(count)
  for (let r = 0; r < count; r++) {
    order[r] = regionSize[r]
    const { xs, ys } = outline(regionMap, width, height, r, starts[r])
    const n = xs.length
    if (n < 3) continue
    // The outline is closed: it is cut at its start and at the point farthest from it.
    let far = 0, most = -1
    for (let i = 1; i < n; i++) {
      const d = (xs[i] - xs[0]) ** 2 + (ys[i] - ys[0]) ** 2
      if (d > most) { most = d; far = i }
    }
    const keep = new Uint8Array(n)
    keep[0] = keep[far] = 1
    reduce(xs, ys, 0, far, tolerance, keep)
    reduce(xs, ys, far, n, tolerance, keep)
    const px = [], py = []
    for (let i = 0; i < n; i++) if (keep[i]) { px.push(xs[i]); py.push(ys[i]) }
    if (px.length < 3) continue
    let area = 0
    for (let i = 0, j = px.length - 1; i < px.length; j = i++) area += px[j] * py[i] - px[i] * py[j]
    area = Math.abs(area) / 2
    if (area < regionSize[r] * MIN_COVER) continue
    polygons[r] = { px, py }
    // An area that encloses others has the larger polygon and is laid down before them.
    order[r] = Math.max(area, regionSize[r])
  }

  const sequence = Array.from({ length: count }, (_, r) => r).sort((a, b) => order[b] - order[a] || a - b)
  const out = new Int32Array(labels.length).fill(-1)
  const crossings = []
  for (const r of sequence) {
    const label = regionCluster[r]
    const polygon = polygons[r]
    if (!polygon) {
      for (let y = minY[r]; y <= maxY[r]; y++) {
        for (let x = minX[r]; x <= maxX[r]; x++) if (regionMap[y * width + x] === r) out[y * width + x] = label
      }
      continue
    }
    const { px, py } = polygon
    const n = px.length
    let top = height, bottom = -1
    for (let i = 0; i < n; i++) { if (py[i] < top) top = py[i]; if (py[i] > bottom) bottom = py[i] }
    for (let y = top; y <= bottom; y++) {
      crossings.length = 0
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const y0 = py[j], y1 = py[i]
        if (y0 === y1) continue
        // Half-open, so that a corner counts once.
        if (y >= Math.min(y0, y1) && y < Math.max(y0, y1)) crossings.push(px[j] + ((y - y0) * (px[i] - px[j])) / (y1 - y0))
      }
      crossings.sort((a, b) => a - b)
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, Math.ceil(crossings[i] - 0.5)), to = Math.min(width - 1, Math.floor(crossings[i + 1] + 0.5))
        for (let x = from; x <= to; x++) out[y * width + x] = label
      }
    }
  }

  // What no polygon covers goes to the nearest area, spreading from all of them at once.
  const queue = new Int32Array(out.length)
  let head = 0, tail = 0
  for (let p = 0; p < out.length; p++) if (out[p] >= 0) queue[tail++] = p
  if (!tail) return Int32Array.from(labels)
  while (head < tail) {
    const p = queue[head++]
    const x = p % width, y = (p - x) / width
    if (x > 0 && out[p - 1] < 0) { out[p - 1] = out[p]; queue[tail++] = p - 1 }
    if (x < width - 1 && out[p + 1] < 0) { out[p + 1] = out[p]; queue[tail++] = p + 1 }
    if (y > 0 && out[p - width] < 0) { out[p - width] = out[p]; queue[tail++] = p - width }
    if (y < height - 1 && out[p + width] < 0) { out[p + width] = out[p]; queue[tail++] = p + width }
  }
  return out
}

/**
 * A label map with geometric areas: small areas go first, the rest is straightened, and the
 * slivers that leaves are merged away.
 */
export function geometricAreas(labels, width, height, simplify = 0) {
  const minRegion = geometricMinRegion(width, height, simplify)
  const merged = mergeSmallRegions(labels, width, height, minRegion)
  const straight = straighten(merged, width, height, edgeTolerance(width, height, simplify))
  return mergeSmallRegions(straight, width, height, Math.max(2, Math.round(minRegion / 4)))
}
