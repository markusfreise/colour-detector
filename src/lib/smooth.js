// Calm colour areas: the steps of `segmentImage` that keep noise out of the areas, decide which
// small things stay, join what is too alike to be painted apart and round the outlines.
//
// 1. The picture is cut into small compact patches that follow its edges (`compactPatches`);
//    where it is noise from pixel to pixel, into plain squares instead (`settlePatches`).
// 2. Every patch gets one robust colour, evened out with the patches around it that are nearly the
//    same colour (`patchColours`). Pixels then take the colour of their patch, so noise, grain and
//    JPEG blocks are gone before the colours are clustered, while an edge stays where it is.
// 3. After clustering, the details are found (`findDetails`): the small or thin areas that stand
//    out from what is around them (an eye, a letter, a wire). They are decided once, as a whole.
// 3b. Texture is told from details (`dropTexture`): one of many small pieces in a rough zone is none.
// 4. Areas join (`mergeAreas`): what is too small for a brush always, larger areas while it costs
//    the picture little. A detail stays as it was found until a step of Simplify drops it whole.
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
// A pixel that differs (by OWN_COLOUR) from all four pixels beside it stands alone; where more
// than RESTLESS of the pixels do, the picture is noise from pixel to pixel. (Small writing and a
// row of windows come to a third; noise in all three channels to three quarters and more.)
const ALONE = 4
const RESTLESS = 0.5
// How far the colour of a patch reaches into the patches around it, in patch sides.
const PATCH_REACH = 0.6
// Further than this many times that reach from its centre a patch counts for nothing.
const PATCH_REACH_END = 5
// The window of `roundOutlines` is a disc in which a pixel at the rim counts this much less than
// the one in the middle (the rim lies ROUND_FALLOFF standard deviations out).
const ROUND_FALLOFF = 1.5
// Part of the window around a pixel that a label must hold before the pixel can take it.
const MIN_SHARE = 0.2
// Votes are whole numbers: the pixel in the middle of a window counts this much, the others less.
const VOTE_WHOLE = 4096
// A detail differs at least this much (OKLab) from the colour around it ...
const DETAIL_CONTRAST = 0.12
// ... taken this many pixels away from it ...
const DETAIL_RING = 3
// ... where at most this part of the pixels is as close as DETAIL_ALIKE to its colour.
const DETAIL_ALIKE = 0.06
const DETAIL_ALIKE_SHARE = 0.25
// A large area can still be a detail at any step when it is thin: at most this many pixels
// per pixel of outline (a wire, a line of writing).
const DETAIL_THIN = 1.5
// Details of one colour this close together (pixels) are one group ...
const DETAIL_GROUP = 8
// ... when each is worth at least this part of what a detail on its own must be worth.
const DETAIL_WEAKEST = 0.5
// ... and counts as large as the largest of them, but no more than this many times its own size.
const DETAIL_SPAN = 8
// A would-be detail is texture when it stands out by less than this x the roughness of the
// ground around it x the crowd of would-be details it lies in (see `dropTexture`) ...
const TEXTURE = 1.8
// ... where pieces of other colours count up to this many.
const TEXTURE_CROWD = 3
// A zone is texture as a whole when its roughness x its number of would-be details reaches this.
const TEXTURE_ZONE = 0.2
// In a zone of texture an area that would be large enough elsewhere joins only a neighbour less
// than this (OKLab, see `apart`) from its colour: a window in a busy house front stays.
const TEXTURE_ALIKE = 0.14
// Below this lightness (OKLab) colours count as dark: see `apart`. Two colours are never taken
// to be less than DARK_LEAST of their distance apart.
const DARK = 0.35
const DARK_LEAST = 0.7

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
  for (let round = 0; round < PATCH_ROUNDS; round++) {
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
 * Undo the patches where the picture is noise from pixel to pixel (grain as strong as an edge, a
 * raster, a pattern of single pixels). There the patches follow the noise instead of taking it
 * out, so the pixels go back to the square of the grid they lie in, which then gets one colour.
 * Such a place is one where most pixels stand alone (ALONE, RESTLESS), counted over a square of
 * the grid and the eight around it. Writing and other fine drawing is not: its strokes are lines,
 * and a pixel of a line has pixels of its kind beside it. Neither is noise in black and white
 * only, where half the pixels beside a pixel are like it: that stays a picture of specks, which
 * Simplify takes away step by step.
 * Changes `patches.patchOf` in place.
 * @returns {Uint8Array|null} per patch: 1 = a square of noise; null when the picture has none
 */
export function settlePatches(lab, width, height, { patchOf, cols, rows }) {
  const sx = width / cols, sy = height / rows
  const differs = (p, q) => {
    const dL = lab[p * 3] - lab[q * 3], da = lab[p * 3 + 1] - lab[q * 3 + 1], db = lab[p * 3 + 2] - lab[q * 3 + 2]
    return dL * dL + da * da + db * db > OWN_COLOUR * OWN_COLOUR ? 1 : 0
  }
  // unlike[p] = how many of the pixels beside p differ from it.
  const unlike = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x < width - 1 && differs(p, p + 1)) { unlike[p]++; unlike[p + 1]++ }
      if (y < height - 1 && differs(p, p + width)) { unlike[p]++; unlike[p + width]++ }
    }
  }
  const alone = new Int32Array(cols * rows), sizes = new Int32Array(cols * rows)
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor(y / sy))
    for (let x = 0; x < width; x++) {
      const home = row * cols + Math.min(cols - 1, Math.floor(x / sx))
      sizes[home]++
      if (unlike[y * width + x] >= ALONE) alone[home]++
    }
  }
  const restless = new Uint8Array(cols * rows)
  let any = false
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let lone = 0, all = 0
      for (let rr = Math.max(0, row - 1); rr <= Math.min(rows - 1, row + 1); rr++) {
        for (let cc = Math.max(0, col - 1); cc <= Math.min(cols - 1, col + 1); cc++) { lone += alone[rr * cols + cc]; all += sizes[rr * cols + cc] }
      }
      if (lone > RESTLESS * all) { restless[row * cols + col] = 1; any = true }
    }
  }
  if (!any) return null
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor(y / sy))
    for (let x = 0; x < width; x++) {
      const home = row * cols + Math.min(cols - 1, Math.floor(x / sx))
      if (restless[home]) patchOf[y * width + x] = home
    }
  }
  return restless
}

