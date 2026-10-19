import Foundation

/// The words the colour logic hands over in English (it is a port of the web's and checked
/// against it), in the chosen language for the screen and the printed sheet.
enum Words {
    /// "medium", "concentrated (hardly any water)", "excellent", "tea": each is its own text.
    static func term(_ english: String) -> String { L(english) }

    /// How watery a mix is, without the aside in brackets: "concentrated".
    static func shortDilution(_ dilution: String) -> String {
        L(withoutAside(dilution))
    }

    /// "concentrated (hardly any water)" -> "concentrated".
    static func withoutAside(_ text: String) -> String {
        text.replacingOccurrences(of: #" \(.*\)$"#, with: "", options: .regularExpression)
    }

    /// The same with a capital, for the top of a tile.
    static func dilutionTitle(_ dilution: String) -> String {
        let short = shortDilution(dilution)
        return short.prefix(1).uppercased() + short.dropFirst()
    }

    /// How to prepare a wash: "1 part paint to 4 parts water, like coffee". Built from the numbers
    /// of the plan rather than its English sentence.
    static func guide(water: Double, consistency: String) -> String {
        guard water.isFinite else { return L("clear water") }
        let like = L(consistency)
        if water < 1 { return L("1 part paint to hardly any water, like %@", like) }
        return L(water == 1 ? "1 part paint to %@ part water, like %@" : "1 part paint to %@ parts water, like %@", number(water), like)
    }

    /// The short form in the list of layers: "1:4 with water, like coffee".
    static func shortGuide(water: Double, consistency: String) -> String {
        water >= 1 ? L("1:%@ with water, like %@", number(water), L(consistency)) : guide(water: water, consistency: consistency)
    }

    /// 4, 2.5 or 2,5: whole numbers without decimals.
    static func number(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(value == value.rounded() ? 0 : 1)).locale(Localization.locale))
    }
}
