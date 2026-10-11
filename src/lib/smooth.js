// Calm colour areas: the steps of `segmentImage` that keep noise out of the areas, decide which
// small things stay, join what is too alike to be painted apart and round the outlines.
//
// 1. The picture is cut into small compact patches that follow its edges (`compactPatches`).
// 2. Every patch gets one robust colour, evened out with the patches around it that are nearly the
//    same colour (`patchColours`). Pixels then take the colour of their patch, so noise, grain and
//    JPEG blocks are gone before the colours are clustered, while an edge stays where it is.
// 3. After clustering, the details are found (`findDetails`): the small or thin areas that stand
//    out from what is around them (an eye, a letter, a wire). They are decided once, as a whole,
//    and no later step touches them.
// 4. Areas join (`mergeAreas`): what is too small for a brush always, larger areas while it costs
//    the picture little.
// 5. The outlines are rounded (`roundOutlines`): a pixel takes the label most pixels around it have.
//
// Pure functions on typed arrays, like the rest of the pipeline. Nothing here imports segment.js.

// How much the distance to the centre of a patch counts against a difference in colour (OKLab):
// higher gives rounder patches, lower lets them follow faint edges (and noise).
const COMPACTNESS = 0.08
const PATCH_ROUNDS = 4
// A pixel is left out of the colour of its patch when it is further from the mean of the patch
// than this many times the average pixel of the patch (plus a little, for a patch that is flat).
const STRAY = 1.5
const STRAY_EXTRA = 0.005
// A pixel this far (OKLab) from the colour of its patch is not noise but something small of its
// own (a highlight in an eye, a wire against the sky): it keeps its colour.
const OWN_COLOUR = 0.09
// How far the colour of a patch reaches into the patches around it, in patch sides.
const PATCH_REACH = 0.6
// The window of `roundOutlines` is a disc in which a pixel at the rim counts this much less than
// the one in the middle (the rim lies ROUND_FALLOFF standard deviations out).
const ROUND_FALLOFF = 1.5
// Part of the window around a pixel that a label must hold before the pixel can take it.
const MIN_SHARE = 0.2
// A detail differs at least this much (OKLab) from the colour around it ...
const DETAIL_CONTRAST = 0.12
// ... taken this many pixels away from it ...
const DETAIL_RING = 3
// ... where at most this part of the pixels is as close as DETAIL_ALIKE to its colour.
const DETAIL_ALIKE = 0.06
const DETAIL_ALIKE_SHARE = 0.25
// An area larger than `maxSize` can still be a detail when it is thin: at most this many pixels
// per pixel of outline (a wire, a line of writing).
const DETAIL_THIN = 1.5
// Details of one colour this close together (pixels) are one group ...
const DETAIL_GROUP = 8
// ... when each is worth at least this part of what a detail on its own must be worth.
const DETAIL_WEAKEST = 0.5

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
 * The picture with every pixel in the colour of its patch: the robust colour of the patch
 * (`robustColours`), evened out with the patches around it (`evenColours`) and run smoothly from
 * patch to patch (`spreadColours`). Noise that is larger than a patch goes, an edge between two
 * different colours stays. `blend` = the difference in OKLab at which a neighbour hardly counts.
 * @returns {Float32Array} OKLab per pixel
 */
export function patchColours(lab, width, height, patches, { blend = 0.03, rounds = 4 } = {}) {
  const { robust, sizes } = robustColours(lab, patches.patchOf, patches.cols * patches.rows)
  const even = evenColours(robust, sizes, patches.cols, patches.rows, blend, rounds)
  return spreadColours(lab, width, height, patches, sizes, robust, even, blend)
}

/**
 * One colour per patch: the mean of its pixels without the ones that stray, so a patch that holds
 * a bit of something else is not tinted by it.
 * @returns {{robust: Float64Array, sizes: Float64Array}}  OKLab and pixel count per patch
 */
