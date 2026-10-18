import Foundation

/// A colour of a series as the dialog that adds colours to a box lists it: a colour of the chart,
/// as the paint already known with that number where there is one, or a known paint off the chart.
/// As the entries of `seriesColours` in paintbox.js.
struct SeriesColour: Identifiable, Hashable {
    /// Series and number, lower case.
    let id: String
    let vendor: String
    let number: String
    /// In the language shown.
    let name: String
    /// The English name of the chart (or of the paint), as it is stored.
    let chartName: String
    let nameDe: String
    /// Nil for a colour whose value the chart does not give reliably.
    let hex: String?
    /// Nil for a colour that is on the chart only.
    let paintID: String?
    let search: String
}

enum SeriesColours {
    private static func key(_ vendor: String, _ number: String) -> String {
        "\(vendor.trimmingCharacters(in: .whitespaces).lowercased())|\(number.trimmingCharacters(in: .whitespaces).lowercased())"
    }

    /// The colours of a series by number: each colour of the chart (`catalogue`, empty without the
    /// charts), as the paint already known with that number where there is one, and the known paints
    /// of the series that are not on it. `name` gives a paint's name in the language shown; `locale`
    /// picks the chart's names.
    static func list(vendor: String, catalogue: [ChartColour], paints: [Paint], name: (Paint) -> String = { $0.name }, locale: String = "en") -> [SeriesColour] {
        let prefix = key(vendor, "")
        var known: [String: Paint] = [:]
        var order: [String] = []
        for paint in paints {
            let k = key(paint.vendor, paint.number)
            guard k.hasPrefix(prefix) else { continue }
            if known[k] == nil { order.append(k) }
            known[k] = paint
        }
        var listed = Set<String>()
        var colours: [SeriesColour] = []
        for colour in catalogue {
            let k = key(vendor, colour.number)
            let paint = known[k]
            listed.insert(k)
            let shown = paint.map(name) ?? colour.names?[locale] ?? colour.name
            let words = [vendor, colour.number, shown] + colour.allNames + (colour.pigments ?? []) + [paint?.nameDe ?? ""]
            colours.append(SeriesColour(id: k, vendor: vendor, number: colour.number, name: shown, chartName: colour.name, nameDe: colour.names?["de"] ?? "", hex: paint?.hex ?? colour.hex, paintID: paint?.id, search: words.joined(separator: " ").lowercased()))
        }
        for k in order where !listed.contains(k) {
            guard let paint = known[k] else { continue }
            let words = [vendor, paint.number, name(paint), paint.name, paint.nameDe]
            colours.append(SeriesColour(id: k, vendor: vendor, number: paint.number, name: name(paint), chartName: paint.name, nameDe: paint.nameDe, hex: paint.hex, paintID: paint.id, search: words.joined(separator: " ").lowercased()))
        }
        return colours.sorted { $0.number.compare($1.number, options: .numeric) == .orderedAscending }
    }

    /// The colours with every word of `query` in their series, number or names, and of the hue group `hue` (or any).
    static func filter(_ colours: [SeriesColour], query: String = "", hue: HueGroup? = nil) -> [SeriesColour] {
        let words = query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
        return colours.filter { colour in
            (hue == nil || colour.hex.map { ColorMath.hueGroup(hex: $0) } == hue) && words.allSatisfy { colour.search.contains($0) }
        }
    }
}
