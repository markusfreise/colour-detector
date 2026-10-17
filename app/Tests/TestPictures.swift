import Foundation
@testable import Watercolourlove

/// Test pictures made as the web app's tests make them, so that both get the same pixels.
enum TestPictures {
    /// A pixel value as a Uint8ClampedArray of JavaScript stores it: clamped, halves to even.
    static func clamped(_ v: Double) -> UInt8 {
        if v.isNaN { return 0 }
        return UInt8(max(0, min(255, v)).rounded(.toNearestOrEven))
    }

    /// RGBA of a picture whose pixel (x, y) has the colour `at(x, y)` gives, row by row.
    static func makeImage(_ width: Int, _ height: Int, _ at: (Int, Int) -> (Double, Double, Double)) -> [UInt8] {
        var rgba = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let (r, g, b) = at(x, y)
                let i = (y * width + x) * 4
                rgba[i] = clamped(r); rgba[i + 1] = clamped(g); rgba[i + 2] = clamped(b)
            }
        }
        return rgba
    }

    static func random(_ seed: UInt32) -> () -> Double {
        var generator = Segmenter.Mulberry32(seed: seed)
        return { generator.next() }
    }

    /// Two flat halves (and a small dark square in the left one) under heavy noise.
    static func noisy(_ w: Int, _ h: Int, seed: UInt32 = 3) -> [UInt8] {
        let rand = random(seed)
        return makeImage(w, h) { x, y in
            func n() -> Double { Smooth.jsRound((rand() - 0.5) * 40) }
            if x >= 30 && x < 42 && y >= 40 && y < 52 { let r = 40 + n(), g = 30 + n(), b = 30 + n(); return (r, g, b) }
            if Double(x) < Double(w) / 2 { let r = 200 + n() * 0.7, g = 150 + n(), b = 110 + n(); return (r, g, b) }
            let r = 90 + n(), g = 130 + n(), b = 180 + n() * 0.7
            return (r, g, b)
        }
    }

    /// Blobs of many colours under noise.
    static func blobs(_ w: Int, _ h: Int) -> [UInt8] {
        let rand = random(21)
        return makeImage(w, h) { x, y in
            func n() -> Double { Smooth.jsRound((rand() - 0.5) * 50) }
            let fx = Double(x), fy = Double(y)
            let v = sin(fx / 9) + cos(fy / 7) + sin((fx + fy) / 13)
            let r = 128 + 60 * v + n(), g = 128 - 50 * sin(fx / 11) + n(), b = 100 + 40 * cos(fy / 5) + n()
            return (r, g, b)
        }
    }

    /// The eyes of `face`: 9 x 5 pixels around these points.
    static let eyes = [(60, 60), (100, 60)]

    /// A face, more or less: skin under noise with two eyes of 9 x 5 pixels, darker than the skin
    /// but not black, so that they go at a high Simplify.
    static func face(_ w: Int, _ h: Int) -> [UInt8] {
        let rand = random(5)
        return makeImage(w, h) { x, y in
            func n() -> Double { Smooth.jsRound((rand() - 0.5) * 30) }
            for (ex, ey) in eyes where abs(x - ex) <= 4 && abs(y - ey) <= 2 { let r = 165 + n(), g = 110 + n(), b = 90 + n(); return (r, g, b) }
            let r = 225 + n() * 0.5, g = 170 + n() + Double(x >> 3), b = 140 + n()
            return (r, g, b)
        }
    }

    /// A label map (0 = ground at lightness `ground`) with shapes drawn into it: (label, lightness, x0, y0, x1, y1).
    static func drawn(_ w: Int, _ h: Int, _ ground: Float, _ shapes: [(Int32, Float, Int, Int, Int, Int)]) -> (labels: [Int32], lab: [Float]) {
        var labels = [Int32](repeating: 0, count: w * h)
        var lab = [Float](repeating: 0, count: w * h * 3)
        for p in 0..<(w * h) { lab[p * 3] = ground }
        for (label, L, x0, y0, x1, y1) in shapes {
            for y in y0..<y1 { for x in x0..<x1 { labels[y * w + x] = label; lab[(y * w + x) * 3] = L } }
        }
        return (labels, lab)
    }

    /// A noisier copy of `lab`, as the photo before the noise was taken out.
    static func noisyPhoto(_ lab: [Float], seed: UInt32 = 4) -> [Float] {
        let rand = random(seed)
        return lab.enumerated().map { j, v in j % 3 == 0 ? Float(Double(v) + (rand() - 0.5) * 0.12) : v }
    }

    /// The sizes of the areas of a label map, in the order the areas are numbered.
    static func sizes(_ labels: [Int32], _ w: Int, _ h: Int) -> [Int] {
        Smooth.findAreas(labels, w, h).sizeOf.map { Int($0) }
    }

    /// FNV-1a over the low two bytes of every value, as the reference script of the web values hashes them.
    static func fnv(_ values: [Int32]) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for v in values {
            let u = UInt32(bitPattern: v)
            h ^= u & 0xff; h = h &* 16_777_619
            h ^= (u >> 8) & 0xff; h = h &* 16_777_619
        }
        return h
    }
}