export function robustColours(lab, patchOf, n) {
  const count = patchOf.length
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
  const robust = new Float64Array(n * 3)
  const kept = new Float64Array(n)
  for (let p = 0; p < count; p++) {
    const c = patchOf[p]
    if (away[p] > STRAY * (spread[c] / sizes[c]) + STRAY_EXTRA) continue
    robust[c * 3] += lab[p * 3]; robust[c * 3 + 1] += lab[p * 3 + 1]; robust[c * 3 + 2] += lab[p * 3 + 2]
    kept[c]++
  }
  for (let c = 0; c < n; c++) {
    for (let j = 0; j < 3; j++) robust[c * 3 + j] = kept[c] ? robust[c * 3 + j] / kept[c] : mean[c * 3 + j]
  }
  return { robust, sizes }
}

/**
 * Even out the colours of the patches, `rounds` times, with the eight patches around each: every
 * neighbour counts by its size and the less the further its colour is away.
 * @returns {Float64Array} OKLab per patch
 */
export function evenColours(colours, sizes, cols, rows, blend, rounds) {
  const falloff = 1 / (blend * blend)
  let colour = colours
  for (let round = 0; round < rounds; round++) {
    const next = new Float64Array(colour.length)
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
  return colour
}

/**
 * Give every pixel the colours of its patch and the patches around it, each by how near its
 * centre is and by how alike the two patches are (nothing across an edge, so the edge stays
 * sharp). Within one colour the picture then runs smoothly from patch to patch instead of in
 * steps. A pixel far from the `robust` colour of its patch (OWN_COLOUR) keeps its own colour.
 * @param {Float64Array} colours  OKLab per patch, after `evenColours`
 * @returns {Float32Array} OKLab per pixel
 */
export function spreadColours(lab, width, height, { patchOf, cols, rows }, sizes, robust, colours, blend) {
  const count = width * height
  const n = cols * rows
  const centre = new Float64Array(n * 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = patchOf[y * width + x]
      centre[c * 2] += x; centre[c * 2 + 1] += y
    }
  }
  for (let c = 0; c < n; c++) if (sizes[c]) { centre[c * 2] /= sizes[c]; centre[c * 2 + 1] /= sizes[c] }
  // alike[c * 9 + i] = how much the i-th of the nine patches at and around c counts for the pixels of c.
  const alike = new Float32Array(n * 9)
  const sharp = 2 / (blend * blend)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = row * cols + col
      if (!sizes[c]) continue
      for (let i = 0; i < 9; i++) {
        const rr = row + Math.floor(i / 3) - 1, cc = col + (i % 3) - 1
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || !sizes[rr * cols + cc]) continue
        const q = rr * cols + cc
        const dL = colours[q * 3] - colours[c * 3], da = colours[q * 3 + 1] - colours[c * 3 + 1], db = colours[q * 3 + 2] - colours[c * 3 + 2]
        alike[c * 9 + i] = Math.exp(-(dL * dL + da * da + db * db) * sharp)
      }
    }
  }
  const reach = PATCH_REACH * Math.sqrt(count / n)
  const nearness = 1 / (2 * reach * reach)
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
        L += colours[q * 3] * w; a += colours[q * 3 + 1] * w; b += colours[q * 3 + 2] * w; total += w
      }
      // No patch near enough to count: the colour of its own patch.
      if (total > 0) { out[p * 3] = L / total; out[p * 3 + 1] = a / total; out[p * 3 + 2] = b / total }
      else { out[p * 3] = colours[c * 3]; out[p * 3 + 1] = colours[c * 3 + 1]; out[p * 3 + 2] = colours[c * 3 + 2] }
    }
  }
  return out
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
 * `radius` pixels, near pixels counting more), `passes` times. Teeth, steps and thin tongues
 * narrower than the window go, and an outline becomes a curve a brush can follow.
 * Pixels marked in `fixed` (the details) are counted but never changed; with `only` (a mask)
 * nothing outside it is changed.
 */
