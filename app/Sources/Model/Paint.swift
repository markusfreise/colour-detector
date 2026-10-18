import Foundation

struct Paint: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var vendor: String
    var line: String = ""
    var number: String
    var name: String
    var nameDe: String = ""
    /// Colour at strength 1: a mid-strength wash on white paper, not the masstone.
    var hex: String
    /// "whole pan", "half pan", "tube 15 ml", or just "pan" / "tube" / "travelbox".
    var forms: [String]
    var source: String = "chart"
    /// Part of the default selection of a new paint box.
    var enabled: Bool = false
    var note: String?
    /// Added by the user.
    var custom: Bool?

    /// The series the stock is built on: its paints are grouped by form, every other series gets a group of its own.
    static let houseVendor = "Schmincke Horadam"
    /// What the house series was called before it was named after the paints (custom paints saved then).
    static let oldHouseVendor = "Schmincke"

    var isCustom: Bool { custom ?? false }

    /// The name in the chosen language: the German one where the chart has it.
    var displayName: String { Localization.current == "de" && !nameDe.isEmpty ? nameDe : name }
    var mixPaint: MixPaint { MixPaint(id: id, hex: hex) }

    func comes(as form: PaintForm) -> Bool {
        forms.contains { $0.contains(form.rawValue) }
    }

    /// Keys of the groups the paint is listed in: its forms for Schmincke, the travel box, or its brand.
    var groupKeys: [String] {
        if comes(as: .travelbox) { return [PaintForm.travelbox.rawValue] }
        if vendor != Paint.houseVendor { return ["vendor:\(vendor.isEmpty ? "Other" : vendor)"] }
        return [PaintForm.pan, .tube].filter(comes(as:)).map(\.rawValue)
    }

    /// The form a paint of one's own comes in, as the paint form offers it; anything else is a pan.
    var ownForm: PaintForm { PaintForm.own(forms.first) }

    /// Short form label: "P" for pan, "T" for tube, "S" for the travel box, "P/T" when owned as both.
    var formLabel: String {
        PaintForm.allCases.filter(comes(as:)).map(\.label).joined(separator: "/")
    }

    /// Vendor number with at least three digits, e.g. "45" -> "045"; prefixed numbers ("W311") stay as they are.
    var displayNumber: String {
        number.allSatisfy(\.isNumber) && number.count < 3 ? String(repeating: "0", count: 3 - number.count) + number : number
    }

    fileprivate var numericNumber: Int { Int(number.filter(\.isNumber)) ?? 0 }
}

enum PaintForm: String, CaseIterable, Identifiable, Sendable {
    case pan, tube, travelbox, liquid, other

    /// The forms a paint added by hand can have, as the web's OWN_FORMS.
    static let own: [PaintForm] = [.pan, .tube, .liquid, .other]

    /// The form a box file or a form names; anything else is a pan (the web's ownForm).
    static func own(_ name: String?) -> PaintForm { own.first { $0.rawValue == name } ?? .pan }

    var id: String { rawValue }
    var title: String {
        switch self {
        case .pan: L("%@ Pans", Paint.houseVendor)
        case .tube: L("%@ Tubes", Paint.houseVendor)
        case .travelbox: L("Travelbox")
        case .liquid: L("Liquid")
        case .other: L("Other")
        }
    }
    var singular: String {
        switch self {
        case .pan: L("Pan")
        case .tube: L("Tube")
        case .travelbox: L("Travelbox")
        case .liquid: L("Liquid")
        case .other: L("Other")
        }
    }
    /// One letter, in the chosen language: P for pan (N for Näpfchen in German), T for tube.
    var label: String {
        switch self {
        case .pan: L("P (pan)")
        case .tube: L("T (tube)")
        case .travelbox: L("S (travel box)")
        case .liquid: L("L (liquid)")
        case .other: L("O (other)")
        }
    }
}

struct PaintGroup: Identifiable {
    let id: String
    let title: String
    /// The paints listed: the group's paints without the ones left out by the caller.
    let paints: [Paint]
}

