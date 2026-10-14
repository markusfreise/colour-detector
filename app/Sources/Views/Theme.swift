import SwiftUI

/// Sizes and small building blocks shared by all screens.
enum Theme {
    #if os(macOS)
    static let body = Font.system(size: 15)
    static let strong = Font.system(size: 15, weight: .semibold)
    static let small = Font.system(size: 12.5)
    static let title = Font.system(size: 17, weight: .semibold)
    static let chip = Font.system(size: 12)
    static let controlHeight: CGFloat = 34
    #else
    static let body = Font.body
    static let strong = Font.body.weight(.semibold)
    static let small = Font.footnote
    static let title = Font.title3.weight(.semibold)
    static let chip = Font.system(size: 12.5)
    static let controlHeight: CGFloat = 40
    #endif

    static let cardRadius: CGFloat = 14

    /// Behind the picture and the panels.
    static var page: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color(uiColor: .systemGroupedBackground)
        #endif
    }

    /// Surface of a card.
    static var surface: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }
}

/// A tick box with its label, the same on every platform.
struct CheckToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .imageScale(.large)
                    .foregroundStyle(configuration.isOn ? Color.accentColor : .secondary)
                configuration.label
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(configuration.isOn ? .isSelected : [])
    }
}

extension View {
    /// A system button that shows whether it is on: prominent when on, bordered when off.
    @ViewBuilder func borderedStyle(selected: Bool) -> some View {
        if selected { buttonStyle(.borderedProminent) } else { buttonStyle(.bordered) }
    }
}
