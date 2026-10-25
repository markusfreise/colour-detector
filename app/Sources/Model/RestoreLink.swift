import Foundation

/// The link of the QR code on the printed sheet, as the web's `src/lib/restoreLink.js` writes it:
/// the website with `#restore=` and the settings that differ from the defaults and the palette, as
/// JSON, compressed (raw deflate) and in base64url. Opened, the website restores them; the photo is
/// not in it. The settings go in the web's terms: Simplify counted from the web's zero, the numbers
/// as false, true or "backdrop", no grid as false.
enum RestoreLink {
    static let site = "https://watercolourlove.de/"

    static func url(settings: AnalysisSettings, palette: Palette, paints byID: [String: Paint]) -> String? {
        let current = web(settings)
        let defaults = web(AnalysisSettings())
        var changed: [String: Any] = [:]
        for (key, value) in current where !same(value, defaults[key]) { changed[key] = value }
        let ref = { (id: String) -> Any? in
            guard let paint = byID[id] else { return nil }
            return paint.custom == true ? [paint.vendor, paint.number, paint.name, paint.hex] : id
        }
        var data: [String: Any] = ["v": 1, "s": changed]
        if !palette.auto { data["p"] = palette.paintIDs.compactMap(ref) }
        if !palette.layerAuto { data["l"] = palette.layerIDs.compactMap(ref) }
        if palette.autoOff != ["travelbox"] { data["o"] = palette.autoOff }
        guard let json = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]),
              let packed = try? (json as NSData).compressed(using: .zlib) as Data else { return nil }
        let code = packed.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return site + "#restore=" + code
    }

    /// The settings as the web names and counts them.
    static func web(_ s: AnalysisSettings) -> [String: Any] {
        let numbers: Any = switch s.numbers {
        case .none: false
        case .plain: true
        case .backdrop: "backdrop"
        }
        return [
            "mode": s.mode.rawValue, "layerCount": s.layerCount, "layerSimplify": s.layerSimplify,
            "layerAccents": s.layerAccents, "maxCoats": s.maxCoats, "colours": s.colours,
            "simplify": s.simplify + Segmenter.simplifyZero, "geometric": s.geometric, "maxPaints": s.maxPaints,
            "details": s.details, "values": s.values, "saturation": s.saturation, "contrast": s.contrast,
            "view": s.view.rawValue, "blockingTones": s.blockingTones, "blockingForms": s.blockingForms,
            "blockingOpacity": s.blockingOpacity, "outlines": s.outlines, "numbers": numbers,
            "numberSize": s.numberSize.rawValue, "grid": s.grid?.rawValue ?? false, "gridColumns": s.gridColumns,
        ]
    }

    private static func same(_ a: Any, _ b: Any?) -> Bool {
        guard let b else { return false }
        let json = { (value: Any) in try? JSONSerialization.data(withJSONObject: [value], options: [.fragmentsAllowed]) }
        return json(a) == json(b)
    }
}
