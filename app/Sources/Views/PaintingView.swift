import SwiftUI

/// The picture as numbered colour areas, or in layer mode as the paper with its layers. It fills
/// the screen behind the bars and cards, as in the web app; pinch to zoom, drag to move a zoomed
/// picture (never past its edges, as in the web app), double-tap to fit it again. Tap an area to look at its colour, or in layer mode a spot to
/// see its layers. While choosing a close-up, a drag draws a frame over the part to zoom in on.
struct PaintingView: View {
    @Environment(Session.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var zoom = 1.0
    @State private var zoomAtStart: Double?
    @State private var offset = CGSize.zero
    @State private var offsetAtStart: CGSize?
    /// Where the inspected area was tapped, in working pixels: the spot pulses there.
    @State private var spot: CGPoint?
    @State private var pulsing = false
    /// The frame being drawn for a close-up, from where the drag began to where it is, in shares of the picture.
    @State private var frameDrag: (from: CGPoint, to: CGPoint)?

    /// Margin around the picture inside the padding, so its shadow stays visible.
    private static let padding = 16.0
    /// How far a zoomed picture may be moved past its edge: its shadow and a little more.
    private static let edge = 20.0

    var body: some View {
        GeometryReader { frame in
            ZStack {
                picture
                    .scaleEffect(zoom)
                    .offset(offset)
                if session.busy {
                    ProgressView(session.layerMode ? "Planning layers" : "Analysing")
                        .padding(12)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .frame(width: frame.size.width, height: frame.size.height)
            .contentShape(Rectangle())
            .gesture(magnify(in: frame.size))
            .simultaneousGesture(pan(in: frame.size), including: zoom > 1 && !session.framing ? .all : .subviews)
            .onTapGesture(count: 2) { fit() }
            .overlay(alignment: .bottom) {
                if session.framing, frameDrag == nil, !session.busy {
                    Text("Drag a frame over the part to zoom in on")
                        .font(.callout)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.regularMaterial, in: Capsule())
                        .padding(12)
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if zoom > 1.01 {
                    IconButton(title: "Fit picture", symbol: "arrow.down.right.and.arrow.up.left", action: fit)
                        .padding(Theme.gap)
                }
            }
        }
        .animation(.easeOut(duration: 0.2), value: session.busy)
        .onChange(of: session.image) { fit() }
        .onChange(of: session.selectedRegion) { _, region in if region == nil { spot = nil } }
    }

    // MARK: Picture

    @ViewBuilder private var picture: some View {
        if let image = session.rendered, let size = session.workingSize {
            NumberedPicture(image: image, width: size.width, labels: session.pictureLabels())
                .overlay {
                    GeometryReader { geometry in
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture { location in tap(location, in: geometry.size, working: size) }
                        if session.framing {
                            Color.clear
                                .contentShape(Rectangle())
                                .gesture(framing(in: geometry.size))
                            if let drag = frameDrag, let rect = Closeups.rect(from: drag.from, to: drag.to, smallest: 0) {
                                frameMark(rect, in: geometry.size)
                            }
                        }
                        if let point = marker(working: size) {
                            ring
                                .position(x: point.x / Double(size.width) * geometry.size.width, y: point.y / Double(size.height) * geometry.size.height)
                                .allowsHitTesting(false)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                .padding(Self.padding)
                .opacity(session.busy ? 0.5 : 1)
                .accessibilityLabel(session.layerMode ? "Picture as layers of paint" : "Picture as numbered colour areas")
                .accessibilityHint(session.layerMode ? "Tap a spot to see which layers it gets." : "Tap an area to see its recipe.")
        } else {
            RoundedRectangle(cornerRadius: 6)
                .fill(.quaternary)
                .aspectRatio(4 / 3, contentMode: .fit)
                .padding(Self.padding)
        }
    }

    /// The frame as in the web app: dashed white with a dark rim, the rest of the picture dimmed.
    private func frameMark(_ rect: CGRect, in size: CGSize) -> some View {
        let box = CGRect(x: rect.minX * size.width, y: rect.minY * size.height, width: rect.width * size.width, height: rect.height * size.height)
        return ZStack {
            Path { path in
                path.addRect(CGRect(origin: .zero, size: size))
                path.addRect(box)
            }
            .fill(.black.opacity(0.25), style: FillStyle(eoFill: true))
            Rectangle()
                .stroke(.black.opacity(0.6), lineWidth: 1 / zoom)
                .frame(width: box.width + 2 / zoom, height: box.height + 2 / zoom)
                .position(x: box.midX, y: box.midY)
            Rectangle()
                .stroke(.white, style: StrokeStyle(lineWidth: 2 / zoom, dash: [6 / zoom, 4 / zoom]))
                .frame(width: box.width, height: box.height)
                .position(x: box.midX, y: box.midY)
        }
        .allowsHitTesting(false)
    }

    /// One finger draws the frame; a frame too small to count was a slip and the choice stays open.
    private func framing(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let share = { (p: CGPoint) in CGPoint(x: p.x / size.width, y: p.y / size.height) }
                frameDrag = (frameDrag?.from ?? share(value.startLocation), share(value.location))
            }
            .onEnded { _ in
                defer { frameDrag = nil }
                guard let drag = frameDrag, let rect = Closeups.rect(from: drag.from, to: drag.to) else { return }
                session.addCloseup(rect)
            }
    }

    /// The spot that was tapped: the layer spot, or the area whose colour is on the card.
    private func marker(working size: (width: Int, height: Int)) -> CGPoint? {
        if session.layerMode, let point = session.layerPoint {
            return CGPoint(x: Double(point.x) + 0.5, y: Double(point.y) + 0.5)
        }
        return session.selectedRegion == nil ? nil : spot
    }

    private var ring: some View {
        Circle()
            .strokeBorder(.white, lineWidth: 3)
            .overlay(Circle().strokeBorder(Color(hex: "#1d1b18"), lineWidth: 1.5))
            .frame(width: 22, height: 22)
            .scaleEffect(pulsing ? 1.35 : 1)
            .opacity(pulsing ? 0.55 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                pulsing = false
                withAnimation(.easeInOut(duration: 0.6).repeatCount(5, autoreverses: true)) { pulsing = true }
            }
            .onDisappear { pulsing = false }
            .id(spot.map { "\($0.x),\($0.y)" } ?? "layer")
    }

    private func tap(_ location: CGPoint, in size: CGSize, working: (width: Int, height: Int)) {
        let x = Int(location.x / size.width * Double(working.width))
        let y = Int(location.y / size.height * Double(working.height))
        guard x >= 0, y >= 0, x < working.width, y < working.height else { return }
        if session.layerMode {
            session.selectPoint((x, y))
            return
        }
        guard let segmentation = session.segmentation else { return }
        session.inspect(region: Int(segmentation.regionMap[y * segmentation.width + x]))
        spot = session.selectedRegion == nil ? nil : CGPoint(x: Double(x) + 0.5, y: Double(y) + 0.5)
    }

    // MARK: Zoom

    private func magnify(in size: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                let start = zoomAtStart ?? zoom
                zoomAtStart = start
                zoom = min(max(start * value.magnification, 1), 8)
                // Zooming out pulls a moved picture back so no edge comes loose.
                offset = clamped(offset, in: size)
            }
            .onEnded { _ in
                zoomAtStart = nil
                if zoom < 1.05 { fit() }
            }
    }

    private func pan(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                let start = offsetAtStart ?? offset
                offsetAtStart = start
                offset = clamped(CGSize(width: start.width + value.translation.width, height: start.height + value.translation.height), in: size)
            }
            .onEnded { _ in offsetAtStart = nil }
    }

    /// The offset kept within the picture: an edge may come in from the screen's edge only as far as
    /// `edge`, and a side that fits on the screen stays centred.
    private func clamped(_ offset: CGSize, in size: CGSize) -> CGSize {
        guard let working = session.workingSize, working.width > 0, working.height > 0 else { return .zero }
        let fit = min((size.width - 2 * Self.padding) / Double(working.width), (size.height - 2 * Self.padding) / Double(working.height))
        let width = Double(working.width) * fit * zoom
        let height = Double(working.height) * fit * zoom
        let limit = CGSize(width: max(0, (width - size.width) / 2 + Self.edge), height: max(0, (height - size.height) / 2 + Self.edge))
        return CGSize(
            width: min(max(offset.width, -limit.width), limit.width),
            height: min(max(offset.height, -limit.height), limit.height)
        )
    }

    private func fit() {
        withAnimation(reduceMotion ? nil : .snappy) {
            zoom = 1
            offset = .zero
        }
    }
}

extension Session {
    /// Size of the analysed picture in working pixels, in either mode.
    var workingSize: (width: Int, height: Int)? {
        if layerMode { return layers.map { ($0.width, $0.height) } }
        return segmentation.map { ($0.width, $0.height) }
    }

    /// The numbers in the picture, as it is shown: colour labels, or in layer mode the coats of the
    /// layer seen alone. Shared by the screen, the printed sheet and the exported picture.
    func pictureLabels() -> [NumberedPicture.Label] {
        guard settings.numbers else { return [] }
        let onPhoto = settings.view == .original
        if layerMode {
            guard let plan = layers, let solo = layerSolo else { return [] }
            let layer = plan.layers[solo]
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
        // Between a new analysis and its mixes the areas have no colours yet: no numbers then.
        guard let segmentation, regionEntry.count == segmentation.regions.count else { return [] }
        return segmentation.regions.compactMap { region in
            let index = regionEntry[region.id]
            guard entries.indices.contains(index), onPhoto || isShown(index) else { return nil }
            let color: Color = switch settings.view {
            case .original: .white
            case .template: Color.templateNumber
            default: Color.ink(on: displayHex(entries[index]))
            }
            return NumberedPicture.Label(
                text: entries[index].label,
                x: Double(region.anchorX) + 0.5,
                y: Double(region.anchorY) + 0.5,
                room: Double(region.anchorDist),
                color: color
            )
        }
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
