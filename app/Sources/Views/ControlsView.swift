import SwiftUI

/// How many colours, how calm the areas, how many paints per mix, and what the picture shows.
struct ControlsView: View {
    @Environment(Session.self) private var session
    @Environment(\.horizontalSizeClass) private var sizeClass
    // The sliders move freely; the analysis only runs when the finger lifts.
    @State private var colours = 20.0
    @State private var simplify = 0.0
    @State private var saturation = 200.0
    @State private var contrast = 100.0
    @State private var variety = 5.0

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
                GridRow {
                    slider("Saturation", value: $saturation, range: 0...200, unit: "%") {
                        session.settings.saturation = Int((saturation / 5).rounded()) * 5
                    }
                    slider("Contrast", value: $contrast, range: 50...200, unit: "%") {
                        session.settings.contrast = Int((contrast / 5).rounded()) * 5
                    }
                    slider("Variety", value: $variety, range: 0...10) {
                        session.settings.variety = Int(variety.rounded())
                    }
                }
                .padding(.top, 12)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Variety: lower = closer overall, higher = small areas keep their own colour")
                    .font(Theme.small)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if session.settings.saturation != 100 || session.settings.contrast != 100 {
                    Button("Reset") {
                        session.settings.saturation = 100
                        session.settings.contrast = 100
                        session.analyse()
                    }
                    .buttonStyle(.outline)
                    .help("Saturation and contrast back to the photo as it is")
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
        .onChange(of: session.settings) { sync() }
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", hint: String? = nil, commit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(Theme.strong).lineLimit(1).minimumScaleFactor(0.6).layoutPriority(1)
                Spacer(minLength: 4)
                Text("\(Int(value.wrappedValue.rounded()))\(unit)").foregroundStyle(.secondary).monospacedDigit()
            }
            // No step: on the Mac a stepped slider draws a tick for every value.
            Slider(value: value, in: range) { editing in
                guard !editing else { return }
                // What the picture is analysed from; Variety only replans the mixes, which the session does itself.
                let before = analysed
                commit()
                if before != analysed { session.analyse() }
                sync()
            }
            .accessibilityLabel(title)
            if let hint {
                Text(hint).font(Theme.small).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var analysed: [Int] {
        [session.settings.colours, session.settings.simplify, session.settings.saturation, session.settings.contrast]
    }

    private func sync() {
        colours = Double(session.settings.colours)
        simplify = Double(session.settings.simplify)
        saturation = Double(session.settings.saturation)
        contrast = Double(session.settings.contrast)
        variety = Double(session.settings.variety)
    }
}