export function roundOutlines(labels, width, height, k, { radius = 3, passes = 2, fixed = null, only = null } = {}) {
  if (radius < 1 || passes < 1) return labels
  const sigma = radius / ROUND_FALLOFF
  const offX = [], offY = [], offW = []
  let total = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // The disc: every pixel whose middle is within radius + 1/2 of the middle of the window.
      if (dx * dx + dy * dy > (radius + 0.5) * (radius + 0.5)) continue
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
      offX.push(dx); offY.push(dy); offW.push(w)
      total += w
    }
  }
  const taps = offW.length
  const weight = Float32Array.from(offW, (w) => w / total)
  const shift = Int32Array.from(offX, (dx, i) => offY[i] * width + dx)
  const votes = new Float32Array(k)
  const seen = new Int32Array(taps)
  const edge = new Uint8Array(labels.length), across = new Uint8Array(labels.length), near = new Uint8Array(labels.length)
  let src = labels
  for (let pass = 0; pass < passes; pass++) {
    // Only pixels within `radius` of an outline can change: further away the window holds one
    // label. After the first pass that is: within `radius` of a pixel that changed.
    if (pass === 0) for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (x < width - 1 && src[p] !== src[p + 1]) edge[p] = edge[p + 1] = 1
        if (y < height - 1 && src[p] !== src[p + width]) edge[p] = edge[p + width] = 1
      }
    }
    widen(edge, across, width, height, 1, width, radius)
    widen(across, near, height, width, width, 1, radius)
    const dst = Int32Array.from(src)
    edge.fill(0)
    let changed = false
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (!near[p] || (fixed && fixed[p]) || (only && !only[p])) continue
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
        // The label with the most votes; on a tie the pixel stays as it is, then the lower label
        // wins. A label that is hardly there (MIN_SHARE) cannot take the pixel.
        const own = src[p]
        let best = own
        for (let i = 0; i < found; i++) {
          const c = seen[i]
          if (c === own || votes[c] < MIN_SHARE) continue
          if (votes[c] > votes[best] || (votes[c] === votes[best] && best !== own && c < best)) best = c
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
 * The areas of a label map: connected pixels of one label (4 neighbours), numbered row by row.
 * The same areas as `connectedComponents` in segment.js, on typed arrays only.
 * @returns {{areaOf: Int32Array, labelOf: Int32Array, sizeOf: Int32Array, count: number}}
 */
export function findAreas(labels, width, height) {
  const total = labels.length
  const areaOf = new Int32Array(total).fill(-1)
  const labelOf = new Int32Array(total), sizeOf = new Int32Array(total)
  const stack = new Int32Array(total)
  let count = 0
  for (let start = 0; start < total; start++) {
    if (areaOf[start] !== -1) continue
    const label = labels[start]
    let top = 0, size = 0
    stack[top++] = start
    areaOf[start] = count
    while (top) {
      const p = stack[--top]
      size++
      const x = p % width
      if (x > 0 && areaOf[p - 1] === -1 && labels[p - 1] === label) { areaOf[p - 1] = count; stack[top++] = p - 1 }
      if (x < width - 1 && areaOf[p + 1] === -1 && labels[p + 1] === label) { areaOf[p + 1] = count; stack[top++] = p + 1 }
      if (p >= width && areaOf[p - width] === -1 && labels[p - width] === label) { areaOf[p - width] = count; stack[top++] = p - width }
      if (p + width < total && areaOf[p + width] === -1 && labels[p + width] === label) { areaOf[p + width] = count; stack[top++] = p + width }
    }
    labelOf[count] = label
    sizeOf[count] = size
    count++
  }
  return { areaOf, labelOf: labelOf.slice(0, count), sizeOf: sizeOf.slice(0, count), count }
}

/**
 * The details of a label map: the small things worth keeping (an eye, a mouth, a letter, a lit
 * window, a wire). One rule decides it, for a whole area at a time and before anything is joined
 * or rounded, so a detail is kept whole or not at all. An area can be a detail when
 * - it has `minSize` to `maxSize` pixels, or more when it is thin (DETAIL_THIN);
 * - its colour is at least DETAIL_CONTRAST (OKLab) away from the colour around it: the mean of
 *   the pixels DETAIL_RING away from it. The strip between a dark and a light area is therefore
 *   none: what is around it is, taken together, its own colour;
 * - hardly any of those pixels has its colour (DETAIL_ALIKE_SHARE), so a bump on a larger area
 *   of nearly the same colour is none either.
 * What it is worth is what losing it would cost: its thickness (pixels per pixel of outline) x
 * the square of that distance in colour. A thin stroke is worth much when it is strong (a
 * letter), a faint shape has to be thick. The caller keeps the details worth more than a limit.
 * Such areas of one colour that lie close together are a group (the letters of a line, the
 * pieces of a wire) and are worth what the best of them is worth, so that they stay or go
 * together; but none more than 1 / DETAIL_WEAKEST times its own worth.
 * @param {Float32Array} lab  colour per pixel
 * @returns {Float32Array} per pixel: the worth of the detail it belongs to, 0 where there is none
 */
export function findDetails(labels, lab, width, height, { minSize = 1, maxSize = Infinity } = {}) {
  const total = labels.length
  const { areaOf, sizeOf, count } = findAreas(labels, width, height)
  // The pixels of every area in a row: first[r] .. first[r + 1] in `pixels`.
  const first = new Int32Array(count + 1)
  for (let r = 0; r < count; r++) first[r + 1] = first[r] + sizeOf[r]
  const filled = first.slice(0, count)
  const pixels = new Int32Array(total)
  for (let p = 0; p < total; p++) pixels[filled[areaOf[p]]++] = p
  const ring = [-DETAIL_RING, DETAIL_RING, -DETAIL_RING * width, DETAIL_RING * width]
  // worth[r] = what losing area r would cost; -1 when it cannot be a detail.
  const worth = new Float64Array(count).fill(-1)
  const colour = new Float64Array(count * 3)
  for (let r = 0; r < count; r++) {
    const size = sizeOf[r]
    if (size < minSize) continue
    let L = 0, a = 0, b = 0
    for (let i = first[r]; i < first[r + 1]; i++) { const p = pixels[i]; L += lab[p * 3]; a += lab[p * 3 + 1]; b += lab[p * 3 + 2] }
    L /= size; a /= size; b /= size
    let outline = 0, around = 0, alike = 0, sL = 0, sa = 0, sb = 0
    for (let i = first[r]; i < first[r + 1]; i++) {
      const p = pixels[i]
      const x = p % width, y = (p - x) / width
      if (x > 0 && areaOf[p - 1] !== r) outline++
      if (x < width - 1 && areaOf[p + 1] !== r) outline++
      if (y > 0 && areaOf[p - width] !== r) outline++
      if (y < height - 1 && areaOf[p + width] !== r) outline++
      for (let side = 0; side < 4; side++) {
        if (side === 0 ? x < DETAIL_RING : side === 1 ? x >= width - DETAIL_RING : side === 2 ? y < DETAIL_RING : y >= height - DETAIL_RING) continue
        const q = p + ring[side]
        if (areaOf[q] === r) continue
        const dL = lab[q * 3] - L, da = lab[q * 3 + 1] - a, db = lab[q * 3 + 2] - b
        if (dL * dL + da * da + db * db < DETAIL_ALIKE * DETAIL_ALIKE) alike++
        sL += lab[q * 3]; sa += lab[q * 3 + 1]; sb += lab[q * 3 + 2]
        around++
      }
    }
    if (!around || !outline || alike > around * DETAIL_ALIKE_SHARE) continue
    if (size > maxSize && size > outline * DETAIL_THIN) continue
    const dL = sL / around - L, da = sa / around - a, db = sb / around - b
    const contrast2 = dL * dL + da * da + db * db
    if (contrast2 < DETAIL_CONTRAST * DETAIL_CONTRAST) continue
    worth[r] = (size / outline) * contrast2
    colour[r * 3] = L; colour[r * 3 + 1] = a; colour[r * 3 + 2] = b
  }
  // Groups: group[r] = the area that stands for the group of r.
  const group = new Int32Array(count)
  for (let r = 0; r < count; r++) group[r] = r
  const head = (r) => {
    while (group[r] !== r) { group[r] = group[group[r]]; r = group[r] }
    return r
  }
  // A grid of cells; an area is noted in the cells within half a cell of its pixels, and joins
  // the group of the area noted there before it when the two are about one colour.
  const cellsAcross = Math.ceil(width / DETAIL_GROUP) + 1, half = DETAIL_GROUP >> 1
  const noted = new Int32Array(cellsAcross * (Math.ceil(height / DETAIL_GROUP) + 1)).fill(-1)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    for (let i = first[r]; i < first[r + 1]; i++) {
      const x = pixels[i] % width, y = (pixels[i] - x) / width
      for (let corner = 0; corner < 4; corner++) {
        const cx = Math.max(0, x + (corner & 1 ? half : -half)), cy = Math.max(0, y + (corner & 2 ? half : -half))
        const cell = Math.floor(cy / DETAIL_GROUP) * cellsAcross + Math.floor(cx / DETAIL_GROUP)
        const other = noted[cell]
        if (other < 0) { noted[cell] = r; continue }
        if (other === r) continue
        const dL = colour[other * 3] - colour[r * 3], da = colour[other * 3 + 1] - colour[r * 3 + 1], db = colour[other * 3 + 2] - colour[r * 3 + 2]
        if (dL * dL + da * da + db * db >= DETAIL_CONTRAST * DETAIL_CONTRAST) continue
        const g = head(r), h = head(other)
        if (g !== h) group[Math.max(g, h)] = Math.min(g, h)
      }
    }
  }
  const best = new Float64Array(count)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    const g = head(r)
    if (worth[r] > best[g]) best[g] = worth[r]
  }
  const out = new Float32Array(total)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    const value = Math.min(best[head(r)], worth[r] / DETAIL_WEAKEST)
    for (let i = first[r]; i < first[r + 1]; i++) out[pixels[i]] = value
  }
  return out
}

