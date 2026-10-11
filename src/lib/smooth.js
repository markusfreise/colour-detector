// Calm colour areas: the steps of `segmentImage` that keep noise out of the areas and round their outlines.
//
// 1. The picture is cut into small compact patches that follow its edges (`compactPatches`).
// 2. Every patch gets one robust colour, evened out with the patches around it that are nearly the
//    same colour (`patchColours`). Pixels then take the colour of their patch, so noise, grain and
//    JPEG blocks are gone before the colours are clustered, while an edge stays where it is.
//    Within one colour the patches run into each other, so a slow change (fog, sky, skin) gives
//    curved outlines and not the outlines of patches.
// 3. After clustering, the outlines are rounded (`smoothOutlines`): a pixel takes the colour most
//    pixels around it have, unless its own colour (slightly out of focus, `softColours`) clearly
//    says otherwise.
// 4. Areas too small for a brush join a neighbour (`mergeSmallAreas`), unless they stand out.
//
// Pure functions on typed arrays, like the rest of the pipeline.

import { connectedComponents } from './segment.js'

// How much the distance to the centre of a patch counts against a difference in colour (OKLab):
// higher gives rounder patches, lower lets them follow faint edges (and noise).
const COMPACTNESS = 0.08
const PATCH_ROUNDS = 4
// A pixel this far (OKLab) from the colour of its patch is not noise but something small of its
// own (a highlight in an eye, a wire against the sky): it keeps its colour.
const OWN_COLOUR = 0.09
// Part of the window around a pixel that a colour must hold before the pixel can take it.
const MIN_SHARE = 0.2

/**
 * Cut the picture into compact patches of about step x step pixels that follow its edges
 * (SLIC: k-means on colour and position together, every centre only looking around itself).
 * @returns {{patchOf: Int32Array, cols: number, rows: number}}  patch per pixel; patch = row * cols + col
 */
export function compactPatches(lab, width, height, step) {
  const cols = Math.max(1, Math.round(width / step)), rows = Math.max(1, Math.round(height / step))
  const sx = width / cols, sy = height / rows
  const n = cols * rows
  const reach = Math.ceil(Math.max(sx, sy))
  const spatial = (COMPACTNESS * COMPACTNESS) / (reach * reach)
  const patchOf = new Int32Array(width * height)
  // centre: L, a, b, x, y
  const centre = new Float64Array(n * 5)
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor(y / sy))
    for (let x = 0; x < width; x++) patchOf[y * width + x] = row * cols + Math.min(cols - 1, Math.floor(x / sx))
  }
  const sums = new Float64Array(n * 5)
  const sizes = new Int32Array(n)
  const best = new Float32Array(width * height)
  for (let round = 0; round <= PATCH_ROUNDS; round++) {
    // Centres = mean colour and position of the pixels of each patch.
    sums.fill(0); sizes.fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x, c = patchOf[p] * 5
        sums[c] += lab[p * 3]; sums[c + 1] += lab[p * 3 + 1]; sums[c + 2] += lab[p * 3 + 2]
        sums[c + 3] += x; sums[c + 4] += y
        sizes[patchOf[p]]++
      }
    }
    for (let c = 0; c < n; c++) {
      if (!sizes[c]) continue
      for (let j = 0; j < 5; j++) centre[c * 5 + j] = sums[c * 5 + j] / sizes[c]
    }
    if (round === PATCH_ROUNDS) break
    // Every pixel goes to the closest centre among those around it; one no centre reaches stays.
    best.fill(Infinity)
    for (let c = 0; c < n; c++) {
      if (!sizes[c]) continue
      const cL = centre[c * 5], ca = centre[c * 5 + 1], cb = centre[c * 5 + 2], cx = centre[c * 5 + 3], cy = centre[c * 5 + 4]
      const x0 = Math.max(0, Math.round(cx) - reach), x1 = Math.min(width - 1, Math.round(cx) + reach)
      const y0 = Math.max(0, Math.round(cy) - reach), y1 = Math.min(height - 1, Math.round(cy) + reach)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = y * width + x
          const dL = lab[p * 3] - cL, da = lab[p * 3 + 1] - ca, db = lab[p * 3 + 2] - cb
          const d = dL * dL + da * da + db * db + ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * spatial
          if (d < best[p]) { best[p] = d; patchOf[p] = c }
        }
      }
    }
  }
  return { patchOf, cols, rows }
}

