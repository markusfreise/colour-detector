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
    /// "whole pan", "half pan", "tube 15 ml", or just "pan" / "tube".
    var forms: [String]
    var source: String = "chart"
    /// Part of the default selection of a new paint box.
    var enabled: Bool = false
    var note: String?
    /// Added by the user.
    var custom: Bool?

    var isCustom: Bool { custom ?? false }
    var mixPaint: MixPaint { MixPaint(id: id, hex: hex) }

    func comes(as form: PaintForm) -> Bool {
        forms.contains { $0.contains(form.rawValue) }
    }

    /// Short form label: "P" for pan, "T" for tube, "P/T" when owned as both.
    var formLabel: String {
        PaintForm.allCases.filter(comes(as:)).map { String($0.title.prefix(1)) }.joined(separator: "/")
    }

    /// Vendor number with at least three digits, e.g. "45" -> "045"; prefixed numbers ("W311") stay as they are.
    var displayNumber: String {
        number.allSatisfy(\.isNumber) && number.count < 3 ? String(repeating: "0", count: 3 - number.count) + number : number
    }

    fileprivate var numericNumber: Int { Int(number.filter(\.isNumber)) ?? 0 }
}

enum PaintForm: String, CaseIterable, Identifiable, Sendable {
    case pan, tube

    var id: String { rawValue }
    var title: String { self == .pan ? "Pans" : "Tubes" }
    var singular: String { self == .pan ? "Pan" : "Tube" }
}

struct PaintGroup: Identifiable {
    let form: PaintForm
    let paints: [Paint]

    var id: String { form.rawValue }
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

    /// Grouped by form (pans, then tubes). A paint owned as both pan and tube appears in both groups.
    func groupedByForm() -> [PaintGroup] {
        PaintForm.allCases
            .map { form in PaintGroup(form: form, paints: filter { $0.comes(as: form) }.sortedForBox()) }
            .filter { !$0.paints.isEmpty }
    }
}

/// One colour of the Schmincke Horadam colour chart; fills in name and colour when a paint is added by number.
struct ChartColour: Codable {
    let number: String
    let name: String
    let hex: String
}
