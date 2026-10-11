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
// 6. For the screen, the finished map is enlarged with its outlines as smooth lines (`upscaleAreas`),
//    so that a slanted outline is not drawn as a staircase. This changes no area, only its drawing.
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
// A patch where more than this part of the pixels is that far off, among patches of which most
// are the same, holds nothing small of its own but noise or a pattern finer than the patches:
// there every pixel takes the patch colour. (The strokes of a letter fill patches like that too,
// but those lie among plain ones.)
const OWN_SHARE = 0.4
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
// A detail stands on calm ground: an area with more than this part of its outline on other
// would-be details is one of a crowd (speckle, the grain of a rough surface) and none itself.
const DETAIL_CROWD = 0.7
// The inside of a detail (the hole of a letter) stays with it from this many pixels on.
const DETAIL_HOLE = 3
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
 * steps. A pixel far from the `robust` colour of its patch (OWN_COLOUR) keeps its own colour,
 * unless the patch lies in noise (OWN_SHARE).
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
  // far[c] = how many pixels of patch c are far from its colour; noisy[c] = 1 when that is a
  // large part of it and of most of the patches around it as well.
  const far = new Int32Array(n)
  for (let p = 0; p < count; p++) {
    const c = patchOf[p]
    const oL = lab[p * 3] - robust[c * 3], oa = lab[p * 3 + 1] - robust[c * 3 + 1], ob = lab[p * 3 + 2] - robust[c * 3 + 2]
    if (oL * oL + oa * oa + ob * ob > OWN_COLOUR * OWN_COLOUR) far[c]++
  }
  const noisy = new Uint8Array(n)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = row * cols + col
      if (far[c] <= sizes[c] * OWN_SHARE) continue
      let around = 0, same = 0
      for (let i = 0; i < 9; i++) {
        const rr = row + Math.floor(i / 3) - 1, cc = col + (i % 3) - 1
        if (i === 4 || rr < 0 || rr >= rows || cc < 0 || cc >= cols || !sizes[rr * cols + cc]) continue
        around++
        if (far[rr * cols + cc] > sizes[rr * cols + cc] * OWN_SHARE) same++
      }
      if (same * 2 > around) noisy[c] = 1
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
      if (!noisy[c] && oL * oL + oa * oa + ob * ob > OWN_COLOUR * OWN_COLOUR) {
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
 * Pixels marked in `fixed` (the details) are neither changed nor counted, so a detail keeps its
 * shape exactly: it loses no pixel and gains none. With `only` (a mask) nothing outside it is changed.
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
            const q = p + shift[i]
            if (fixed && fixed[q]) continue
            const c = src[q]
            if (!votes[c]) seen[found++] = c
            votes[c] += weight[i]
          }
        } else {
          for (let i = 0; i < taps; i++) {
            const xx = x + offX[i], yy = y + offY[i]
            if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue
            if (fixed && fixed[yy * width + xx]) continue
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
 * An area that could be a detail but lies among others that could (DETAIL_CROWD) is none: it is
 * part of a speckle or a grain, and that is texture.
 * @param {Float32Array} lab  colour per pixel
 * @param {Int32Array} [extent]  if given, filled per pixel with the pixels of its whole group
 * @returns {Float32Array} per pixel: the worth of the detail it belongs to, 0 where there is none
 */
export function findDetails(labels, lab, width, height, { minSize = 1, maxSize = Infinity, extent = null } = {}) {
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
  // Not one of a crowd: decided for all at once, on what could be a detail before this.
  const crowded = new Uint8Array(count)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    let sides = 0, onDetails = 0
    for (let i = first[r]; i < first[r + 1]; i++) {
      const p = pixels[i]
      const x = p % width, y = (p - x) / width
      for (let side = 0; side < 4; side++) {
        if (side === 0 ? x === 0 : side === 1 ? x === width - 1 : side === 2 ? y === 0 : y === height - 1) continue
        const other = areaOf[p + (side === 0 ? -1 : side === 1 ? 1 : side === 2 ? -width : width)]
        if (other === r) continue
        sides++
        if (worth[other] >= 0) onDetails++
      }
    }
    if (onDetails > sides * DETAIL_CROWD) crowded[r] = 1
  }
  for (let r = 0; r < count; r++) if (crowded[r]) worth[r] = -1
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
  const groupSize = new Int32Array(count)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    const g = head(r)
    if (worth[r] > best[g]) best[g] = worth[r]
    groupSize[g] += sizeOf[r]
  }
  const out = new Float32Array(total)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    const value = Math.min(best[head(r)], worth[r] / DETAIL_WEAKEST)
    for (let i = first[r]; i < first[r + 1]; i++) {
      out[pixels[i]] = value
      if (extent) extent[pixels[i]] = groupSize[head(r)]
    }
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
 *   for `details`, and its group has `detailSize` pixels or more, see there for `extent`): it
 *   counts as large enough, however small it is, down to `smallest` pixels (what is left of a
 *   detail that was cut up is none);
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
 * An area joins or is joined once in a round, so every join is decided on sizes and colours that
 * still hold; only a large area can take in several small ones in one round.
 * There is no limit on the rounds and none is needed: the first pair of a round that wants to
 * join can, so a round either joins something, leaving fewer areas, or is the last of its stage.
 * On equal cost the neighbour with the lower number is picked; areas are numbered row by row.
 * @param {Float32Array} lab  colour per pixel
 * @param {Array<{minSize?: number, limit?: number, detailLimit?: number, detailSize?: number, smallest?: number}>} stages
 */
