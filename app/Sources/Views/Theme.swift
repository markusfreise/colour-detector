import SwiftUI

/// Sizes, colours and small building blocks shared by all screens: the web app's design tokens
/// (resources/scss/properties.scss) and its buttons, segmented groups and floating panels.
enum Theme {
    #if os(macOS)
    static let body = Font.system(size: 15)
    static let strong = Font.system(size: 15, weight: .semibold)
    static let small = Font.system(size: 12.5)
    static let title = Font.system(size: 17, weight: .semibold)
    static let chip = Font.system(size: 12)
    static let controlHeight: CGFloat = 34
    /// Side of a square icon button (.button with an icon on the web).
    static let iconButton: CGFloat = 36
    #else
    static let body = Font.body
    static let strong = Font.body.weight(.semibold)
    static let small = Font.footnote
    static let title = Font.title3.weight(.semibold)
    static let chip = Font.system(size: 12.5)
    static let controlHeight: CGFloat = 40
    static let iconButton: CGFloat = 42
    #endif

    static let cardRadius: CGFloat = 14

    // --gap and its multiples, --radius*
    static let gap: CGFloat = 12
    static let radius: CGFloat = 10
    static let radiusMedium: CGFloat = 8
    static let radiusSmall: CGFloat = 6

    // --c-* in light and dark
    static let background = Color(light: "#f7f4ee", dark: "#1b1a18")
    static let raised = Color(light: "#ffffff", dark: "#252321")
    static let copy = Color(light: "#2a2622", dark: "#eee9e1")
    static let copyLight = Color(light: "#6d655c", dark: "#a89f94")
    static let corporate = Color(light: "#242424", dark: "#eee9e1")
    static let corporateSoft = Color(light: "#ebe8e3", dark: "#33302c")
    static let onCorporate = Color(light: "#ffffff", dark: "#1b1a18")
    static let border = Color(light: "#e4ddd2", dark: "#3a3632")
    static let borderLight = Color(light: "#efece7", dark: "#2e2b28")

    /// Behind the picture and the panels.
    static var page: Color { background }

    /// Surface of a card.
    static var surface: Color { raised }
}

extension Color {
    /// A colour with its own value in dark mode, as a token of properties.scss.
    init(light: String, dark: String) {
        #if os(macOS)
        self.init(nsColor: NSColor(name: nil) { appearance in
            NSColor(Color(hex: appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light))
        })
        #else
        self.init(uiColor: UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light))
        })
        #endif
    }
}

extension View {
    /// --shadow-flat: buttons and groups.
    func flatShadow() -> some View { shadow(color: .black.opacity(0.18), radius: 1.5, y: 1) }

    /// --shadow: what floats over the picture.
    func floatShadow() -> some View { shadow(color: .black.opacity(0.18), radius: 15, y: 8) }
}

/// The web app's square icon button: white with a thin border, in the primary colour when it is on.
struct IconButtonStyle: ButtonStyle {
    var active = false
    var size = Theme.iconButton
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .labelStyle(.iconOnly)
            .font(.system(size: size * 0.45))
            .foregroundStyle(active ? Theme.onCorporate : configuration.isPressed ? Theme.corporate : Theme.copy)
            .frame(width: size, height: size)
            .background(active ? Theme.corporate : Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radiusSmall))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall).strokeBorder(active ? .clear : Theme.border))
            .flatShadow()
            .opacity(enabled ? 1 : 0.45)
            .contentShape(Rectangle())
    }
}

/// The square icon button with its tooltip, for a menu as well as for an action. The title is
/// the English text; it is shown in the chosen language.
struct IconButton: View {
    let title: String
    let symbol: String
    var active = false
    var size = Theme.iconButton
    /// The short label shown with Help on; the title when there is none.
    var hint: String? = nil
    /// Below a row of tools: 1 puts the label a line lower than its neighbours'.
    var hintRow = 0
    let action: () -> Void

    var body: some View {
        Button(L(title), systemImage: symbol, action: action)
            .buttonStyle(IconButtonStyle(active: active, size: size))
            .help(L(title))
            .hint(hint ?? title, size: size, row: hintRow)
    }
}

/// Where the labels of the buttons go while Help is on: beside a column of buttons, on the side
/// away from the edge of the window, or below a row of tools (above it at the bottom of a phone).
enum HintSide {
    case leading, trailing, below, above
}

