import Foundation

/// Blocking: the picture as two or three flat tones of hard contrast in large masses, to find light,
/// shadow and the overall forms before painting. Lightness is CIE L* (0 black ... 100 white), the
/// lightness the eye sees, not an average of red, green and blue.
/// A port of src/lib/blocking.js; keep the two in step.
struct BlockedPicture: Sendable {
    struct Region: Sendable {
        let id: Int
        /// 0 = the lightest tone.
        let tone: Int
        let size: Int
        let anchorX: Int
        let anchorY: Int
        let anchorDist: Float
    }

    let width: Int
    let height: Int
    /// 2 (light and shadow) or 3 (with a middle tone).
    let tones: Int
    /// The L* the tones are split at, ascending (one fewer than `tones`).
    let thresholds: [Double]
    /// Where the photo itself divides (`Blocking.naturalSplit`), whatever was asked for.
    let natural: [Double]
    /// Tone per pixel.
    let toneMap: [Int32]
    /// Region id per pixel.
    let regionMap: [Int32]
    let regions: [Region]
    /// Part of the picture in each tone, lightest first.
    let shares: [Double]
}

enum Blocking {
    static let minTones = 2
    static let maxTones = 3
    /// "Forms": 0 = more detail ... 10 = the largest masses.
    static let defaultForms = 6.0

    /// The greys the tones are shown in, as L*: the paper, a middle tone, a strong dark.
    private static func toneLightness(_ tones: Int) -> [Double]? {
        tones == 2 ? [100, 24] : tones == 3 ? [100, 60, 24] : nil
    }

    // Linear value of every sRGB channel value, in single precision as in the web app.
    private static let linear: [Float] = (0..<256).map { Float(ColorMath.srgbToLinear(Double($0))) }

    private static func lstar(_ y: Double) -> Double {
        y > 216.0 / 24389 ? 116 * cbrt(y) - 16 : (24389.0 / 27) * y
    }

    /// CIE L* of an sRGB colour (D65): from the luminance Y of linear red, green and blue.
    static func lightnessOf(_ r: UInt8, _ g: UInt8, _ b: UInt8) -> Double {
        lstar(0.2126 * Double(linear[Int(r)]) + 0.7152 * Double(linear[Int(g)]) + 0.0722 * Double(linear[Int(b)]))
    }

