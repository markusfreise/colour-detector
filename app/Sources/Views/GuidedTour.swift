import SwiftUI

/// The guided tour, as the web's GuidedTour.vue: four cards over the app's own buttons, shown once on
/// every device and again from Help. The buttons of a step are marked with `.tourAnchor(step)`;
/// `TourOverlay` outlines them, dims the rest and puts the card beside them.
enum TourStep: Int, CaseIterable {
    case photo, paints, settings, recipes

    var title: String {
        switch self {
        case .photo: L("First choose a photo")
        case .paints: L("Now choose your paints")
        case .settings: L("Adjust the settings")
        case .recipes: L("Find the recipes")
        }
    }

    var text: String {
        switch self {
        case .photo: L("Try one of the samples, or load a reference photo of your own.")
        case .paints: L("Pick the paints you want to use, or leave it on Auto and the app chooses them from your paint box.")
        case .settings: L("Set them to the way you work: how many colours, how simple the areas, mixing or layers.")
        case .recipes: L("Hover over an area, or tap it, to see the recipe for its colour. Print or export the sheet to paint away from the screen. Have fun painting!")
        }
    }
}

@MainActor
@Observable
final class Tour {
    static let seenKey = "tourSeen"
    /// The step shown; nil while there is no tour.
    var step: TourStep?

    var seen: Bool { UserDefaults.standard.bool(forKey: Self.seenKey) }

    func start() { step = .photo }

    func next() {
        guard let step else { return }
        if let following = TourStep(rawValue: step.rawValue + 1) { self.step = following } else { end() }
    }

    /// Skipped or finished: it does not come back by itself on this device.
    func end() {
        step = nil
        UserDefaults.standard.set(true, forKey: Self.seenKey)
    }
}

struct TourAnchorKey: PreferenceKey {
    static let defaultValue: [TourStep: [Anchor<CGRect>]] = [:]

    static func reduce(value: inout [TourStep: [Anchor<CGRect>]], nextValue: () -> [TourStep: [Anchor<CGRect>]]) {
        value.merge(nextValue()) { $0 + $1 }
    }
}

extension View {
    /// Marks a view as what a step of the tour points at; several views of one step are outlined together.
    func tourAnchor(_ step: TourStep) -> some View {
        anchorPreference(key: TourAnchorKey.self, value: .bounds) { [step: [$0]] }
    }
}

struct TourOverlay: View {
    let tour: Tour
    let step: TourStep
    let anchors: [Anchor<CGRect>]
    @State private var cardSize = CGSize(width: 320, height: 180)

    private static let pad: CGFloat = 6
    private static let gap: CGFloat = 12
    private static let gutter: CGFloat = 16

    var body: some View {
        GeometryReader { proxy in
            let target = Self.union(anchors.map { proxy[$0] })?.insetBy(dx: -Self.pad, dy: -Self.pad)
            let place = Self.place(target, card: cardSize, in: proxy.size)
            ZStack(alignment: .topLeading) {
                // The window dimmed, the target cut out of it.
                Path { path in
                    path.addRect(CGRect(origin: .zero, size: proxy.size))
                    if let target { path.addRoundedRect(in: target, cornerSize: CGSize(width: Theme.radius, height: Theme.radius)) }
                }
                .fill(.black.opacity(0.38), style: FillStyle(eoFill: true))
                .allowsHitTesting(false)
                if let target {
                    RoundedRectangle(cornerRadius: Theme.radius)
                        .stroke(.white, lineWidth: 2)
                        .frame(width: target.width, height: target.height)
                        .offset(x: target.minX, y: target.minY)
                        .allowsHitTesting(false)
                }
                card
                    .onGeometryChange(for: CGSize.self) { $0.size } action: { cardSize = $0 }
                    .offset(x: place.x, y: place.y)
            }
        }
        .ignoresSafeArea()
        .animation(.easeOut(duration: 0.2), value: step)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(step.rawValue + 1) / \(TourStep.allCases.count)").font(.footnote).foregroundStyle(Theme.copyLight)
            Text(step.title).font(Theme.title).foregroundStyle(Theme.copy)
            Text(step.text).foregroundStyle(Theme.copy).fixedSize(horizontal: false, vertical: true)
            if step == .recipes {
                Link(L("Open the manual"), destination: Self.manual).underline()
            }
            HStack {
                Button(step == .recipes ? L("Close") : L("Skip tour")) { tour.end() }
                    .buttonStyle(.plain)
                    .underline()
                    .foregroundStyle(Theme.copyLight)
                Spacer()
                Button(step == .recipes ? L("Let's paint") : L("Next")) { tour.next() }
                    .buttonStyle(.plain)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.onCorporate)
                    .padding(.horizontal, 16)
                    .frame(minHeight: Theme.controlHeight)
                    .background(Theme.corporate, in: RoundedRectangle(cornerRadius: Theme.radiusSmall))
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 8)
        }
        .padding(16)
        .frame(width: 320)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: Theme.radius))
        .floatShadow()
    }

    /// The manual of the website, in the language of the app.
    private static var manual: URL {
        URL(string: Localization.locale.language.languageCode?.identifier == "de" ? "https://watercolourlove.de/de/handbuch/" : "https://watercolourlove.de/manual/")!
    }

    private static func union(_ rects: [CGRect]) -> CGRect? {
        let seen = rects.filter { $0.width > 0 && $0.height > 0 }
        guard let first = seen.first else { return nil }
        return seen.dropFirst().reduce(first) { $0.union($1) }
    }

    /// Beside the target on the first side with room: right, left, below, above; always inside the
    /// window (the web's placeCard in src/lib/tour.js).
    static func place(_ target: CGRect?, card: CGSize, in view: CGSize) -> CGPoint {
        let clampX = { (x: CGFloat) in min(max(x, gutter), view.width - gutter - card.width) }
        let clampY = { (y: CGFloat) in min(max(y, gutter), view.height - gutter - card.height) }
        guard let target else { return CGPoint(x: clampX((view.width - card.width) / 2), y: clampY((view.height - card.height) / 2)) }
        let middleY = clampY(target.midY - card.height / 2)
        let middleX = clampX(target.midX - card.width / 2)
        if target.maxX + gap + card.width <= view.width - gutter { return CGPoint(x: target.maxX + gap, y: middleY) }
        if target.minX - gap - card.width >= gutter { return CGPoint(x: target.minX - gap - card.width, y: middleY) }
        if target.maxY + gap + card.height <= view.height - gutter { return CGPoint(x: middleX, y: target.maxY + gap) }
        if target.minY - gap - card.height >= gutter { return CGPoint(x: middleX, y: target.minY - gap - card.height) }
        return CGPoint(x: middleX, y: clampY(view.height - gutter - card.height))
    }
}
