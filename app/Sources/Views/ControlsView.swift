import SwiftUI

/// The settings, in the web app's order: method and areas, then how calm the areas are, how many
/// colours or layers, then the photo itself. What the picture shows lives in the toolbar.
struct ControlsView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
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
        let layerMode = session.settings.mode == .layer
        Form {
            Section {
                Picker("Method", selection: Binding(get: { session.settings.mode }, set: { session.setMode($0) })) {
                    Label("Mix", systemImage: "paintbrush.pointed").tag(AnalysisMode.mix)
                    Label("Layer", systemImage: "square.3.layers.3d").tag(AnalysisMode.layer)
                }
                Picker("Areas", selection: $session.settings.geometric) {
                    Label("Organic", systemImage: "square.grid.3x3").tag(false)
                    Label("Geometric", systemImage: "triangle").tag(true)
                }
            } footer: {
                Text(layerMode
                    ? "Layer: a few thin washes, each painted over the dry one before."
                    : session.settings.geometric
                        ? "Geometric: shapes with straight edges, laid over each other from large to small."
                        : "Mix: every colour mixed on the palette and painted once.")
            }

            Section {
                if layerMode {
                    slider("Simplify areas", value: $layerSimplify, range: 0...10, hint: "Higher = bigger, calmer shapes") {
                        session.settings.layerSimplify = Int(layerSimplify.rounded())
                    }
                    let auto = library.activeBox.layerAuto
                    slider(
                        "Layers", value: $layers, range: 2...Double(Library.maxLayerPaints),
                        hint: auto ? "Washes; accents and second coats are extra steps" : "Chosen by hand. Auto in the paint box picks again."
                    ) {
                        session.settings.layerCount = Int(layers.rounded())
                    }
                    .disabled(!auto)
                    slider("Accents", value: $accents, range: 0...3, hint: "Small strong touches painted last, first for a colour the washes miss, then for the darks") {
                        session.settings.layerAccents = Int(accents.rounded())
                    }
                    Picker("Max. coats", selection: $session.settings.maxCoats) {
                        ForEach(1...3, id: \.self) { Text("\($0)").tag($0) }
                    }
                } else {
                    slider("Simplify areas", value: $simplify, range: 0...10, hint: "Higher = bigger, calmer shapes") {
                        session.settings.simplify = Int(simplify.rounded())
                    }
                    slider("Colours", value: $colours, range: 2...32, hint: "More colours = more detail") {
                        session.settings.colours = Int(colours.rounded())
                    }
                    slider("Details", value: $variety, range: 0...10, hint: "Lower = closer overall, higher = small areas keep their own colour") {
                        session.settings.variety = Int(variety.rounded())
                    }
                    Picker("Max. paints", selection: $session.settings.maxPaints) {
                        ForEach(1...3, id: \.self) { Text("\($0)").tag($0) }
                    }
                }
            }

            Section {
                slider("Saturation", value: $saturation, range: 0...200, unit: "%") {
                    session.settings.saturation = Int((saturation / 5).rounded()) * 5
                }
                slider("Contrast", value: $contrast, range: 50...200, unit: "%") {
                    session.settings.contrast = Int((contrast / 5).rounded()) * 5
                }
                if session.settings.saturation != 100 || session.settings.contrast != 100 {
                    Button("Reset Photo", systemImage: "arrow.counterclockwise") {
                        session.settings.saturation = 100
                        session.settings.contrast = 100
                        session.analyse()
                    }
                }
            } header: {
                Text("Photo")
            } footer: {
                Text("Applied to the photo before its colours are found.")
            }
        }
        .pickerStyle(.segmented)
        .onAppear(perform: sync)
        .onChange(of: session.settings) { sync() }
        .onChange(of: library.revision) { sync() }
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", hint: String? = nil, commit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                Spacer(minLength: 4)
                Text("\(Int(value.wrappedValue.rounded()))\(unit)").foregroundStyle(.secondary).monospacedDigit()
            }
            // No step: on the Mac a stepped slider draws a tick for every value.
            Slider(value: value, in: range) { editing in
                guard !editing else { return }
                // What the picture is analysed from; Details only replans the mixes, which the session does itself.
                let before = analysed
                commit()
                if before != analysed { session.analyse() }
                sync()
            }
            .accessibilityLabel(title)
            .accessibilityValue("\(Int(value.wrappedValue.rounded()))\(unit)")
            if let hint {
                Text(hint).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 2)
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
