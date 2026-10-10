import Foundation

// Image segmentation into flat colour areas ("paint-by-numbers" style).
// A port of src/lib/segment.js; keep the two in step.
//
// 1. Optional box blur to suppress texture noise.
// 2. Clustering into mixes (absorbance directions) and their washes -> one label per pixel.
// 3. Majority filter passes to smooth ragged edges.
// 4. Connected components; regions smaller than `minRegion` pixels are merged
//    into the neighbour they share the longest border with.
// 5. A label anchor per region (the pixel furthest from its border).

struct Segmentation: Sendable {
    struct Region: Sendable {
        let id: Int
        let cluster: Int
        let size: Int
        let anchorX: Int
        let anchorY: Int
        let anchorDist: Float
    }

    struct Cluster: Sendable {
        let index: Int
        /// The mix this colour is a wash of.
        let group: Int
        /// Wash within the mix, 0 = lightest.
        let level: Int
        let hex: String
        let pixelCount: Int
    }

    let width: Int
    let height: Int
    /// Region id per pixel.
    let regionMap: [Int32]
    let regions: [Region]
    let clusters: [Cluster]
}

enum Segmenter {
    /// Small seeded random generator, so the same picture always gives the same areas.
    struct Mulberry32 {
        private var a: UInt32

        init(seed: UInt32) { a = seed }

        mutating func next() -> Double {
            a = a &+ 0x6d2b79f5
            var t = a
            t = (t ^ (t >> 15)) &* (t | 1)
            t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
            return Double(t ^ (t >> 14)) / 4294967296
        }
    }

    static func boxBlur(_ rgba: [UInt8], _ width: Int, _ height: Int, radius: Int) -> [UInt8] {
        if radius < 1 { return rgba }
        var out = [UInt8](repeating: 255, count: rgba.count)
        var tmp = [Float](repeating: 0, count: rgba.count)
        let n = Float(2 * radius + 1)
        rgba.withUnsafeBufferPointer { src in
            for y in 0..<height {
                for x in 0..<width {
                    var r: Float = 0, g: Float = 0, b: Float = 0
                    for dx in -radius...radius {
                        let i = (y * width + min(width - 1, max(0, x + dx))) * 4
                        r += Float(src[i]); g += Float(src[i + 1]); b += Float(src[i + 2])
                    }
                    let o = (y * width + x) * 4
                    tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n
                }
            }
        }
        tmp.withUnsafeBufferPointer { src in
            for y in 0..<height {
                for x in 0..<width {
                    var r: Float = 0, g: Float = 0, b: Float = 0
                    for dy in -radius...radius {
                        let i = (min(height - 1, max(0, y + dy)) * width + x) * 4
                        r += src[i]; g += src[i + 1]; b += src[i + 2]
                    }
                    let o = (y * width + x) * 4
                    out[o] = UInt8((r / n).rounded(.toNearestOrEven))
                    out[o + 1] = UInt8((g / n).rounded(.toNearestOrEven))
                    out[o + 2] = UInt8((b / n).rounded(.toNearestOrEven))
                }
            }
        }
        return out
    }

    static func oklabPixels(_ rgba: [UInt8], count: Int) -> [Float] {
        let lut = (0..<256).map { ColorMath.srgbToLinear(Double($0)) }
        var lab = [Float](repeating: 0, count: count * 3)
        for p in 0..<count {
            let c = ColorMath.oklab(linear: Vec3(lut[Int(rgba[p * 4])], lut[Int(rgba[p * 4 + 1])], lut[Int(rgba[p * 4 + 2])]))
            lab[p * 3] = Float(c.x); lab[p * 3 + 1] = Float(c.y); lab[p * 3 + 2] = Float(c.z)
        }
        return lab
    }

    /// Weight of a colour in the clustering = (its pixel count) ^ areaPower; 1 would follow the pixel
    /// count, and a photo that is mostly dark background would then spend every colour on that
    /// background and lose the small, colourful parts (lips, a flower, a sign).
    static let areaPower = 0.4
    /// When colours are sorted into mixes, a difference in lightness counts this much of a difference
    /// in hue or saturation: a lighter or darker version of a colour is cheap for a painter, a new hue
    /// needs a new mix.
    static let lightnessWeight = 0.5
    /// A mix is painted in at most this many washes (water levels).
    static let maxWashes = 5
    /// One more wash for every factor of about 1.7 between the weakest and the strongest part of a mix.
    private static let washStep = 0.55
    private static let minReflectance = 0.0005
    private static let binL = 50.0 // histogram steps per unit of L
    private static let binAB = 100.0 // histogram steps per unit of a and b