/**
 * The picture with every pixel in the colour of its patch.
 * The colour of a patch is the mean of its pixels without the ones that stray (so a patch that
 * holds a bit of something else is not tinted by it), then evened out `rounds` times with the
 * patches around it, each counting the less the further its colour is away (`blend` = the
 * difference in OKLab at which a neighbour hardly counts any more): noise that is larger than a
 * patch goes, an edge between two different colours stays.
 * @returns {Float32Array} OKLab per pixel
 */
export function patchColours(lab, width, height, { patchOf, cols, rows }, { blend = 0.03, rounds = 4 } = {}) {
  const count = width * height
  const n = cols * rows
  const mean = new Float64Array(n * 3)
  const sizes = new Float64Array(n)
  for (let p = 0; p < count; p++) {
    const c = patchOf[p]
    mean[c * 3] += lab[p * 3]; mean[c * 3 + 1] += lab[p * 3 + 1]; mean[c * 3 + 2] += lab[p * 3 + 2]
    sizes[c]++
  }
  for (let c = 0; c < n; c++) if (sizes[c]) { mean[c * 3] /= sizes[c]; mean[c * 3 + 1] /= sizes[c]; mean[c * 3 + 2] /= sizes[c] }
  // How far the pixels of a patch are from its mean, on average.
  const spread = new Float64Array(n)
  const away = new Float32Array(count)
  for (let p = 0; p < count; p++) {
    const c = patchOf[p]
    const dL = lab[p * 3] - mean[c * 3], da = lab[p * 3 + 1] - mean[c * 3 + 1], db = lab[p * 3 + 2] - mean[c * 3 + 2]
    away[p] = Math.sqrt(dL * dL + da * da + db * db)
    spread[c] += away[p]
  }
  // Robust colour: the mean of the pixels that are not far out.
  let colour = new Float64Array(n * 3)
  const kept = new Float64Array(n)
  for (let p = 0; p < count; p++) {
    const c = patchOf[p]
    if (away[p] > 1.5 * (spread[c] / sizes[c]) + 0.005) continue
    colour[c * 3] += lab[p * 3]; colour[c * 3 + 1] += lab[p * 3 + 1]; colour[c * 3 + 2] += lab[p * 3 + 2]
    kept[c]++
  }
  for (let c = 0; c < n; c++) {
    for (let j = 0; j < 3; j++) colour[c * 3 + j] = kept[c] ? colour[c * 3 + j] / kept[c] : mean[c * 3 + j]
  }
  const robust = colour
  // Even out with the eight patches around, by size and by closeness in colour.
  const falloff = 1 / (blend * blend)
  for (let round = 0; round < rounds; round++) {
    const next = new Float64Array(n * 3)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const c = row * cols + col
        if (!sizes[c]) continue
        let L = 0, a = 0, b = 0, total = 0
        for (let dy = -1; dy <= 1; dy++) {
          const rr = row + dy
          if (rr < 0 || rr >= rows) continue
          for (let dx = -1; dx <= 1; dx++) {
            const cc = col + dx
            if (cc < 0 || cc >= cols) continue
            const q = rr * cols + cc
            if (!sizes[q]) continue
            const dL = colour[q * 3] - colour[c * 3], da = colour[q * 3 + 1] - colour[c * 3 + 1], db = colour[q * 3 + 2] - colour[c * 3 + 2]
            const w = sizes[q] * Math.exp(-(dL * dL + da * da + db * db) * falloff)
            L += colour[q * 3] * w; a += colour[q * 3 + 1] * w; b += colour[q * 3 + 2] * w; total += w
          }
        }
        next[c * 3] = L / total; next[c * 3 + 1] = a / total; next[c * 3 + 2] = b / total
      }
    }
    colour = next
  }
  // Where every patch lies, and how much each of the patches around it counts for its pixels:
  // nothing across an edge, so the edge stays sharp.
  const centre = new Float64Array(n * 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = patchOf[y * width + x]
      centre[c * 2] += x; centre[c * 2 + 1] += y
    }
  }
  const alike = new Float32Array(n * 9)
  const sharp = 1 / (blend * blend * 0.5)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = row * cols + col
      if (!sizes[c]) continue
      centre[c * 2] /= sizes[c]; centre[c * 2 + 1] /= sizes[c]
      for (let i = 0; i < 9; i++) {
        const rr = row + Math.floor(i / 3) - 1, cc = col + (i % 3) - 1
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || !sizes[rr * cols + cc]) continue
        const q = rr * cols + cc
        const dL = colour[q * 3] - colour[c * 3], da = colour[q * 3 + 1] - colour[c * 3 + 1], db = colour[q * 3 + 2] - colour[c * 3 + 2]
        alike[c * 9 + i] = Math.exp(-(dL * dL + da * da + db * db) * sharp)
      }
    }
  }
  // A pixel gets the colours of its patch and the patches around it, each by how near its centre
  // is: within one colour the picture runs smoothly from patch to patch instead of in steps, so
  // the outlines of the areas become curves and not the outlines of patches.
  const step = Math.sqrt(count / n)
  const nearness = 1 / (2 * (0.6 * step) * (0.6 * step))
  const out = new Float32Array(count * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const c = patchOf[p]
      const oL = lab[p * 3] - robust[c * 3], oa = lab[p * 3 + 1] - robust[c * 3 + 1], ob = lab[p * 3 + 2] - robust[c * 3 + 2]
      if (oL * oL + oa * oa + ob * ob > OWN_COLOUR * OWN_COLOUR) {
        out[p * 3] = lab[p * 3]; out[p * 3 + 1] = lab[p * 3 + 1]; out[p * 3 + 2] = lab[p * 3 + 2]
        continue
      }
      const row = Math.floor(c / cols), col = c - row * cols
      let L = 0, a = 0, b = 0, total = 0
      for (let i = 0; i < 9; i++) {
        const like = alike[c * 9 + i]
        if (!like) continue
        const q = (row + Math.floor(i / 3) - 1) * cols + col + (i % 3) - 1
        const dx = x - centre[q * 2], dy = y - centre[q * 2 + 1]
        const w = like * Math.exp(-(dx * dx + dy * dy) * nearness)
        L += colour[q * 3] * w; a += colour[q * 3 + 1] * w; b += colour[q * 3 + 2] * w; total += w
      }
      if (total > 1e-12) { out[p * 3] = L / total; out[p * 3 + 1] = a / total; out[p * 3 + 2] = b / total }
      else { out[p * 3] = colour[c * 3]; out[p * 3 + 1] = colour[c * 3 + 1]; out[p * 3 + 2] = colour[c * 3 + 2] }
    }
  }
  return out
}

