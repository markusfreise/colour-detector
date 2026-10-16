import SwiftUI

/// The settings of the Blocking view: how many tones, where light ends and shadow begins, how large
/// the masses are, how much of the photo shows through. Below them the tones in painting order;
/// one of them on its own with a tap, here or in the picture.
struct BlockingControlsView: View {
    @Environment(Session.self) private var session
    // The sliders move freely; the blocking is worked out anew when the finger lifts.
    @State private var split: [Double] = [50]
    @State private var forms = Blocking.defaultForms
    @State private var opacity = 100.0
    @State private var contrast = 100.0

    var body: some View {
        let settings = session.settings
        let result = session.blockingResult
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: Theme.gap) {
                    Text("Tones").font(Theme.strong)
                    Picker("Tones", selection: Binding(get: { settings.blockingTones }, set: setTones)) {
                        Text("2").tag(2).help("Two tones: light against shadow (notan)")
                        Text("3").tag(3).help("Three tones: light, a middle tone and shadow")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(width: 120)
                }
                Text(settings.blockingTones == 2 ? "Light against shadow (notan)" : "Light, a middle tone and shadow")
                    .font(Theme.small)
                    .foregroundStyle(Theme.copyLight)
            }

            // One slider per boundary between two tones: further left, more of the picture counts as light.
            ForEach(split.indices, id: \.self) { i in
                slider(boundaryTitle(i), value: Binding(get: { split.indices.contains(i) ? split[i] : 50 }, set: { moveSplit(i, $0) }), range: 5...95) {
                    session.settings.blockingSplit = split
                }
                .help(L("Further left, more of the picture counts as light"))
            }
            if settings.blockingSplit != nil {
                Button("Split as the photo divides") { session.settings.blockingSplit = nil }
                    .buttonStyle(.bordered)
            }

            slider("Forms", value: $forms, range: 0...10) {
                session.settings.blockingForms = Int(forms.rounded())
            }
            .help(L("Left: more detail. Right: the largest masses."))

            HStack(alignment: .top, spacing: Theme.gap) {
                slider("Opacity", value: $opacity, range: 20...100, unit: "%") {
                    session.settings.blockingOpacity = Int((opacity / 5).rounded()) * 5
                }
                .help(L("How strongly the tones cover the photo"))
                slider("Contrast", value: $contrast, range: 50...200, unit: "%") {
                    session.settings.contrast = Int((contrast / 5).rounded()) * 5
                    session.analyse()
                }
            }

            if let result {
                VStack(spacing: 6) {
                    ForEach(Array(result.shares.enumerated()), id: \.offset) { tone, share in
                        toneRow(tone, share: share, tones: result.tones)
                    }
                }
                if let solo = session.blockingSolo {
                    Text(L(advice(solo, tones: result.tones)))
                        .font(Theme.small)
                        .foregroundStyle(Theme.copyLight)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Theme.corporate)
        .onAppear(perform: sync)
        .onChange(of: session.settings) { sync() }
        .onChange(of: result?.natural) { sync() }
        .task(id: session.blockingKey) { session.ensureBlocking() }
    }

    /// One tone: its grey, number, name and part of the picture; a tap shows it on its own.
    private func toneRow(_ tone: Int, share: Double, tones: Int) -> some View {
        let grey = Blocking.toneGrey(tone, tones: tones)
        let active = session.blockingSolo == tone
        return Button {
            session.blockingSolo = active ? nil : tone
        } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(red: Double(grey.r) / 255, green: Double(grey.g) / 255, blue: Double(grey.b) / 255))
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.2)))
                    .frame(width: 26, height: 26)
                Text("\(tone + 1)").font(Theme.strong).monospacedDigit()
                Text(L(toneName(tone, tones: tones)))
                Spacer(minLength: 0)
                Text("\(Int((share * 100).rounded()))%").foregroundStyle(Theme.copyLight).monospacedDigit()
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(active ? Theme.corporateSoft : .clear, in: RoundedRectangle(cornerRadius: Theme.radiusSmall))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", commit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(L(title)).font(Theme.strong)
                Spacer(minLength: 4)
                Text("\(Int(value.wrappedValue.rounded()))\(unit)").foregroundStyle(Theme.copyLight).monospacedDigit()
            }
            .lineLimit(1)
            Slider(value: value, in: range) { editing in
                if !editing { commit() }
            }
            .accessibilityLabel(L(title))
            .accessibilityValue("\(Int(value.wrappedValue.rounded()))\(unit)")
        }
        .frame(maxWidth: .infinity)
    }

    private func setTones(_ tones: Int) {
        guard session.settings.blockingTones != tones else { return }
        session.settings.blockingTones = tones
        session.settings.blockingSplit = nil
    }

    /// Two boundaries keep their order and a little room between them.
    private func moveSplit(_ i: Int, _ value: Double) {
        var next = split
        guard next.indices.contains(i) else { return }
        next[i] = value.rounded()
        if next.count == 2 {
            if i == 0 { next[0] = min(next[0], next[1] - 3) } else { next[1] = max(next[1], next[0] + 3) }
        }
        split = next
    }

    private func boundaryTitle(_ i: Int) -> String {
        split.count == 1 ? "Light / shadow" : i == 0 ? "Light / middle" : "Middle / shadow"
    }

    private func toneName(_ tone: Int, tones: Int) -> String {
        tone == 0 ? "tone.light" : tone == tones - 1 ? "tone.shadow" : "Middle tone"
    }

    /// What the tone on its own tells the painter.
    private func advice(_ tone: Int, tones: Int) -> String {
        if tone == 0 { return "The lightest tone: save the paper white here, or mask it before you paint." }
        if tone == tones - 1 { return "The darkest tone: paint it last." }
        return "The middle tone: one wash over everything but the light."
    }

    /// The boundaries shown: set by hand, or where the photo divides.
    private func sync() {
        let settings = session.settings
        split = settings.blockingSplit ?? session.blockingResult?.natural ?? (settings.blockingTones == 2 ? [50] : [35, 65])
        forms = Double(settings.blockingForms)
        opacity = Double(settings.blockingOpacity)
        contrast = Double(settings.contrast)
    }
}