/**
 * The picture with every pixel in the colour of its patch: the robust colour of the patch
 * (`robustColours`), evened out with the patches around it (`evenColours`) and run smoothly from
 * patch to patch (`spreadColours`). Noise that is larger than a patch goes, an edge between two
 * different colours stays. `blend` = the difference in OKLab at which a neighbour hardly counts;
 * `restless` = the squares of noise from `settlePatches`, which are evened out whatever their colours.
 * @returns {Float32Array} OKLab per pixel
 */
export function patchColours(lab, width, height, patches, { blend = 0.03, rounds = 4, restless = null } = {}) {
  const { robust, sizes } = robustColours(lab, patches.patchOf, patches.cols * patches.rows)
  const even = evenColours(robust, sizes, patches.cols, patches.rows, blend, rounds, restless)
  return spreadColours(lab, width, height, patches, sizes, robust, even, blend, restless)
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
 * neighbour counts by its size and the less the further its colour is away. Between two patches
 * marked in `restless` the colour does not count: one square of noise is too small to tell its colour.
 * @returns {Float64Array} OKLab per patch
 */
export function evenColours(colours, sizes, cols, rows, blend, rounds, restless = null) {
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
            const w = restless && restless[c] && restless[q] ? sizes[q] : sizes[q] * Math.exp(-(dL * dL + da * da + db * db) * falloff)
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
 * except in a square of noise (`restless`, from `settlePatches`).
 * @param {Float64Array} colours  OKLab per patch, after `evenColours`
 * @returns {Float32Array} OKLab per pixel
 */
export function spreadColours(lab, width, height, { patchOf, cols, rows }, sizes, robust, colours, blend, restless = null) {
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
  // How much a patch counts by distance is the product of what it counts along x and along y:
  // both are worked out once per patch, for the columns and rows within `span` of its centre.
  const span = Math.ceil(PATCH_REACH_END * reach), across = 2 * span + 1
  const nearX = new Float32Array(n * across), nearY = new Float32Array(n * across)
  const fromX = new Int32Array(n), fromY = new Int32Array(n)
  for (let c = 0; c < n; c++) {
    if (!sizes[c]) continue
    fromX[c] = Math.round(centre[c * 2]) - span; fromY[c] = Math.round(centre[c * 2 + 1]) - span
    for (let i = 0; i < across; i++) {
      const dx = fromX[c] + i - centre[c * 2], dy = fromY[c] + i - centre[c * 2 + 1]
      nearX[c * across + i] = Math.exp(-dx * dx * nearness); nearY[c * across + i] = Math.exp(-dy * dy * nearness)
    }
  }
  const out = new Float32Array(count * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const c = patchOf[p]
      const oL = lab[p * 3] - robust[c * 3], oa = lab[p * 3 + 1] - robust[c * 3 + 1], ob = lab[p * 3 + 2] - robust[c * 3 + 2]
      // Not in a square of noise, though: there every pixel is far from the colour of its square.
      if (oL * oL + oa * oa + ob * ob > OWN_COLOUR * OWN_COLOUR && !(restless && restless[c])) {
        out[p * 3] = lab[p * 3]; out[p * 3 + 1] = lab[p * 3 + 1]; out[p * 3 + 2] = lab[p * 3 + 2]
        continue
      }
      const row = Math.floor(c / cols), col = c - row * cols
      let L = 0, a = 0, b = 0, total = 0
      for (let i = 0; i < 9; i++) {
        const like = alike[c * 9 + i]
        if (!like) continue
        const q = (row + Math.floor(i / 3) - 1) * cols + col + (i % 3) - 1
        const ix = x - fromX[q], iy = y - fromY[q]
        if (ix < 0 || ix >= across || iy < 0 || iy >= across) continue
        const w = like * nearX[q * across + ix] * nearY[q * across + iy]
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
 * Pixels marked in `fixed` (the details) keep their label, so a detail loses nothing. They do
 * count for the pixels around them: a dent in the outline of a detail is filled like any other,
 * by which a detail can gain a few pixels. With `only` (a mask) nothing outside it is changed.
 */
export function roundOutlines(labels, width, height, k, { radius = 3, passes = 2, fixed = null, only = null } = {}) {
  if (radius < 1 || passes < 1) return labels
  const sigma = radius / ROUND_FALLOFF
  const offX = [], offY = [], offW = []
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // The disc: every pixel whose middle is within radius + 1/2 of the middle of the window.
      if (dx * dx + dy * dy > (radius + 0.5) * (radius + 0.5)) continue
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
      offX.push(dx); offY.push(dy); offW.push(w)
    }
  }
  const taps = offW.length
  // Whole numbers, so that equal votes are equal whatever the order they are added in.
  const weight = Int32Array.from(offW, (w) => Math.round(w * VOTE_WHOLE))
  let all = 0
  for (let i = 0; i < taps; i++) all += weight[i]
  const least = MIN_SHARE * all
  const shift = Int32Array.from(offX, (dx, i) => offY[i] * width + dx)
  const votes = new Int32Array(k)
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
          if (c === own || votes[c] < least) continue
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
 * - it has `minSize` to `maxSize` pixels, or more when it is thin (DETAIL_THIN). `room` says
 *   how much: the size of the area, or 0 when it is thin, so that the caller can ask for less
 *   than `maxSize` step by step;
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
 * together; but none more than 1 / DETAIL_WEAKEST times its own worth. In the same way a detail
 * counts as large as the largest of its group, or as all the would-be details it touches taken
 * together when that is more (a quote mark with its soft rim), up to DETAIL_SPAN times its own
 * size (the dot of an i): `span`, which the caller can ask a least value of as well.
 * Texture is no detail, however strong: with `photo` (the picture before the noise was taken
 * out) the pieces that are grains of a rough zone are left out, see `dropTexture`.
 * @param {Float32Array} lab  colour per pixel
 * @param {Float32Array} [options.photo]  colour per pixel as in the photo
 * @param {number} [options.cell]  side of the cells texture is counted in, in pixels
 * @param {number} [options.pieceSize]  from this size on a piece that is not thin is never texture
 * @param {Int32Array} [options.kindOf]  per label, its kind (labels of one kind are one colour to the eye)
 * @param {Uint8Array} [options.textured]  zeros; set to 1 for every pixel in a zone of texture
 * @returns {{worth: Float32Array, span: Int32Array, room: Int32Array}} per pixel: the worth of the
 *   detail it belongs to, the size it counts as and the room it takes; all 0 where there is none
 */
export function findDetails(labels, lab, width, height, { minSize = 1, maxSize = Infinity, photo = null, cell = 16, pieceSize = Infinity, kindOf = null, textured = null } = {}) {
  const total = labels.length
  const { areaOf, labelOf, sizeOf, count } = findAreas(labels, width, height)
  // The pixels of every area in a row: first[r] .. first[r + 1] in `pixels`.
  const first = new Int32Array(count + 1)
  for (let r = 0; r < count; r++) first[r + 1] = first[r] + sizeOf[r]
  const filled = first.slice(0, count)
  const pixels = new Int32Array(total)
  for (let p = 0; p < total; p++) pixels[filled[areaOf[p]]++] = p
  const ring = [-DETAIL_RING, DETAIL_RING, -DETAIL_RING * width, DETAIL_RING * width]
  // worth[r] = what losing area r would cost; -1 when it cannot be a detail.
  const worth = new Float64Array(count).fill(-1)
  const thin = new Uint8Array(count)
  const colour = new Float64Array(count * 3), standing = new Float64Array(count)
  for (let r = 0; r < count; r++) {
    const size = sizeOf[r]
    if (size < minSize) continue
    let L = 0, a = 0, b = 0
    for (let i = first[r]; i < first[r + 1]; i++) { const p = pixels[i]; L += lab[p * 3]; a += lab[p * 3 + 1]; b += lab[p * 3 + 2] }
    L /= size; a /= size; b /= size
    let outline = 0, around = 0, alike = 0, sL = 0, sa = 0, sb = 0, sq = 0
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
        sq += lab[q * 3] * lab[q * 3] + lab[q * 3 + 1] * lab[q * 3 + 1] + lab[q * 3 + 2] * lab[q * 3 + 2]
        around++
      }
    }
    const dL = sL / around - L, da = sa / around - a, db = sb / around - b
    const contrast2 = dL * dL + da * da + db * db
    if (!around || !outline || alike > around * DETAIL_ALIKE_SHARE) continue
    if (contrast2 < DETAIL_CONTRAST * DETAIL_CONTRAST) continue
    thin[r] = size <= outline * DETAIL_THIN ? 1 : 0
    if (size > maxSize && !thin[r]) continue
    worth[r] = (size / outline) * contrast2
    colour[r * 3] = L; colour[r * 3 + 1] = a; colour[r * 3 + 2] = b
    standing[r] = Math.sqrt(contrast2) * size / outline
  }
  if (photo) {
    // The kind of every area: that of its label, or the label itself.
    const kind = new Int32Array(count)
    let kinds = 0
    for (let r = 0; r < count; r++) {
      kind[r] = kindOf ? kindOf[labelOf[r]] : labelOf[r]
      if (kind[r] >= kinds) kinds = kind[r] + 1
    }
    dropTexture(worth, standing, thin, kind, kinds, areaOf, sizeOf, first, pixels, lab, photo, width, height, cell, pieceSize, textured)
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
  // Would-be details that touch are one thing to the eye, whatever their colours (the pupil in an
  // eye, a quote mark with its soft rim): together[r] = the area that stands for those around r.
  const together = new Int32Array(count)
  for (let r = 0; r < count; r++) together[r] = r
  const whole = (r) => {
    while (together[r] !== r) { together[r] = together[together[r]]; r = together[r] }
    return r
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, r = areaOf[p]
      if (worth[r] < 0) continue
      for (let side = 0; side < 2; side++) {
        if (side === 0 ? x === width - 1 : y === height - 1) continue
        const other = areaOf[p + (side === 0 ? 1 : width)]
        if (other === r || worth[other] < 0) continue
        const g = whole(r), h = whole(other)
        if (g !== h) together[Math.max(g, h)] = Math.min(g, h)
      }
    }
  }
  const best = new Float64Array(count)
  const largest = new Int32Array(count), touching = new Int32Array(count)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    const g = head(r)
    if (worth[r] > best[g]) best[g] = worth[r]
    if (sizeOf[r] > largest[g]) largest[g] = sizeOf[r]
    touching[whole(r)] += sizeOf[r]
  }
  const out = new Float32Array(total)
  const span = new Int32Array(total), room = new Int32Array(total)
  for (let r = 0; r < count; r++) {
    if (worth[r] < 0) continue
    const g = head(r)
    const value = Math.min(best[g], worth[r] / DETAIL_WEAKEST)
    const counts = Math.min(Math.max(largest[g], touching[whole(r)]), sizeOf[r] * DETAIL_SPAN)
    const takes = thin[r] ? 0 : sizeOf[r]
    for (let i = first[r]; i < first[r + 1]; i++) { out[pixels[i]] = value; span[pixels[i]] = counts; room[pixels[i]] = takes }
  }
  return { worth: out, span, room }
}

/**
 * Texture is no detail. Takes out of `worth` (sets to -1) every would-be detail that is one of
 * many in a zone whose ground is rough: heather, leaves, gravel, the dashes of a wall in shadow.
 * A letter is one of many too, but on a calm ground; an eye lies in grainy skin, but nearly alone.
 * - How rough the ground is: what the patches took out of the photo there (the mean distance of
 *   a pixel of `photo` to its colour in `lab`), over the pixels that belong to no would-be detail.
 * - How many pieces there are: every piece counts 1 in all, shared out over the cells its pixels
 *   lie in, so a long wire counts little in each of them.
 * Both are taken over a zone of 3 x 3 cells of `cell` pixels a side (the caller scales `cell`
 * with the picture) and are per zone of full size, so a zone at the edge of the picture counts
 * like any other. A piece is looked at where it lies: the mean over its pixels of the zones
 * around them, without itself.
 * A piece is texture when it stands out (contrast x thickness, `standing`) by less than
 * TEXTURE x roughness x crowd. The crowd is the pieces around it, of whatever colour, but no more
 * than TEXTURE_CROWD of them, plus the pieces of its own kind (`kind`: the mix its colour is a
 * wash of): so the parts of a small face, which are many but of many colours and stand out, stay,
 * while the leaves of a tree, which are many of one colour, go however strong they are.
 * A piece of `pieceSize` pixels or more is never texture, unless it is thin: what is as large as
 * an area that stays anyway is a thing (a window, a person), not a grain.
 * With `textured` (a mask of zeros) the caller is told where the zones of texture lie: those
 * whose roughness x pieces reaches TEXTURE_ZONE.
 */
function dropTexture(worth, standing, thin, kind, kinds, areaOf, sizeOf, first, pixels, lab, photo, width, height, cell, pieceSize, textured) {
  const count = worth.length
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell), cells = cols * rows
  const rough = new Float64Array(cells), ground = new Float64Array(cells), all = new Float64Array(cells)
  // pieces[z * kinds + label] = the pieces of that label in cell z.
  const pieces = new Float32Array(cells * kinds)
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * cols
    for (let x = 0; x < width; x++) {
      const p = y * width + x, z = row + Math.floor(x / cell), r = areaOf[p]
      all[z]++
      if (worth[r] >= 0) { pieces[z * kinds + kind[r]] += 1 / sizeOf[r]; continue }
      const dL = photo[p * 3] - lab[p * 3], da = photo[p * 3 + 1] - lab[p * 3 + 1], db = photo[p * 3 + 2] - lab[p * 3 + 2]
      rough[z] += Math.sqrt(dL * dL + da * da + db * db)
      ground[z]++
    }
  }
  // Per cell, for the zone around it: the roughness of its ground and its pieces, of every label
  // and of all together, per zone of full size.
  const zoneRough = new Float64Array(cells), zonePieces = new Float32Array(cells * kinds), zoneAll = new Float64Array(cells)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const z = row * cols + col
      let sum = 0, on = 0, there = 0
      for (let rr = Math.max(0, row - 1); rr <= Math.min(rows - 1, row + 1); rr++) {
        for (let cc = Math.max(0, col - 1); cc <= Math.min(cols - 1, col + 1); cc++) {
          const q = rr * cols + cc
          sum += rough[q]; on += ground[q]; there += all[q]
          for (let k = 0; k < kinds; k++) zonePieces[z * kinds + k] += pieces[q * kinds + k]
        }
      }
      zoneRough[z] = on ? sum / on : 0
      const full = (9 * cell * cell) / there
      let crowd = 0
      for (let k = 0; k < kinds; k++) { zonePieces[z * kinds + k] *= full; crowd += zonePieces[z * kinds + k] }
      zoneAll[z] = crowd
      if (!textured || zoneRough[z] * crowd < TEXTURE_ZONE) continue
      const x1 = Math.min(width, (col + 1) * cell), y1 = Math.min(height, (row + 1) * cell)
      for (let y = row * cell; y < y1; y++) for (let x = col * cell; x < x1; x++) textured[y * width + x] = 1
    }
  }
  for (let r = 0; r < count; r++) {
    // A piece as large as an area that stays anyway is a thing, not a grain; unless it is thin.
    if (worth[r] < 0 || (sizeOf[r] >= pieceSize && !thin[r])) continue
    let level = 0, crowd = 0, own = 0
    for (let i = first[r]; i < first[r + 1]; i++) {
      const x = pixels[i] % width, y = (pixels[i] - x) / width
      const z = Math.floor(y / cell) * cols + Math.floor(x / cell)
      level += zoneRough[z]; crowd += zoneAll[z]; own += zonePieces[z * kinds + kind[r]]
    }
    level /= sizeOf[r]
    own = Math.max(0, own / sizeOf[r] - 1)
    crowd = Math.min(TEXTURE_CROWD, Math.max(0, crowd / sizeOf[r] - 1)) + own
    if (standing[r] < TEXTURE * level * crowd) standing[r] = -1
  }
  // Decided for all at once, on what could be a detail before this.
  for (let r = 0; r < count; r++) if (worth[r] >= 0 && standing[r] < 0) worth[r] = -1
}