/**
 * The colours of a picture slightly out of focus: the mean over a square of `radius` pixels around
 * every pixel. Used to place outlines: a jagged edge between two colours becomes an even slope,
 * and the outline runs along its middle. (A stronger blur would lose strokes one pixel wide.)
 * @returns {Float32Array} OKLab per pixel
 */
export function softColours(lab, width, height, radius) {
  const tmp = new Float32Array(lab.length), out = new Float32Array(lab.length)
  meanAlong(lab, tmp, width, height, 3, width * 3, radius)
  meanAlong(tmp, out, height, width, width * 3, 3, radius)
  return out
}

// Running mean over 2 x radius + 1 values along every line (`step` from pixel to pixel, `stride`
// from line to line); at the ends the line is continued with its last pixel.
function meanAlong(src, dst, length, lines, step, stride, radius) {
  const span = 2 * radius + 1
  for (let line = 0; line < lines; line++) {
    for (let j = 0; j < 3; j++) {
      const start = line * stride + j
      let sum = 0
      for (let i = -radius; i <= radius; i++) sum += src[start + Math.min(length - 1, Math.max(0, i)) * step]
      for (let i = 0; i < length; i++) {
        dst[start + i * step] = sum / span
        sum += src[start + Math.min(length - 1, i + radius + 1) * step] - src[start + Math.max(0, i - radius) * step]
      }
    }
  }
}

