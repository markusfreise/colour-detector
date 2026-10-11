import SwiftUI

/// The method (mixes or layers), how many colours or layers, how calm the areas, and what the picture shows.
struct ControlsView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    @Environment(\.horizontalSizeClass) private var sizeClass
    // The sliders move freely; the analysis only runs when the finger lifts.
    @State private var colours = 20.0
    @State private var simplify = 0.0
    @State private var saturation = 200.0
    @State private var contrast = 100.0
    @State private var variety = 5.0
    @State private var layers = 5.0
    @State private var layerSimplify = 4.0
    @State private var accents = 3.0

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

            let layerMode = session.settings.mode == .layer
            VStack(alignment: .leading, spacing: 6) {
                Text("Method").font(Theme.strong)
                SegmentedButtons(
                    options: AnalysisMode.allCases.map { ($0, $0.title) },
                    selection: Binding(get: { session.settings.mode }, set: { session.setMode($0) })
                )
                if layerMode {
                    Text("Layer: a few thin washes, each painted over the dry one before.")
                        .font(Theme.small)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Grid(alignment: .topLeading, horizontalSpacing: 14, verticalSpacing: 0) {
                GridRow {
                    if layerMode {
                        let auto = library.activeBox.layerAuto
                        slider(
                            "Layers", value: $layers, range: 2...Double(Library.maxLayerPaints),
                            hint: auto ? "Washes; accents and second coats are extra steps" : "Chosen by hand. Auto in the paint box picks again."
                        ) {
                            session.settings.layerCount = Int(layers.rounded())
                        }
                        .disabled(!auto)
                        slider("Simplify areas", value: $layerSimplify, range: 0...10, hint: "Higher = bigger, calmer shapes") {
                            session.settings.layerSimplify = Int(layerSimplify.rounded())
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Max. coats").font(Theme.strong).lineLimit(1).minimumScaleFactor(0.7)
                            SegmentedButtons(options: (1...3).map { ($0, "\($0)") }, selection: $session.settings.maxCoats)
                        }
                        .frame(minWidth: 92)
                    } else {
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
                GridRow {
                    slider("Saturation", value: $saturation, range: 0...200, unit: "%") {
                        session.settings.saturation = Int((saturation / 5).rounded()) * 5
                    }
                    slider("Contrast", value: $contrast, range: 50...200, unit: "%") {
                        session.settings.contrast = Int((contrast / 5).rounded()) * 5
                    }
                    if layerMode {
                        slider("Accents", value: $accents, range: 0...3) {
                            session.settings.layerAccents = Int(accents.rounded())
                        }
                    } else {
                        slider("Variety", value: $variety, range: 0...10) {
                            session.settings.variety = Int(variety.rounded())
                        }
                    }
                }
                .padding(.top, 12)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(layerMode
                    ? "Accents: small strong touches painted last, first for a colour the washes miss, then for the darks"
                    : "Variety: lower = closer overall, higher = small areas keep their own colour")
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
                if layerMode {
                    SegmentedButtons(options: [(ViewMode.mixed, "Layered paint"), (ViewMode.original, "Photo")], selection: $session.settings.view)
                } else {
                    SegmentedButtons(options: ViewMode.allCases.map { ($0, sizeClass == .compact ? $0.shortTitle : $0.title) }, selection: $session.settings.view)
                }
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
        let s = session.settings
        return s.mode == .layer
            ? [s.layerCount, s.layerSimplify, s.layerAccents, s.saturation, s.contrast]
            : [s.colours, s.simplify, s.saturation, s.contrast]
    }

    private func sync() {
        colours = Double(session.settings.colours)
        simplify = Double(session.settings.simplify)
        saturation = Double(session.settings.saturation)
        contrast = Double(session.settings.contrast)
        variety = Double(session.settings.variety)
        // By hand the number of layers is the number of chosen base paints.
        layers = library.activeBox.layerAuto ? Double(session.settings.layerCount) : Double(max(2, library.activeBox.layerIDs.count))
        layerSimplify = Double(session.settings.layerSimplify)
        accents = Double(session.settings.layerAccents)
    }
}
