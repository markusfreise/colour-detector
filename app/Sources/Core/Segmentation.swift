import Foundation

// Image segmentation into flat colour areas ("paint-by-numbers" style).
// A port of src/lib/segment.js; keep the two in step.
//
// 1. Optional box blur to suppress texture noise.
// 2. k-means++ clustering in OKLab -> one label per pixel.
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

    static func kmeans(_ lab: [Float], count: Int, k: Int, iterations: Int = 12, sampleSize: Int = 30000, seed: UInt32 = 7) -> (labels: [Int32], centroids: [Float]) {
        var random = Mulberry32(seed: seed)
        let sampleN = min(count, sampleSize)
        var sample = [Int](repeating: 0, count: sampleN)
        for i in 0..<sampleN { sample[i] = sampleN == count ? i : Int(random.next() * Double(count)) }

        var centroids = [Float](repeating: 0, count: k * 3)
        var labels = [Int32](repeating: 0, count: count)

        lab.withUnsafeBufferPointer { lab in
            func dist2(_ p: Int, _ c: Int) -> Double {
                let dL = Double(lab[p * 3]) - Double(centroids[c * 3])
                let da = Double(lab[p * 3 + 1]) - Double(centroids[c * 3 + 1])
                let db = Double(lab[p * 3 + 2]) - Double(centroids[c * 3 + 2])
                return dL * dL + da * da + db * db
            }
            func setCentroid(_ c: Int, from p: Int) {
                for j in 0..<3 { centroids[c * 3 + j] = lab[p * 3 + j] }
            }
            func assign(_ p: Int) -> Int {
                var best = 0
                var bestD = Double.infinity
                for c in 0..<k {
                    let d = dist2(p, c)
                    if d < bestD { bestD = d; best = c }
                }
                return best
            }

            // k-means++ seeding on the sample
            setCentroid(0, from: sample[Int(random.next() * Double(sampleN))])
            var d = [Double](repeating: .infinity, count: sampleN)
            for c in 1..<max(1, k) {
                var sum = 0.0
                for i in 0..<sampleN {
                    d[i] = min(d[i], dist2(sample[i], c - 1))
                    sum += d[i]
                }
                var r = random.next() * sum
                var chosen = sample[sampleN - 1]
                for i in 0..<sampleN {
                    r -= d[i]
                    if r <= 0 { chosen = sample[i]; break }
                }
                setCentroid(c, from: chosen)
            }

            // Lloyd iterations on the sample
            for _ in 0..<iterations {
                var sums = [Double](repeating: 0, count: k * 3)
                var counts = [Int](repeating: 0, count: k)
                for i in 0..<sampleN {
                    let p = sample[i]
                    let c = assign(p)
                    for j in 0..<3 { sums[c * 3 + j] += Double(lab[p * 3 + j]) }
                    counts[c] += 1
                }
                for c in 0..<k where counts[c] > 0 {
                    for j in 0..<3 { centroids[c * 3 + j] = Float(sums[c * 3 + j] / Double(counts[c])) }
                }
            }

            for p in 0..<count { labels[p] = Int32(assign(p)) }
        }
        return (labels, centroids)
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

    /// The full pipeline. `rgba` is the picture at working resolution; `simplify` runs from 0 to 10.
    static func segment(rgba: [UInt8], width: Int, height: Int, colours: Int = 12, simplify: Int = 4, seed: UInt32 = 7) -> Segmentation {
        let count = width * height
        let s = Double(simplify)
        let blurred = boxBlur(rgba, width, height, radius: Int((s / 3).rounded()))
        let lab = oklabPixels(blurred, count: count)
        let k = max(1, min(colours, count))
        let (raw, centroids) = kmeans(lab, count: count, k: k, seed: seed)

        let smoothed = majorityFilter(raw, width, height, k: k, passes: Int((s / 2).rounded(.up)))
        let minRegion = Int((Double(count) * 0.00004 * pow(s + 1, 2.2)).rounded())
        let labels = mergeSmallRegions(smoothed, width, height, minRegion: max(2, (simplify + 1) * (simplify + 1), minRegion))

        // Recompute cluster colours from the actual (unblurred) pixels they cover.
        var sums = [Double](repeating: 0, count: k * 3)
        var counts = [Int](repeating: 0, count: k)
        let original = oklabPixels(rgba, count: count)
        for p in 0..<count {
            let c = Int(labels[p])
            for j in 0..<3 { sums[c * 3 + j] += Double(original[p * 3 + j]) }
            counts[c] += 1
        }
        let clusters = (0..<k).map { c -> Segmentation.Cluster in
            let lab3 = counts[c] > 0
                ? Vec3(sums[c * 3], sums[c * 3 + 1], sums[c * 3 + 2]) / Double(counts[c])
                : Vec3(Double(centroids[c * 3]), Double(centroids[c * 3 + 1]), Double(centroids[c * 3 + 2]))
            return Segmentation.Cluster(index: c, hex: ColorMath.hex(oklab: lab3), pixelCount: counts[c])
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
