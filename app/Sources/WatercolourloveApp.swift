import SwiftUI

@main
struct WatercolourloveApp: App {
    @State private var library: Library
    @State private var session: Session
    @State private var collection = PictureCollection()
    @State private var store = Store()
    @State private var account = Account()
    /// The preferences, as on the web: "auto" follows the system.
    @AppStorage(Localization.languageKey) private var language = "auto"
    @AppStorage(Localization.themeKey) private var theme = "auto"
    @State private var showingPreferences = false

    init() {
        Localization.apply(UserDefaults.standard.string(forKey: Localization.languageKey) ?? "auto")
        let library = Library()
        _library = State(initialValue: library)
        _session = State(initialValue: Session(library: library))
    }

    var body: some Scene {
        WindowGroup {
            // Before the views below look up their texts.
            let _ = Localization.apply(language)
            RootView()
                .environment(library)
                .environment(session)
                .environment(collection)
                .environment(store)
                .environment(account)
                .environment(\.locale, Localization.locale)
                .preferredColorScheme(Localization.colorScheme(theme))
                // A plan bought on the web counts as the purchase.
                .onChange(of: account.pro, initial: true) { store.accountPro = account.pro }
                // A new language: every text is looked up again.
                .id(language)
                // Above the redrawn views, so that it stays open while the language changes.
                .sheet(isPresented: $showingPreferences) {
                    PreferencesView()
                        .environment(account)
                        .environment(\.locale, Localization.locale)
                        .preferredColorScheme(Localization.colorScheme(theme))
                }
                .environment(\.openPreferences) { showingPreferences = true }
                .onChange(of: theme, initial: true) { applyTheme() }
                #if os(macOS)
                .frame(minWidth: 940, minHeight: 600)
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1280, height: 860)
        #endif
    }

    /// On the Mac the sheets are windows of their own: the whole app takes the look.
    private func applyTheme() {
        #if os(macOS)
        NSApp.appearance = switch theme {
        case "light": NSAppearance(named: .aqua)
        case "dark": NSAppearance(named: .darkAqua)
        default: nil
        }
        #endif
    }
}

/// Opens the preferences, which live above the screen that is redrawn when the language changes.
private struct OpenPreferencesKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

extension EnvironmentValues {
    var openPreferences: () -> Void {
        get { self[OpenPreferencesKey.self] }
        set { self[OpenPreferencesKey.self] = newValue }
    }
}
