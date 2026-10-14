import SwiftUI

private func percent(_ share: Double) -> String {
    let percent = Int((share * 100).rounded())
    return percent == 0 ? "<1" : "\(percent)"
}

private func plural(_ n: Int, _ word: String) -> String { "\(n) \(word)\(n == 1 ? "" : "s")" }

/// A layer as the list, the walk and the printed sheets describe it.
struct LayerRow: Identifiable {
    struct Coat: Identifiable {
        let coats: Int
        let hex: String
        let share: Double
        /// Part of the picture that ends with exactly this many coats.
        let only: Double
        /// The step that paints this coat.
        let step: Int?

        var id: Int { coats }
    }

    /// Index of the layer in the plan.
    let id: Int
    let number: String
    let accent: Bool
    let name: String
    /// One stroke on white paper.
    let hex: String
    let wash: String
    let share: Double
    let role: String?
    let help: String
    let coats: [Coat]
}

extension Session {
    /// One row per painted layer, in painting order: the washes light to dark, then the accents.
    func layerRows(paints: [String: Paint]) -> [LayerRow] {
        guard let plan = layers else { return [] }
        let numbers = layerNumbers
        return plan.layers.indices.compactMap { index in
            let layer = plan.layers[index]
            guard layer.top > 0, let number = numbers[index] else { return nil }
            let coats = layer.coats.filter { $0.share > 0 }
            let accent = layer.kind == .accent
            // What the picture gains from this layer: the mean distance to the photo without it and with it.
            let gain = layer.buys.map { $0.without - $0.with } ?? 0
            let paint = paints[layer.paintID]
            return LayerRow(
                id: index,
                number: number,
                accent: accent,
                name: paint.map { "\($0.displayNumber) \($0.name)" } ?? layer.paintID,
                hex: layer.hexes[1],
                wash: layer.water >= 1 ? "1:\(layer.water.formatted()) with water, like \(layer.consistency)" : layer.guide,
                share: layer.coats.first?.share ?? 0,
                role: !accent ? nil : layer.role == .dark ? "for the darks" : layer.role == .colour ? "for a colour the washes miss" : nil,
                help: gain >= 0.05 ? "It brings the picture \(gain.formatted(.number.precision(.fractionLength(1)))) closer to the photo." : "",
                coats: coats.map { coat in
                    LayerRow.Coat(coats: coat.coats, hex: coat.hex, share: coat.share, only: coat.only, step: plan.steps.firstIndex { $0.layer == index && $0.coat == coat.coats })
                }
            )
        }
    }
}