/**
 * How far apart two colours are for joining areas: the square of their distance in OKLab, counted
 * less when both are dark (below DARK in lightness). Two darks that the numbers tell apart look
 * alike on paper, so the patches of a shadow run together; a dark eye on light skin counts in full.
 */
export function apart(L1, a1, b1, L2, a2, b2) {
  const dL = L1 - L2, da = a1 - a2, db = b1 - b2
  const lighter = L1 > L2 ? L1 : L2
  const seen = lighter >= DARK ? 1 : Math.max(DARK_LEAST, lighter / DARK)
  return (dL * dL + da * da + db * db) * seen * seen
}

/**
 * Join areas of a label map until every area left is worth painting on its own, in `stages`: each
 * a `{ minSize, limit, detailLimit, detailSize, detailRoom, floor }`, worked through one after the other on what the one
 * before left. So the areas of a later stage are always made of whole areas of an earlier one, and
 * raising the stages step by step (Simplify) can only lower the number of areas.
 * In a stage one of three things holds for an area:
 * - it is a detail (its pixels are worth `detailLimit` or more on average, it counts as
 *   `detailSize` pixels or more and takes no more room than `detailRoom`, see `findDetails`
 *   for `details`): it stays as it is. It takes nothing in and joins nothing but another detail
 *   that it is alike enough (`limit`), so its colour and its outline stay those that were found;
 * - else, when it is smaller than `minSize` pixels: it joins the neighbour that costs least,
 *   whatever the cost, but never a detail. In a zone of texture (most of its pixels inside
 *   `rough`, a mask) the least size is `roughSize` of the stage, for areas and for details
 *   alike; but an area that is only too small by that joins nothing it stands out from
 *   (TEXTURE_ALIKE), so heather runs together and a window in a busy house front stays. One with nothing but details around it stays (the
 *   inside of a letter), and takes the label of the ground the details lie on when it is nearly
 *   that colour;
 * - an area that is large enough joins a neighbour only while that costs less than `limit`,
 *   cheapest pair first.
 * An area under `floor` pixels never stays, detail or not, and joins whatever costs least.
 * The cost of joining two areas is what the picture loses: how far apart their colours are
 * (`apart`) x the pixels that change colour (about the size of the smaller one) / the length of
 * the outline that goes. So patches of nearly one colour inside a coat or a cheek run together,
 * and two large areas with a short common outline stay apart.
 * The joined area takes the label of the larger of the two.
 * For an area with most of its pixels inside `where` (a mask, 1 = inside) the stage does not
 * count: `inside` (a stage of its own) is used at every stage.
 *
 * Works in rounds on the list of neighbours. At the start of a round every area is sized up (detail,
 * too small, its colour) and picks its cheapest neighbour; then two areas that picked each other
 * join, and a small area joins the one it picked. An area that has taken one in does not go into
 * another in the same round, and nothing joins an area that has just gone: what was worked out at
 * the start of the round holds for every join in it. The first area with a pick always joins, so
 * a round leaves fewer areas or is the last of its stage, and no limit on the rounds is needed.
 * On equal cost the neighbour with the lower number is picked; areas are numbered row by row.
 * @param {Float32Array} lab  colour per pixel
 * @param {Array<{minSize?: number, roughSize?: number, limit?: number, detailLimit?: number, detailSize?: number, detailRoom?: number, floor?: number}>} stages
 * @param {{worth: Float32Array, span: Int32Array, room: Int32Array}} [options.details]  from `findDetails`
 */
