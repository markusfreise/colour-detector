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

    /// The brand the stock is built on: its paints are grouped by form, every other brand gets a group of its own.
    static let houseVendor = "Schmincke"

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
        return PaintForm.own.filter(comes(as:)).map(\.rawValue)
    }

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
    case pan, tube, travelbox

    /// The forms a paint added by hand can have.
    static let own: [PaintForm] = [.pan, .tube]

    var id: String { rawValue }
    var title: String {
        switch self {
        case .pan: L("%@ Pans", Paint.houseVendor)
        case .tube: L("%@ Tubes", Paint.houseVendor)
        case .travelbox: L("Travelbox")
        }
    }
    var singular: String {
        switch self {
        case .pan: L("Pan")
        case .tube: L("Tube")
        case .travelbox: L("Travelbox")
        }
    }
    /// One letter, in the chosen language: P for pan (N for Näpfchen in German), T for tube.
    var label: String {
        switch self {
        case .pan: L("P (pan)")
        case .tube: L("T (tube)")
        case .travelbox: L("S (travel box)")
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
        let groups = PaintForm.allCases.map { (key: $0.rawValue, title: $0.title) } + vendors.map { (key: $0, title: String($0.dropFirst("vendor:".count))) }
        return groups.compactMap { group in
            let own = keyed.filter { $0.keys.contains(group.key) }.map(\.paint)
            guard !own.isEmpty else { return nil }
            let listed = own.filter(shown)
            let byPlace = listed.sorted { $0.number.compare($1.number, options: .numeric) == .orderedAscending }
            return PaintGroup(id: group.key, title: group.title, paints: group.key == PaintForm.travelbox.rawValue ? byPlace : listed.sortedForBox())
        }
    }
}

/// One colour of the Schmincke Horadam colour chart; fills in name and colour when a paint is added by number.
struct ChartColour: Codable {
    let number: String
    let name: String
    let hex: String
}