extension EnvironmentValues {
    /// Help is on: every button shows its label, as the web's .app--hints.
    @Entry var showHints = false
    @Entry var hintSide = HintSide.trailing
}

extension View {
    /// The label of a button of side `size`, shown beside it while Help is on. Below a row of tools
    /// every second label (`row` 1) sits a line lower, so that neighbours do not run into each other.
    func hint(_ text: String, size: CGFloat = Theme.iconButton, row: Int = 0) -> some View {
        modifier(HintLabel(text: text, size: size, row: row))
    }
}

private struct HintLabel: ViewModifier {
    let text: String
    let size: CGFloat
    let row: Int
    @Environment(\.showHints) private var shown
    @Environment(\.hintSide) private var side

    func body(content: Content) -> some View {
        content.overlay(alignment: alignment) {
            if shown {
                placed
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .transition(.opacity)
            }
        }
    }

    private var bubble: some View {
        Text(L(text))
            .font(.caption2.weight(.medium))
            .multilineTextAlignment(.center)
            .foregroundStyle(Theme.onCorporate)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Theme.corporate.opacity(0.9), in: RoundedRectangle(cornerRadius: Theme.radiusSmall))
    }

    @ViewBuilder private var placed: some View {
        switch side {
        case .leading: bubble.fixedSize().offset(x: -(size + 6))
        case .trailing: bubble.fixedSize().offset(x: size + 6)
        case .below: bubble.frame(width: 96).fixedSize().offset(y: size + 4 + CGFloat(row) * 26)
        case .above: bubble.frame(width: 96).fixedSize().offset(y: -(size + 4 + CGFloat(row) * 26))
        }
    }

    /// The side of the button the label starts from, before it is moved past the button.
    private var alignment: Alignment {
        switch side {
        case .leading: .trailing
        case .trailing: .leading
        case .below: .top
        case .above: .bottom
        }
    }
}

/// A row of options in one frame, divided by thin lines; the chosen one in the primary colour.
struct SegmentedGroup<Option: Hashable>: View {
    let options: [Option]
    let selection: Option?
    let title: (Option) -> String
    let symbol: (Option) -> String
    let choose: (Option) -> Void
    var size = Theme.iconButton
    /// Short labels for Help; the titles when there are none.
    var hint: ((Option) -> String)? = nil

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.element) { index, option in
                let active = option == selection
                if index > 0 { Theme.border.frame(width: 1) }
                Button { choose(option) } label: {
                    Image(systemName: symbol(option))
                        .font(.system(size: size * 0.45))
                        .foregroundStyle(active ? Theme.onCorporate : Theme.copyLight)
                        .frame(width: size, height: size)
                        .background(active ? Theme.corporate : .clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(L(title(option)))
                .accessibilityLabel(L(title(option)))
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .fixedSize()
        .background(Theme.raised)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSmall))
        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSmall).strokeBorder(Theme.border))
        .flatShadow()
        // The labels for Help outside the clipped frame, each under its option.
        .overlay {
            HStack(spacing: 0) {
                ForEach(Array(options.enumerated()), id: \.element) { index, option in
                    if index > 0 { Color.clear.frame(width: 1) }
                    Color.clear.frame(width: size, height: size).hint(hint?(option) ?? title(option), size: size, row: index % 2)
                }
            }
        }
    }
}

/// A panel floating over the picture (.flyout--floating): a handle strip to drag it by, the cross
/// that closes it at its top right, the content below.
struct PanelCard<Content: View>: View {
    let close: () -> Void
    @ViewBuilder let content: Content
    @State private var offset = CGSize.zero
    @GestureState private var drag = CGSize.zero

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Theme.copyLight.opacity(0.45))
                .frame(width: 40, height: 5)
                .frame(maxWidth: .infinity, minHeight: 24)
                .contentShape(Rectangle())
                .gesture(DragGesture()
                    .updating($drag) { value, state, _ in state = value.translation }
                    .onEnded { value in
                        offset.width += value.translation.width
                        offset.height += value.translation.height
                    })
                .accessibilityHidden(true)
            content
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
        .foregroundStyle(Theme.copy)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.border))
        .overlay(alignment: .topTrailing) {
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.copyLight)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(4)
            .accessibilityLabel("Close")
        }
        .floatShadow()
        .offset(x: offset.width + drag.width, y: offset.height + drag.height)
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
