import SwiftUI

/// The settings, laid out as the web app's settings panel: method and areas as icon groups, then
/// the sliders in rows: how calm the areas are, how many colours or layers, then the photo itself.
/// What the picture shows lives in the tools above the picture.
struct ControlsView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    @Environment(Store.self) private var store
    @State private var showingPaywall = false
    @State private var paywallReason = "make the areas finer than Simplify 0"
    // The sliders move freely; the analysis only runs when the finger lifts.
    @State private var colours = 20.0
    @State private var simplify = 0.0
    @State private var saturation = 200.0
    @State private var contrast = 100.0
    @State private var variety = 5.0
    @State private var maxPaints = 3.0
    @State private var layers = 5.0
    @State private var layerSimplify = 4.0
    @State private var accents = 3.0
    @State private var maxCoats = 2.0

    var body: some View {
        // In the Blocking view only its own settings; the colour settings come back with the other views.
        if session.settings.view == .blocking {
            BlockingControlsView()
        } else {
            colourSettings
        }
    }

    private var colourSettings: some View {
        @Bindable var session = session
        let layerMode = session.settings.mode == .layer
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: Theme.gap) {
                SegmentedGroup(
                    options: [AnalysisMode.mix, .layer], selection: session.settings.mode,
                    title: { $0 == .mix ? "Mix: every colour mixed on the palette and painted once" : "Layer: a few thin washes, each painted over the dry one before" },
                    symbol: { $0 == .mix ? "paintbrush.pointed" : "square.3.layers.3d" },
                    choose: { session.setMode($0) }
                )
                SegmentedGroup(
                    options: [false, true], selection: session.settings.geometric,
                    title: { $0 ? "Geometric: shapes with straight edges, laid over each other from large to small" : "Organic: areas that follow the photo" },
                    symbol: { $0 ? "triangle" : "square.grid.3x3" },
                    choose: { session.settings.geometric = $0 }
                )
                // Monochrome: the picture in grey, each value painted with one colour of the paint box.
                IconButton(
                    title: "Monochrome: the picture in grey, each value painted with one colour of the paint box",
                    symbol: "circle.lefthalf.filled",
                    active: session.valueMode,
                    hint: "Monochrome"
                ) { session.settings.values.toggle() }
                .disabled(layerMode)
                Spacer(minLength: 0)
                if session.settings.saturation != 100 || session.settings.contrast != 100 {
                    IconButton(title: "Reset photo: saturation and contrast back to 100%", symbol: "arrow.counterclockwise") {
                        session.settings.saturation = 100
                        session.settings.contrast = 100
                        session.analyse()
                    }
                }
            }

            if layerMode {
                slider("Simplify areas", value: $layerSimplify, range: 0...10, hint: "Higher = bigger, calmer shapes") {
                    session.settings.layerSimplify = Int(layerSimplify.rounded())
                }
                let auto = library.palette.layerAuto
                HStack(alignment: .top, spacing: Theme.gap) {
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
                    slider("Max. coats", value: $maxCoats, range: 1...3) {
                        session.settings.maxCoats = Int(maxCoats.rounded())
                    }
                }
            } else {
                // Shown from 0 to 12; the finer steps -1 and -2 come with the full version.
                slider("Simplify areas", value: $simplify, range: Double(Self.finest)...Double(Self.coarsest), hint: store.unlocked ? "Higher = bigger, calmer shapes" : "Higher = bigger, calmer shapes. Below 0 with Pro") {
                    let value = Int(simplify.rounded())
                    if value < 0, !store.unlocked {
                        session.settings.simplify = 0
                        paywallReason = "make the areas finer than Simplify 0"
                        showingPaywall = true
                    } else {
                        session.settings.simplify = value
                    }
                }
                HStack(alignment: .top, spacing: Theme.gap) {
                    slider("Colours", value: $colours, range: 2...32, hint: "More colours = more detail") {
                        session.settings.colours = Int(colours.rounded())
                    }
                    slider("Details", value: $variety, range: 0...10, hint: "Lower = closer overall, higher = small areas keep their own colour") {
                        session.settings.variety = Int(variety.rounded())
                    }
                    slider("Max. paints", value: $maxPaints, range: 1...3, hint: "Paints in one mix at most") {
                        session.settings.maxPaints = Int(maxPaints.rounded())
                    }
                }
            }

            HStack(alignment: .top, spacing: Theme.gap) {
                slider("Saturation", value: $saturation, range: 0...200, unit: "%", hint: "Applied to the photo before its colours are found") {
                    session.settings.saturation = Int((saturation / 5).rounded()) * 5
                }
                slider("Contrast", value: $contrast, range: 50...200, unit: "%", hint: "Applied to the photo before its colours are found") {
                    session.settings.contrast = Int((contrast / 5).rounded()) * 5
                }
            }
        }
        .tint(Theme.corporate)
        .sheet(isPresented: $showingPaywall) { PaywallView(reason: paywallReason) }
        .onAppear(perform: sync)
        .onChange(of: session.settings) { sync() }
        .onChange(of: library.revision) { sync() }
    }

    /// Simplify as shown: the analysis counts from Segmenter.finest, the shown 0 at Segmenter.simplifyZero.
    static let finest = Segmenter.finest - Segmenter.simplifyZero
    static let coarsest = Segmenter.topSimplify - Segmenter.simplifyZero

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", hint: String? = nil, commit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(L(title)).font(Theme.strong)
                Spacer(minLength: 4)
                Text("\(Int(value.wrappedValue.rounded()))\(unit)").foregroundStyle(Theme.copyLight).monospacedDigit()
            }
            .lineLimit(1)
            // No step: on the Mac a stepped slider draws a tick for every value.
            Slider(value: value, in: range) { editing in
                guard !editing else { return }
                // What the picture is analysed from; Details and Max. paints the session handles itself.
                let before = analysed
                commit()
                if before != analysed { session.analyse() }
                sync()
            }
            .accessibilityLabel(L(title))
            .accessibilityValue("\(Int(value.wrappedValue.rounded()))\(unit)")
        }
        // The explanation is a tooltip, as on the web.
        .help(hint.map { L($0) } ?? "")
        .frame(maxWidth: .infinity)
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
        maxPaints = Double(session.settings.maxPaints)
        maxCoats = Double(session.settings.maxCoats)
        // By hand the number of layers is the number of chosen base paints.
        layers = library.palette.layerAuto ? Double(session.settings.layerCount) : Double(max(2, library.palette.layerIDs.count))
        layerSimplify = Double(session.settings.layerSimplify)
        accents = Double(session.settings.layerAccents)
    }
}