export function mergeAreas(labels, lab, width, height, stages, { details = null, extent = null, where = null, inside = null } = {}) {
  const total = labels.length
  const { areaOf, labelOf, sizeOf, count } = findAreas(labels, width, height)
  if (count < 2) return labels
  // Per area: size, sum of its colours, sum of the worth of its pixels as details, pixels in `where`.
  const size = Float64Array.from(sizeOf)
  const sum = new Float64Array(count * 3)
  const worth = new Float64Array(count), within = new Float64Array(count), reach = new Float64Array(count)
  for (let p = 0; p < total; p++) {
    const r = areaOf[p]
    sum[r * 3] += lab[p * 3]; sum[r * 3 + 1] += lab[p * 3 + 1]; sum[r * 3 + 2] += lab[p * 3 + 2]
    if (details) worth[r] += details[p]
    if (extent) reach[r] += extent[p]
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
  const changed = new Uint8Array(count)
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
        reach[stay] += reach[go]
        join(stay, go)
        joined = true
      }
      if (!joined) {
        for (let r = 0; r < count; r++) {
          if (into[r] !== r) continue
          const rule = inside && within[r] * 2 > size[r] ? inside : stage
          limitOf[r] = rule.limit ?? 0
          kept[r] = details && worth[r] > 0 && worth[r] >= (rule.detailLimit ?? Infinity) * size[r] && (!extent || reach[r] >= (rule.detailSize ?? 0) * size[r]) && size[r] >= (rule.smallest ?? 1) ? 1 : 0
          small[r] = !kept[r] && size[r] < (rule.minSize ?? 1) ? 1 : 0
        }
        // An area with nothing but details around it is part of them (the inside of a letter): it
        // stays too, unless it is a mere pixel or two (DETAIL_HOLE).
        if (details) {
          open.fill(0)
          for (let i = 0; i < pairs; i++) {
            const a = Math.floor(keys[i] / count), b = keys[i] - a * count
            if (!kept[b]) open[a] = 1
            if (!kept[a]) open[b] = 1
          }
          for (let r = 0; r < count; r++) if (!open[r] && size[r] >= DETAIL_HOLE) small[r] = 0
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
        changed.fill(0)
        for (let r = 0; r < count; r++) {
          const other = pick[r]
          if (other < 0 || (!small[r] && pick[other] !== r)) continue
          // What was decided before the round holds for an area only until it joins or is joined:
          // such a pair waits for the next round. Small areas can still join one large area together.
          if (changed[r] || into[other] !== other || (changed[other] && (small[other] || !small[r]))) continue
          const a = r, b = other
          changed[a] = changed[b] = 1
          // The larger one stays (the lower one when they are equal) and takes the other in; but a
          // detail is not lost to an area that is too small to stay itself.
          const stay = kept[a] && small[b] ? a : kept[b] && small[a] ? b : size[a] > size[b] || (size[a] === size[b] && a < b) ? a : b
          const go = stay === a ? b : a
          // What a detail takes in becomes part of it; a detail taken in is none any more.
          worth[stay] = kept[stay] ? worth[stay] * (size[stay] + size[go]) / size[stay] : 0
          reach[stay] = kept[stay] ? reach[stay] * (size[stay] + size[go]) / size[stay] : 0
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

// Smooth drawing. A label map drawn larger pixel by pixel shows every outline that is not level or
// upright as a staircase. `upscaleAreas` enlarges the map with the outlines as smooth lines instead.

// An outline is drawn at most this far from where it is in the label map, in pixels of that map.
const OUTLINE_SHIFT = 0.5
// A turn of an outline with at least this many straight pixels on both sides is a real corner (of
// a box, a roof) and stays where it is; a straight line in a pixel grid never has such a turn.
const CORNER_RUN = 3
// The top of a bend of at most this many pixels stays as it is.
const BEND_RUN = 2
// A point of an outline is evened out with its neighbours SMOOTH_ROUNDS x (run + 1) ^ 2 times,
// `run` being the longest straight piece it lies on: the longer the steps of a staircase, the
// further along the line they have to be spread. Never more than SMOOTH_ROUNDS_MOST times.
const SMOOTH_ROUNDS = 0.25
const SMOOTH_ROUNDS_MOST = 100
// A pixel whose middle lies exactly on an outline goes to the area on the left or above.
const SMOOTH_TIE = 0.02

// The top of a bend, `length` sides from point `from` on (`step` from point to point): a short one
// stays as it is, a longer one is held in its middle, so that what is thin or small is not drawn
// thinner and a round shape keeps its size.
function holdBend(stay, from, step, length) {
  if (length <= BEND_RUN) for (let i = 0; i <= length; i++) stay[from + i * step] = 1
  else { stay[from + (length >> 1) * step] = 1; stay[from + ((length + 1) >> 1) * step] = 1 }
}

/**
 * Where the outlines of a label map run when they are drawn as smooth lines: how far every corner
 * point of the pixel grid moves. The outlines are the sides of pixels between two labels; a
 * corner point with exactly two such sides is a point of one line. Each of these is evened out
 * with its two neighbours on the line, again and again, and never leaves the square of
 * OUTLINE_SHIFT around its place, so a staircase becomes the slanted line it stands for and
 * nothing moves by more than half a pixel. Points where three or four areas meet, ends at the
 * edge of the picture and real corners (CORNER_RUN) stay.
 * @returns {{dx: Float64Array, dy: Float64Array}}  per corner point (x, y) at y * (width + 1) + x
 */
export function outlineShifts(labels, width, height) {
  const across = width + 1
  const points = across * (height + 1)
  // Per corner point: the sides of the outline that leave it.
  const RIGHT = 1, DOWN = 2, LEFT = 4, UP = 8
  const links = new Uint8Array(points)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x < width - 1 && labels[p] !== labels[p + 1]) { links[y * across + x + 1] |= DOWN; links[(y + 1) * across + x + 1] |= UP }
      if (y < height - 1 && labels[p] !== labels[p + width]) { links[(y + 1) * across + x] |= RIGHT; links[(y + 1) * across + x + 1] |= LEFT }
    }
  }
  // The straight pieces: per point the length of the level and of the upright piece it lies on or ends.
  // A piece that turns the same way at both ends is the top of a bend (the end of a thin line, the
  // flat top of a round shape) and no step of a staircase: `stay` marks the points that hold it.
  const level = new Int32Array(points), upright = new Int32Array(points)
  const stay = new Uint8Array(points)
  for (let y = 1; y < height; y++) {
    let start = -1
    for (let x = 0; x <= width; x++) {
      const c = y * across + x
      if (start >= 0 && links[c] !== (LEFT | RIGHT)) {
        for (let i = start; i <= x; i++) level[y * across + i] = x - start
        const a = links[y * across + start], b = links[c]
        if ((a === (RIGHT | UP) && b === (LEFT | UP)) || (a === (RIGHT | DOWN) && b === (LEFT | DOWN))) holdBend(stay, y * across + start, 1, x - start)
        start = -1
      }
      if (start < 0 && (links[c] & RIGHT)) start = x
    }
  }
  for (let x = 1; x < width; x++) {
    let start = -1
    for (let y = 0; y <= height; y++) {
      const c = y * across + x
      if (start >= 0 && links[c] !== (UP | DOWN)) {
        for (let i = start; i <= y; i++) upright[i * across + x] = y - start
        const a = links[start * across + x], b = links[c]
        if ((a === (DOWN | LEFT) && b === (UP | LEFT)) || (a === (DOWN | RIGHT) && b === (UP | RIGHT))) holdBend(stay, start * across + x, across, y - start)
        start = -1
      }
      if (start < 0 && (links[c] & DOWN)) start = y
    }
  }
  // The points that move, and how many rounds each: rounds[c] = 0 for one that stays.
  const rounds = new Int32Array(points)
  const perRounds = new Int32Array(SMOOTH_ROUNDS_MOST + 2)
  let moving = 0
  for (let c = 0; c < points; c++) {
    const l = links[c]
    if (!l || (l & (l - 1)) === 0) continue // no outline, or its end at the edge of the picture
    const rest = l & (l - 1)
    if (rest & (rest - 1)) continue // three or four areas meet
    if (stay[c]) continue
    const turn = l !== (LEFT | RIGHT) && l !== (UP | DOWN)
    if (turn && level[c] >= CORNER_RUN && upright[c] >= CORNER_RUN) continue
    const run = Math.max(level[c], upright[c])
    rounds[c] = Math.min(SMOOTH_ROUNDS_MOST, Math.ceil(SMOOTH_ROUNDS * (run + 1) * (run + 1)))
    perRounds[rounds[c]]++
    moving++
  }
  // The moving points in a row, the ones with the most rounds first; `first` and `second` are the
  // two neighbours of each on its line, `ox` and `oy` where the middle between those lies.
  const from = new Int32Array(SMOOTH_ROUNDS_MOST + 2)
  for (let r = SMOOTH_ROUNDS_MOST; r >= 1; r--) from[r] = from[r + 1] + perRounds[r + 1]
  const until = from.slice() // until[r] = how many points have more than r - 1 rounds, filled below
  const list = new Int32Array(moving), first = new Int32Array(moving), second = new Int32Array(moving)
  const ox = new Float64Array(moving), oy = new Float64Array(moving)
  for (let c = 0; c < points; c++) {
    if (!rounds[c]) continue
    const i = until[rounds[c]]++
    list[i] = c
    let found = 0
    for (let side = 0; side < 4; side++) {
      if (!(links[c] & (1 << side))) continue
      const stepX = side === 0 ? 1 : side === 2 ? -1 : 0, stepY = side === 1 ? 1 : side === 3 ? -1 : 0
      if (found++ === 0) first[i] = c + stepY * across + stepX
      else second[i] = c + stepY * across + stepX
      ox[i] += stepX / 2; oy[i] += stepY / 2
    }
  }
  const dx = new Float64Array(points), dy = new Float64Array(points)
  const nextX = new Float64Array(moving), nextY = new Float64Array(moving)
  for (let round = 1; round <= SMOOTH_ROUNDS_MOST; round++) {
    const active = until[round] // the points with `round` rounds or more
    if (!active) break
    let moved = false
    for (let i = 0; i < active; i++) {
      const c = list[i], a = first[i], b = second[i]
      // Half way to the middle between its two neighbours, as far as its square lets it.
      let x = (dx[c] + ox[i] + (dx[a] + dx[b]) / 2) / 2, y = (dy[c] + oy[i] + (dy[a] + dy[b]) / 2) / 2
      if (x > OUTLINE_SHIFT) x = OUTLINE_SHIFT
      else if (x < -OUTLINE_SHIFT) x = -OUTLINE_SHIFT
      if (y > OUTLINE_SHIFT) y = OUTLINE_SHIFT
      else if (y < -OUTLINE_SHIFT) y = -OUTLINE_SHIFT
      if (x !== dx[c] || y !== dy[c]) moved = true
      nextX[i] = x; nextY[i] = y
    }
    for (let i = 0; i < active; i++) { dx[list[i]] = nextX[i]; dy[list[i]] = nextY[i] }
    if (!moved) break
  }
  return { dx, dy }
}

/**
 * A label map `scale` times as large, with the outlines of its areas as smooth lines instead of
 * enlarged pixel steps (`outlineShifts`). Every enlarged pixel has the label of the pixel it
 * comes from or, where an outline has moved over its middle, of the pixel on the other side of
 * that outline: never a label from further away, and none is left without. A pixel of the map
 * always keeps at least one of its enlarged pixels, so nothing small is drawn away.
 * @param {Int32Array} labels  label per pixel
 * @returns {Int32Array} label per pixel of the map of width * scale by height * scale
 */
export function upscaleAreas(labels, width, height, scale) {
  const big = width * scale
  const out = new Int32Array(big * height * scale)
  const { dx, dy } = outlineShifts(labels, width, height)
  const across = width + 1
  // Where along a side between two moved points the place `at` lies (0..1), the side running from `from` to `to`.
  const along = (at, from, to) => (to - from < 1e-9 ? 0.5 : at <= from ? 0 : at >= to ? 1 : (at - from) / (to - from))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, own = labels[p]
      const left = x > 0 && labels[p - 1] !== own, right = x < width - 1 && labels[p + 1] !== own
      const up = y > 0 && labels[p - width] !== own, down = y < height - 1 && labels[p + width] !== own
      const o = y * scale * big + x * scale
      for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) out[o + j * big + i] = own
      if (!left && !right && !up && !down) continue
      let changed = 0
      for (let j = 0; j < scale; j++) {
        const v = (j + 0.5) / scale
        for (let i = 0; i < scale; i++) {
          const u = (i + 0.5) / scale
          // The upright side nearest to this enlarged pixel, if it is an outline: how far the
          // outline has moved over it at this height (`overX`, more than 0 = past its middle).
          let overX = -1, overY = -1
          const nearLeft = u < 0.5, nearUp = v < 0.5
          if (nearLeft ? left : right) {
            const top = y * across + x + (nearLeft ? 0 : 1), bottom = top + across
            const t = along(y + v, y + dy[top], y + 1 + dy[bottom])
            const shift = dx[top] + t * (dx[bottom] - dx[top])
            overX = nearLeft ? shift - u + SMOOTH_TIE : -shift - (1 - u) - SMOOTH_TIE
          }
          if (nearUp ? up : down) {
            const start = (y + (nearUp ? 0 : 1)) * across + x, end = start + 1
            const t = along(x + u, x + dx[start], x + 1 + dx[end])
            const shift = dy[start] + t * (dy[end] - dy[start])
            overY = nearUp ? shift - v + SMOOTH_TIE : -shift - (1 - v) - SMOOTH_TIE
          }
          if (overX <= 0 && overY <= 0) continue
          // Two outlines over it: the one that has come further takes it.
          out[o + j * big + i] = overX >= overY ? labels[nearLeft ? p - 1 : p + 1] : labels[nearUp ? p - width : p + width]
          changed++
        }
      }
      // Nothing of the pixel would be left: it is drawn as it is.
      if (changed === scale * scale) for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) out[o + j * big + i] = own
    }
  }
  return out
}
