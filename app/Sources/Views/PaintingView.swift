import SwiftUI

/// The picture as numbered colour areas. Tap an area to select its colour.
struct PaintingView: View {
    @Environment(Session.self) private var session

    var body: some View {
        ZStack {
            if let image = session.rendered, let segmentation = session.segmentation {
                NumberedPicture(
                    image: image,
                    segmentation: segmentation,
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
                    .fill(.quaternary)
                    .aspectRatio(4 / 3, contentMode: .fit)
            }
            if session.busy {
                ProgressView("Analysing")
                    .padding(12)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius))
        .shadow(color: .black.opacity(0.1), radius: 10, y: 3)
        .animation(.easeOut(duration: 0.2), value: session.busy)
    }

    private func labels(_ segmentation: Segmentation) -> [NumberedPicture.Label] {
        segmentation.regions.compactMap { region in
            let index = session.regionEntry[region.id]
            guard session.entries.indices.contains(index) else { return nil }
            let onPhoto = session.settings.view == .original
            return NumberedPicture.Label(
                text: String(index + 1),
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
    let segmentation: Segmentation
    let labels: [Label]
    var fontSize: CGFloat = 14

    var body: some View {
        Image(decorative: image, scale: 1)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .overlay {
                Canvas { context, size in
                    let scale = size.width / Double(segmentation.width)
                    for label in labels where label.room * scale >= fontSize * 0.7 {
                        let text = Text(label.text).font(.system(size: fontSize, weight: .bold)).foregroundStyle(label.color)
                        context.draw(text, at: CGPoint(x: label.x * scale, y: label.y * scale))
                    }
                }
                .allowsHitTesting(false)
            }
    }
}
