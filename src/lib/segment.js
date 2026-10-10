// Image segmentation into flat colour areas ("paint-by-numbers" style).
//
// 1. Optional box blur to suppress texture noise.
// 2. k-means++ clustering in OKLab -> one label per pixel.
// 3. Majority filter passes to smooth ragged edges.
// 4. Connected components; regions smaller than `minRegion` pixels are merged
//    into the neighbour they share the longest border with.
// 5. A label anchor per region (the pixel furthest from its border).
//
// Pure functions on typed arrays so it runs in a Web Worker and in tests.

import { srgbToLinear, linearToOklab, oklabToHex } from './color.js'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function boxBlur(rgba, width, height, radius) {
  if (radius < 1) return rgba
  const out = new Uint8ClampedArray(rgba.length)
  const tmp = new Float32Array(rgba.length)
  // horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx))
        const i = (y * width + xx) * 4
        r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++
      }
      const o = (y * width + x) * 4
      tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n
    }
  }
  // vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy))
        const i = (yy * width + x) * 4
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; n++
      }
      const o = (y * width + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return out
}

export function toOklabPixels(rgba, count) {
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i)
  const lab = new Float32Array(count * 3)
  for (let p = 0; p < count; p++) {
    const [L, a, b] = linearToOklab([lut[rgba[p * 4]], lut[rgba[p * 4 + 1]], lut[rgba[p * 4 + 2]]])
    lab[p * 3] = L; lab[p * 3 + 1] = a; lab[p * 3 + 2] = b
  }
  return lab
}

function dist2(lab, p, c, ci) {
  const dL = lab[p * 3] - c[ci * 3]
  const da = lab[p * 3 + 1] - c[ci * 3 + 1]
  const db = lab[p * 3 + 2] - c[ci * 3 + 2]
  return dL * dL + da * da + db * db
}

export function kmeans(lab, count, k, { iterations = 12, sampleSize = 30000, seed = 7 } = {}) {
  const rand = mulberry32(seed)
  const sampleN = Math.min(count, sampleSize)
  const sample = new Int32Array(sampleN)
  for (let i = 0; i < sampleN; i++) sample[i] = sampleN === count ? i : Math.floor(rand() * count)

  // k-means++ seeding on the sample
  const centroids = new Float32Array(k * 3)
  const first = sample[Math.floor(rand() * sampleN)]
  centroids.set(lab.subarray(first * 3, first * 3 + 3), 0)
  const d = new Float64Array(sampleN).fill(Infinity)
  for (let c = 1; c < k; c++) {
    let sum = 0
    for (let i = 0; i < sampleN; i++) {
      d[i] = Math.min(d[i], dist2(lab, sample[i], centroids, c - 1))
      sum += d[i]
    }
    let r = rand() * sum
    let chosen = sample[sampleN - 1]
    for (let i = 0; i < sampleN; i++) {
      r -= d[i]
      if (r <= 0) { chosen = sample[i]; break }
    }
    centroids.set(lab.subarray(chosen * 3, chosen * 3 + 3), c * 3)
  }

  // Lloyd iterations on the sample
  const assign = (p) => {
    let best = 0, bestD = Infinity
    for (let c = 0; c < k; c++) {
      const dd = dist2(lab, p, centroids, c)
      if (dd < bestD) { bestD = dd; best = c }
    }
    return best
  }
  for (let it = 0; it < iterations; it++) {
    const sums = new Float64Array(k * 3)
    const counts = new Int32Array(k)
    for (let i = 0; i < sampleN; i++) {
      const p = sample[i]
      const c = assign(p)
      sums[c * 3] += lab[p * 3]; sums[c * 3 + 1] += lab[p * 3 + 1]; sums[c * 3 + 2] += lab[p * 3 + 2]
      counts[c]++
    }
    for (let c = 0; c < k; c++) {
      if (!counts[c]) continue
      centroids[c * 3] = sums[c * 3] / counts[c]
      centroids[c * 3 + 1] = sums[c * 3 + 1] / counts[c]
      centroids[c * 3 + 2] = sums[c * 3 + 2] / counts[c]
    }
  }

  const labels = new Int32Array(count)
  for (let p = 0; p < count; p++) labels[p] = assign(p)
  return { labels, centroids }
}

export function majorityFilter(labels, width, height, k, passes) {
  let src = labels
  const votes = new Int32Array(k)
  for (let pass = 0; pass < passes; pass++) {
    const dst = new Int32Array(src.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        votes.fill(0)
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= width) continue
            votes[src[yy * width + xx]]++
          }
        }
        const own = src[y * width + x]
        let best = own
        for (let c = 0; c < k; c++) if (votes[c] > votes[best]) best = c
        dst[y * width + x] = votes[best] >= 5 ? best : own
      }
    }
    src = dst
  }
  return src
}

/** 4-connected components. Returns region id per pixel and the cluster of each region. */
export function connectedComponents(labels, width, height) {
  const regionMap = new Int32Array(labels.length).fill(-1)
  const regionCluster = []
  const regionSize = []
  const stack = new Int32Array(labels.length)
  for (let start = 0; start < labels.length; start++) {
    if (regionMap[start] !== -1) continue
    const id = regionCluster.length
    const cluster = labels[start]
    let top = 0, size = 0
    stack[top++] = start
    regionMap[start] = id
    while (top) {
      const p = stack[--top]
      size++
      const x = p % width, y = (p - x) / width
      const nbs = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]
      for (const q of nbs) {
        if (q >= 0 && regionMap[q] === -1 && labels[q] === cluster) {
          regionMap[q] = id
          stack[top++] = q
        }
      }
    }
    regionCluster.push(cluster)
    regionSize.push(size)
  }
  return { regionMap, regionCluster, regionSize }
}

