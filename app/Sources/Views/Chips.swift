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
            .font(.caption2)
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
                Text(paint.name).fontWeight(used ? .bold : .regular)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(paint.vendor) \(paint.displayNumber), \(paint.name)")
        .help([paint.vendor, paint.line, paint.nameDe, paint.source == "estimate" ? "colour estimated" : ""].filter { !$0.isEmpty }.joined(separator: " · "))
    }
}

/// A recipe: the mixed colour with how watery it is and how close it gets, then the paints and their parts.
struct RecipeView: View {
    let recipe: Recipe
    let paints: [String: Paint]
    /// One row, for the printed sheet.
    var wide = false

    var body: some View {
        if wide {
            HStack(spacing: 6) {
                result.frame(width: 150)
                ingredients
            }
        } else {
            VStack(spacing: 6) {
                result
                ingredients
            }
        }
    }

    private var result: some View {
        Chip(hex: recipe.hex, minHeight: wide ? 36 : 44) {
            VStack(alignment: .leading, spacing: 1) {
                Text(recipe.dilution).bold()
                Text("\(recipe.deltaE.formatted(.number.precision(.fractionLength(1)))) • \(recipe.quality)")
            }
        }
    }

    @ViewBuilder private var ingredients: some View {
        if recipe.paints.isEmpty {
            Text("Leave the paper white")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            HStack(spacing: 6) {
                ForEach(Array(recipe.paints.enumerated()), id: \.offset) { index, item in
                    if let paint = paints[item.paintID] {
                        Chip(hex: paint.hex, minHeight: wide ? 36 : 44) {
                            VStack(alignment: .leading, spacing: 1) {
                                HStack(spacing: 4) {
                                    Text(parts(recipe.parts[index])).bold()
                                    Text(paint.formLabel)
                                }
                                Text("\(Text(paint.displayNumber).bold()) \(paint.name)")
                            }
                        }
                    }
                }
            }
        }
    }

    private func parts(_ n: Double) -> String {
        "\(n.formatted(.number.precision(.fractionLength(n == n.rounded() ? 0 : 1)))) x"
    }
}