/** Mean colour (OKLab) of the pixels of every label; labels without pixels stay at 0. */
export function labelColours(labels, lab, k) {
  const colours = new Float64Array(k * 3)
  const sizes = new Float64Array(k)
  for (let p = 0; p < labels.length; p++) {
    const c = labels[p]
    colours[c * 3] += lab[p * 3]; colours[c * 3 + 1] += lab[p * 3 + 1]; colours[c * 3 + 2] += lab[p * 3 + 2]
    sizes[c]++
  }
  for (let c = 0; c < k; c++) if (sizes[c]) { colours[c * 3] /= sizes[c]; colours[c * 3 + 1] /= sizes[c]; colours[c * 3 + 2] /= sizes[c] }
  return colours
}

// Widen a mask by `radius` pixels along its lines: `step` from pixel to pixel in a line of
// `length` pixels, `stride` from line to line.
function widen(mask, out, length, lines, step, stride, radius) {
  for (let line = 0; line < lines; line++) {
    const start = line * stride
    // Distance to the last marked pixel, forwards and then backwards.
    let since = radius + 1
    for (let i = 0; i < length; i++) {
      since = mask[start + i * step] ? 0 : since + 1
      out[start + i * step] = since <= radius ? 1 : 0
    }
    since = radius + 1
    for (let i = length - 1; i >= 0; i--) {
      since = mask[start + i * step] ? 0 : since + 1
      if (since <= radius) out[start + i * step] = 1
    }
  }
}

/**
 * Round the outlines of the areas of a label map.
 * Every pixel near an outline takes the label that most pixels around it have (a round window of
 * `radius` pixels, near pixels counting more), weighed against how well the colour of that label
 * fits the pixel: `fidelity` x the squared OKLab distance. So an outline between two similar
 * colours becomes a calm curve and specks go, while a thin or small shape in a clearly different
 * colour (a spire, an eye) holds its ground.
 * @param {Float32Array} lab  colour per pixel
 * @param {Float64Array} colours  colour per label (see `labelColours`)
 */
export function smoothOutlines(labels, lab, colours, width, height, k, { radius = 3, passes = 2, fidelity = 40 } = {}) {
  if (radius < 1 || passes < 1) return labels
  // The window: a disc, near pixels counting more.
  const sigma = radius / 1.5
  const offX = [], offY = [], offW = []
  let total = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > (radius + 0.5) * (radius + 0.5)) continue
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
      offX.push(dx); offY.push(dy); offW.push(w)
      total += w
    }
  }
  const taps = offW.length
  const reach = Math.ceil(radius * 0.6)
  const weight = Float32Array.from(offW, (w) => w / total)
  const shift = Int32Array.from(offX, (dx, i) => offY[i] * width + dx)
  const votes = new Float32Array(k)
  const seen = new Int32Array(taps)
  const edge = new Uint8Array(labels.length), across = new Uint8Array(labels.length), near = new Uint8Array(labels.length)
  let src = labels
  for (let pass = 0; pass < passes; pass++) {
    // Only pixels near an outline are looked at: further away no other colour holds enough of the
    // window. After the first pass that is: near a pixel that changed.
    let any = pass > 0
    if (pass === 0) for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (x < width - 1 && src[p] !== src[p + 1]) { edge[p] = edge[p + 1] = 1; any = true }
        if (y < height - 1 && src[p] !== src[p + width]) { edge[p] = edge[p + width] = 1; any = true }
      }
    }
    widen(edge, across, width, height, 1, width, reach)
    widen(across, near, height, width, width, 1, reach)
    if (!any) break
    const dst = Int32Array.from(src)
    edge.fill(0)
    let changed = false
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (!near[p]) continue
        let found = 0
        if (x >= radius && x < width - radius && y >= radius && y < height - radius) {
          for (let i = 0; i < taps; i++) {
            const c = src[p + shift[i]]
            if (!votes[c]) seen[found++] = c
            votes[c] += weight[i]
          }
        } else {
          for (let i = 0; i < taps; i++) {
            const xx = x + offX[i], yy = y + offY[i]
            if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue
            const c = src[yy * width + xx]
            if (!votes[c]) seen[found++] = c
            votes[c] += weight[i]
          }
        }
        const own = src[p]
        let best = own, least = Infinity
        if (found > 1) {
          const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2]
          for (let i = 0; i < found; i++) {
            const c = seen[i]
            // A colour that is hardly there cannot take the pixel: otherwise a colour between two
            // others would creep along the edge between them, pass after pass.
            if (c !== own && votes[c] < MIN_SHARE) continue
            const dL = L - colours[c * 3], da = a - colours[c * 3 + 1], db = b - colours[c * 3 + 2]
            const cost = fidelity * (dL * dL + da * da + db * db) - votes[c]
            // On a tie the pixel stays as it is, then the lower label wins: the same result every time.
            if (cost < least - 1e-9 || (Math.abs(cost - least) <= 1e-9 && (c === own || (best !== own && c < best)))) { least = cost; best = c }
          }
        }
        for (let i = 0; i < found; i++) votes[seen[i]] = 0
        if (best !== own) { dst[p] = best; edge[p] = 1; changed = true }
      }
    }
    src = dst
    if (!changed) break
  }
  return src
}