/**
 * Join areas of a label map until every area left is worth painting on its own, in `stages`: each
 * a `{ minSize, limit, detailLimit }`, worked through one after the other on what the one before
 * left. So the areas of a later stage are always made of whole areas of an earlier one, and
 * raising the stages step by step (Simplify) can only lower the number of areas.
 * In a stage one of three things holds for an area:
 * - it is a detail (its pixels are worth `detailLimit` or more on average, see `findDetails`
 *   for `details`): it counts as large enough, however small it is;
 * - else, when it is smaller than `minSize` pixels: it joins the neighbour that costs least,
 *   whatever the cost;
 * - an area that is large enough joins a neighbour only while that costs less than `limit`,
 *   cheapest pair first.
 * The cost of joining two areas is what the picture loses: the square of the distance of their
 * colours (OKLab) x the pixels that change colour (about the size of the smaller one) / the
 * length of the outline that goes. So patches of nearly one colour inside a coat or a cheek run
 * together, and two large areas with a short common outline stay apart.
 * The joined area takes the label of the larger of the two; a detail that takes in an area too
 * small to stay keeps its own.
 * For an area with most of its pixels inside `where` (a mask, 1 = inside) the stage does not
 * count: `inside` (`{ minSize, limit, detailLimit }`) is used at every stage.
 *
 * Works in rounds on the list of neighbours: in every round each area picks its cheapest
 * neighbour, and two areas that pick each other join (a small area joins without being picked).
 * There is no limit on the rounds and none is needed: the cheapest pair of all always pick each
 * other, so a round either joins something, leaving fewer areas, or is the last of its stage.
 * On equal cost the neighbour with the lower number is picked; areas are numbered row by row.
 * @param {Float32Array} lab  colour per pixel
 * @param {Array<{minSize?: number, limit?: number, detailLimit?: number}>} stages
 */
