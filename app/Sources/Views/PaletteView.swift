import SwiftUI

/// The mixes of the picture. Every mix shows its base colour, its recipe as a bar of paints in
/// their proportions, and its washes. Selecting a mix or a wash blanks the rest of the picture.
struct PaletteView: View {
    @Environment(Session.self) private var session

    var body: some View {
        let mixes = session.mixBlocks
        VStack(alignment: .leading, spacing: 8) {
            if !session.entries.isEmpty {
                Text("\(session.entries.count) in \(session.mixCount) \(session.mixCount == 1 ? "mix" : "mixes")")
                    .font(Theme.small)
                    .foregroundStyle(.secondary)
            }
            if session.mixCount < session.entries.count {
                Text(Mixing.washLetters.map { "\($0.letter) \($0.label)" }.joined(separator: "   "))
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
                        Text(mix.names).font(Theme.body).lineLimit(1)
                        Text(meta(mix)).font(Theme.small).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Mix \(mix.number), \(mix.names)")
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
                .accessibilityLabel("Wash \(wash.label), \(wash.dilution)")
                .help("\(wash.label): \(wash.dilution), \(percent(wash.share))% of image")
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.15)))
    }

    private func toggle(_ index: Int) {
        session.select(entry: session.selectedEntry == index ? nil : index)
    }

    private func percent(_ share: Double) -> String {
        let percent = Int((share * 100).rounded())
        return percent == 0 ? "<1" : "\(percent)"
    }

    private func meta(_ mix: MixBlock) -> String {
        var parts: [String] = []
        if mix.washes.count > 1 {
            parts.append("\(mix.washes.count) washes")
        } else if !mix.dilution.isEmpty {
            parts.append(mix.dilution)
        }
        parts.append("\(percent(mix.share))% of image")
        if mix.changed { parts.append("changed") }
        return parts.joined(separator: " · ")
    }
}

/// A recipe as a bar: one segment per paint, as wide as its part of the mix.
struct RecipeBar: View {
    let parts: [MixBlock.Part]
    var fontSize: CGFloat = 10

    var body: some View {
        GeometryReader { geometry in
            let total = max(parts.reduce(0) { $0 + $1.share }, 0.0001)
            HStack(spacing: 0) {
                ForEach(parts) { part in
                    Text(part.parts)
                        .font(.system(size: fontSize, weight: .bold))
                        .lineLimit(1)
                        .frame(width: max(6, geometry.size.width * part.share / total), height: geometry.size.height)
                        .background(Color(hex: part.paint.hex))
                        .foregroundStyle(Color.ink(on: part.paint.hex))
                        .clipped()
                        .help("\(part.parts) x \(part.paint.displayNumber) \(part.paint.name)")
                }
            }
            .frame(width: geometry.size.width, alignment: .leading)
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.primary.opacity(0.15)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Recipe: " + parts.map { "\($0.parts) x \($0.paint.name)" }.joined(separator: ", "))
    }
}