/// The layers of the plan: tick them on and off, tap one to see it alone, tap a coat to see its step.
struct LayerListView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    var showPaintBox: () -> Void

    var body: some View {
        let rows = session.layerRows(paints: library.byID)
        let washes = rows.filter { !$0.accent }
        let accents = rows.filter(\.accent)
        VStack(alignment: .leading, spacing: 8) {
            if let plan = session.layers {
                Text("\([plural(washes.count, "layer"), accents.isEmpty ? nil : plural(accents.count, "accent"), plural(plan.steps.count, "step")].compactMap { $0 }.joined(separator: ", ")) · match: \(Mixing.matchQuality(plan.deltaE.mean))")
                    .font(Theme.small)
                    .foregroundStyle(.secondary)
            } else if !session.busy {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No base paints chosen. Open the paint box and pick up to \(Library.maxLayerPaints), or let the app choose.")
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        Button("Paint box", action: showPaintBox).buttonStyle(.borderedProminent)
                        Button("Auto") { session.proposeLayers() }.buttonStyle(.bordered)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                ForEach(washes) { row($0) }
            }
            if !accents.isEmpty {
                Text("Accents, painted last").font(Theme.strong).padding(.top, 4)
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(accents) { row($0) }
                }
            }
            if let plan = session.layers {
                let unused = plan.layers.filter { $0.top <= 0 }.map { layer in library.byID[layer.paintID].map { "\($0.displayNumber) \($0.name)" } ?? layer.paintID }
                if !unused.isEmpty {
                    note(library.activeBox.layerAuto
                        ? "Not needed for this picture: \(unused.joined(separator: ", "))."
                        : "No layer for \(unused.joined(separator: ", ")): \(unused.count == 1 ? "it adds" : "they add") too little here. Swap \(unused.count == 1 ? "it" : "them") in the paint box.")
                }
                if plan.deltaE.rough >= 0.1 {
                    Text("\(percent(plan.deltaE.rough))% of the picture is out of reach of these paints. Compare with Photo, or swap a paint.")
                        .font(Theme.small)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
                note("Ticks only change what the picture shows. Change the paints in the paint box.")
            }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(Theme.small).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }

    private func row(_ row: LayerRow) -> some View {
        let solo = session.layerSolo == row.id
        let current = session.currentStep?.layer == row.id
        return VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 8) {
                Toggle(row.number, isOn: Binding(get: { session.layerView.indices.contains(row.id) && session.layerView[row.id] > 0 }, set: { session.showLayer(row.id, $0) }))
                    .toggleStyle(CheckToggleStyle())
                    .font(Theme.strong)
                    .monospacedDigit()
                    .frame(width: 58, alignment: .leading)
                    .accessibilityLabel("Show layer \(row.number), \(row.name)")
                Button {
                    session.soloLayer(row.id)
                } label: {
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color(hex: row.hex))
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.15)))
                            .frame(width: 36, height: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(row.name).font(Theme.body).lineLimit(1)
                            Text([row.wash, row.accent || row.coats.count < 2 ? nil : "\(row.coats.count) coats", "\(percent(row.share))%", row.role].compactMap { $0 }.joined(separator: " · "))
                                .font(Theme.small)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("\(solo ? "Show all layers." : "Show only this layer.") \(row.help)")
            }
            if row.coats.count > 1 {
                // One segment per coat, in the colour that many coats give on white paper, as wide as
                // the part of the layer's area that ends with that many coats.
                GeometryReader { geometry in
                let total = max(row.coats.reduce(0) { $0 + $1.only }, 0.0001)
                let least = min(56, geometry.size.width / CGFloat(row.coats.count))
                let free = geometry.size.width - least * CGFloat(row.coats.count)
                HStack(spacing: 0) {
                    ForEach(row.coats) { coat in
                        Button {
                            session.goToStep(coat.step)
                        } label: {
                            Text(plural(coat.coats, "coat"))
                                .font(.system(size: 11, weight: .bold))
                                .lineLimit(1)
                                .frame(width: least + free * coat.only / total)
                                .frame(maxHeight: .infinity)
                                .background(Color(hex: coat.hex))
                                .foregroundStyle(Color.ink(on: coat.hex))
                                .overlay {
                                    if coat.step != nil, coat.step == session.layerStep { Rectangle().strokeBorder(Color.accentColor, lineWidth: 2) }
                                }
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Coat \(coat.coats) of layer \(row.number): show this step")
                        .help("\(plural(coat.coats, "coat")) on \(percent(coat.only))% of the image. Click to see the step that paints coat \(coat.coats).")
                    }
                }
                }
                .frame(height: 24)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.15)))
                .padding(.leading, 66)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(solo || current ? Color.accentColor.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 8))
    }
}