    /// Histogram of the picture's colours in OKLab: one point per occupied bin (mean colour, pixel count).
    /// Clustering runs on these points, so it is exact (no sampling) and independent of the picture size.
    static func colourBins(_ lab: [Float], count: Int) -> (points: [Double], counts: [Double], binOf: [Int32]) {
        var index = [Int: Int32]()
        var sums: [Double] = []
        var counts: [Double] = []
        var binOf = [Int32](repeating: 0, count: count)
        lab.withUnsafeBufferPointer { lab in
            for p in 0..<count {
                let l = Double(lab[p * 3]), a = Double(lab[p * 3 + 1]), b = Double(lab[p * 3 + 2])
                let key = Int((l * binL).rounded()) * 1_048_576 + (Int((a * binAB).rounded()) + 512) * 1024 + Int((b * binAB).rounded()) + 512
                let i: Int32
                if let known = index[key] {
                    i = known
                } else {
                    i = Int32(counts.count)
                    index[key] = i
                    sums.append(contentsOf: [0, 0, 0])
                    counts.append(0)
                }
                let o = Int(i) * 3
                sums[o] += l; sums[o + 1] += a; sums[o + 2] += b
                counts[Int(i)] += 1
                binOf[p] = i
            }
        }
        var points = sums
        for i in counts.indices { for j in 0..<3 { points[i * 3 + j] = sums[i * 3 + j] / counts[i] } }
        return (points, counts, binOf)
    }

