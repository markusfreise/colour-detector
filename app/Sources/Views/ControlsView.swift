import SwiftUI

/// How many colours, how calm the areas, how many paints per mix, and what the picture shows.
struct ControlsView: View {
    @Environment(Session.self) private var session
    // The sliders move freely; the analysis only runs when the finger lifts.
    @State private var colours = 12.0
    @State private var simplify = 4.0

    var body: some View {
        @Bindable var session = session
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                LabeledContent("Colours", value: "\(Int(colours))").fontWeight(.semibold)
                Slider(value: $colours, in: 2...32, step: 1) { editing in
                    if !editing, Int(colours) != session.settings.colours {
                        session.settings.colours = Int(colours)
                        session.analyse()
                    }
                }
                Text("More colours = more detail").font(.caption).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 2) {
                LabeledContent("Simplify areas", value: "\(Int(simplify))").fontWeight(.semibold)
                Slider(value: $simplify, in: 0...10, step: 1) { editing in
                    if !editing, Int(simplify) != session.settings.simplify {
                        session.settings.simplify = Int(simplify)
                        session.analyse()
                    }
                }
                Text("Higher = bigger, calmer shapes").font(.caption).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Max. paints per mix").fontWeight(.semibold)
                Picker("Max. paints per mix", selection: $session.settings.maxPaints) {
                    ForEach(1...3, id: \.self) { Text("\($0)").tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Show").fontWeight(.semibold)
                Picker("Show", selection: $session.settings.view) {
                    ForEach(ViewMode.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                HStack(spacing: 20) {
                    Toggle("Outlines", isOn: $session.settings.outlines)
                    Toggle("Numbers", isOn: $session.settings.numbers)
                }
                #if os(macOS)
                .toggleStyle(.checkbox)
                #endif
            }
        }
        .onAppear(perform: sync)
        .onChange(of: session.settings.colours) { sync() }
        .onChange(of: session.settings.simplify) { sync() }
    }

    private func sync() {
        colours = Double(session.settings.colours)
        simplify = Double(session.settings.simplify)
    }
}