/** Repeatedly merge regions below minRegion px into their longest-border neighbour's cluster. */
export function mergeSmallRegions(labels, width, height, minRegion) {
  let current = labels
  for (let round = 0; round < 6; round++) {
    const { regionMap, regionCluster, regionSize } = connectedComponents(current, width, height)
    const small = regionSize.map((s) => s < minRegion)
    if (!small.some(Boolean)) return current
    const border = new Map() // smallRegion -> Map(neighbourCluster -> count)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        const r = regionMap[p]
        if (!small[r]) continue
        const nbs = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]
        for (const q of nbs) {
          if (q < 0) continue
          const rq = regionMap[q]
          if (rq === r) continue
          if (!border.has(r)) border.set(r, new Map())
          const m = border.get(r)
          // Prefer merging into large neighbours: weight by their size.
          const c = regionCluster[rq]
          m.set(c, (m.get(c) || 0) + (small[rq] ? 0.25 : 1))
        }
      }
    }
    const newCluster = regionCluster.slice()
    for (const [r, m] of border) {
      let best = -1, bestCount = -1
      for (const [c, count] of m) if (count > bestCount) { bestCount = count; best = c }
      if (best >= 0) newCluster[r] = best
    }
    const next = new Int32Array(current.length)
    for (let p = 0; p < next.length; p++) next[p] = newCluster[regionMap[p]]
    current = next
  }
  return current
}

/** Chamfer distance to the region border; the max per region is a good label anchor. */
export function labelAnchors(regionMap, width, height, regionCount) {
  const INF = 1e9
  const dist = new Float32Array(regionMap.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const r = regionMap[p]
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        regionMap[p - 1] !== r || regionMap[p + 1] !== r || regionMap[p - width] !== r || regionMap[p + width] !== r
      dist[p] = edge ? 0 : INF
    }
  }
  const D = 1, D2 = 1.414
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (!dist[p]) continue
      dist[p] = Math.min(dist[p], dist[p - 1] + D, dist[p - width] + D, dist[p - width - 1] + D2, dist[p - width + 1] + D2)
    }
  }
  for (let y = height - 2; y >= 0; y--) {
    for (let x = width - 2; x > 0; x--) {
      const p = y * width + x
      if (!dist[p]) continue
      dist[p] = Math.min(dist[p], dist[p + 1] + D, dist[p + width] + D, dist[p + width + 1] + D2, dist[p + width - 1] + D2)
    }
  }
  const anchors = Array.from({ length: regionCount }, () => ({ x: 0, y: 0, d: -1 }))
  for (let p = 0; p < regionMap.length; p++) {
    const a = anchors[regionMap[p]]
    if (dist[p] > a.d) {
      a.d = dist[p]
      a.x = p % width
      a.y = (p - a.x) / width
    }
  }
  return anchors
}

/**
 * Full pipeline.
 * @param {Uint8ClampedArray} rgba image data at working resolution
 * @param {{colours:number, simplify:number}} options simplify 0..10
 */
export function segmentImage(rgba, width, height, { colours = 12, simplify = 4, seed = 7 } = {}) {
  const count = width * height
  const blurred = boxBlur(rgba, width, height, Math.round(simplify / 3))
  const lab = toOklabPixels(blurred, count)
  const k = Math.max(1, Math.min(colours, count))
  const { labels: raw, centroids } = kmeans(lab, count, k, { seed })

  const smoothed = majorityFilter(raw, width, height, k, Math.ceil(simplify / 2))
  const minRegion = Math.round(count * 0.00004 * Math.pow(simplify + 1, 2.2))
  const labels = mergeSmallRegions(smoothed, width, height, Math.max(2, (simplify + 1) ** 2, minRegion))

  // Recompute cluster colours from the actual (unblurred) pixels they cover.
  const sums = new Float64Array(k * 3)
  const counts = new Int32Array(k)
  const original = toOklabPixels(rgba, count)
  for (let p = 0; p < count; p++) {
    const c = labels[p]
    sums[c * 3] += original[p * 3]; sums[c * 3 + 1] += original[p * 3 + 1]; sums[c * 3 + 2] += original[p * 3 + 2]
    counts[c]++
  }
  const clusters = []
  for (let c = 0; c < k; c++) {
    const lab3 = counts[c]
      ? [sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]]
      : [centroids[c * 3], centroids[c * 3 + 1], centroids[c * 3 + 2]]
    clusters.push({ index: c, hex: oklabToHex(lab3), pixelCount: counts[c] })
  }

  const { regionMap, regionCluster, regionSize } = connectedComponents(labels, width, height)
  const anchors = labelAnchors(regionMap, width, height, regionCluster.length)
  const regions = regionCluster.map((cluster, id) => ({
    id,
    cluster,
    size: regionSize[id],
    anchorX: anchors[id].x,
    anchorY: anchors[id].y,
    anchorDist: anchors[id].d,
  }))

  // Clusters can end up empty after merging; callers skip those (pixelCount === 0).
  return { width, height, regionMap, regions, clusters }
}