    /// Cluster the picture into `k` mixes, each painted in one or more washes.
    ///
    /// A watercolour mix with more or less water keeps the direction of its absorbance
    /// (A = -ln reflectance) and only changes its length. So a mix is a direction, and a colour
    /// belongs to the mix whose best wash comes closest to it (OKLab distance). Colours that differ
    /// only in strength therefore share a mix instead of using up one each. Within a mix the
    /// strengths are then split into washes.
    ///
    /// Returns the cluster per pixel and, per cluster, its mix and wash; clusters are ordered mix by
    /// mix, lightest wash first.
    static func clusterWashes(_ lab: [Float], count: Int, k: Int, iterations: Int = 24, seed: UInt32 = 7) -> (labels: [Int32], clusters: [(group: Int, level: Int)]) {
        var random = Mulberry32(seed: seed)
        let (points, counts, binOf) = colourBins(lab, count: count)
        let n = counts.count
        let kk = max(1, min(k, n))
        var absorb = [Double](repeating: 0, count: n * 3)
        var weight = [Double](repeating: 0, count: n)
        for i in 0..<n {
            let linear = ColorMath.linear(oklab: Vec3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]))
            absorb[i * 3] = -log(min(1, max(minReflectance, linear.x)))
            absorb[i * 3 + 1] = -log(min(1, max(minReflectance, linear.y)))
            absorb[i * 3 + 2] = -log(min(1, max(minReflectance, linear.z)))
            weight[i] = pow(counts[i], areaPower)
        }
        var dirs = [Vec3](repeating: Vec3(0, 0, 0), count: kk)
        func direction(_ v: Vec3) -> Vec3 {
            let length = (v * v).sum().squareRoot()
            // No absorbance at all (pure white) has no direction: use neutral grey.
            return length < 1e-9 ? Vec3(repeating: (1.0 / 3).squareRoot()) : v / length
        }
        func absorbance(_ i: Int) -> Vec3 { Vec3(absorb[i * 3], absorb[i * 3 + 1], absorb[i * 3 + 2]) }
        // Strength of bin i as a wash of mix c: its absorbance projected on the mix direction.
        func strength(_ i: Int, _ c: Int) -> Double { max(0, (absorbance(i) * dirs[c]).sum()) }
        // Squared OKLab distance between bin i and the closest wash of mix c.
        func d2(_ i: Int, _ c: Int) -> Double {
            let t = strength(i, c)
            let d = dirs[c]
            let reached = ColorMath.oklab(linear: Vec3(exp(-t * d.x), exp(-t * d.y), exp(-t * d.z)))
            let dL = (reached.x - points[i * 3]) * lightnessWeight
            let da = reached.y - points[i * 3 + 1]
            let db = reached.z - points[i * 3 + 2]
            return dL * dL + da * da + db * db
        }

        // k-means++ seeding: the first mix is the most common colour, the rest are drawn
        // with probability weight x squared distance to the nearest mix so far.
        var first = 0
        for i in 1..<max(1, n) where counts[i] > counts[first] { first = i }
        dirs[0] = direction(absorbance(first))
        var d = [Double](repeating: .infinity, count: n)
        for c in 1..<max(1, kk) {
            var sum = 0.0
            for i in 0..<n {
                d[i] = min(d[i], d2(i, c - 1))
                sum += d[i] * weight[i]
            }
            var r = random.next() * sum
            var chosen = n - 1
            for i in 0..<n {
                r -= d[i] * weight[i]
                if r <= 0 { chosen = i; break }
            }
            dirs[c] = direction(absorbance(chosen))
        }

        // Lloyd iterations: assign every bin to its closest mix, then turn each mix to the
        // weighted mean absorbance of its bins.
        var group = [Int](repeating: 0, count: n)
        for iteration in 0..<iterations {
            var changed = iteration == 0
            var sums = [Vec3](repeating: Vec3(0, 0, 0), count: kk)
            for i in 0..<n {
                var best = 0
                var bestD = Double.infinity
                for c in 0..<kk {
                    let dd = d2(i, c)
                    if dd < bestD { bestD = dd; best = c }
                }
                if group[i] != best { group[i] = best; changed = true }
                sums[best] += absorbance(i) * weight[i]
            }
            if !changed { break }
            for c in 0..<kk where sums[c].sum() > 1e-9 { dirs[c] = direction(sums[c]) }
        }

        // Washes: split every mix by strength (log scale, like the water levels of a recipe).
        var clusters: [(group: Int, level: Int)] = []
        var clusterOfBin = [Int32](repeating: 0, count: n)
        var logS = [Double](repeating: 0, count: n)
        for c in 0..<kk {
            var members = (0..<n).filter { group[$0] == c }
            if members.isEmpty { continue }
            for i in members { logS[i] = log(max(0.02, strength(i, c))) }
            members.sort { logS[$0] < logS[$1] }
            // Range between the 2% and 98% points by pixel count, so a few stray pixels add no wash.
            let total = members.reduce(0.0) { $0 + counts[$1] }
            func at(_ share: Double) -> Double {
                var run = 0.0
                for i in members {
                    run += counts[i]
                    if run >= total * share { return logS[i] }
                }
                return logS[members[members.count - 1]]
            }
            let lo = at(0.02), hi = at(0.98)
            let levels = max(1, min(maxWashes, members.count, 1 + Int(((hi - lo) / washStep).rounded())))
            var centres = (0..<levels).map { levels == 1 ? (lo + hi) / 2 : lo + (hi - lo) * Double($0) / Double(levels - 1) }
            var level = [Int](repeating: 0, count: members.count)
            for _ in 0..<12 {
                var sum = [Double](repeating: 0, count: levels)
                var w = [Double](repeating: 0, count: levels)
                for (m, i) in members.enumerated() {
                    var best = 0
                    for l in 1..<max(1, levels) where abs(logS[i] - centres[l]) < abs(logS[i] - centres[best]) { best = l }
                    level[m] = best
                    sum[best] += logS[i] * weight[i]
                    w[best] += weight[i]
                }
                for l in 0..<levels where w[l] > 0 { centres[l] = sum[l] / w[l] }
            }
            let base = clusters.count
            for l in 0..<levels { clusters.append((c, l)) }
            for (m, i) in members.enumerated() { clusterOfBin[i] = Int32(base + level[m]) }
        }

        var labels = [Int32](repeating: 0, count: count)
        for p in 0..<count { labels[p] = clusterOfBin[Int(binOf[p])] }
        return (labels, clusters)
    }

    static func majorityFilter(_ labels: [Int32], _ width: Int, _ height: Int, k: Int, passes: Int) -> [Int32] {
        var src = labels
        var votes = [Int](repeating: 0, count: k)
        for _ in 0..<passes {
            var dst = [Int32](repeating: 0, count: src.count)
            for y in 0..<height {
                for x in 0..<width {
                    for c in 0..<k { votes[c] = 0 }
                    for yy in max(0, y - 1)...min(height - 1, y + 1) {
                        for xx in max(0, x - 1)...min(width - 1, x + 1) {
                            votes[Int(src[yy * width + xx])] += 1
                        }
                    }
                    let own = Int(src[y * width + x])
                    var best = own
                    for c in 0..<k where votes[c] > votes[best] { best = c }
                    dst[y * width + x] = Int32(votes[best] >= 5 ? best : own)
                }
            }
            src = dst
        }
        return src
    }

    /// 4-connected components: region id per pixel, and cluster and size of each region.
    static func connectedComponents(_ labels: [Int32], _ width: Int, _ height: Int) -> (regionMap: [Int32], regionCluster: [Int], regionSize: [Int]) {
        var regionMap = [Int32](repeating: -1, count: labels.count)
        var regionCluster: [Int] = []
        var regionSize: [Int] = []
        var stack = [Int](repeating: 0, count: labels.count)
        for start in 0..<labels.count where regionMap[start] == -1 {
            let id = Int32(regionCluster.count)
            let cluster = labels[start]
            var top = 0
            var size = 0
            stack[top] = start; top += 1
            regionMap[start] = id
            while top > 0 {
                top -= 1
                let p = stack[top]
                size += 1
                let x = p % width
                let y = p / width
                if x > 0, regionMap[p - 1] == -1, labels[p - 1] == cluster { regionMap[p - 1] = id; stack[top] = p - 1; top += 1 }
                if x < width - 1, regionMap[p + 1] == -1, labels[p + 1] == cluster { regionMap[p + 1] = id; stack[top] = p + 1; top += 1 }
                if y > 0, regionMap[p - width] == -1, labels[p - width] == cluster { regionMap[p - width] = id; stack[top] = p - width; top += 1 }
                if y < height - 1, regionMap[p + width] == -1, labels[p + width] == cluster { regionMap[p + width] = id; stack[top] = p + width; top += 1 }
            }
            regionCluster.append(Int(cluster))
            regionSize.append(size)
        }
        return (regionMap, regionCluster, regionSize)
    }

    /// Repeatedly merge regions below minRegion px into their longest-border neighbour's cluster.
    static func mergeSmallRegions(_ labels: [Int32], _ width: Int, _ height: Int, minRegion: Int) -> [Int32] {
        var current = labels
        for _ in 0..<6 {
            let (regionMap, regionCluster, regionSize) = connectedComponents(current, width, height)
            let small = regionSize.map { $0 < minRegion }
            if !small.contains(true) { return current }
            // small region -> [(neighbour cluster, border length)], in the order the neighbours were met
            var border: [Int: [(cluster: Int, count: Double)]] = [:]
            for y in 0..<height {
                for x in 0..<width {
                    let p = y * width + x
                    let r = Int(regionMap[p])
                    if !small[r] { continue }
                    for q in [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1] where q >= 0 {
                        let rq = Int(regionMap[q])
                        if rq == r { continue }
                        // Prefer merging into large neighbours: weight by their size.
                        let c = regionCluster[rq]
                        let weight = small[rq] ? 0.25 : 1
                        var list = border[r] ?? []
                        if let i = list.firstIndex(where: { $0.cluster == c }) { list[i].count += weight } else { list.append((c, weight)) }
                        border[r] = list
                    }
                }
            }
            var newCluster = regionCluster
            for (r, list) in border {
                var best = -1
                var bestCount = -1.0
                for entry in list where entry.count > bestCount { bestCount = entry.count; best = entry.cluster }
                if best >= 0 { newCluster[r] = best }
            }
            current = regionMap.map { Int32(newCluster[Int($0)]) }
        }
        return current
    }

    /// Chamfer distance to the region border; the maximum per region is a good label anchor.
    static func labelAnchors(_ regionMap: [Int32], _ width: Int, _ height: Int, regionCount: Int) -> [(x: Int, y: Int, d: Float)] {
        let inf: Float = 1e9
        var dist = [Float](repeating: 0, count: regionMap.count)
        for y in 0..<height {
            for x in 0..<width {
                let p = y * width + x
                let r = regionMap[p]
                let edge = x == 0 || y == 0 || x == width - 1 || y == height - 1 ||
                    regionMap[p - 1] != r || regionMap[p + 1] != r || regionMap[p - width] != r || regionMap[p + width] != r
                dist[p] = edge ? 0 : inf
            }
        }
        let d1: Float = 1
        let d2: Float = 1.414
        if height > 1, width > 2 {
            for y in 1..<height {
                for x in 1..<(width - 1) {
                    let p = y * width + x
                    if dist[p] == 0 { continue }
                    dist[p] = min(dist[p], dist[p - 1] + d1, dist[p - width] + d1, dist[p - width - 1] + d2, dist[p - width + 1] + d2)
                }
            }
            for y in stride(from: height - 2, through: 0, by: -1) {
                for x in stride(from: width - 2, to: 0, by: -1) {
                    let p = y * width + x
                    if dist[p] == 0 { continue }
                    dist[p] = min(dist[p], dist[p + 1] + d1, dist[p + width] + d1, dist[p + width + 1] + d2, dist[p + width - 1] + d2)
                }
            }
        }
        var anchors = [(x: Int, y: Int, d: Float)](repeating: (0, 0, -1), count: regionCount)
        for p in 0..<regionMap.count {
            let r = Int(regionMap[p])
            if dist[p] > anchors[r].d { anchors[r] = (p % width, p / width, dist[p]) }
        }
        return anchors
    }

    /// The full pipeline. `rgba` is the picture at working resolution; `colours` is the number of
    /// mixes, `simplify` runs from 0 to 10.
    static func segment(rgba: [UInt8], width: Int, height: Int, colours: Int = 12, simplify: Int = 4, seed: UInt32 = 7) -> Segmentation {
        let count = width * height
        let s = Double(simplify)
        let blurred = boxBlur(rgba, width, height, radius: Int((s / 3).rounded()))
        let lab = oklabPixels(blurred, count: count)
        let (raw, found) = clusterWashes(lab, count: count, k: max(1, min(colours, count)), seed: seed)
        let k = found.count

        let smoothed = majorityFilter(raw, width, height, k: k, passes: Int((s / 2).rounded(.up)))
        let minRegion = Int((Double(count) * 0.00004 * pow(s + 1, 2.2)).rounded())
        let labels = mergeSmallRegions(smoothed, width, height, minRegion: max(2, (simplify + 1) * (simplify + 1), minRegion))

        // Cluster colours from the actual (unblurred) pixels they cover.
        var sums = [Double](repeating: 0, count: k * 3)
        var counts = [Int](repeating: 0, count: k)
        let original = oklabPixels(rgba, count: count)
        for p in 0..<count {
            let c = Int(labels[p])
            for j in 0..<3 { sums[c * 3 + j] += Double(original[p * 3 + j]) }
            counts[c] += 1
        }
        let clusters = (0..<k).map { c -> Segmentation.Cluster in
            let hex = counts[c] > 0 ? ColorMath.hex(oklab: Vec3(sums[c * 3], sums[c * 3 + 1], sums[c * 3 + 2]) / Double(counts[c])) : "#ffffff"
            return Segmentation.Cluster(index: c, group: found[c].group, level: found[c].level, hex: hex, pixelCount: counts[c])
        }

        let (regionMap, regionCluster, regionSize) = connectedComponents(labels, width, height)
        let anchors = labelAnchors(regionMap, width, height, regionCount: regionCluster.count)
        let regions = regionCluster.indices.map {
            Segmentation.Region(id: $0, cluster: regionCluster[$0], size: regionSize[$0], anchorX: anchors[$0].x, anchorY: anchors[$0].y, anchorDist: anchors[$0].d)
        }
        // Clusters can end up empty after merging; callers skip those (pixelCount == 0).
        return Segmentation(width: width, height: height, regionMap: regionMap, regions: regions, clusters: clusters)
    }
}
