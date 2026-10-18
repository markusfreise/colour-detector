import Foundation

// Image segmentation into flat colour areas ("paint-by-numbers" style).
// A port of src/lib/segment.js; keep the two in step.
//
// 1. Noise goes: the picture is cut into small patches along its edges and every pixel takes the
//    colour of its patch (Smooth.swift).
// 2. Clustering into mixes (absorbance directions) and their washes -> one label per pixel.
// 3. Calm areas (`calmAreas`): the details that stay are found (an eye, a letter), areas that are
//    too small or too alike join, and the outlines are rounded. Simplify only turns this step up;
//    the colours found do not change with it.
// 4. Connected components and a label anchor per region (the pixel furthest from its border).
//
// boxBlur, majorityFilter and mergeSmallRegions are no longer part of this pipeline; layer mode
// and Blocking use them.

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
        // The table is kept in single precision, as the web app keeps it.
        let lut = (0..<256).map { Double(Float(ColorMath.srgbToLinear(Double($0)))) }
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

    /// The two weights above as the Details slider (0...10) sets them; at 5 they are the constants.
    /// Higher Details weighs small colours more and lightness less, so a small area of another hue
    /// gets a mix of its own already here; lower weighs colours by area and lightness more. As
    /// `varietyWeights` in segment.js.
    static func varietyWeights(_ variety: Int = 5) -> (areaPower: Double, lightnessWeight: Double) {
        let off = Double(5 - min(10, max(0, variety))) / 5 // 1 at Details 0, -1 at Details 10
        return (areaPower + 0.4 * off, lightnessWeight * pow(2, off))
    }
    /// A mix is painted in at most this many washes (water levels).
    static let maxWashes = 5
    /// One more wash for every factor of about 1.7 between the weakest and the strongest part of a mix.
    static let washStep = 0.55
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
                let key = Int(Smooth.jsRound(l * binL)) * 1_048_576 + (Int(Smooth.jsRound(a * binAB)) + 512) * 1024 + Int(Smooth.jsRound(b * binAB)) + 512
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
    /// With `anchors` (colours in OKLab) the mixes are given instead of found: every anchor is a
    /// mix, the colours are only assigned to them and `k` is not used.
    ///
    /// Returns the cluster per pixel and, per cluster, its mix and wash; clusters are ordered mix by
    /// mix, lightest wash first.
    static func clusterWashes(_ lab: [Float], count: Int, k: Int, iterations requested: Int = 24, seed: UInt32 = 7, areaPower: Double = Segmenter.areaPower, maxWashes: Int = Segmenter.maxWashes, washStep: Double = Segmenter.washStep, lightnessWeight: Double = Segmenter.lightnessWeight, anchors: [Vec3]? = nil) -> (labels: [Int32], clusters: [(group: Int, level: Int)]) {
        var random = Mulberry32(seed: seed)
        let (points, counts, binOf) = colourBins(lab, count: count)
        let n = counts.count
        let given = anchors?.isEmpty == false ? anchors : nil
        let kk = given?.count ?? max(1, min(k, n))
        var iterations = requested
        var absorb = [Double](repeating: 0, count: n * 3)
        var weight = [Double](repeating: 0, count: n)
        for i in 0..<n {
            let linear = ColorMath.linear(oklab: Vec3(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]))
            absorb[i * 3] = -log(min(1, max(minReflectance, linear.x)))
            absorb[i * 3 + 1] = -log(min(1, max(minReflectance, linear.y)))
            absorb[i * 3 + 2] = -log(min(1, max(minReflectance, linear.z)))
            weight[i] = pow(counts[i], areaPower)
        }
        var dirs = [Double](repeating: 0, count: kk * 3)
        func setDir(_ c: Int, _ x: Double, _ y: Double, _ z: Double) {
            let length = hypot3(x, y, z)
            // No absorbance at all (pure white) has no direction: use neutral grey.
            if length < 1e-9 {
                let grey = 0.5.squareRoot() * (2.0 / 3).squareRoot()
                dirs[c * 3] = grey; dirs[c * 3 + 1] = grey; dirs[c * 3 + 2] = grey
            } else { dirs[c * 3] = x / length; dirs[c * 3 + 1] = y / length; dirs[c * 3 + 2] = z / length }
        }
        // Strength of bin i as a wash of mix c: its absorbance projected on the mix direction.
        func strength(_ i: Int, _ c: Int) -> Double {
            max(0, absorb[i * 3] * dirs[c * 3] + absorb[i * 3 + 1] * dirs[c * 3 + 1] + absorb[i * 3 + 2] * dirs[c * 3 + 2])
        }
        let lw2 = lightnessWeight * lightnessWeight
        // Squared OKLab distance between bin i and the closest wash of mix c.
        func d2(_ i: Int, _ c: Int) -> Double {
            let t = strength(i, c)
            let reached = ColorMath.oklab(linear: Vec3(exp(-t * dirs[c * 3]), exp(-t * dirs[c * 3 + 1]), exp(-t * dirs[c * 3 + 2])))
            let dL = reached.x - points[i * 3], da = reached.y - points[i * 3 + 1], db = reached.z - points[i * 3 + 2]
            return lw2 * dL * dL + da * da + db * db
        }

        // k-means++ seeding: the first mix is the most common colour, the rest are drawn
        // with probability weight x squared distance to the nearest mix so far.
        var first = 0
        for i in 1..<max(1, n) where counts[i] > counts[first] { first = i }
        if let given {
            // Given mixes: the direction of each anchor's absorbance, kept as it is.
            for (c, anchor) in given.enumerated() {
                let linear = ColorMath.linear(oklab: anchor)
                setDir(c, -log(min(1, max(minReflectance, linear.x))), -log(min(1, max(minReflectance, linear.y))), -log(min(1, max(minReflectance, linear.z))))
            }
            iterations = 1
        } else if n > 0 {
            setDir(0, absorb[first * 3], absorb[first * 3 + 1], absorb[first * 3 + 2])
        }
        var d = [Double](repeating: .infinity, count: n)
        if given == nil && kk > 1 {
            for c in 1..<kk {
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
                setDir(c, absorb[chosen * 3], absorb[chosen * 3 + 1], absorb[chosen * 3 + 2])
            }
        }

        // Lloyd iterations: assign every bin to its closest mix, then turn each mix to the
        // weighted mean absorbance of its bins.
        var group = [Int](repeating: 0, count: n)
        for iteration in 0..<iterations {
            var changed = iteration == 0
            var sums = [Double](repeating: 0, count: kk * 3)
            for i in 0..<n {
                var best = 0
                var bestD = Double.infinity
                for c in 0..<kk {
                    let dd = d2(i, c)
                    if dd < bestD { bestD = dd; best = c }
                }
                if group[i] != best { group[i] = best; changed = true }
                let w = weight[i]
                sums[best * 3] += absorb[i * 3] * w; sums[best * 3 + 1] += absorb[i * 3 + 1] * w; sums[best * 3 + 2] += absorb[i * 3 + 2] * w
            }
            if !changed || given != nil { break }
            for c in 0..<kk where sums[c * 3] + sums[c * 3 + 1] + sums[c * 3 + 2] > 1e-9 { setDir(c, sums[c * 3], sums[c * 3 + 1], sums[c * 3 + 2]) }
        }

        // Washes: split every mix by strength (log scale, like the water levels of a recipe).
        var clusters: [(group: Int, level: Int)] = []
        var clusterOfBin = [Int32](repeating: 0, count: n)
        var logS = [Double](repeating: 0, count: n)
        for c in 0..<kk {
            var members = (0..<n).filter { group[$0] == c }
            if members.isEmpty { continue }
            for i in members { logS[i] = log(max(0.02, strength(i, c))) }
            // In order of strength; equal ones keep their order, as in the web app's (stable) sort.
            members.sort { logS[$0] < logS[$1] || (logS[$0] == logS[$1] && $0 < $1) }
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
            let levels = max(1, min(maxWashes, members.count, 1 + Int(Smooth.jsRound((hi - lo) / washStep))))
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
                for l in 0..<levels where w[l] != 0 { centres[l] = sum[l] / w[l] }
            }
            let base = clusters.count
            for l in 0..<levels { clusters.append((c, l)) }
            for (m, i) in members.enumerated() { clusterOfBin[i] = Int32(base + level[m]) }
        }

        var labels = [Int32](repeating: 0, count: count)
        for p in 0..<count { labels[p] = clusterOfBin[Int(binOf[p])] }
        return (labels, clusters)
    }

    /// Math.hypot of JavaScript (V8): the largest part taken out, the squares added up with Kahan's
    /// compensation, so that a direction has the same length as in the web app.
    static func hypot3(_ x: Double, _ y: Double, _ z: Double) -> Double {
        let values = [abs(x), abs(y), abs(z)]
        let largest = max(values[0], values[1], values[2])
        if largest == 0 { return 0 }
        var sum = 0.0, compensation = 0.0
        for value in values {
            let part = value / largest
            let summand = part * part - compensation
            let preliminary = sum + summand
            compensation = (preliminary - sum) - summand
            sum = preliminary
        }
        return sum.squareRoot() * largest
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

    // MARK: Calm areas

    /// Side of the patches the picture is cut into before its colours are found, in pixels.
    static let patchStep = 5.0
    /// Patches closer in colour than about this (OKLab) are evened out with each other.
    static let patchBlend = 0.035
    /// Sizes in pixels are meant for a picture of this many pixels and scale with the picture
    /// (areas with its pixels, the rounding window with its side).
    static let referencePixels = 480_000.0
    /// The highest step of Simplify.
    static let topSimplify = 10
    /// The lowest step of Simplify. Below 0 it goes the other way: what calms the areas at every step
    /// from 0 on (the patches, the joining, the texture, the rounding) is taken back evenly, and at
    /// `finest` none of it is left: the areas follow the photo, down to `smallestArea`.
    static let finest = -4
    /// The step of Simplify that is shown as 0 and opens a picture; the steps below it are Pro.
    static let simplifyZero = -2
    /// The smallest area that is no detail, in pixels at Simplify 0; it grows with (Simplify + 1) ^ minAreaPower.
    static let minArea = 72.0
    static let minAreaPower = 1.3
    /// Nothing smaller than this many pixels is ever an area of its own, whatever the size of the picture.
    static let smallestArea = 6.0
    /// Two areas join while that costs less than this at Simplify 0 (see `Smooth.mergeAreas`), and
    /// mergeGrowth times more with every step of Simplify.
    static let mergeLimit = 0.02
    static let mergeGrowth = 1.25
    /// Before the details are looked for, the pieces of one thing join: at this part of mergeLimit.
    static let tidyLimit = 0.25
    /// A small area is a detail when losing it would cost at least this at Simplify 0 (see
    /// `Smooth.findDetails`), and 1 + detailRise x step ^ 3 times that further up.
    static let detailLimit = 0.04
    static let detailRise = 0.008
    /// A detail also has to count as this many pixels at Simplify 0, and detailSizeGrowth times more
    /// with every step, so that the specks go first.
    static let detailSize = 6.0
    static let detailSizeGrowth = 1.35
    /// Rounding of the outlines: the window around a pixel at Simplify 0, and what a step of Simplify adds.
    static let outlineRadius = 3.0
    static let outlineRadiusStep = 0.3
    static let outlinePasses = 2
    /// Inside a focus box the areas are as at Simplify 0, and both limits are this part of theirs there.
    static let focusLimit = 0.5
    /// Texture is looked for in cells of this many pixels a side in a picture of referencePixels;
    /// the cells scale with the side of the picture.
    static let textureCell = 16.0
    /// In a zone of texture the smallest area is that of this many steps of Simplify further up, and
    /// the outlines are rounded as that many further up.
    static let textureSteps = 1.5
    static let textureRounder = 3.0

    /// Calm areas from the labels of the clustering, in five steps:
    /// 1. pieces of a few pixels join a neighbour, so that a letter or an eye is one area;
    /// 2. the details are found: small or thin areas that stand out, but not texture. They stay as
    ///    they are from here on;
    /// 3. areas join: the ones too small for a brush always, larger ones while it costs little;
    /// 4. the outlines are rounded;
    /// 5. what the rounding cut off or made too small joins a neighbour.
    /// `simplify` (0...10) raises the smallest area, the limits, the least size of a detail and the
    /// rounding; the joining goes through every step up to it on the same details, so a higher step
    /// joins what the lower one left. Inside `where` (a mask of the focus boxes) the areas are those
    /// of Simplify 0, with half the limits. In a zone of texture the smallest area is larger and the
    /// outlines are rounder.
    /// Below 0 (down to `finest`) there is one stage, with the sizes, limits and rounding of
    /// Simplify 0 taken back evenly; at `finest` only areas under smallestArea join and no outline
    /// is rounded.
    /// - Parameters:
    ///   - raw: cluster per pixel
    ///   - lab: colour per pixel, without noise
    ///   - photo: colour per pixel as in the photo: tells texture from details
    ///   - kindOf: per cluster, the mix it is a wash of
    /// - Returns: cluster per pixel
    static func calmAreas(_ raw: [Int32], _ lab: [Float], _ width: Int, _ height: Int, k: Int, simplify: Int, where whereMask: [UInt8]? = nil, photo: [Float]? = nil, kindOf: [Int32]? = nil) -> [Int32] {
        let count = width * height
        let share = Double(count) / referencePixels
        let s = Double(simplify)
        // What is left of the calming below Simplify 0: 1 from 0 on, 0 at `finest`.
        let calm = simplify < 0 ? max(0, 1 - s / Double(finest)) : 1
        func minSizeAt(_ level: Double) -> Double { max(smallestArea, Smooth.jsRound(minArea * share * pow(level + 1, minAreaPower))) }
        func mergeLimitAt(_ level: Double) -> Double { mergeLimit * pow(mergeGrowth, level) }
        func detailLimitAt(_ level: Double) -> Double { detailLimit * (1 + detailRise * level * level * level) }
        func detailSizeAt(_ level: Double) -> Double { Smooth.jsRound(detailSize * pow(detailSizeGrowth, level)) }
        func radiusAt(_ level: Double) -> Int { max(1, Int(Smooth.jsRound((outlineRadius + level * outlineRadiusStep) * share.squareRoot()))) }

        // One stage per step of Simplify below the one asked for, then that one (see `Smooth.mergeAreas`).
        func stageAt(_ level: Double) -> Smooth.Stage {
            Smooth.Stage(minSize: minSizeAt(level), roughSize: minSizeAt(level + textureSteps), limit: mergeLimitAt(level), detailLimit: detailLimitAt(level), detailSize: detailSizeAt(level), detailRoom: minSizeAt(level), floor: smallestArea)
        }
        // Below 0: the stage of Simplify 0 with its sizes (by area, hence the square) and limits taken back.
        func fineSizeAt(_ level: Double) -> Double { max(smallestArea, Smooth.jsRound(minSizeAt(level) * calm * calm)) }
        func fineStage() -> Smooth.Stage {
            Smooth.Stage(minSize: fineSizeAt(0), roughSize: fineSizeAt(textureSteps * calm), limit: mergeLimitAt(0) * calm, detailLimit: detailLimitAt(0) * calm, detailSize: detailSizeAt(0), detailRoom: fineSizeAt(0), floor: smallestArea)
        }
        var stages: [Smooth.Stage] = []
        if simplify > 0 { for level in 0..<simplify { stages.append(stageAt(Double(level))) } }
        let last = simplify < 0 ? fineStage() : stageAt(s)
        stages.append(last)
        var inside: Smooth.Stage
        if simplify < 0 {
            inside = last
            inside.limit = last.limit * focusLimit
            inside.detailLimit = last.detailLimit * focusLimit
            inside.roughSize = 0
        } else {
            inside = Smooth.Stage(minSize: minSizeAt(0), limit: mergeLimitAt(0) * focusLimit, detailLimit: detailLimitAt(0) * focusLimit, detailSize: detailSizeAt(0), detailRoom: minSizeAt(0), floor: smallestArea)
        }
        // The window of the rounding; below 0 it shrinks to nothing.
        func windowAt(_ level: Double) -> Int {
            simplify < 0 ? Int(Smooth.jsRound((outlineRadius + level * outlineRadiusStep) * calm * share.squareRoot())) : radiusAt(level)
        }

        let tidy = Smooth.mergeAreas(raw, lab, width, height, stages: [Smooth.Stage(limit: mergeLimit * tidyLimit * calm, floor: smallestArea)])
        // The details are the same at every step (up to the largest that the top step has room for);
        // a step only says which of them it keeps. So the steps join the same areas in the same order.
        let details = Smooth.findDetails(tidy, lab, width, height, minSize: smallestArea, maxSize: minSizeAt(Double(max(topSimplify, simplify))), photo: photo,
                                         cell: max(2, Int(Smooth.jsRound(textureCell * share.squareRoot()))), pieceSize: minSizeAt(0), kindOf: kindOf, findTexture: photo != nil)
        var rough = details.textured
        let merged = Smooth.mergeAreas(tidy, lab, width, height, stages: stages, details: details, where: whereMask, inside: inside, rough: rough)
        // The details that are left and are small or thin: no outline of theirs is rounded. One as large
        // as an area that stays anyway (a window, a lip) keeps its place but gets a round outline.
        var fixed = [UInt8](repeating: 0, count: count)
        let roomLeast = minSizeAt(0)
        for p in 0..<count {
            let rule = whereMask.map { $0[p] != 0 } == true ? inside : last
            let worth = Double(details.worth[p])
            fixed[p] = worth > 0 && worth >= rule.detailLimit && Double(details.span[p]) >= rule.detailSize && Double(details.room[p]) < roomLeast ? 1 : 0
        }
        let step = Double(max(0, simplify))
        var rounded = Smooth.roundOutlines(merged, width, height, k: k, radius: windowAt(step), passes: outlinePasses, fixed: fixed)
        if rough != nil {
            // The zones of texture once more, with a wider window; not where a focus box asks for fine areas.
            if let whereMask { for p in 0..<count where whereMask[p] != 0 { rough![p] = 0 } }
            rounded = Smooth.roundOutlines(rounded, width, height, k: k, radius: windowAt(step + textureRounder * calm), passes: outlinePasses, fixed: fixed, only: rough)
        }
        if let whereMask, simplify > 0 {
            let fine = Smooth.roundOutlines(merged, width, height, k: k, radius: radiusAt(0), passes: outlinePasses, fixed: fixed, only: whereMask)
            for p in 0..<count where whereMask[p] != 0 { rounded[p] = fine[p] }
        }
        return Smooth.mergeAreas(rounded, lab, width, height, stages: [last], details: details, where: whereMask, inside: inside, rough: rough)
    }

    /// The full pipeline.
    /// - Parameters:
    ///   - rgba: the picture at working resolution
    ///   - colours: the number of mixes
    ///   - simplify: `finest`...10 (0 and up: calm areas, ever fewer; below 0: ever finer, at
    ///     `finest` the areas follow the photo). The web shows `simplifyZero` as 0 and opens a picture
    ///     with it.
    ///   - geometric: areas as polygons with straight edges instead of their organic outline
    ///   - anchors: hex colours that are the mixes (then `colours` is not used)
    ///   - focus: boxes in which the areas stay as fine as at Simplify 0 and details are kept more
    ///     readily, whatever `simplify` is
    ///   - maxWashes, washStep: washes a mix is split into at most, and the factor of strength (log)
    ///     between two of them: a grey picture is one mix, so these set the number of its values
    ///   - variety: the Details slider (see `varietyWeights`), unless areaPower / lightnessWeight are given
    static func segment(rgba: [UInt8], width: Int, height: Int, colours: Int = 12, simplify: Int = 4, geometric: Bool = false, anchors given: [String]? = nil, focus: [Details.Box]? = nil, seed: UInt32 = 7, variety: Int = 5, areaPower: Double? = nil, maxWashes: Int = Segmenter.maxWashes, washStep: Double = Segmenter.washStep, lightnessWeight: Double? = nil) -> Segmentation {
        let count = width * height
        let weights = varietyWeights(variety)
        let areaPower = areaPower ?? weights.areaPower
        let lightnessWeight = lightnessWeight ?? weights.lightnessWeight
        // Noise goes before the colours are found: every pixel takes the colour of its patch.
        let original = oklabPixels(rgba, count: count)
        // Below Simplify 0 the patches shrink, and with a side under two pixels there are none.
        let calm = simplify < 0 ? max(0, 1 - Double(simplify) / Double(finest)) : 1
        let step = Int(Smooth.jsRound(patchStep * calm))
        var lab = original
        if step >= 2 {
            var patches = Smooth.compactPatches(original, width, height, step: step)
            let restless = Smooth.settlePatches(original, width, height, &patches)
            lab = Smooth.patchColours(original, width, height, patches, blend: patchBlend * calm, restless: restless)
        }
        let (raw, found) = clusterWashes(lab, count: count, k: max(1, min(colours, count)), seed: seed, areaPower: areaPower, maxWashes: maxWashes, washStep: washStep, lightnessWeight: lightnessWeight,
                                         // Given colours (hex) as the mixes, instead of finding them.
                                         anchors: given?.isEmpty == false ? given!.map { ColorMath.oklab(hex: $0) } : nil)
        let k = found.count
        let whereMask = focus?.isEmpty == false ? Details.boxMask(focus!, width, height) : nil
        let calmed = calmAreas(raw, lab, width, height, k: k, simplify: simplify, where: whereMask, photo: original, kindOf: found.map { Int32($0.group) })
        var labels = calmed
        if geometric {
            labels = Geometric.areas(calmed, width, height, simplify: max(0, simplify))
            if let whereMask {
                // Where the details are, the areas keep their own outlines; what that cuts off joins a neighbour.
                for p in 0..<count where whereMask[p] != 0 { labels[p] = calmed[p] }
                labels = Smooth.mergeAreas(labels, lab, width, height, stages: [Smooth.Stage(floor: smallestArea)])
            }
        }

        // Cluster colours from the pixels of the photo they cover, not from the colours of the patches.
        var sums = [Double](repeating: 0, count: k * 3)
        var counts = [Int](repeating: 0, count: k)
        for p in 0..<count {
            let c = Int(labels[p])
            sums[c * 3] += Double(original[p * 3]); sums[c * 3 + 1] += Double(original[p * 3 + 1]); sums[c * 3 + 2] += Double(original[p * 3 + 2])
            counts[c] += 1
        }
        let clusters = (0..<k).map { c -> Segmentation.Cluster in
            let hex = counts[c] > 0 ? ColorMath.hex(oklab: Vec3(sums[c * 3] / Double(counts[c]), sums[c * 3 + 1] / Double(counts[c]), sums[c * 3 + 2] / Double(counts[c]))) : "#ffffff"
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
