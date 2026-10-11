import SwiftUI

/// The picture as numbered colour areas, or in layer mode as the paper with its layers.
/// Tap an area to select its colour, or in layer mode a spot to see its layers.
struct PaintingView: View {
    @Environment(Session.self) private var session

    var body: some View {
        ZStack {
            if session.layerMode, let image = session.rendered, let plan = session.layers {
                NumberedPicture(image: image, width: plan.width, labels: session.settings.numbers ? coatLabels(plan) : [])
                    .overlay {
                        GeometryReader { geometry in
                            Color.clear
                                .contentShape(Rectangle())
                                .onTapGesture { location in
                                    session.selectPoint((Int(location.x / geometry.size.width * Double(plan.width)), Int(location.y / geometry.size.height * Double(plan.height))))
                                }
                            if let point = session.layerPoint {
                                // The spot whose layers are listed next to the picture.
                                Circle()
                                    .strokeBorder(.white, lineWidth: 3)
                                    .overlay(Circle().strokeBorder(Color(hex: "#1d1b18"), lineWidth: 1.5))
                                    .frame(width: 20, height: 20)
                                    .position(
                                        x: (Double(point.x) + 0.5) / Double(plan.width) * geometry.size.width,
                                        y: (Double(point.y) + 0.5) / Double(plan.height) * geometry.size.height
                                    )
                                    .allowsHitTesting(false)
                            }
                        }
                    }
                    .opacity(session.busy ? 0.5 : 1)
                    .accessibilityLabel("Picture as layers of paint")
            } else if !session.layerMode, let image = session.rendered, let segmentation = session.segmentation {
                NumberedPicture(
                    image: image,
                    width: segmentation.width,
                    labels: session.settings.numbers ? labels(segmentation) : []
                )
                .overlay {
                    GeometryReader { geometry in
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture { location in tap(location, in: geometry.size, segmentation) }
                    }
                }
                .opacity(session.busy ? 0.5 : 1)
                .accessibilityLabel("Picture as numbered colour areas")
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(session.layerMode && !session.busy ? AnyShapeStyle(.white) : AnyShapeStyle(.quaternary))
                    .aspectRatio(4 / 3, contentMode: .fit)
            }
            if session.busy {
                ProgressView(session.layerMode ? "Planning layers" : "Analysing")
                    .padding(12)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
        .shadow(color: .black.opacity(0.1), radius: 10, y: 3)
        .animation(.easeOut(duration: 0.2), value: session.busy)
    }

    /// One layer on its own: the number of coats in every area that gets any.
    private func coatLabels(_ plan: LayerPlan) -> [NumberedPicture.Label] {
        guard let solo = session.layerSolo else { return [] }
        let layer = plan.layers[solo]
        let onPhoto = session.settings.view == .original
        return layer.regions.compactMap { region in
            guard region.coats > 0 else { return nil }
            return NumberedPicture.Label(
                text: "\(region.coats)",
                x: Double(region.anchorX) + 0.5,
                y: Double(region.anchorY) + 0.5,
                room: Double(region.anchorDist),
                color: onPhoto ? .white : Color.ink(on: layer.hexes[region.coats])
            )
        }
    }

    private func labels(_ segmentation: Segmentation) -> [NumberedPicture.Label] {
        segmentation.regions.compactMap { region in
            let index = session.regionEntry[region.id]
            guard session.entries.indices.contains(index) else { return nil }
            let onPhoto = session.settings.view == .original
            guard onPhoto || session.isShown(index) else { return nil }
            return NumberedPicture.Label(
                text: session.entries[index].label,
                x: Double(region.anchorX) + 0.5,
                y: Double(region.anchorY) + 0.5,
                room: Double(region.anchorDist),
                color: onPhoto ? .white : Color.ink(on: session.displayHex(session.entries[index]))
            )
        }
    }

    private func tap(_ location: CGPoint, in size: CGSize, _ segmentation: Segmentation) {
        let x = Int(location.x / size.width * Double(segmentation.width))
        let y = Int(location.y / size.height * Double(segmentation.height))
        guard x >= 0, y >= 0, x < segmentation.width, y < segmentation.height else { return }
        session.select(region: Int(segmentation.regionMap[y * segmentation.width + x]))
    }
}

/// The rendered areas with a number in every area that has room for one.
struct NumberedPicture: View {
    struct Label {
        let text: String
        /// Position in working pixels.
        let x: Double
        let y: Double
        /// Distance from the position to the area's border, in working pixels.
        let room: Double
        let color: Color
    }

    let image: CGImage
    /// Width of the picture in working pixels.
    let width: Int
    let labels: [Label]
    var fontSize: CGFloat = 14

    var body: some View {
        Image(decorative: image, scale: 1)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .overlay {
                Canvas { context, size in
                    let scale = size.width / Double(width)
                    for label in labels where label.room * scale >= fontSize * 0.7 {
                        let text = Text(label.text).font(.system(size: fontSize, weight: .bold)).foregroundStyle(label.color)
                        context.draw(text, at: CGPoint(x: label.x * scale, y: label.y * scale))
                    }
                }
                .allowsHitTesting(false)
            }
    }
}