    /// L* of every pixel of RGBA data.
    static func lightnessMap(_ rgba: [UInt8], count: Int) -> [Float] {
        var out = [Float](repeating: 0, count: count)
        rgba.withUnsafeBufferPointer { rgba in
            for p in 0..<count { out[p] = Float(lightnessOf(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2])) }
        }
        return out
    }

    /// How many pixels have each L*, in `bins` steps from 0 to 100.
    static func histogram(_ L: [Float], bins: Int = 100) -> [Double] {
        var out = [Double](repeating: 0, count: bins)
        for v in L { out[min(bins - 1, max(0, Int(((Double(v) / 100) * Double(bins)).rounded(.down))))] += 1 }
        return out
    }

    /// Where the photo itself divides into light and dark: the thresholds (L*, ascending) that keep
    /// the tones apart as well as they can (Otsu's method; for three tones the best pair of two).
    static func naturalSplit(_ hist: [Double], tones: Int = 2) -> [Double] {
        let bins = hist.count
        var count = [Double](repeating: 0, count: bins + 1)
        var sum = [Double](repeating: 0, count: bins + 1)
        for i in 0..<bins {
            count[i + 1] = count[i] + hist[i]
            sum[i + 1] = sum[i] + hist[i] * (Double(i) + 0.5)
        }
        // The share of the spread between the groups that a group from bin a to bin b (exclusive) adds.
        func part(_ a: Int, _ b: Int) -> Double {
            let n = count[b] - count[a]
            let s = sum[b] - sum[a]
            return n > 0 ? s * s / n : 0
        }
        func edge(_ i: Int) -> Double { (Double(i) / Double(bins)) * 100 }
        if tones <= 2 {
            var best = 1, score = -1.0
            if bins > 1 {
                for t in 1..<bins {
                    let s = part(0, t) + part(t, bins)
                    if s > score { best = t; score = s }
                }
            }
            return [edge(best)]
        }
        var best = (1, 2), score = -1.0
        if bins > 2 {
            for t1 in 1..<(bins - 1) {
                for t2 in (t1 + 1)..<bins {
                    let s = part(0, t1) + part(t1, t2) + part(t2, bins)
                    if s > score { best = (t1, t2); score = s }
                }
            }
        }
        return [edge(best.0), edge(best.1)]
    }

    /// The tone of a lightness: 0 the lightest, counting down past each threshold it is below.
    static func toneOf(_ lightness: Double, _ thresholds: [Double]) -> Int {
        var tone = 0
        for t in thresholds where lightness < t { tone += 1 }
        return tone
    }

    /// The tone of a colour given as hex.
    static func toneOfHex(_ hex: String, _ thresholds: [Double]) -> Int {
        let n = UInt32(hex.hasPrefix("#") ? String(hex.dropFirst()) : hex, radix: 16) ?? 0
        return toneOf(lightnessOf(UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)), thresholds)
    }

    /// The grey a tone is shown in, as (r, g, b).
    static func toneGrey(_ tone: Int, tones: Int) -> (r: UInt8, g: UInt8, b: UInt8) {
        let table = toneLightness(tones)
        let L = table.flatMap { tone >= 0 && tone < $0.count ? $0[tone] : nil } ?? 100
        // From L* back to an sRGB grey.
        let y = L > 8 ? pow((L + 16) / 116, 3) : L / (24389.0 / 27)
        let v = UInt8(max(0, min(255, Smooth.jsRound(255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * pow(y, 1 / 2.4) - 0.055)))))
        return (v, v, v)
    }

    // A blur of the lightness, so that the masses come from the large shapes and not from texture.
    private static func blurred(_ L: [Float], _ width: Int, _ height: Int, radius: Int) -> [Float] {
        if radius < 1 { return L }
        var tmp = [Float](repeating: 0, count: L.count)
        var out = [Float](repeating: 0, count: L.count)
        let n = Double(2 * radius + 1)
        L.withUnsafeBufferPointer { L in
        tmp.withUnsafeMutableBufferPointer { tmp in
        out.withUnsafeMutableBufferPointer { out in
            for y in 0..<height {
                let row = y * width
                var acc = 0.0
                for dx in -radius...radius { acc += Double(L[row + min(width - 1, max(0, dx))]) }
                for x in 0..<width {
                    tmp[row + x] = Float(acc / n)
                    acc += Double(L[row + min(width - 1, x + radius + 1)]) - Double(L[row + max(0, x - radius)])
                }
            }
            for x in 0..<width {
                var acc = 0.0
                for dy in -radius...radius { acc += Double(tmp[min(height - 1, max(0, dy)) * width + x]) }
                for y in 0..<height {
                    out[y * width + x] = Float(acc / n)
                    acc += Double(tmp[min(height - 1, y + radius + 1) * width + x]) - Double(tmp[max(0, y - radius) * width + x])
                }
            }
        }}}
        return out
    }

    /// The picture as tones in large masses.
    /// - Parameters:
    ///   - tones: 2 (light and shadow) or 3 (with a middle tone)
    ///   - split: thresholds in L*, one fewer than tones; nil (or the wrong number) = where the photo
    ///     divides (`naturalSplit`)
    ///   - forms: 0 (more detail) to 10 (the largest masses)
    static func blockImage(rgba: [UInt8], width: Int, height: Int, tones requested: Int = 2, split: [Double]? = nil, forms: Double = defaultForms) -> BlockedPicture {
        let tones = min(maxTones, max(minTones, requested))
        let count = width * height
        let L = lightnessMap(rgba, count: count)
        let natural = naturalSplit(histogram(L), tones: tones)
        let thresholds = split.map { $0.count == tones - 1 ? $0.sorted() : natural } ?? natural
        // Sizes grow with the picture, so that a close-up and the whole picture look alike.
        let size = Double(count).squareRoot() / 700
        let f = min(10, max(0, forms))
        let soft = blurred(L, width, height, radius: Int(Smooth.jsRound(f * 0.8 * size)))
        var labels = [Int32](repeating: 0, count: count)
        for p in 0..<count { labels[p] = Int32(toneOf(Double(soft[p]), thresholds)) }
        if f > 0 { labels = Segmenter.majorityFilter(labels, width, height, k: tones, passes: 2) }
        labels = Smooth.roundOutlines(labels, width, height, k: tones, radius: Int(Smooth.jsRound(f * 0.5 * size)), passes: 1)
        // An area smaller than this joins a neighbour (the web compares with the unrounded number).
        let smallest = max(4, Double(count) * (0.00002 + f * f * 0.00012))
        labels = Segmenter.mergeSmallRegions(labels, width, height, minRegion: Int(smallest.rounded(.up)))
        let (regionMap, regionCluster, regionSize) = Segmenter.connectedComponents(labels, width, height)
        let anchors = Segmenter.labelAnchors(regionMap, width, height, regionCount: regionCluster.count)
        var shares = [Double](repeating: 0, count: tones)
        for r in regionCluster.indices { shares[regionCluster[r]] += Double(regionSize[r]) / Double(count) }
        let regions = regionCluster.indices.map {
            BlockedPicture.Region(id: $0, tone: regionCluster[$0], size: regionSize[$0], anchorX: anchors[$0].x, anchorY: anchors[$0].y, anchorDist: anchors[$0].d)
        }
        return BlockedPicture(width: width, height: height, tones: tones, thresholds: thresholds, natural: natural, toneMap: labels, regionMap: regionMap, regions: regions, shares: shares)
    }
}
