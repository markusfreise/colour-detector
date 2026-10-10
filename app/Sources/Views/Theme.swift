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

    static let sidebarWidth: CGFloat = 520
    static let cardRadius: CGFloat = 14

    /// Page behind the cards.
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

/// A panel on the page: rounded, on its own surface, with a light shadow.
struct Card<Content: View>: View {
    var title: String?
    var accent = false
    @ViewBuilder var actions: () -> AnyView
    @ViewBuilder var content: Content

    init(_ title: String? = nil, accent: Bool = false, @ViewBuilder content: () -> Content) {
        self.title = title
        self.accent = accent
        self.actions = { AnyView(EmptyView()) }
        self.content = content()
    }

    init(_ title: String, accent: Bool = false, @ViewBuilder actions: @escaping () -> some View, @ViewBuilder content: () -> Content) {
        self.title = title
        self.accent = accent
        self.actions = { AnyView(actions()) }
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                HStack(spacing: 8) {
                    Text(title).font(Theme.title)
                    Spacer(minLength: 8)
                    actions()
                }
            }
            content
        }
        .font(Theme.body)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
        .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius).strokeBorder(accent ? Color.accentColor : Color.primary.opacity(0.06), lineWidth: accent ? 1.5 : 1))
        .shadow(color: .black.opacity(0.07), radius: 10, y: 3)
    }
}

/// A row of equally wide buttons of which one is selected. Larger and calmer than the system's segmented control.
struct SegmentedButtons<Value: Hashable>: View {
    let options: [(value: Value, title: String)]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                let selected = option.value == selection
                Button {
                    selection = option.value
                } label: {
                    Text(option.title)
                        .font(selected ? Theme.strong : Theme.body)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .padding(.horizontal, 4)
                        .frame(maxWidth: .infinity, minHeight: Theme.controlHeight)
                        .foregroundStyle(selected ? Color.accentColor : .secondary)
                        .background(selected ? Color.accentColor.opacity(0.14) : .clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
                if index < options.count - 1 {
                    Rectangle().fill(Color.primary.opacity(0.12)).frame(width: 1, height: Theme.controlHeight)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Color.primary.opacity(0.14)))
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

/// The app's ordinary button: outlined, roomy, with the text in the body size.
struct OutlineButtonStyle: ButtonStyle {
    var prominent = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(prominent ? Theme.strong : Theme.body)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .frame(minHeight: Theme.controlHeight - 2)
            .foregroundStyle(prominent ? Color.accentColor : .primary)
            .background(prominent ? Color.accentColor.opacity(0.14) : Theme.surface, in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(prominent ? Color.accentColor.opacity(0.4) : Color.primary.opacity(0.16)))
            .opacity(enabled ? (configuration.isPressed ? 0.6 : 1) : 0.4)
            .contentShape(Rectangle())
    }
}

extension ButtonStyle where Self == OutlineButtonStyle {
    static var outline: OutlineButtonStyle { OutlineButtonStyle() }
    static var outlineProminent: OutlineButtonStyle { OutlineButtonStyle(prominent: true) }
}
