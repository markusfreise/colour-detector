import SwiftUI

/// How many colours, how calm the areas, how many paints per mix, and what the picture shows.
struct ControlsView: View {
    @Environment(Session.self) private var session
    @Environment(\.horizontalSizeClass) private var sizeClass
    // The sliders move freely; the analysis only runs when the finger lifts.
    @State private var colours = 12.0
    @State private var simplify = 4.0

    var body: some View {
        @Bindable var session = session
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Text(session.imageName.isEmpty ? "No picture" : session.imageName)
                    .font(Theme.strong)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                if session.savedID != nil {
                    Text("In library").font(Theme.small).foregroundStyle(.secondary)
                }
            }

            Grid(alignment: .topLeading, horizontalSpacing: 14, verticalSpacing: 0) {
                GridRow {
                    slider("Colours", value: $colours, range: 2...32, hint: "More colours = more detail") {
                        session.settings.colours = Int(colours.rounded())
                    }
                    slider("Simplify areas", value: $simplify, range: 0...10, hint: "Higher = bigger, calmer shapes") {
                        session.settings.simplify = Int(simplify.rounded())
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Max. paints").font(Theme.strong).lineLimit(1).minimumScaleFactor(0.7)
                        SegmentedButtons(options: (1...3).map { ($0, "\($0)") }, selection: $session.settings.maxPaints)
                    }
                    .frame(minWidth: 92)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 16) {
                    Text("Show").font(Theme.strong)
                    Spacer(minLength: 0)
                    Toggle("Outlines", isOn: $session.settings.outlines)
                    Toggle("Numbers", isOn: $session.settings.numbers)
                }
                .toggleStyle(CheckToggleStyle())
                SegmentedButtons(options: ViewMode.allCases.map { ($0, sizeClass == .compact ? $0.shortTitle : $0.title) }, selection: $session.settings.view)
            }
        }
        .onAppear(perform: sync)
        .onChange(of: session.settings.colours) { sync() }
        .onChange(of: session.settings.simplify) { sync() }
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, hint: String, commit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(Theme.strong).lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                Text("\(Int(value.wrappedValue.rounded()))").foregroundStyle(.secondary).monospacedDigit()
            }
            // No step: on the Mac a stepped slider draws a tick for every value.
            Slider(value: value, in: range) { editing in
                guard !editing else { return }
                let before = (session.settings.colours, session.settings.simplify)
                commit()
                if before != (session.settings.colours, session.settings.simplify) { session.analyse() }
                sync()
            }
            .accessibilityLabel(title)
            Text(hint).font(Theme.small).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func sync() {
        colours = Double(session.settings.colours)
        simplify = Double(session.settings.simplify)
    }
}
