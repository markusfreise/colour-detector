import SwiftUI

/// The colour of the area tapped in the picture: which one it is, how much of the picture it
/// covers, and the recipe to mix it. It floats over the picture, above the bottom bar; the full
/// breakdown opens from here as a sheet.
struct ColourCard: View {
    @Environment(Session.self) private var session
    @Environment(Library.self) private var library
    let showBreakdown: () -> Void

    var body: some View {
        if let entry = session.inspected {
            FloatingCard(title: L("Colour %@", entry.label), subtitle: L("%@%% of image", percent(entry.share)), hex: entry.recipe?.hex ?? entry.targetHex) {
                session.inspect(region: nil)
            } content: {
                if let recipe = entry.recipe {
                    // The card is narrow everywhere: one paint per row.
                    RecipeView(recipe: recipe, paints: library.byID, stacked: true)
                } else {
                    Text("No paints selected in the paint box.").foregroundStyle(.secondary)
                }
                Button("Full Breakdown", systemImage: "list.bullet.rectangle", action: showBreakdown)
                    .buttonStyle(.bordered)
            }
        }
    }

    private func percent(_ share: Double) -> String {
        let percent = Int((share * 100).rounded())
        return percent == 0 ? "<1" : "\(percent)"
    }
}

/// Layer mode: the layers the tapped spot gets, in the same place as the colour card.
struct SpotCard: View {
    @Environment(Session.self) private var session

    var body: some View {
        if let spot = session.layerSpot {
            FloatingCard(title: L("This Spot"), subtitle: nil, hex: nil) {
                session.selectPoint(nil)
            } content: {
                LayerSpotView(spot: spot)
            }
        }
    }
}

/// A card over the picture: on the floating layer, so on a material rather than a plain surface.
struct FloatingCard<Content: View>: View {
    let title: String
    let subtitle: String?
    let hex: String?
    let close: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                if let hex {
                    RoundedRectangle(cornerRadius: 7)
                        .fill(Color(hex: hex))
                        .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(.primary.opacity(0.15)))
                        .frame(width: 32, height: 32)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).font(.headline)
                    if let subtitle {
                        Text(subtitle).font(.subheadline).foregroundStyle(Theme.copyLight)
                    }
                }
                Spacer(minLength: 8)
                CloseButton(action: close)
            }
            content
        }
        .padding(16)
        .frame(maxWidth: 400, alignment: .leading)
        .foregroundStyle(Theme.copy)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.border))
        .floatShadow()
        .accessibilityElement(children: .contain)
    }
}

/// The cross that closes a card, as on the web, with "Close" for VoiceOver.
struct CloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.copyLight)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close")
    }
}

/// Everything about one colour: target against mix, the colour by hand, every recipe.
struct BreakdownSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        NavigationStack {
            ScrollView {
                if let index = session.inspectedEntry {
                    EntryEditorView(index: index, stacked: sizeClass == .compact).padding()
                }
            }
            .navigationTitle(L("Colour %@", session.inspected?.label ?? ""))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                // In a bar the system draws the button: the plain xmark symbol.
                ToolbarItem(placement: .cancellationAction) { Button("Close", systemImage: "xmark") { dismiss() } }
            }
        }
        // The colour went away, e.g. a new analysis: nothing left to show.
        .onChange(of: session.inspectedEntry) { _, entry in if entry == nil { dismiss() } }
    }
}
