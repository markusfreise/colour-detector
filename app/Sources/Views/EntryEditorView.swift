import SwiftUI

/// One colour of the picture: target and mix side by side, a new target colour, and the alternative recipes.
struct EntryEditorView: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    let index: Int
    /// Narrow screen: recipes list one paint per row.
    var stacked = false

    var body: some View {
        if let entry = session.entries.indices.contains(index) ? session.entries[index] : nil {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    swatch(entry.targetHex, caption: "Target")
                    swatch(entry.recipe?.hex ?? entry.targetHex, caption: "Your mix")
                }
                HStack {
                    ColorPicker("Change colour", selection: target(entry), supportsOpacity: false)
                        .fixedSize()
                    Spacer()
                    if entry.overridden {
                        Button("Reset to photo") { session.resetTarget(index) }.buttonStyle(.bordered)
                    }
                }
                if session.selectedRegion != nil, session.areaCount(of: index) > 1 {
                    Button("Edit only the tapped area") { session.detachSelectedRegion() }.buttonStyle(.borderedProminent)
                }
                Text("Recipes").font(Theme.strong)
                let washes = session.washes(of: index)
                if !washes.isEmpty {
                    Text("Same mix as \(washes.joined(separator: ", ")) – only the amount of water differs.")
                        .font(Theme.small)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if entry.recipes.isEmpty {
                    Text("No paints selected in the paint box.").foregroundStyle(.secondary)
                }
                let paints = library.byID
                ForEach(Array(entry.recipes.enumerated()), id: \.offset) { recipeIndex, recipe in
                    Button {
                        session.chooseRecipe(index, recipeIndex)
                    } label: {
                        RecipeView(recipe: recipe, paints: paints, stacked: stacked)
                            .padding(8)
                            .background(entry.chosen == recipeIndex ? Color.accentColor.opacity(0.14) : .clear, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(entry.chosen == recipeIndex ? Color.accentColor : Color.primary.opacity(0.12), lineWidth: entry.chosen == recipeIndex ? 1.5 : 1))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(entry.chosen == recipeIndex ? .isSelected : [])
                }
            }
        }
    }

    private func swatch(_ hex: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Chip(hex: hex, minHeight: 60) { Text(hex) }
            Text(caption).font(Theme.small).foregroundStyle(.secondary)
        }
    }

    private func target(_ entry: PaletteEntry) -> Binding<CGColor> {
        Binding(
            get: { .from(hex: entry.targetHex) },
            set: { session.setTarget(index, hex: $0.hex) }
        )
    }
}