extension Array where Element == Paint {
    /// Paints in colour-wheel order, by number inside each family.
    func sortedForBox() -> [Paint] {
        map { (paint: $0, family: ColorMath.family(hex: $0.hex)) }
            .sorted {
                if $0.family != $1.family { return $0.family < $1.family }
                if $0.paint.numericNumber != $1.paint.numericNumber { return $0.paint.numericNumber < $1.paint.numericNumber }
                return $0.paint.number < $1.paint.number
            }
            .map(\.paint)
    }

    /// Schmincke pans, Schmincke tubes, the travel box, then one group per other brand.
    /// The travel box keeps the places in the box ("A1" to "C6"). A paint owned as both pan and tube
    /// appears in both groups.
    /// `shown` leaves paints out of the lists without dropping their group (the paint box hides selected paints).
    func groupedByForm(shown: (Paint) -> Bool = { _ in true }) -> [PaintGroup] {
        let keyed = map { (paint: $0, keys: $0.groupKeys) }
        let vendors = Set(keyed.flatMap(\.keys).filter { $0.hasPrefix("vendor:") }).sorted { $0.localizedCompare($1) == .orderedAscending }
        let groups = [PaintForm.pan, .tube, .travelbox].map { (key: $0.rawValue, title: $0.title) } + vendors.map { (key: $0, title: String($0.dropFirst("vendor:".count))) }
        return groups.compactMap { group in
            let own = keyed.filter { $0.keys.contains(group.key) }.map(\.paint)
            guard !own.isEmpty else { return nil }
            let listed = own.filter(shown)
            let byPlace = listed.sorted { $0.number.compare($1.number, options: .numeric) == .orderedAscending }
            return PaintGroup(id: group.key, title: group.title, paints: group.key == PaintForm.travelbox.rawValue ? byPlace : listed.sortedForBox())
        }
    }
}

/// One colour of a library's colour chart; fills in name and colour when a paint is added by number.
/// What the maker's chart says besides (`src/data/libraries.js`): names in other languages,
/// pigments by Colour Index, transparency. `hex` is nil where the chart gives no reliable colour,
/// and `unverified` says why: then the number fills in the name and the colour is set by hand.
struct ChartColour: Codable, Hashable {
    let number: String
    let name: String
    let hex: String?
    var names: [String: String]? = nil
    var pigments: [String]? = nil
    var transparency: String? = nil
    var unverified: String? = nil

    /// All the names the colour goes by, for the search.
    var allNames: [String] { [name] + (names.map { Array($0.values) } ?? []) }

    /// Pigments and transparency, in the language of the app.
    var details: [String] {
        var parts: [String] = []
        if let pigments, !pigments.isEmpty { parts.append(pigments.joined(separator: " ")) }
        if let word = transparency.flatMap({ Self.transparencyWords[$0] }) { parts.append(L(word)) }
        return parts
    }

    /// How much of the paper a paint covers, as the makers' charts mark it.
    static let transparencyWords = ["T": "Transparent", "ST": "Semi-transparent", "SO": "Semi-opaque", "O": "Opaque"]
}

/// A paint series that comes with the app, with its colour chart (`src/data/libraries.js`):
/// a number of the series entered for a paint fills in its name and colour.
struct PaintLibrary: Codable, Identifiable {
    let id: String
    /// As it is written on the tube; also the vendor of the paints added from it.
    let name: String
    let catalogue: [ChartColour]
    /// Other names the series is typed under (the German name of the common colours).
    var aliases: [String]? = nil
    /// For everybody: the common colours. The charts of the makers come with the full version.
    var free: Bool? = nil

    /// Whether its colours may be used: the common colours always, a maker's chart when unlocked.
    func isOpen(unlocked: Bool) -> Bool { unlocked || free == true }

    func colour(number: String) -> ChartColour? {
        let wanted = number.trimmingCharacters(in: .whitespaces).lowercased()
        return catalogue.first { $0.number.lowercased() == wanted }
    }
}
