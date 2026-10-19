import Foundation

/// Boxes of the picture that ask for more detail (the focus of `Segmenter.segment`).
/// A port of `boxMask` in src/lib/details.js. The final wash of details (`detailWash`) there serves
/// the AI plan only and is not ported: the app has no AI.
enum Details {
    /// A box as parts of the picture (0...1).
    struct Box: Sendable, Equatable {
        var left: Double
        var top: Double
        var right: Double
        var bottom: Double
    }

    /// Pixels inside the boxes: 1 inside, 0 outside. `pad` widens a box by that part of its own size,
    /// since boxes from a model are approximate.
    static func boxMask(_ boxes: [Box], _ width: Int, _ height: Int, pad: Double = 0.15) -> [UInt8] {
        var mask = [UInt8](repeating: 0, count: width * height)
        for box in boxes {
            let px = (box.right - box.left) * pad, py = (box.bottom - box.top) * pad
            let x0 = max(0, Int(((box.left - px) * Double(width)).rounded(.down))), x1 = min(width - 1, Int(((box.right + px) * Double(width)).rounded(.up)))
            let y0 = max(0, Int(((box.top - py) * Double(height)).rounded(.down))), y1 = min(height - 1, Int(((box.bottom + py) * Double(height)).rounded(.up)))
            if x0 > x1 || y0 > y1 { continue }
            for y in y0...y1 { for x in x0...x1 { mask[y * width + x] = 1 } }
        }
        return mask
    }
}
