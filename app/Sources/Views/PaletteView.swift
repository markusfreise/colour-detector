import SwiftUI

/// Every colour of the picture with the paints that mix it. The washes of a mix sit together:
/// their swatches touch and only the first one names the paints.
struct PaletteView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library

    private struct Row: Identifiable {
        let id: Int
        let index: Int
        let entry: PaletteEntry
        var label: String
        var share: Double
        var washes = 1
        var joinTop = false
        var joinBottom = false
        /// Only the base colour of the mix is shown.
        var base: String?
    }

    var body: some View {
        @Bindable var session = session
        let paints = library.byID
        let rows = rows
        VStack(alignment: .leading, spacing: 8) {
            if !session.entries.isEmpty {
                Text("\(session.entries.count) in \(session.mixCount) \(session.mixCount == 1 ? "mix" : "mixes")")
                    .font(Theme.small)
                    .foregroundStyle(.secondary)
            }
            if session.mixCount < session.entries.count {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Toggle("Washes", isOn: $session.settings.washes).toggleStyle(CheckToggleStyle())
                    if session.settings.washes {
                        Text(Mixing.washLetters.map { "\($0.letter) \($0.label)" }.joined(separator: "   "))
                            .font(Theme.small)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(rows) { row in
                    Button {
                        session.select(entry: session.selectedEntry == row.index ? nil : row.index)
                    } label: {
                        HStack(spacing: 10) {
                            Text(row.label)
                                .font(Theme.strong)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                                .frame(width: 38, alignment: .trailing)
                            swatch(row)
                            VStack(alignment: .leading, spacing: 1) {
                                if !row.joinTop {
                                    Text(summary(row.entry, paints)).font(Theme.body).lineLimit(1)
                                }
                                Text(meta(row)).font(Theme.small).foregroundStyle(.secondary).lineLimit(1)
                            }
                            .padding(.vertical, 6)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 8)
                        .padding(.top, row.joinTop ? 0 : 2)
                        .padding(.bottom, row.joinBottom ? 0 : 2)
                        .frame(minHeight: row.joinTop ? 30 : 46)
                        .background(selected(row) ? Color.accentColor.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 8))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, row.joinTop ? 0 : 2)
                }
            }
        }
    }

    /// Mix by mix. Neighbours painted with the same mix are joined; with washes hidden a mix is one row.
    private var rows: [Row] {
        func mix(_ entry: PaletteEntry) -> String {
            "\(entry.family):\(entry.recipe?.paints.map(\.paintID).joined(separator: "+") ?? "")"
        }
        var list = session.order.map { Row(id: session.entries[$0].id, index: $0, entry: session.entries[$0], label: session.entries[$0].label, share: session.entries[$0].share) }
        if !session.settings.washes {
            // Only the base colour of each mix: its largest wash, with the area of the whole mix.
            var mixes: [Row] = []
            for row in list {
                if let m = mixes.firstIndex(where: { $0.entry.family == row.entry.family }) {
                    let share = mixes[m].share + row.share
                    let washes = mixes[m].washes + 1
                    if row.entry.share > mixes[m].entry.share { mixes[m] = row }
                    mixes[m].share = share
                    mixes[m].washes = washes
                } else {
                    mixes.append(row)
                }
            }
            return mixes.map { row in
                var row = row
                row.label = String(row.entry.label.prefix { $0.isNumber })
                row.base = session.baseHex(of: row.entry)
                return row
            }
        }
        for n in list.indices {
            list[n].joinTop = n > 0 && mix(list[n - 1].entry) == mix(list[n].entry)
            list[n].joinBottom = n < list.count - 1 && mix(list[n + 1].entry) == mix(list[n].entry)
        }
        return list
    }

    private func selected(_ row: Row) -> Bool {
        session.selectedEntry == row.index || (row.base != nil && session.selected?.family == row.entry.family)
    }

    /// Photo colour and mix side by side; the washes of a mix form one column.
    private func swatch(_ row: Row) -> some View {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: row.joinTop ? 0 : 6, bottomLeadingRadius: row.joinBottom ? 0 : 6,
            bottomTrailingRadius: row.joinBottom ? 0 : 6, topTrailingRadius: row.joinTop ? 0 : 6
        )
        return HStack(spacing: 0) {
            if let base = row.base {
                Color(hex: base)
            } else {
                Color(hex: row.entry.targetHex)
                Color(hex: row.entry.recipe?.hex ?? row.entry.targetHex)
            }
        }
        .frame(width: 48)
        .frame(minHeight: row.joinTop || row.joinBottom ? 30 : 34, maxHeight: row.joinTop || row.joinBottom ? .infinity : 34)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.primary.opacity(0.15)))
    }

    private func summary(_ entry: PaletteEntry, _ paints: [String: Paint]) -> String {
        guard let recipe = entry.recipe else { return "No paints selected" }
        if recipe.paints.isEmpty { return "Paper white" }
        return recipe.paints.compactMap { paints[$0.paintID]?.name }.joined(separator: " + ")
    }

    private func meta(_ row: Row) -> String {
        let percent = Int((row.share * 100).rounded())
        var parts: [String] = []
        if row.washes > 1 {
            parts.append("\(row.washes) washes")
        } else if let recipe = row.entry.recipe, !recipe.paints.isEmpty {
            // The water level tells the washes of one mix apart.
            parts.append(recipe.dilution.replacingOccurrences(of: " (layer/glaze)", with: ""))
        }
        parts.append("\(percent == 0 ? "<1" : "\(percent)")% of image")
        if row.entry.overridden { parts.append("changed") }
        return parts.joined(separator: " · ")
    }
}
