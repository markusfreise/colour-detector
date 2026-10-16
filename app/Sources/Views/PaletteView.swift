import SwiftUI

/// The mixes of the picture. Every mix shows its base colour, its recipe as a bar of paints in
/// their proportions, and its washes. Selecting a mix or a wash blanks the rest of the picture.
struct PaletteView: View {
    @Environment(Session.self) private var session
    @Environment(Store.self) private var store

    var body: some View {
        let mixes = session.mixBlocks
        VStack(alignment: .leading, spacing: 8) {
            if !session.entries.isEmpty {
                Text(L(session.mixCount == 1 ? "%lld in %lld mix" : "%lld in %lld mixes", session.entries.count, session.mixCount))
                    .font(Theme.small)
                    .foregroundStyle(.secondary)
            }
            if session.mixCount < session.entries.count {
                Text(Mixing.washLetters.map { "\($0.letter) \(L($0.label))" }.joined(separator: "   "))
                    .font(Theme.small)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(mixes) { mix in
                    block(mix)
                }
            }
        }
        // With Blocking at hand, the tones are worked out in the background, for the tone of every mix.
        .task(id: store.unlocked && !session.entries.isEmpty ? session.blockingKey : nil) {
            if store.unlocked, !session.entries.isEmpty, !session.layerMode { session.ensureBlocking() }
        }
    }

    private func block(_ mix: MixBlock) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Button {
                toggle(mix.base)
            } label: {
                HStack(spacing: 10) {
                    Text(mix.number)
                        .font(Theme.strong)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(width: 30, alignment: .trailing)
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(hex: mix.hex))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.15)))
                        .frame(width: 36, height: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        paintsLine(mix).font(Theme.small).fixedSize(horizontal: false, vertical: true)
                        Text(meta(mix)).font(Theme.small).foregroundStyle(.secondary).lineLimit(1)
                        // Value matters more than hue: a mix that lands in another tone of the blocking.
                        if let warning = toneWarning(mix) {
                            Text(warning == .lighter ? "The mix is lighter than its tone in the blocking" : "The mix is darker than its tone in the blocking")
                                .font(Theme.small)
                                .foregroundStyle(.orange)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L("Mix %@, %@", mix.number, mix.names))
            if !mix.paints.isEmpty {
                RecipeBar(parts: mix.paints).frame(height: 16).padding(.leading, 40)
            }
            if mix.washes.count > 1 {
                washBar(mix).frame(height: 24).padding(.leading, 40)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 5)
        .padding(.bottom, 7)
        .background(session.selected?.family == mix.id ? Color.accentColor.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 8))
    }

    /// The paints by number and name, as small as the line below; wraps so that no number is cut off.
    private func paintsLine(_ mix: MixBlock) -> Text {
        guard !mix.paints.isEmpty else { return Text(mix.names) }
        return mix.paints.enumerated().reduce(Text("")) { line, item in
            line + Text(item.offset > 0 ? " + " : "") + Text(item.element.paint.displayNumber).bold() + Text(" " + item.element.paint.displayName)
        }
    }

    /// The washes of a mix, lightest first; each one selects that wash.
    private func washBar(_ mix: MixBlock) -> some View {
        HStack(spacing: 0) {
            ForEach(mix.washes) { wash in
                Button {
                    toggle(wash.id)
                } label: {
                    Text(wash.letter)
                        .font(.system(size: 11, weight: .bold))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(hex: wash.hex))
                        .foregroundStyle(Color.ink(on: wash.hex))
                        .overlay {
                            if session.selectedEntry == wash.id { Rectangle().strokeBorder(Color.accentColor, lineWidth: 2) }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("Wash %@, %@", wash.label, Words.shortDilution(wash.dilution)))
                .help(L("%@: %@, %@%% of image", wash.label, Words.shortDilution(wash.dilution), percent(wash.share)))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.15)))
    }

    private func toggle(_ index: Int) {
        session.select(entry: session.selectedEntry == index ? nil : index)
    }

    /// The tone of a mix (its largest wash) in the blocking, with the full version.
    private func tone(_ mix: MixBlock) -> Int? {
        guard store.unlocked, session.entries.indices.contains(mix.base) else { return nil }
        return session.tone(of: session.entries[mix.base])
    }

    private func toneWarning(_ mix: MixBlock) -> Session.ToneWarning? {
        guard store.unlocked, session.entries.indices.contains(mix.base) else { return nil }
        return session.toneWarning(session.entries[mix.base])
    }

    private func percent(_ share: Double) -> String {
        let percent = Int((share * 100).rounded())
        return percent == 0 ? "<1" : "\(percent)"
    }

    private func meta(_ mix: MixBlock) -> String {
        var parts: [String] = []
        if mix.washes.count > 1 {
            parts.append(L("%lld washes", mix.washes.count))
        } else if !mix.dilution.isEmpty {
            parts.append(Words.shortDilution(mix.dilution))
        }
        parts.append(L("%@%% of image", percent(mix.share)))
        if mix.changed { parts.append(L("changed")) }
        // Its tone in the blocking.
        if let tone = tone(mix) { parts.append(L("tone %lld", tone)) }
        return parts.joined(separator: " · ")
    }
}

/// A recipe as a bar: one segment per paint, as wide as its part of the mix.
struct RecipeBar: View {
    let parts: [MixBlock.Part]
    var fontSize: CGFloat = 10
    /// Each segment also names its paint: "2.5 x C5".
    var numbered = false

    var body: some View {
        GeometryReader { geometry in
            let total = max(parts.reduce(0) { $0 + $1.share }, 0.0001)
            HStack(spacing: 0) {
                ForEach(parts) { part in
                    Text(numbered ? "\(part.parts) x \(part.paint.displayNumber)" : part.parts)
                        .font(.system(size: fontSize, weight: .bold))
                        .lineLimit(1)
                        .frame(width: max(6, geometry.size.width * part.share / total), height: geometry.size.height)
                        .background(Color(hex: part.paint.hex))
                        .foregroundStyle(Color.ink(on: part.paint.hex))
                        .clipped()
                        .help("\(part.parts) x \(part.paint.displayNumber) \(part.paint.displayName)" as String)
                }
            }
            .frame(width: geometry.size.width, alignment: .leading)
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.15)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L("Recipe: %@", parts.map { "\($0.parts) x \($0.paint.displayName)" }.joined(separator: ", ")))
    }
}