export function mergeAreas(labels, lab, width, height, stages, { details = null, where = null, inside = null, rough = null } = {}) {
  const total = labels.length
  const { areaOf, labelOf, sizeOf, count } = findAreas(labels, width, height)
  if (count < 2) return labels
  // Per area: size, sum of its colours, sum of the worth of its pixels as details, pixels in `where`.
  const size = Float64Array.from(sizeOf)
  const sum = new Float64Array(count * 3)
  const worth = new Float64Array(count), within = new Float64Array(count), coarse = new Float64Array(count)
  const span = new Int32Array(count), room = new Int32Array(count)
  for (let p = 0; p < total; p++) {
    const r = areaOf[p]
    sum[r * 3] += lab[p * 3]; sum[r * 3 + 1] += lab[p * 3 + 1]; sum[r * 3 + 2] += lab[p * 3 + 2]
    if (details) {
      worth[r] += details.worth[p]
      if (details.span[p] > span[r]) span[r] = details.span[p]
      if (details.room[p] > room[r]) room[r] = details.room[p]
    }
    if (where && where[p]) within[r]++
    if (rough && rough[p]) coarse[r]++
  }
  // The neighbours: one entry per pixel side between two areas (lower area first), then put in
  // order and counted: pairs of areas with the length of their common outline.
  let sides = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (x < width - 1 && areaOf[p] !== areaOf[p + 1]) sides++
      if (y < height - 1 && areaOf[p] !== areaOf[p + width]) sides++
    }
  }
  const pairA = new Int32Array(sides), pairB = new Int32Array(sides), lengths = new Int32Array(sides)
  sides = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, r = areaOf[p]
      if (x < width - 1 && r !== areaOf[p + 1]) {
        const q = areaOf[p + 1]
        pairA[sides] = r < q ? r : q; pairB[sides] = r < q ? q : r; lengths[sides++] = 1
      }
      if (y < height - 1 && r !== areaOf[p + width]) {
        const q = areaOf[p + width]
        pairA[sides] = r < q ? r : q; pairB[sides] = r < q ? q : r; lengths[sides++] = 1
      }
    }
  }
  const work = { first: new Int32Array(count + 1), slot: new Int32Array(count), b: new Int32Array(sides), lengths: new Int32Array(sides) }
  let pairs = combinePairs(pairA, pairB, lengths, sides, count, work)

  // into[r] = the area r has joined (itself when it has joined none).
  const into = new Int32Array(count)
  for (let r = 0; r < count; r++) into[r] = r
  // Per area, for the round at hand: the cost up to which it joins, whether it is a detail,
  // whether it is too small to stay, whether it is under the floor, whether it has taken one in.
  const limitOf = new Float64Array(count)
  const kept = new Uint8Array(count), small = new Uint8Array(count), tiny = new Uint8Array(count), soft = new Uint8Array(count)
  const open = new Uint8Array(count), grown = new Uint8Array(count)
  const pick = new Int32Array(count)
  const least = new Float64Array(count)
  // Area `go` becomes part of area `stay`.
  const join = (stay, go) => {
    into[go] = stay
    within[stay] += within[go]
    coarse[stay] += coarse[go]
    size[stay] += size[go]
    sum[stay * 3] += sum[go * 3]; sum[stay * 3 + 1] += sum[go * 3 + 1]; sum[stay * 3 + 2] += sum[go * 3 + 2]
  }
  for (const stage of stages) {
    for (;;) {
      // Two areas that came to lie side by side with one label are one area to the eye.
      let joined = false
      for (let i = 0; i < pairs; i++) {
        let a = pairA[i], b = pairB[i]
        while (into[a] !== a) a = into[a]
        while (into[b] !== b) b = into[b]
        if (a === b || labelOf[a] !== labelOf[b]) continue
        const stay = size[a] >= size[b] ? a : b, go = stay === a ? b : a
        worth[stay] += worth[go]
        if (span[go] > span[stay]) span[stay] = span[go]
        room[stay] += room[go]
        join(stay, go)
        joined = true
      }
      if (!joined) {
        for (let r = 0; r < count; r++) {
          if (into[r] !== r) continue
          const rule = inside && within[r] * 2 > size[r] ? inside : stage
          // In a zone of texture the smallest area is larger, and so is the largest detail.
          const inTexture = rule.roughSize > 0 && coarse[r] * 2 > size[r]
          const enough = inTexture ? rule.roughSize : rule.minSize ?? 1
          limitOf[r] = rule.limit ?? 0
          tiny[r] = size[r] < (rule.floor ?? 1) ? 1 : 0
          kept[r] = !tiny[r] && worth[r] > 0 && worth[r] >= (rule.detailLimit ?? Infinity) * size[r] && span[r] >= (rule.detailSize ?? 0) && room[r] <= (inTexture ? Math.max(rule.roughSize, rule.detailRoom ?? Infinity) : rule.detailRoom ?? Infinity) ? 1 : 0
          small[r] = tiny[r] || (!kept[r] && size[r] < enough) ? 1 : 0
          // Too small only because it lies in texture: it joins what it does not stand out from.
          soft[r] = small[r] && size[r] >= (rule.minSize ?? 1) ? 1 : 0
          open[r] = 0
          grown[r] = 0
          pick[r] = -1
          least[r] = Infinity
        }
        // An area with nothing but details around it is part of them: it stays too.
        for (let i = 0; i < pairs; i++) {
          if (!kept[pairB[i]]) open[pairA[i]] = 1
          if (!kept[pairA[i]]) open[pairB[i]] = 1
        }
        for (let i = 0; i < pairs; i++) {
          const a = pairA[i], b = pairB[i]
          const far = apart(sum[a * 3] / size[a], sum[a * 3 + 1] / size[a], sum[a * 3 + 2] / size[a], sum[b * 3] / size[b], sum[b * 3 + 1] / size[b], sum[b * 3 + 2] / size[b])
          const cost = far * (size[a] * size[b] / (size[a] + size[b])) / lengths[i]
          const alike = far < TEXTURE_ALIKE * TEXTURE_ALIKE
          // Two areas that are large enough join only when it is cheap enough for both, and a
          // detail only with a detail. A small one joins what is no detail.
          const free = kept[a] === kept[b] && cost < Math.min(limitOf[a], limitOf[b])
          const aGoes = free || (small[a] && (tiny[a] || (!kept[b] && open[a] && (alike || !soft[a]))))
          const bGoes = free || (small[b] && (tiny[b] || (!kept[a] && open[b] && (alike || !soft[b]))))
          if (aGoes && (cost < least[a] || (cost === least[a] && b < pick[a]))) { least[a] = cost; pick[a] = b }
          if (bGoes && (cost < least[b] || (cost === least[b] && a < pick[b]))) { least[b] = cost; pick[b] = a }
        }
        for (let r = 0; r < count; r++) {
          const other = pick[r]
          if (other < 0 || into[r] !== r || grown[r] || into[other] !== other) continue
          const mutual = pick[other] === r
          if (!small[r] && (!mutual || grown[other])) continue
          // The larger one stays (the lower one when they are equal); a small one that was not
          // picked back goes into the one it picked.
          const stay = !mutual || size[other] > size[r] || (size[other] === size[r] && other < r) ? other : r
          const go = stay === r ? other : r
          if (grown[go]) continue
          // Two details are one detail; a detail that is taken in is none any more.
          worth[stay] = kept[stay] && kept[go] ? worth[stay] + worth[go] : kept[stay] ? worth[stay] : 0
          if (kept[go] && span[go] > span[stay]) span[stay] = span[go]
          if (kept[go]) room[stay] += room[go]
          join(stay, go)
          grown[stay] = 1
          joined = true
        }
      }
      if (!joined) break
      // The neighbours of the joined areas: the same pairs under their new numbers, counted again.
      let left = 0
      for (let i = 0; i < pairs; i++) {
        let a = pairA[i], b = pairB[i]
        while (into[a] !== a) a = into[a]
        while (into[b] !== b) b = into[b]
        if (a === b) continue
        pairA[left] = a < b ? a : b; pairB[left] = a < b ? b : a
        lengths[left++] = lengths[i]
      }
      pairs = combinePairs(pairA, pairB, lengths, left, count, work)
    }
  }
  // What has nothing but details around it (a detail itself or not) and less than the contrast of
  // a detail to the ground they lie on is that ground seen through them (the inside of an o): it
  // takes the label of the ground, so that it is painted with it. The flags are those of the last
  // round, which joined nothing.
  if (details) {
    // ground[d] = the area a detail lies on: its neighbour with the longest common outline that
    // is no detail and large enough to stay. through[r] = the same for a closed-in area, by way of
    // the detail it shares most outline with. shared[r] = the length of that outline.
    const ground = new Int32Array(count).fill(-1), through = new Int32Array(count).fill(-1)
    const shared = new Int32Array(count)
    for (let i = 0; i < pairs; i++) {
      const a = pairA[i], b = pairB[i]
      if (kept[a] && !kept[b] && !small[b] && lengths[i] > shared[a]) { shared[a] = lengths[i]; ground[a] = b }
      if (kept[b] && !kept[a] && !small[a] && lengths[i] > shared[b]) { shared[b] = lengths[i]; ground[b] = a }
    }
    shared.fill(0)
    for (let i = 0; i < pairs; i++) {
      const a = pairA[i], b = pairB[i]
      if (!open[a] && kept[b] && ground[b] >= 0 && lengths[i] > shared[a]) { shared[a] = lengths[i]; through[a] = ground[b] }
      if (!open[b] && kept[a] && ground[a] >= 0 && lengths[i] > shared[b]) { shared[b] = lengths[i]; through[b] = ground[a] }
    }
    for (let r = 0; r < count; r++) {
      const g = through[r]
      if (g < 0 || into[r] !== r) continue
      const far = apart(sum[r * 3] / size[r], sum[r * 3 + 1] / size[r], sum[r * 3 + 2] / size[r], sum[g * 3] / size[g], sum[g * 3 + 1] / size[g], sum[g * 3 + 2] / size[g])
      if (far < DETAIL_CONTRAST * DETAIL_CONTRAST) labelOf[r] = labelOf[g]
    }
  }
  const out = new Int32Array(total)
  for (let p = 0; p < total; p++) {
    let r = areaOf[p]
    while (into[r] !== r) r = into[r]
    out[p] = labelOf[r]
  }
  return out
}

