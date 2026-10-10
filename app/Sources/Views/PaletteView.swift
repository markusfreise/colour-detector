import SwiftUI

/// Every colour of the picture with the paints that mix it.
struct PaletteView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library

    var body: some View {
        let paints = library.byID
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(session.entries.enumerated()), id: \.element.id) { index, entry in
                Button {
                    session.select(entry: session.selectedEntry == index ? nil : index)
                } label: {
                    HStack(spacing: 10) {
                        Text("\(index + 1)")
                            .fontWeight(.bold)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .frame(width: 24, alignment: .trailing)
                        HStack(spacing: 0) {
                            Color(hex: entry.targetHex)
                            Color(hex: entry.recipe?.hex ?? entry.targetHex)
                        }
                        .frame(width: 44, height: 28)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.15)))
                        VStack(alignment: .leading, spacing: 0) {
                            Text(summary(entry, paints)).lineLimit(1)
                            Text(meta(entry)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 5)
                    .padding(.horizontal, 6)
                    .background(session.selectedEntry == index ? Color.accentColor.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 8))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func summary(_ entry: PaletteEntry, _ paints: [String: Paint]) -> String {
        guard let recipe = entry.recipe else { return "No paints selected" }
        if recipe.paints.isEmpty { return "Paper white" }
        return recipe.paints.compactMap { paints[$0.paintID]?.name }.joined(separator: " + ")
    }

    private func meta(_ entry: PaletteEntry) -> String {
        let percent = Int((entry.share * 100).rounded())
        return "\(percent == 0 ? "<1" : "\(percent)")% of image" + (entry.overridden ? " · changed" : "")
    }
}