/**
 * Join every area smaller than `minRegion` pixels with a neighbour: the one it shares a long
 * border with and is close to in colour. Unlike `mergeSmallRegions` this always finishes: an area
 * only ever joins a larger one, round after round, until no small area is left.
 * A small area that stands out stays (an eye, a mouth, a lit window): its colour is at least
 * `keepContrast` (OKLab) away from everything around it and it has at least `keepSize` pixels;
 * the stronger the contrast, the smaller it may be (black letters on white).
 * @param {Float32Array} lab  colour per pixel
 */
export function mergeSmallAreas(labels, lab, width, height, minRegion, { keepSize = Infinity, keepContrast = Infinity } = {}) {
  let current = labels
  for (let round = 0; round < 40; round++) {
    const { regionMap, regionCluster, regionSize } = connectedComponents(current, width, height)
    const n = regionSize.length
    let anySmall = false
    for (let r = 0; r < n; r++) if (regionSize[r] < minRegion) { anySmall = true; break }
    if (!anySmall) return current
    const colour = labelColours(regionMap, lab, n)
    // Border length of every small area with each of its neighbours.
    const border = new Map()
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        const r = regionMap[p]
        if (regionSize[r] >= minRegion) continue
        for (let side = 0; side < 4; side++) {
          const q = side === 0 ? (x > 0 ? p - 1 : -1) : side === 1 ? (x < width - 1 ? p + 1 : -1) : side === 2 ? (y > 0 ? p - width : -1) : (y < height - 1 ? p + width : -1)
          if (q < 0) continue
          const rq = regionMap[q]
          if (rq === r) continue
          let m = border.get(r)
          if (!m) { m = new Map(); border.set(r, m) }
          m.set(rq, (m.get(rq) || 0) + 1)
        }
      }
    }
    // target[r] = the area r joins, or -1 when it stays.
    const target = new Int32Array(n).fill(-1)
    let joins = 0
    for (const [r, m] of border) {
      let best = -1, bestScore = -1, closest = Infinity
      for (const [q, length] of m) {
        const d = Math.hypot(colour[q * 3] - colour[r * 3], colour[q * 3 + 1] - colour[r * 3 + 1], colour[q * 3 + 2] - colour[r * 3 + 2])
        if (d < closest) closest = d
        // Only into a larger area (or an equal one that comes later): two small areas never swap.
        if (regionSize[q] < regionSize[r] || (regionSize[q] === regionSize[r] && q < r)) continue
        const score = length / (0.03 + d)
        if (score > bestScore) { bestScore = score; best = q }
      }
      if (closest >= keepContrast && regionSize[r] * closest >= keepSize * keepContrast) continue
      if (best >= 0) { target[r] = best; joins++ }
    }
    if (!joins) return current
    // Follow the joins to their end, so that a chain of small areas goes in one round.
    const cluster = regionCluster.slice()
    for (let r = 0; r < n; r++) {
      if (target[r] < 0) continue
      let end = target[r]
      while (target[end] >= 0) end = target[end]
      cluster[r] = regionCluster[end]
    }
    const next = new Int32Array(current.length)
    for (let p = 0; p < next.length; p++) next[p] = cluster[regionMap[p]]
    current = next
  }
  return current
}
