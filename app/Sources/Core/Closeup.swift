import CoreGraphics
import Foundation

/// Close-ups: a part of the picture chosen with a frame, analysed as a picture of its own.
/// Port of `src/lib/closeup.js`.
enum Closeups {
    /// A drag shorter than this share of a side is a slip of the hand, not a choice.
    static let minSide = 0.04
    /// A small part is enlarged for the analysis, up to this factor: beyond it there is nothing more to find.
    static let maxEnlarge = 4.0

    /// The rectangle between two points of a drag, as shares of the picture (0...1), or nil when it
    /// is too small. `smallest` is the least share of a side that counts (0 while the frame is only drawn).
    static func rect(from a: CGPoint, to b: CGPoint, smallest: Double = minSide) -> CGRect? {
        func clamp(_ v: Double) -> Double { min(1, max(0, v)) }
        let x0 = clamp(min(a.x, b.x)), x1 = clamp(max(a.x, b.x))
        let y0 = clamp(min(a.y, b.y)), y1 = clamp(max(a.y, b.y))
        if x1 - x0 < smallest || y1 - y0 < smallest { return nil }
        return CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
    }

    /// Where a close-up lies in the source picture (`sx`...`sh`, pixels), and the size it is analysed at.
    static func size(sourceWidth: Int, sourceHeight: Int, rect: CGRect, workPixels: Int)
        -> (sx: Int, sy: Int, sw: Int, sh: Int, width: Int, height: Int) {
        let sx = Int((rect.minX * Double(sourceWidth)).rounded())
        let sy = Int((rect.minY * Double(sourceHeight)).rounded())
        let sw = max(1, min(sourceWidth - sx, Int((rect.width * Double(sourceWidth)).rounded())))
        let sh = max(1, min(sourceHeight - sy, Int((rect.height * Double(sourceHeight)).rounded())))
        let scale = min(maxEnlarge, (Double(workPixels) / Double(sw * sh)).squareRoot())
        return (sx, sy, sw, sh, max(1, Int((Double(sw) * scale).rounded())), max(1, Int((Double(sh) * scale).rounded())))
    }
}