export function mergeAreas(labels, lab, width, height, stages, { details = null, where = null, inside = null } = {}) {
  const total = labels.length
  const { areaOf, labelOf, sizeOf, count } = findAreas(labels, width, height)
  if (count < 2) return labels
  // Per area: size, sum of its colours, sum of the worth of its pixels as details, pixels in `where`.
  const size = Float64Array.from(sizeOf)
  const sum = new Float64Array(count * 3)
  const worth = new Float64Array(count), within = new Float64Array(count)
  for (let p = 0; p < total; p++) {
    const r = areaOf[p]
    sum[r * 3] += lab[p * 3]; sum[r * 3 + 1] += lab[p * 3 + 1]; sum[r * 3 + 2] += lab[p * 3 + 2]
    if (details) worth[r] += details[p]
    if (where && where[p]) within[r]++
  }
  // The neighbours: one entry a * count + b (a < b) per pixel side between two areas, sorted, then
  // counted: pairs of areas with the length of their common outline.
  const keys = new Float64Array(total * 2)
  let sides = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, r = areaOf[p]
      if (x < width - 1 && r !== areaOf[p + 1]) keys[sides++] = Math.min(r, areaOf[p + 1]) * count + Math.max(r, areaOf[p + 1])
      if (y < height - 1 && r !== areaOf[p + width]) keys[sides++] = Math.min(r, areaOf[p + width]) * count + Math.max(r, areaOf[p + width])
    }
  }
  keys.subarray(0, sides).sort()
  const lengths = new Float64Array(sides)
  let pairs = 0
  for (let i = 0; i < sides; i++) {
    if (pairs && keys[pairs - 1] === keys[i]) lengths[pairs - 1]++
    else { keys[pairs] = keys[i]; lengths[pairs++] = 1 }
  }

  // into[r] = the area r has joined (itself when it has joined none).
  const into = new Int32Array(count)
  for (let r = 0; r < count; r++) into[r] = r
  const end = (r) => {
    while (into[r] !== r) { into[r] = into[into[r]]; r = into[r] }
    return r
  }
  // Per area, for the stage at hand: the cost up to which it joins, whether it is a detail,
  // whether it is too small to stay.
  const limitOf = new Float64Array(count)
  const kept = new Uint8Array(count), small = new Uint8Array(count), open = new Uint8Array(count)
  const pick = new Int32Array(count)
  const least = new Float64Array(count)
  // Area `go` becomes part of area `stay`.
  const join = (stay, go) => {
    into[go] = stay
    within[stay] += within[go]
    size[stay] += size[go]
    sum[stay * 3] += sum[go * 3]; sum[stay * 3 + 1] += sum[go * 3 + 1]; sum[stay * 3 + 2] += sum[go * 3 + 2]
  }
  for (const stage of stages) {
    for (;;) {
      // Two joined areas that came to lie side by side with one label are one area to the eye.
      let joined = false
      for (let i = 0; i < pairs; i++) {
        const a = end(Math.floor(keys[i] / count)), b = end(keys[i] - Math.floor(keys[i] / count) * count)
        if (a === b || labelOf[a] !== labelOf[b]) continue
        const stay = size[a] >= size[b] ? a : b, go = stay === a ? b : a
        worth[stay] += worth[go]
        join(stay, go)
        joined = true
      }
      if (!joined) {
        for (let r = 0; r < count; r++) {
          if (into[r] !== r) continue
          const rule = inside && within[r] * 2 > size[r] ? inside : stage
          limitOf[r] = rule.limit ?? 0
          kept[r] = details && worth[r] > 0 && worth[r] >= (rule.detailLimit ?? Infinity) * size[r] ? 1 : 0
          small[r] = !kept[r] && size[r] < (rule.minSize ?? 1) ? 1 : 0
        }
        // An area with nothing but details around it is part of them (the inside of a letter): it stays too.
        if (details) {
          open.fill(0)
          for (let i = 0; i < pairs; i++) {
            const a = Math.floor(keys[i] / count), b = keys[i] - a * count
            if (!kept[b]) open[a] = 1
            if (!kept[a]) open[b] = 1
          }
          for (let r = 0; r < count; r++) if (!open[r]) small[r] = 0
        }
        pick.fill(-1)
        least.fill(Infinity)
        for (let i = 0; i < pairs; i++) {
          const a = Math.floor(keys[i] / count), b = keys[i] - a * count
          const dL = sum[a * 3] / size[a] - sum[b * 3] / size[b], da = sum[a * 3 + 1] / size[a] - sum[b * 3 + 1] / size[b], db = sum[a * 3 + 2] / size[a] - sum[b * 3 + 2] / size[b]
          const cost = (dL * dL + da * da + db * db) * (size[a] * size[b] / (size[a] + size[b])) / lengths[i]
          // Two areas that are large enough join only when it is cheap enough for both.
          // The pairs come sorted, so on equal cost the lower neighbour is picked.
          const free = cost < Math.min(limitOf[a], limitOf[b])
          if ((small[a] || free) && cost < least[a]) { least[a] = cost; pick[a] = b }
          if ((small[b] || free) && cost < least[b]) { least[b] = cost; pick[b] = a }
        }
        for (let r = 0; r < count; r++) {
          const other = pick[r]
          if (other < 0 || (!small[r] && pick[other] !== r)) continue
          const a = end(r), b = end(other)
          if (a === b) continue
          // The larger one stays (the lower one when they are equal) and takes the other in; but a
          // detail is not lost to an area that is too small to stay itself.
          const stay = kept[a] && small[b] ? a : kept[b] && small[a] ? b : size[a] > size[b] || (size[a] === size[b] && a < b) ? a : b
          const go = stay === a ? b : a
          // What a detail takes in becomes part of it; a detail taken in is none any more.
          worth[stay] = kept[stay] ? worth[stay] * (size[stay] + size[go]) / size[stay] : 0
          join(stay, go)
          joined = true
        }
      }
      if (!joined) break
      // The neighbours of the joined areas: the same pairs under their new numbers, counted again.
      let left = 0
      for (let i = 0; i < pairs; i++) {
        const a = end(Math.floor(keys[i] / count)), b = end(keys[i] - Math.floor(keys[i] / count) * count)
        if (a === b) continue
        keys[left] = Math.min(a, b) * count + Math.max(a, b)
        lengths[left++] = lengths[i]
      }
      pairs = combinePairs(keys, lengths, left)
    }
  }
  const out = new Int32Array(total)
  for (let p = 0; p < total; p++) out[p] = labelOf[end(areaOf[p])]
  return out
}

// Sort the first `n` pairs by key and add up the lengths of equal ones, in place.
// @returns {number} how many different pairs are left
function combinePairs(keys, lengths, n) {
  const order = new Int32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((i, j) => keys[i] - keys[j] || i - j)
  const sortedKeys = new Float64Array(n), sortedLengths = new Float64Array(n)
  for (let i = 0; i < n; i++) { sortedKeys[i] = keys[order[i]]; sortedLengths[i] = lengths[order[i]] }
  let left = 0
  for (let i = 0; i < n; i++) {
    if (left && keys[left - 1] === sortedKeys[i]) lengths[left - 1] += sortedLengths[i]
    else { keys[left] = sortedKeys[i]; lengths[left] = sortedLengths[i]; left++ }
  }
  return left
}