/// Walk through the painting order, above the picture.
struct LayerStepsView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    /// More separate shapes than this in one step is tedious to paint.
    private let manyShapes = 30

    var body: some View {
        @Bindable var session = session
        if let plan = session.layers, !plan.steps.isEmpty {
            if let index = session.layerStep, let step = session.currentStep {
                let layer = plan.layers[step.layer]
                let accent = step.kind == .accent
                let last = index == plan.steps.count - 1
                VStack(alignment: .leading, spacing: 8) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) {
                            buttons(index: index, last: last)
                            title(plan, step, layer, index: index)
                            Spacer(minLength: 0)
                            views
                            CloseButton { session.goToStep(nil) }
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            title(plan, step, layer, index: index)
                            HStack(spacing: 8) {
                                buttons(index: index, last: last)
                                Spacer(minLength: 0)
                                CloseButton { session.goToStep(nil) }
                            }
                            views
                        }
                    }
                    .buttonStyle(.bordered)
                    HStack(alignment: .top, spacing: 12) {
                        Chip(hex: step.hex, minHeight: 54) {
                            Text(step.coat == 1 ? "One stroke on white paper" : "\(step.coat) coats on white paper")
                                .lineLimit(2)
                        }
                        .frame(width: 170)
                        .help("An estimate from one swatch: test the wash on a scrap first")
                        VStack(alignment: .leading, spacing: 2) {
                            line("Mix", step.coat > 1 ? "the same wash again." : "\(layer.guide).")
                            line("Paint", accent
                                ? "\(step.shapes) small \(step.shapes == 1 ? "shape" : "shapes")\(session.layerStepView == .paint ? " in full colour" : "")."
                                : "\(areas), \(percent(step.share))% of the picture.")
                            line("Then", last ? "you are done." : "let it dry completely.")
                        }
                        .font(Theme.small)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if step.shapes > manyShapes {
                        Text("\(step.shapes) separate shapes in this step. A higher \"Simplify areas\" gives fewer and bigger ones.")
                            .font(Theme.small)
                            .foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                Button("Paint step by step") { session.goToStep(0) }.buttonStyle(.bordered)
            }
        }
    }

    private var areas: String {
        switch session.layerStepView {
        case .paint: "the areas in full colour"
        case .wash: "the filled areas"
        case .result: "the areas of this step"
        }
    }

    private var views: some View {
        Picker("Show", selection: Binding(get: { session.layerStepView }, set: { session.layerStepView = $0 })) {
            ForEach(StepView.allCases, id: \.self) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 330)
    }

    private func buttons(index: Int, last: Bool) -> some View {
        HStack(spacing: 8) {
            Button("Previous") { session.goToStep(index - 1) }.disabled(index == 0)
                .keyboardShortcut(.leftArrow, modifiers: [])
            Button("Next") { session.goToStep(index + 1) }.disabled(last)
                .keyboardShortcut(.rightArrow, modifiers: [])
        }
    }

    private func title(_ plan: LayerPlan, _ step: LayerStep, _ layer: Layer, index: Int) -> some View {
        let accent = step.kind == .accent
        let number = (session.layerNumbers[step.layer] ?? "").replacingOccurrences(of: "A", with: "")
        let same = plan.layers.filter { $0.top > 0 && ($0.kind == .accent) == accent }.count
        let name = library.byID[step.paintID]?.name ?? step.paintID
        let coats = layer.top > 1 ? ", coat \(step.coat) of \(layer.top)" : ""
        return Text("\(Text("Step \(index + 1) of \(plan.steps.count):").bold()) \(accent ? "Accent" : "Layer") \(number) of \(same), \(name)\(coats)")
            .font(Theme.body)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func line(_ label: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(label).bold().frame(width: 40, alignment: .leading)
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// What the clicked spot gets: photo colour, layered colour and the coats of every layer.
struct LayerSpotView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    let spot: LayerSpot

    var body: some View {
        if let plan = session.layers, spot.coats.count == plan.layers.count {
            let numbers = session.layerNumbers
            let painted = plan.layers.indices.filter { spot.coats[$0] > 0 }
            let skipped = plan.layers.indices.filter { plan.layers[$0].top > 0 && spot.coats[$0] == 0 }.compactMap { numbers[$0] }
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 3) {
                        Chip(hex: spot.photo) { Text(spot.photo) }
                        Text("Photo").font(Theme.small).foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Chip(hex: spot.layered) { Text("Match: \(Mixing.matchQuality(spot.deltaE))") }
                            .help("Distance to the photo: \(spot.deltaE.formatted(.number.precision(.fractionLength(1))))")
                        Text("Layered").font(Theme.small).foregroundStyle(.secondary)
                    }
                }
                Text("Layers on this spot").font(Theme.strong)
                if painted.isEmpty {
                    Text("Leave the paper white.").foregroundStyle(.secondary)
                }
                ForEach(painted, id: \.self) { k in
                    let layer = plan.layers[k]
                    let coats = spot.coats[k]
                    Button {
                        // The last step that touches this spot in this layer.
                        session.goToStep(plan.steps.firstIndex { $0.layer == k && $0.coat == coats })
                    } label: {
                        HStack(spacing: 8) {
                            Text(numbers[k] ?? "").font(Theme.strong).foregroundStyle(.secondary).frame(width: 26, alignment: .trailing)
                            RoundedRectangle(cornerRadius: 4).fill(Color(hex: layer.hexes[coats])).frame(width: 22, height: 22)
                                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.15)))
                            Text("\(library.byID[layer.paintID]?.name ?? layer.paintID)\(layer.kind == .accent ? " (accent)" : "")").lineLimit(1)
                            Spacer(minLength: 0)
                            Text(plural(coats, "coat")).foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help("Show the step that paints this")
                }
                if !painted.isEmpty, !skipped.isEmpty {
                    Text("Not painted here: \(skipped.joined(separator: ", ")).").font(Theme.small).foregroundStyle(.secondary)
                }
            }
        }
    }
}
