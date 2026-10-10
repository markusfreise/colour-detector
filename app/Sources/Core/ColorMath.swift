import Foundation

typealias Vec3 = SIMD3<Double>

/// Colour-space helpers: sRGB <-> linear RGB <-> OKLab, plus perceptual distance.
/// A port of src/lib/color.js; keep the two in step.
enum ColorMath {
    /// "#rrggbb" or "#rgb" -> channels 0...255.
    static func rgb(hex: String) -> Vec3 {
        var h = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        let n = UInt32(h, radix: 16) ?? 0
        return Vec3(Double((n >> 16) & 255), Double((n >> 8) & 255), Double(n & 255))
    }

    static func hex(rgb: Vec3) -> String {
        func c(_ v: Double) -> String {
            let n = Int(max(0, min(255, v.rounded())))
            return (n < 16 ? "0" : "") + String(n, radix: 16)
        }
        return "#\(c(rgb.x))\(c(rgb.y))\(c(rgb.z))"
    }

    static func srgbToLinear(_ v: Double) -> Double {
        let c = v / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    static func linearToSrgb(_ v: Double) -> Double {
        let c = v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1 / 2.4) - 0.055
        return max(0, min(255, c * 255))
    }

    static func linear(rgb: Vec3) -> Vec3 {
        Vec3(srgbToLinear(rgb.x), srgbToLinear(rgb.y), srgbToLinear(rgb.z))
    }

    static func rgb(linear: Vec3) -> Vec3 {
        Vec3(linearToSrgb(linear.x), linearToSrgb(linear.y), linearToSrgb(linear.z))
    }

    static func oklab(linear c: Vec3) -> Vec3 {
        let l = cbrt(0.4122214708 * c.x + 0.5363325363 * c.y + 0.0514459929 * c.z)
        let m = cbrt(0.2119034982 * c.x + 0.6806995451 * c.y + 0.1073969566 * c.z)
        let s = cbrt(0.0883024619 * c.x + 0.2817188376 * c.y + 0.6299787005 * c.z)
        return Vec3(
            0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        )
    }

    static func linear(oklab c: Vec3) -> Vec3 {
        let l = pow3(c.x + 0.3963377774 * c.y + 0.2158037573 * c.z)
        let m = pow3(c.x - 0.1055613458 * c.y - 0.0638541728 * c.z)
        let s = pow3(c.x - 0.0894841775 * c.y - 1.291485548 * c.z)
        return Vec3(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        )
    }

    private static func pow3(_ v: Double) -> Double { v * v * v }

    static func oklab(hex: String) -> Vec3 {
        oklab(linear: linear(rgb: rgb(hex: hex)))
    }

    static func hex(oklab lab: Vec3) -> String {
        hex(rgb: rgb(linear: linear(oklab: lab)))
    }

    /// Saturation and contrast of a picture, applied in OKLab so hues stay put.
    /// 1 = unchanged, 0 = grey / flat, 2 = double. `rgba` is returned as it is when nothing changes.
    static func adjust(rgba: [UInt8], saturation: Double = 1, contrast: Double = 1) -> [UInt8] {
        if saturation == 1, contrast == 1 { return rgba }
        let lut = (0..<256).map { srgbToLinear(Double($0)) }
        var out = rgba
        out.withUnsafeMutableBufferPointer { out in
            var i = 0
            while i < out.count {
                let lab = oklab(linear: Vec3(lut[Int(out[i])], lut[Int(out[i + 1])], lut[Int(out[i + 2])]))
                // Contrast pivots on mid lightness.
                let l = min(1, max(0, 0.5 + (lab.x - 0.5) * contrast))
                let c = rgb(linear: linear(oklab: Vec3(l, lab.y * saturation, lab.z * saturation)))
                out[i] = UInt8(c.x.rounded()); out[i + 1] = UInt8(c.y.rounded()); out[i + 2] = UInt8(c.z.rounded())
                i += 4
            }
        }
        return out
    }

    /// Euclidean distance in OKLab, scaled x100 so 1 unit is about a just-noticeable difference.
    static func deltaE(_ a: Vec3, _ b: Vec3) -> Double {
        let d = a - b
        return (d * d).sum().squareRoot() * 100
    }

    /// True when dark text reads better on the given background.
    static func prefersDarkText(on hex: String) -> Bool {
        oklab(hex: hex).x > 0.68
    }

    /// Colour-wheel family of a colour, from its OKLCh hue angle.
    static func family(hex: String) -> ColourFamily {
        let lab = oklab(hex: hex)
        if hypot(lab.y, lab.z) < 0.04 { return .neutral }
        let hue = (atan2(lab.z, lab.y) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
        if hue < 35 { return .red }
        if hue < 80 { return .orange }
        if hue < 110 { return .yellow }
        if hue < 200 { return .green }
        if hue < 285 { return .blue }
        if hue < 345 { return .violet }
        return .red
    }
}

/// Base colours of the colour wheel, in wheel order; `neutral` collects greys, blacks and other low-chroma paints.
enum ColourFamily: Int, Comparable {
    case yellow, orange, red, violet, blue, green, neutral

    static func < (a: ColourFamily, b: ColourFamily) -> Bool { a.rawValue < b.rawValue }
}
