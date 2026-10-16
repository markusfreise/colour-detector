import Foundation
import SwiftUI

/// The language and the light or dark look chosen in the preferences, as on the web: "auto"
/// follows the system. The texts are in Resources/Localizable.xcstrings.
enum Localization {
    static let languageKey = "language"
    static let themeKey = "theme"
    static let languages = ["auto", "en", "de"]
    static let themes = ["auto", "light", "dark"]

    /// The .lproj of the chosen language, or nil for the system's choice.
    nonisolated(unsafe) private(set) static var bundle: Bundle?

    /// Points every lookup of the app's texts at the chosen language: SwiftUI's Text and Button
    /// as well as `L(_:)`. Call it at launch and whenever the language changes, then redraw.
    static func apply(_ language: String) {
        if !swapped {
            object_setClass(Bundle.main, LanguageBundle.self)
            swapped = true
        }
        bundle = language == "auto" ? nil : Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    nonisolated(unsafe) private static var swapped = false

    /// The language the texts are shown in: the chosen one, or what the system picked for the app.
    static var current: String {
        let chosen = UserDefaults.standard.string(forKey: languageKey) ?? "auto"
        return chosen == "auto" ? (Bundle.main.preferredLocalizations.first ?? "en") : chosen
    }

    /// For numbers and dates in the chosen language.
    static var locale: Locale {
        let chosen = UserDefaults.standard.string(forKey: languageKey) ?? "auto"
        return chosen == "auto" ? .autoupdatingCurrent : Locale(identifier: chosen)
    }

    static func colorScheme(_ theme: String) -> ColorScheme? {
        switch theme {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }
}

/// Bundle.main with the texts of the chosen language.
private final class LanguageBundle: Bundle, @unchecked Sendable {
    override func localizedString(forKey key: String, value: String?, table tableName: String?) -> String {
        if let bundle = Localization.bundle {
            return bundle.localizedString(forKey: key, value: value, table: tableName)
        }
        return super.localizedString(forKey: key, value: value, table: tableName)
    }

    override var preferredLocalizations: [String] {
        Localization.bundle == nil ? super.preferredLocalizations : [Localization.current]
    }

    // String(localized:) and SwiftUI's Text look up through these two. The texts have no
    // Markdown, so a plain attributed string is enough.
    @available(macOS 15.4, iOS 18.4, *)
    override func __localizedString(forKey key: String, value: String?, table tableName: String?, localizations: [String]) -> String {
        if let bundle = Localization.bundle {
            return bundle.localizedString(forKey: key, value: value, table: tableName)
        }
        return super.__localizedString(forKey: key, value: value, table: tableName, localizations: localizations)
    }

    override func __localizedAttributedString(forKey key: String, value: String?, table tableName: String?) -> NSAttributedString {
        if let bundle = Localization.bundle {
            return NSAttributedString(string: bundle.localizedString(forKey: key, value: value, table: tableName))
        }
        return super.__localizedAttributedString(forKey: key, value: value, table: tableName)
    }
}

/// A text of the app in the chosen language, for places that need a String rather than a Text.
/// With arguments the text is a format: L("%lld of %lld", 1, 3).
func L(_ key: String, _ arguments: CVarArg...) -> String {
    let text = Bundle.main.localizedString(forKey: key, value: key, table: nil)
    return arguments.isEmpty ? text : String(format: text, locale: Localization.locale, arguments: arguments)
}

/// "1 coat", "3 coats": the singular and plural are their own texts, with the number as %lld.
func L(count: Int, _ one: String, _ other: String) -> String {
    L(count == 1 ? one : other, count)
}