// Put the first `n` pairs (a[i] < b[i]) in order of `a` and add up the lengths of equal pairs, in
// place. `work` holds arrays to work in: first (areas + 1), slot (areas), b and lengths (pairs).
// @returns {number} how many different pairs are left
function combinePairs(a, b, lengths, n, areas, work) {
  const first = work.first, slot = work.slot
  first.fill(0)
  for (let i = 0; i < n; i++) first[a[i] + 1]++
  for (let r = 0; r < areas; r++) first[r + 1] += first[r]
  // The pairs of every area in a row, in the order they came.
  for (let i = 0; i < n; i++) {
    const at = first[a[i]]++
    work.b[at] = b[i]; work.lengths[at] = lengths[i]
  }
  // first[r] is now the end of the row of r, which is where the row of r + 1 starts.
  slot.fill(-1)
  let left = 0, start = 0
  for (let r = 0; r < areas; r++) {
    const from = left
    for (let i = start; i < first[r]; i++) {
      const q = work.b[i]
      if (slot[q] >= from) { lengths[slot[q]] += work.lengths[i]; continue }
      slot[q] = left
      a[left] = r; b[left] = q; lengths[left++] = work.lengths[i]
    }
    start = first[r]
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
// A pixel whose middle lies exactly on an outline goes to the area on the left of it (above it,
// where the outline is level), whichever way the outline runs: a staircase of one pixel up and one
// along is then drawn in half steps, and a thin slanted stripe gains on one side what it loses on
// the other.
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
            overX = (nearLeft ? shift - u : -shift - (1 - u)) + (nearLeft ? SMOOTH_TIE : -SMOOTH_TIE)
          }
          if (nearUp ? up : down) {
            const start = (y + (nearUp ? 0 : 1)) * across + x, end = start + 1
            const t = along(x + u, x + dx[start], x + 1 + dx[end])
            const shift = dy[start] + t * (dy[end] - dy[start])
            // In the corner of a staircase the upright side decides for both, so that the two agree.
            const first = (nearLeft ? left : right) ? nearLeft : nearUp
            overY = (nearUp ? shift - v : -shift - (1 - v)) + (first ? SMOOTH_TIE : -SMOOTH_TIE)
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
