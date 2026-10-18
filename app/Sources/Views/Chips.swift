import SwiftUI

extension Color {
    init(hex: String) {
        let c = ColorMath.rgb(hex: hex)
        self.init(.sRGB, red: c.x / 255, green: c.y / 255, blue: c.z / 255)
    }

    /// Text colour that reads on a chip filled with `hex`.
    static func ink(on hex: String) -> Color {
        ColorMath.prefersDarkText(on: hex) ? Color(hex: "#1d1b18") : .white
    }

    /// Numbers of the template: light blue without yellow, so a printer uses no black ink.
    static let templateNumberHex = "#96c3ff"
    static let templateNumber = Color(hex: templateNumberHex)
}

extension CGColor {
    static func from(hex: String) -> CGColor {
        let c = ColorMath.rgb(hex: hex)
        return CGColor(srgbRed: c.x / 255, green: c.y / 255, blue: c.z / 255, alpha: 1)
    }

    /// "#rrggbb" in sRGB.
    var hex: String {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let c = converted(to: space, intent: .defaultIntent, options: nil)?.components, c.count >= 3 else { return "#808080" }
        return ColorMath.hex(rgb: Vec3(Double(c[0]) * 255, Double(c[1]) * 255, Double(c[2]) * 255))
    }
}

/// A tile filled with a colour: the basic building block of paints, mixes and swatches.
struct Chip<Content: View>: View {
    let hex: String
    var minHeight: CGFloat = 44
    @ViewBuilder var content: Content

    var body: some View {
        content
            .font(Theme.chip)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .bottomLeading)
            .background(Color(hex: hex))
            .foregroundStyle(Color.ink(on: hex))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.35), lineWidth: 1))
    }
}

/// A paint as a chip: bold number, name, and optionally P / T for pan or tube.
struct PaintChip: View {
    let paint: Paint
    var showForm = false
    var used = false

    var body: some View {
        Chip(hex: paint.hex) {
            VStack(alignment: .leading, spacing: 1) {
                HStack {
                    Text(paint.displayNumber).bold()
                    Spacer(minLength: 0)
                    if showForm { Text(paint.formLabel) }
                }
                Text(paint.displayName).fontWeight(used ? .bold : .regular)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(paint.vendor) \(paint.displayNumber), \(paint.displayName)" as String)
        // The name in the other language as well, as on the web.
        .help([paint.vendor, paint.line, paint.displayName == paint.name ? paint.nameDe : paint.name, paint.source == "estimate" ? L("colour estimated") : ""].filter { !$0.isEmpty }.joined(separator: " · "))
    }
}

/// A recipe: the mixed colour on the left with how watery it is and how close it gets,
/// the paints and their parts as rows on the right.
struct RecipeView: View {
    let recipe: Recipe
    let paints: [String: Paint]
    /// Three paints per row and no empty slots, for the printed sheet.
    var wide = false
    /// One paint per row with its full name, for narrow screens.
    var stacked = false

    private var columns: Int { wide ? 3 : stacked ? 1 : 2 }
    private let rowHeight: CGFloat = 30
    /// The grid shows complete rows of slots; unused ones are drawn dashed.
    private var slots: Int { wide ? max(recipe.paints.count, 1) : stacked ? max(recipe.paints.count, 2) : 4 }
    /// "concentrated (hardly any water)" -> "Concentrated": the tile has no room for the aside.
    private var dilution: String { Words.dilutionTitle(recipe.dilution) }

    var body: some View {
        if wide || bar.count < 2 {
            tiles
        } else {
            VStack(spacing: 6) {
                tiles
                RecipeBar(parts: bar, numbered: true).frame(height: 18)
            }
        }
    }

    /// The ratio as a bar: one segment per paint, as wide as its part of the mix.
    private var bar: [MixBlock.Part] {
        recipe.paints.enumerated().compactMap { i, item in
            paints[item.paintID].map { MixBlock.Part(id: item.paintID, paint: $0, share: item.share, parts: String(parts(recipe.parts[i]).dropLast(2))) }
        }
    }

    private var tiles: some View {
        HStack(alignment: .top, spacing: 6) {
            Chip(hex: recipe.hex, minHeight: wide ? rowHeight : rowHeight * CGFloat(slots / columns) + 6 * CGFloat(slots / columns - 1)) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(dilution).bold()
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(recipe.deltaE.formatted(.number.precision(.fractionLength(1)).locale(Localization.locale))) • \(Words.term(recipe.quality))" as String)
                }
            }
            .frame(width: wide ? 140 : 112)
            if recipe.paints.isEmpty {
                Text("Leave the paper white")
                    .font(Theme.small)
                    .italic()
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: rowHeight, alignment: .leading)
            } else {
                Grid(horizontalSpacing: 6, verticalSpacing: 6) {
                    ForEach(0..<((slots + columns - 1) / columns), id: \.self) { row in
                        GridRow {
                            ForEach(0..<columns, id: \.self) { column in
                                slot(row * columns + column)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func slot(_ index: Int) -> some View {
        if index < recipe.paints.count, let paint = paints[recipe.paints[index].paintID] {
            HStack(spacing: 6) {
                Text("\(Text(parts(recipe.parts[index])).bold()) \(paint.formLabel)")
                    .fixedSize()
                Spacer(minLength: 0)
                Text("\(Text(paint.displayNumber).bold()) \(paint.displayName)")
                    .truncationMode(.tail)
            }
            .font(Theme.chip)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, minHeight: rowHeight)
            .background(Color(hex: paint.hex))
            .foregroundStyle(Color.ink(on: paint.hex))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary.opacity(0.35), lineWidth: 1))
            .help(paint.displayName)
        } else if wide {
            Color.clear.frame(maxWidth: .infinity, minHeight: rowHeight)
        } else {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(.primary.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                // A shape takes all the height it is offered: one row, as the filled slots.
                .frame(maxWidth: .infinity, minHeight: rowHeight, maxHeight: rowHeight)
                .accessibilityHidden(true)
        }
    }

    private func parts(_ n: Double) -> String {
        "\(Words.number(n)) x"
    }
}
