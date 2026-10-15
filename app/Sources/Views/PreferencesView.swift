import SwiftUI

/// Language and light or dark, as the web's preferences in the account dialog. Kept on this
/// device; "Automatic" follows the system.
struct PreferencesView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Localization.languageKey) private var language = "auto"
    @AppStorage(Localization.themeKey) private var theme = "auto"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Preferences").font(Theme.title)
            Grid(alignment: .leading, horizontalSpacing: Theme.gap, verticalSpacing: 10) {
                GridRow {
                    Text("Language").lineLimit(1).fixedSize()
                    // Each language under its own name, so that it is found whichever one is set.
                    WordGroup(
                        options: Localization.languages, selection: language,
                        title: { $0 == "auto" ? L("Automatic") : $0 == "de" ? "Deutsch" : "English" },
                        choose: { language = $0 }
                    )
                }
                GridRow {
                    Text("Appearance").lineLimit(1).fixedSize()
                    WordGroup(
                        options: Localization.themes, selection: theme,
                        title: { $0 == "auto" ? L("Automatic") : $0 == "light" ? L("Light") : L("Dark") },
                        choose: { theme = $0 }
                    )
                }
            }
            Divider()
            HStack {
                Spacer()
                Button("Close") { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .foregroundStyle(Theme.copy)
        // Its own texts in the new language at once.
        .id(language)
        .presentationDetents([.medium])
        #if os(macOS)
        .frame(width: 440)
        #endif
    }
}

/// The web's segmented group with words instead of icons: as wide as the words, the chosen one in
/// the primary colour.
struct WordGroup<Option: Hashable>: View {
    let options: [Option]
    let selection: Option
    let title: (Option) -> String
    let choose: (Option) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.element) { index, option in
                let active = option == selection
                if index > 0 { Theme.border.frame(width: 1) }
                Button { choose(option) } label: {
                    Text(title(option))
                        .fontWeight(active ? .semibold : .regular)
                        .foregroundStyle(active ? Theme.onCorporate : Theme.copyLight)
                        .padding(.horizontal, 14)
                        .frame(minHeight: Theme.controlHeight)
                        .background(active ? Theme.corporate : .clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .fixedSize()
        .background(Theme.raised)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSmall))
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall).strokeBorder(Theme.border))
        .flatShadow()
    }
}
