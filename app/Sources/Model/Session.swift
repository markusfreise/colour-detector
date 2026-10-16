import CoreGraphics
import Foundation
import Observation

enum ViewMode: String, Codable, CaseIterable, Identifiable {
    /// In the order of the web app's view switch. `template` leaves the areas empty, to print and paint into.
    case mixed, target, overlay, original, template

    var id: String { rawValue }
    var title: String {
        switch self {
        case .mixed: "Mixed paint"
        case .target: "Photo colour"
        case .original: "Photo"
        case .overlay: "Overlay: the photo at half strength over the paint"
        case .template: "Template to print: areas and numbers in light blue, nothing filled in"
        }
    }

    /// The short label shown with Help.
    var hint: String {
        switch self {
        case .mixed: "Mixed paint"
        case .target: "Photo colour"
        case .original: "Photo"
        case .overlay: "Overlay"
        case .template: "Template to print"
        }
    }

    /// For narrow screens.
    var shortTitle: String {
        switch self {
        case .mixed: "Mixed"
        case .target: "Colour"
        case .original: "Photo"
        case .overlay: "Overlay"
        case .template: "Template"
        }
    }

    /// The SF Symbol of the view; the web app draws the same symbols from icons8.
    var symbol: String {
        switch self {
        case .mixed: "paintpalette"
        case .target: "swatchpalette"
        case .original: "photo"
        case .overlay: "photo.on.rectangle"
        case .template: "square.dashed"
        }
    }

    /// Layer mode shows the paint or the photo.
    static let layerCases: [ViewMode] = [.mixed, .original]
}

/// How the picture is painted: every colour mixed on the palette, or thin washes over each other.
enum AnalysisMode: String, Codable, CaseIterable, Identifiable {
    case mix, layer

    var id: String { rawValue }
    var title: String { self == .mix ? "Mix" : "Layer" }
}

struct AnalysisSettings: Codable, Equatable {
    var mode = AnalysisMode.mix
    /// Layer mode: wash layers the app proposes (accents come on top).
    var layerCount = 5
    /// Layer mode: smoothing of each layer's areas.
    var layerSimplify = 4
    /// Layer mode: small strong touches painted last, 0...3.
    var layerAccents = 3
    /// Layer mode: coats of one wash an area can get.
    var maxCoats = 2
    /// Number of mixes; each is painted in one or more washes.
    var colours = 20
    var simplify = 0
    /// Areas as polygons with straight edges that overlap, instead of their organic outline.
    var geometric = false
    var maxPaints = 3
    /// 0 = the picture as accurate as possible, 10 = small areas of another hue keep their mix.
    var variety = 5
    /// Percent, applied to the photo before the analysis.
    var saturation = 200
    var contrast = 100
    var view = ViewMode.mixed
    var outlines = true
    var numbers = true

    init() {}

    // Pictures saved by earlier versions lack the newer settings.
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let defaults = AnalysisSettings()
        mode = try values.decodeIfPresent(AnalysisMode.self, forKey: .mode) ?? defaults.mode
        layerCount = try values.decodeIfPresent(Int.self, forKey: .layerCount) ?? defaults.layerCount
        layerSimplify = try values.decodeIfPresent(Int.self, forKey: .layerSimplify) ?? defaults.layerSimplify
        layerAccents = try values.decodeIfPresent(Int.self, forKey: .layerAccents) ?? defaults.layerAccents
        maxCoats = try values.decodeIfPresent(Int.self, forKey: .maxCoats) ?? defaults.maxCoats
        colours = try values.decodeIfPresent(Int.self, forKey: .colours) ?? defaults.colours
        simplify = try values.decodeIfPresent(Int.self, forKey: .simplify) ?? defaults.simplify
        geometric = try values.decodeIfPresent(Bool.self, forKey: .geometric) ?? defaults.geometric
        maxPaints = try values.decodeIfPresent(Int.self, forKey: .maxPaints) ?? defaults.maxPaints
        variety = try values.decodeIfPresent(Int.self, forKey: .variety) ?? defaults.variety
        saturation = try values.decodeIfPresent(Int.self, forKey: .saturation) ?? 100
        contrast = try values.decodeIfPresent(Int.self, forKey: .contrast) ?? 100
        view = try values.decodeIfPresent(ViewMode.self, forKey: .view) ?? defaults.view
        outlines = try values.decodeIfPresent(Bool.self, forKey: .outlines) ?? defaults.outlines
        numbers = try values.decodeIfPresent(Bool.self, forKey: .numbers) ?? defaults.numbers
    }
}

/// One colour of the picture with the recipes that mix it.
struct PaletteEntry: Identifiable, Sendable {
    let id: Int
    /// The mix this colour is a wash of, as the analysis numbered it.
    var group = 0
    /// Water level of the wash within its mix (W, L, M, R, C); empty for paper white.
    var letter = ""
    let sourceHex: String
    var targetHex: String
    var overridden = false
    var share: Double
    var recipes: [Recipe] = []
    var chosen = 0
    /// Colours with the same family are painted with the same mix.
    var family = ""
    /// What the picture and the list call this colour: mix number plus water level, e.g. 6L.
    var label = ""

    var recipe: Recipe? { recipes.indices.contains(chosen) ? recipes[chosen] : nil }
}

/// A mix as the colour list and the printed sheet show it: its base colour, its paints and its washes.
struct MixBlock: Identifiable {
    struct Part: Identifiable {
        let id: String
        let paint: Paint
        /// Part of the mix, 0...1: the width of the paint in the recipe bar.
        let share: Double
        let parts: String
    }

    struct Wash: Identifiable {
        /// Entry index.
        let id: Int
        let label: String
        let letter: String
        let hex: String
        let share: Double
        let dilution: String
    }

    /// The family of its entries.
    let id: String
    let number: String
    /// Entry index of the largest wash: the one the recipe is fitted to.
    let base: Int
    let hex: String
    let names: String
    let paints: [Part]
    let dilution: String
    let share: Double
    let changed: Bool
    /// Lightest first.
    let washes: [Wash]
}

/// What the picture shows of a step of the painting order.
enum StepView: String, CaseIterable, Identifiable {
    /// The paper after the step; what is painted now in full colour, the rest faded.
    case paint
    /// Only the areas painted now, filled with one stroke of the wash.
    case wash
    /// The paper with all layers up to and including the step.
    case result

    var id: String { rawValue }
    var title: String {
        switch self {
        case .paint: L("Where to paint")
        case .wash: L("This wash")
        case .result: L("So far")
        }
    }
}

/// What a clicked spot gets in layer mode.
struct LayerSpot {
    let photo: String
    let layered: String
    let deltaE: Double
    /// Coats per layer.
    let coats: [Int]
}

/// A colour change that is kept with a saved picture.
struct EntryEdit: Codable {
    var index: Int
    var targetHex: String?
    var chosen: Int
}

/// The picture being worked on: its areas, its colours and their recipes.
@MainActor
@Observable
final class Session {
    static let workPixels = 800 * 600 // the analysis runs on about this many pixels, whatever the shape
    static let sourceSize = 1600 // longest side that is kept and saved
    static let renderScale = 2 // picture pixels per working pixel, keeps outlines crisp

    /// Sample photos, chosen from the samples sheet; the first one loads at start. All are under
    /// the Unsplash License; `credit` names the photographer and links to the photo or the profile.
    static let samples = [
        Sample(file: "sample-bielefeld", name: "Bielefeld (sample)"),
        Sample(file: "sample-llyn-idwal", name: "Llyn Idwal (sample)"),
        Sample(file: "sample-rooftops-dusk", name: "Rooftops at dusk (sample)"),
        Sample(file: "sample-winter-fields", name: "Winter fields (sample)"),
        Sample(file: "sample-old-town-snow", name: "Old town in snow (sample)"),
        Sample(file: "sample-red-train", name: "Red train (sample)", url: "https://unsplash.com/photos/red-and-white-train-on-train-station-Zi8T2OwJf44"),
        Sample(file: "sample-woman-white-wall", name: "Woman by a white wall (sample)", photographer: "Ayo Ogunseinde", url: "https://unsplash.com/photos/woman-looking-sideways-leaning-on-white-wall-6W4F62sN_yI"),
    ]

    struct Sample {
        let file: String
        let name: String
        var photographer = "Markus Freise"
        var url = "https://unsplash.com/@markusfreise"
    }

    @ObservationIgnored private let library: Library
    @ObservationIgnored private var nextSample = 0
    @ObservationIgnored private var pixels: (rgba: [UInt8], width: Int, height: Int)?
    @ObservationIgnored private var originalPixels: [UInt8]? // the photo at render size, for the "Photo" view
    @ObservationIgnored private var analysisRun = 0
    @ObservationIgnored private var recipeRun = 0
    /// Mix (group) -> its recipes, fitted to the largest wash of the mix.
    @ObservationIgnored private var mixRecipes: [Int: [Recipe]] = [:]

    var imageName = ""
    /// Id in the collection when the picture was saved or opened from it.
    var savedID: String?
    /// The paints chosen for this picture, saved with it (PictureCollection).
    var palette: Palette {
        get { library.palette }
        set { library.setPalette(newValue) }
    }
    private(set) var image: CGImage?
    private(set) var segmentation: Segmentation?
    private(set) var entries: [PaletteEntry] = []
    /// Entry indices in the order of their labels: mix by mix, lightest wash first.
    private(set) var order: [Int] = []
    /// Entries that came from the analysis; detached areas are appended after them.
    private(set) var baseEntries = 0
    /// Region id -> entry index.
    private(set) var regionEntry: [Int] = []
    /// The areas with their outlines, ready to show.
    private(set) var rendered: CGImage?
    /// The colour shown on its own in the picture, chosen in the colour list.
    private(set) var selectedEntry: Int?
    /// The area tapped in the picture.
    private(set) var selectedRegion: Int?
    /// The colour of the colour card and its full breakdown. Looking at a colour leaves the picture as it is.
    private(set) var inspectedEntry: Int?
    private(set) var busy = false
    var error: String?
    /// A frame is being drawn over the picture, to choose a close-up. The colour card makes room for it.
    var framing = false {
        didSet {
            guard framing, !oldValue else { return }
            selectedRegion = nil
            inspectedEntry = nil
            layerPoint = nil
        }
    }
    /// Parts of the base picture, each analysed as a picture of its own.
    private(set) var closeups: [Closeup] = []
    /// The close-up on screen, nil for the base picture.
    private(set) var closeupID: Int?
    /// The base picture while a close-up is on screen.
    @ObservationIgnored private var base: (image: CGImage, pixels: (rgba: [UInt8], width: Int, height: Int), name: String, savedID: String?, edits: [EntryEdit])?

    // Layer mode (glazing): the picture as coats of a few base paints.
    /// The plan; nil until analysed or without base paints.
    private(set) var layers: LayerPlan?
    /// Per layer: shown in the picture.
    private(set) var layerShown: [Bool] = []
    /// Index into the steps of the plan while the painting order is walked through.
    private(set) var layerStep: Int?
    var layerStepView = StepView.paint {
        didSet { if layerStepView != oldValue { render() } }
    }
    /// The clicked spot, in working pixels.
    private(set) var layerPoint: (x: Int, y: Int)?
    /// What the base paints were proposed for; they are kept as long as that holds.
    @ObservationIgnored private var layerProposal: String?
    /// Counts the pictures opened, to tell results for an earlier one apart.
    @ObservationIgnored private var pictureSerial = 0
    /// What the mixes were analysed from.
    @ObservationIgnored private var mixKey: String?
    /// Colour changes of a picture that was opened in layer mode, for its first mix analysis.
    @ObservationIgnored private var pendingEdits: (serial: Int, edits: [EntryEdit])?
    /// The photo at working size with saturation and contrast applied, as the layers were planned from.
    @ObservationIgnored private var layerSource: [UInt8]?

    var settings = AnalysisSettings() {
        didSet {
            guard settings != oldValue else { return }
            if settings.saturation != oldValue.saturation || settings.contrast != oldValue.contrast { originalPixels = nil }
            if settings.mode != oldValue.mode { return } // `setMode` takes care of the rest
            if settings.geometric != oldValue.geometric {
                analyse()
                return
            }
            if layerMode {
                if settings.maxCoats != oldValue.maxCoats { analyse() } else { render() }
            } else if settings.maxPaints != oldValue.maxPaints || settings.variety != oldValue.variety {
                recomputeAllRecipes()
            } else {
                render()
            }
        }
    }

    init(library: Library) {
        self.library = library
    }

    var selected: PaletteEntry? { selectedEntry.flatMap { entries.indices.contains($0) ? entries[$0] : nil } }
    var inspected: PaletteEntry? { inspectedEntry.flatMap { entries.indices.contains($0) ? entries[$0] : nil } }

    var usedPaintIDs: Set<String> {
        Set(entries.flatMap { $0.recipe?.paints.map(\.paintID) ?? [] })
    }

    /// Number of different mixes; the washes of a mix count once.
    var mixCount: Int { Set(entries.map(\.family)).count }

    /// Loads the next sample photo; `restart` goes back to the first one (used at start).
    func loadSample(restart: Bool = false) {
        if restart { nextSample = 0 }
        loadSample(nextSample)
    }

    /// Opens one sample photo by its place in `samples`.
    func loadSample(_ index: Int) {
        let sample = Self.samples[index % Self.samples.count]
        nextSample = (index + 1) % Self.samples.count
        guard let url = Bundle.main.url(forResource: sample.file, withExtension: "webp"), let data = try? Data(contentsOf: url) else {
            error = L("The sample photo is missing.")
            return
        }
        load(data, name: L(sample.name))
    }

    /// Opens a new photo. Returns false when the data is not a picture.
    @discardableResult
    func load(_ data: Data, name: String, settings: AnalysisSettings? = nil, edits: [EntryEdit] = []) -> Bool {
        guard let decoded = Pictures.decode(data, maxSide: Self.sourceSize) else {
            error = L("Could not open this picture.")
            return false
        }
        let scale = min(1, (Double(Self.workPixels) / Double(decoded.width * decoded.height)).squareRoot())
        let side = Int((Double(max(decoded.width, decoded.height)) * scale).rounded())
        guard let work = Pictures.pixels(of: decoded, maxSide: max(1, side)) else {
            error = L("Could not open this picture.")
            return false
        }
        error = nil
        // The close-ups belonged to the picture before.
        closeups = []
        closeupID = nil
        base = nil
        framing = false
        if let settings { self.settings = settings }
        show(image: decoded, pixels: work, name: name, savedID: nil, edits: edits)
        return true
    }

    /// Puts a picture in place and analyses it, with its colour changes.
    private func show(image: CGImage, pixels: (rgba: [UInt8], width: Int, height: Int), name: String, savedID: String?, edits: [EntryEdit]) {
        self.image = image
        self.pixels = pixels
        originalPixels = nil
        imageName = name
        self.savedID = savedID
        selectedEntry = nil
        selectedRegion = nil
        inspectedEntry = nil
        pictureSerial += 1
        pendingEdits = nil
        analyse(edits: edits)
    }

    // MARK: Close-ups

    struct Closeup: Identifiable {
        let id: Int
        /// The part of the base picture, in shares of it.
        let rect: CGRect
        let thumb: CGImage
        /// Colour changes made while it was on screen.
        var edits: [EntryEdit] = []
    }

    /// A part of the base picture as a picture of its own, cut from the photo as it is kept, so the
    /// analysis finds what the whole picture has no room for. `rect` is in shares of the picture.
    func addCloseup(_ rect: CGRect) {
        guard let source = base?.image ?? image else { return }
        let cut = Closeups.size(sourceWidth: source.width, sourceHeight: source.height, rect: rect, workPixels: 160 * 160)
        guard let part = source.cropping(to: CGRect(x: cut.sx, y: cut.sy, width: cut.sw, height: cut.sh)),
              let thumb = Pictures.scaled(part, maxSide: max(cut.width, cut.height)) else { return }
        let number = (closeups.map(\.id).max() ?? 0) + 1
        closeups.append(Closeup(id: number, rect: rect, thumb: thumb))
        openCloseup(number)
    }

    func openCloseup(_ id: Int) {
        guard let closeup = closeups.first(where: { $0.id == id }), id != closeupID, let image, let pixels else { return }
        if closeupID == nil { base = (image, pixels, imageName, savedID, []) }
        keepEdits()
        guard let base else { return }
        let source = base.image
        let cut = Closeups.size(sourceWidth: source.width, sourceHeight: source.height, rect: closeup.rect, workPixels: Self.workPixels)
        guard let part = source.cropping(to: CGRect(x: cut.sx, y: cut.sy, width: cut.sw, height: cut.sh)),
              let rgba = Pictures.pixels(of: part, width: cut.width, height: cut.height) else {
            error = L("Could not cut out this part of the picture.")
            return
        }
        framing = false
        closeupID = id
        show(image: part, pixels: (rgba, cut.width, cut.height), name: L("%@ – detail %lld", base.name, id), savedID: nil, edits: closeup.edits)
    }

    func showBase() {
        guard closeupID != nil, let base else { return }
        keepEdits()
        closeupID = nil
        self.base = nil
        show(image: base.image, pixels: base.pixels, name: base.name, savedID: base.savedID, edits: base.edits)
    }

    func removeCloseup(_ id: Int) {
        if id == closeupID { showBase() }
        closeups.removeAll { $0.id == id }
    }

    /// The colour changes of the picture on screen go with it, so they are there again on return.
    private func keepEdits() {
        let edits = exportEdits()
        if let index = closeups.firstIndex(where: { $0.id == closeupID }) {
            closeups[index].edits = edits
        } else {
            base?.edits = edits
        }
    }

    // MARK: Analysis

    /// Finds the colour areas again, e.g. after the number of colours changed.
    func analyse(edits: [EntryEdit] = []) {
        guard let pixels else { return }
        if layerMode {
            if !edits.isEmpty { pendingEdits = (pictureSerial, edits) }
            analyseLayers()
            return
        }
        // Colour changes of a picture that was opened in layer mode.
        var edits = edits
        if edits.isEmpty, let pending = pendingEdits, pending.serial == pictureSerial { edits = pending.edits }
        pendingEdits = nil
        analysisRun += 1
        let run = analysisRun
        let key = mixKeyNow
        // "Colours" counts mixes. The analysis is asked for more, and the planning joins them down
        // to the wanted number once the paints are known.
        let colours = Mixes.toRequest(wanted: settings.colours)
        let simplify = settings.simplify
        let geometric = settings.geometric
        let saturation = Double(settings.saturation) / 100
        let contrast = Double(settings.contrast) / 100
        busy = true
        Task {
            let result = await Task.detached(priority: .userInitiated) {
                let adjusted = ColorMath.adjust(rgba: pixels.rgba, saturation: saturation, contrast: contrast)
                return Segmenter.segment(rgba: adjusted, width: pixels.width, height: pixels.height, colours: colours, simplify: simplify, geometric: geometric)
            }.value
            guard run == analysisRun else { return } // a newer analysis superseded this one
            mixKey = key
            segmentation = result
            entries = []
            order = []
            baseEntries = 0
            regionEntry = []
            selectedEntry = nil
            selectedRegion = nil
            inspectedEntry = nil
            recomputeAllRecipes(edits: edits)
        }
    }

    // MARK: Layer mode

    var layerMode: Bool { settings.mode == .layer }

    private var mixKeyNow: String {
        "\(pictureSerial)/\(settings.colours)/\(settings.simplify)/\(settings.saturation)/\(settings.contrast)/\(settings.geometric)"
    }

    /// Glazes of the base paints. On Auto the app proposes the paints from the palette's Auto
    /// pool, otherwise the ones chosen in the paint box are fitted.
    private func analyseLayers() {
        guard let pixels else { return }
        analysisRun += 1
        let run = analysisRun
        let chosen = library.palette
        let s = settings
        let serial = pictureSerial
        let proposalKey = "\(serial)/\(s.layerCount)/\(s.maxCoats)/\(s.layerAccents)"
        // Propose only when there is nothing to keep: a new picture, another number of layers,
        // coats or accents (the best paints depend on those), or Auto pressed.
        let propose = chosen.layerAuto && !(layerProposal == proposalKey && !chosen.layerIDs.isEmpty)
        let pool = (propose ? library.autoCandidates : library.layerPaints).map(\.mixPaint)
        let paintIDs = propose ? nil : chosen.layerIDs
        layerStep = nil
        layerPoint = nil
        guard !pool.isEmpty else {
            layers = nil
            layerShown = []
            busy = false
            render()
            return
        }
        busy = true
        Task {
            let (plan, source) = await Task.detached(priority: .userInitiated) {
                let adjusted = ColorMath.adjust(rgba: pixels.rgba, saturation: Double(s.saturation) / 100, contrast: Double(s.contrast) / 100)
                let plan = Layers.layerImage(
                    rgba: adjusted, width: pixels.width, height: pixels.height, paints: pool,
                    // Auto: the number of wash layers (accent paints come on top). By hand: every chosen paint may be one.
                    count: chosen.layerAuto ? s.layerCount : nil,
                    paintIDs: paintIDs, maxCoats: s.maxCoats, simplify: s.layerSimplify, accents: s.layerAccents, geometric: s.geometric
                )
                return (plan, adjusted)
            }.value
            guard run == analysisRun, layerMode else { return } // superseded
            // A newer picture would have superseded the run above, so the palette is still the picture's.
            if propose {
                library.setLayerPaints(plan.paintIDs, auto: true)
                layerProposal = proposalKey
            }
            layers = plan
            layerSource = source
            layerShown = plan.layers.map { _ in true }
            layerStep = nil
            layerPoint = nil
            busy = false
            render()
        }
    }

    /// Lets the app choose the base paints for this picture (again).
    func proposeLayers() {
        layerProposal = nil
        library.setLayerPaints(library.palette.layerIDs, auto: true)
        if layerMode { analyse() }
    }

    /// The paint box was closed: the layers follow its base paints.
    func layerPaintsChanged() {
        guard layerMode, !busy else { return }
        if (layers?.paintIDs ?? []) != library.palette.layerIDs || library.palette.layerAuto && layerProposal == nil { analyse() }
    }

    func setMode(_ mode: AnalysisMode) {
        guard mode != settings.mode else { return }
        settings.mode = mode
        if mode == .layer, !ViewMode.layerCases.contains(settings.view) { settings.view = .mixed }
        selectedEntry = nil
        selectedRegion = nil
        inspectedEntry = nil
        layerStep = nil
        layerPoint = nil
        if mode == .mix, segmentation != nil, mixKey == mixKeyNow {
            // The mixes are still those of this picture: they come back with every colour change
            // made by hand, only the paint box may have changed. A running layer job is dropped.
            analysisRun += 1
            busy = false
            error = nil
            recomputeAllRecipes()
            return
        }
        analyse()
    }

    /// How many coats of each layer the picture shows: all of the ticked ones, or, while the
    /// painting order is walked through, the paper after that step.
    var layerView: [Int] {
        guard let layers else { return [] }
        if let step = currentStep {
            return layers.layers.indices.map { $0 < step.layer ? layers.layers[$0].top : $0 == step.layer ? step.coat : 0 }
        }
        return layers.layers.indices.map { layerShown.indices.contains($0) && !layerShown[$0] ? 0 : layers.layers[$0].top }
    }

    var currentStep: LayerStep? {
        guard let layers, let layerStep, layers.steps.indices.contains(layerStep) else { return nil }
        return layers.steps[layerStep]
    }

    /// The number a layer goes by: painted layers count 1, 2, 3 in painting order, accents A1, A2,
    /// A3 on their own, so that "Layers" in the settings matches what is numbered; a paint that got
    /// no layer has none.
    var layerNumbers: [String?] {
        guard let layers else { return [] }
        var n = 0, a = 0
        return layers.layers.map { layer in
            guard layer.top > 0 else { return nil }
            if layer.kind == .accent {
                a += 1
                return "A\(a)"
            }
            n += 1
            return "\(n)"
        }
    }

    /// The one layer shown on its own.
    var layerSolo: Int? {
        guard layerStep == nil else { return nil }
        let shown = layerView.indices.filter { layerView[$0] > 0 }
        return shown.count == 1 ? shown[0] : nil
    }

    /// Tick or untick a layer. The last one stays: a picture with nothing on it helps nobody.
    func showLayer(_ index: Int, _ on: Bool) {
        guard layers != nil else { return }
        var next = layerView.map { $0 > 0 }
        guard next.indices.contains(index) else { return }
        next[index] = on
        guard next.contains(true) else { return }
        layerStep = nil
        layerShown = next
        render()
    }

    /// One layer on its own; again on the same layer, or with nil, all of them.
    func soloLayer(_ index: Int?) {
        guard let layers else { return }
        let solo = layerStep == nil && layerSolo == index
        layerStep = nil
        layerShown = layers.layers.indices.map { index == nil || solo || $0 == index }
        render()
    }

    /// Walk through the painting order; nil ends the walk.
    func goToStep(_ step: Int?) {
        guard let layers else { return }
        if let step, !layers.steps.isEmpty {
            layerStep = min(layers.steps.count - 1, max(0, step))
        } else {
            layerStep = nil
            layerShown = layers.layers.map { _ in true }
        }
        render()
    }

    func selectPoint(_ point: (x: Int, y: Int)?) {
        layerPoint = point
    }

    /// What the clicked spot gets: photo colour, layered colour and the coats of every layer.
    var layerSpot: LayerSpot? {
        guard let layers, let point = layerPoint, let source = layerSource, source.count == layers.width * layers.height * 4,
              point.x >= 0, point.y >= 0, point.x < layers.width, point.y < layers.height else { return nil }
        let p = point.y * layers.width + point.x
        let combo = layers.combos[Int(layers.comboMap[p])]
        let photo = ColorMath.hex(rgb: Vec3(Double(source[p * 4]), Double(source[p * 4 + 1]), Double(source[p * 4 + 2])))
        return LayerSpot(photo: photo, layered: combo.hex, deltaE: ColorMath.deltaE(ColorMath.oklab(hex: photo), ColorMath.oklab(hex: combo.hex)), coats: combo.coats)
    }

    /// The paper with some of the layers on it, at render size.
    /// - Parameters:
    ///   - show: coats shown per layer.
    ///   - step: what that step paints stays in full colour and is outlined (see `StepView`).
    ///   - onPhoto: the photo instead of the layers, under lines.
    func layerPicture(show: [Int], step: LayerStep? = nil, stepView: StepView = .paint, outlines: Bool = true, onPhoto: Bool = false) -> CGImage? {
        guard let plan = layers else { return nil }
        let scale = Self.renderScale
        let w = plan.width, h = plan.height
        let outW = w * scale, outH = h * scale
        var out: [UInt8]
        if onPhoto {
            if originalPixels == nil, let image {
                originalPixels = Pictures.pixels(of: image, width: outW, height: outH).map {
                    ColorMath.adjust(rgba: $0, saturation: Double(settings.saturation) / 100, contrast: Double(settings.contrast) / 100)
                }
            }
            out = originalPixels ?? [UInt8](repeating: 255, count: outW * outH * 4)
            if out.count != outW * outH * 4 { out = [UInt8](repeating: 255, count: outW * outH * 4) }
        } else {
            var rgba = Layers.renderLayers(plan, coats: show)
            if let step {
                let map = plan.layers[step.layer].coatMap
                if stepView == .wash {
                    // Only what the brush puts down now: one stroke of this wash on blank paper.
                    let c = ColorMath.rgb(hex: plan.layers[step.layer].hexes[1])
                    let wash = (UInt8(c.x.rounded()), UInt8(c.y.rounded()), UInt8(c.z.rounded()))
                    for p in 0..<(w * h) {
                        let on = Int(map[p]) >= step.coat
                        rgba[p * 4] = on ? wash.0 : 255
                        rgba[p * 4 + 1] = on ? wash.1 : 255
                        rgba[p * 4 + 2] = on ? wash.2 : 255
                    }
                } else if stepView == .paint {
                    // Where the brush goes in this step stays in full colour; the rest of the paper fades back.
                    for p in 0..<(w * h) where Int(map[p]) < step.coat {
                        for c in 0..<3 { rgba[p * 4 + c] = UInt8(Double(rgba[p * 4 + c]) * 0.3 + 178.5) }
                    }
                }
            }
            out = [UInt8](repeating: 255, count: outW * outH * 4)
            out.withUnsafeMutableBufferPointer { out in
                for y in 0..<h {
                    for x in 0..<w {
                        let s = (y * w + x) * 4
                        for dy in 0..<scale {
                            for dx in 0..<scale {
                                let o = ((y * scale + dy) * outW + x * scale + dx) * 4
                                out[o] = rgba[s]; out[o + 1] = rgba[s + 1]; out[o + 2] = rgba[s + 2]
                            }
                        }
                    }
                }
            }
        }

        // Lines: around what the step paints, or between areas that differ within the shown layers.
        let stepMap = step != nil && stepView != .result ? plan.layers[step!.layer].coatMap : nil
        let maps = stepMap == nil && outlines ? plan.layers.indices.filter { show.indices.contains($0) && show[$0] > 0 }.map { plan.layers[$0].coatMap } : []
        if stepMap != nil || !maps.isEmpty {
            let coat = step?.coat ?? 0
            let alpha = stepMap != nil ? (onPhoto ? 0.9 : 0.8) : (onPhoto ? 0.75 : 0.55)
            let line: (Double, Double, Double) = onPhoto ? (255, 255, 255) : (40, 36, 30)
            func differs(_ p: Int, _ q: Int) -> Bool {
                if let stepMap { return (Int(stepMap[p]) >= coat) != (Int(stepMap[q]) >= coat) }
                for map in maps where map[p] != map[q] { return true }
                return false
            }
            out.withUnsafeMutableBufferPointer { out in
                func blend(_ x: Int, _ y: Int) {
                    let o = (y * outW + x) * 4
                    out[o] = UInt8(Double(out[o]) * (1 - alpha) + line.0 * alpha)
                    out[o + 1] = UInt8(Double(out[o + 1]) * (1 - alpha) + line.1 * alpha)
                    out[o + 2] = UInt8(Double(out[o + 2]) * (1 - alpha) + line.2 * alpha)
                }
                for y in 0..<h {
                    for x in 0..<w {
                        let p = y * w + x
                        if x < w - 1, differs(p, p + 1) {
                            for dy in 0..<scale { blend((x + 1) * scale - 1, y * scale + dy) }
                        }
                        if y < h - 1, differs(p, p + w) {
                            for dx in 0..<scale { blend(x * scale + dx, (y + 1) * scale - 1) }
                        }
                    }
                }
            }
        }
        return Pictures.image(rgba: out, width: outW, height: outH)
    }

    /// What `buildPalette` hands back.
    private struct BuiltPalette: Sendable {
        var entries: [PaletteEntry]
        var baseEntries: Int
        var regionEntry: [Int]
        var mixRecipes: [Int: [Recipe]]
        /// The paints Auto picked, when it was asked to.
        var paintIDs: [String]?
    }

    /// Builds the colours and their recipes from the analysis and the paint box, e.g. after the
    /// paint box changed. While the box is on Auto, the paints are picked for this picture first.
    func recomputeAllRecipes(edits: [EntryEdit] = []) {
        guard let seg = segmentation else { return }
        recipeRun += 1
        let run = recipeRun
        let paints = library.enabled.map(\.mixPaint)
        let candidates = library.palette.auto ? library.autoCandidates.map(\.mixPaint) : nil
        let maxPaints = settings.maxPaints
        let wanted = settings.colours
        let variety = settings.variety
        let old = entries
        let oldBase = baseEntries
        let oldRegionEntry = regionEntry
        busy = true
        Task {
            let palette = await Task.detached(priority: .userInitiated) {
                Self.buildPalette(seg: seg, paints: paints, candidates: candidates, maxPaints: maxPaints, wanted: wanted, variety: variety, old: old, oldBase: oldBase, oldRegionEntry: oldRegionEntry)
            }.value
            guard run == recipeRun, seg.regions.count == segmentation?.regions.count else { return }
            if let ids = palette.paintIDs, Set(ids) != library.enabledIDs || !library.palette.auto { library.setEnabled(ids, auto: true) }
            mixRecipes = palette.mixRecipes
            entries = palette.entries
            baseEntries = palette.baseEntries
            regionEntry = palette.regionEntry
            for edit in edits where edit.index < baseEntries {
                if let hex = edit.targetHex { applyTarget(edit.index, hex: hex) }
                if entries[edit.index].recipes.indices.contains(edit.chosen) { entries[edit.index].chosen = edit.chosen }
            }
            if let selectedEntry, !entries.indices.contains(selectedEntry) { self.selectedEntry = nil }
            if let inspectedEntry, !entries.indices.contains(inspectedEntry) { self.inspectedEntry = nil }
            relabel()
            busy = false
            render()
        }
    }

    /// Recipes count as the same mix when they use the same paints.
    private nonisolated static func paintKey(_ recipe: Recipe) -> String {
        recipe.paints.map(\.paintID).sorted().joined(separator: "+")
    }

    /// The analysis delivers mixes, each split into washes. A mix gets its recipes from its largest
    /// wash; every other wash is that recipe with more or less water. Washes that end up on the same
    /// water level are the same instruction for the painter, so they become one colour.
    /// Colours changed by hand, detached areas and picked recipes are carried over where they still fit.
    private nonisolated static func buildPalette(
        seg: Segmentation, paints: [MixPaint], candidates: [MixPaint]?, maxPaints: Int, wanted: Int, variety: Int,
        old: [PaletteEntry], oldBase: Int, oldRegionEntry: [Int]
    ) -> BuiltPalette {
        var box = paints
        var picked: [String]?
        if let candidates {
            // Every wash is a target: a wash its mix cannot reach needs paints for a mix of its own.
            let targets = seg.clusters.filter { $0.pixelCount > 0 }.map { (hex: $0.hex, weight: Double($0.pixelCount)) }
            let ids = Mixing.proposePaints(targets: targets, paints: candidates, maxPaints: maxPaints)
            box = candidates.filter { ids.contains($0.id) }
            picked = ids
        }
        let byID = Dictionary(box.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let total = Double(seg.width * seg.height)
        func wash(_ recipe: Recipe, _ hex: String) -> Recipe { Mixing.washRecipe(recipe, target: hex, paints: byID) ?? recipe }

        struct Item {
            var group: Int
            var clusters: [Int]
            var pixels: Int
            var lab: Vec3
            var hex = ""
            var letter = ""
        }
        var mixRecipes = [Int: [Recipe]]()
        var built: [Item] = []
        for mix in Mixes.plan(clusters: seg.clusters, paints: box, maxPaints: maxPaints, wanted: wanted, variety: variety) {
            mixRecipes[mix.group] = mix.recipes
            var items = mix.clusters.map { Item(group: mix.group, clusters: [$0.index], pixels: $0.pixelCount, lab: ColorMath.oklab(hex: $0.hex)) }
            // Merge washes until every water level of the mix occurs once.
            while true {
                var levels: [Item] = []
                for var item in items {
                    item.hex = ColorMath.hex(oklab: item.lab)
                    item.letter = mix.recipes.first.map { Mixing.washLetter(wash($0, item.hex).strength) } ?? ""
                    if let same = levels.firstIndex(where: { $0.letter == item.letter }) {
                        let n = Double(levels[same].pixels + item.pixels)
                        levels[same].lab = (levels[same].lab * Double(levels[same].pixels) + item.lab * Double(item.pixels)) / n
                        levels[same].pixels += item.pixels
                        levels[same].clusters += item.clusters
                    } else {
                        levels.append(item)
                    }
                }
                let done = levels.count == items.count
                items = levels
                if done { break }
            }
            built += items
        }

        // Largest first, so the entry numbers used in saved pictures stay meaningful.
        let sorted = built.enumerated().sorted { $0.element.pixels != $1.element.pixels ? $0.element.pixels > $1.element.pixels : $0.offset < $1.offset }.map(\.element)
        var clusterToEntry = [Int: Int]()
        var entries = sorted.enumerated().map { i, item -> PaletteEntry in
            for c in item.clusters { clusterToEntry[c] = i }
            return PaletteEntry(id: i, group: item.group, letter: item.letter, sourceHex: item.hex, targetHex: item.hex, share: Double(item.pixels) / total)
        }
        var regionEntry = seg.regions.map { clusterToEntry[$0.cluster] ?? 0 }

        // Carry over what the user changed.
        var pickedPaints = [Int: String]()
        var kept = [Int: String]()
        for e in old where !e.overridden && e.chosen != 0 {
            if let recipe = e.recipe { pickedPaints[e.group] = paintKey(recipe) }
        }
        for e in old.prefix(oldBase) where e.overridden {
            guard let match = entries.firstIndex(where: { $0.group == e.group && $0.letter == e.letter }) else { continue }
            entries[match].targetHex = e.targetHex
            entries[match].overridden = true
            if e.chosen != 0, let recipe = e.recipe { kept[match] = paintKey(recipe) }
        }
        let baseEntries = entries.count
        for (n, e) in old.dropFirst(oldBase).enumerated() {
            let id = entries.count
            let oldIndex = oldBase + n
            var size = 0
            for (r, region) in seg.regions.enumerated() where oldRegionEntry.indices.contains(r) && oldRegionEntry[r] == oldIndex {
                if entries.indices.contains(regionEntry[r]) { entries[regionEntry[r]].share -= Double(region.size) / total }
                regionEntry[r] = id
                size += region.size
            }
            var entry = PaletteEntry(id: id, group: e.group, letter: e.letter, sourceHex: e.sourceHex, targetHex: e.targetHex, share: Double(size) / total)
            entry.overridden = e.overridden
            if e.chosen != 0, let recipe = e.recipe { kept[id] = paintKey(recipe) }
            entries.append(entry)
        }

        for i in entries.indices {
            if entries[i].overridden {
                entries[i].family = "own-\(i)"
                entries[i].recipes = Mixing.findRecipes(target: entries[i].targetHex, paints: box, maxPaints: maxPaints)
            } else {
                entries[i].family = "mix-\(entries[i].group)"
                entries[i].recipes = (mixRecipes[entries[i].group] ?? []).map { wash($0, entries[i].targetHex) }
            }
            if let wanted = entries[i].overridden ? kept[i] : pickedPaints[entries[i].group] ?? kept[i] {
                entries[i].chosen = entries[i].recipes.firstIndex { paintKey($0) == wanted } ?? 0
            }
        }
        return BuiltPalette(entries: entries, baseEntries: baseEntries, regionEntry: regionEntry, mixRecipes: mixRecipes, paintIDs: picked)
    }

    /// Recipes of one colour: washes of its mix, or recipes of its own once its colour was changed by hand.
    private func recomputeRecipes(_ index: Int) {
        let paints = library.enabled.map(\.mixPaint)
        if entries[index].overridden {
            entries[index].family = "own-\(index)"
            entries[index].recipes = Mixing.findRecipes(target: entries[index].targetHex, paints: paints, maxPaints: settings.maxPaints)
        } else {
            let byID = Dictionary(paints.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            let hex = entries[index].targetHex
            entries[index].family = "mix-\(entries[index].group)"
            entries[index].recipes = (mixRecipes[entries[index].group] ?? []).map { Mixing.washRecipe($0, target: hex, paints: byID) ?? $0 }
        }
        entries[index].chosen = 0
    }

    /// Labels: one number per mix, largest first. A mix painted in several washes adds a letter
    /// for the water level: 6L is mix 6 as a light wash, 6R the same mix rich.
    private func relabel() {
        var families: [(key: String, share: Double, members: [Int])] = []
        for (i, e) in entries.enumerated() {
            if let f = families.firstIndex(where: { $0.key == e.family }) {
                families[f].share += e.share
                families[f].members.append(i)
            } else {
                families.append((e.family, e.share, [i]))
            }
        }
        func strength(_ i: Int) -> Double { entries[i].recipes.first?.strength ?? 0 }
        var next: [Int] = []
        let sorted = families.enumerated().sorted { $0.element.share != $1.element.share ? $0.element.share > $1.element.share : $0.offset < $1.offset }
        for (n, family) in sorted.map(\.element).enumerated() {
            let members = family.members.sorted { strength($0) != strength($1) ? strength($0) < strength($1) : $0 < $1 }
            let washes = Set(members.map { entries[$0].letter }).count > 1
            for i in members {
                entries[i].label = "\(n + 1)\(washes ? entries[i].letter : "")"
                next.append(i)
            }
        }
        order = next
    }

    /// One block per mix, in the order of the labels.
    var mixBlocks: [MixBlock] {
        let paints = library.byID
        func short(_ recipe: Recipe) -> String { recipe.dilution.replacingOccurrences(of: " (layer/glaze)", with: "") }
        func parts(_ n: Double) -> String { Words.number(n) }
        var families: [String] = []
        var members: [String: [Int]] = [:]
        for index in order {
            let family = entries[index].family
            if members[family] == nil { families.append(family) }
            members[family, default: []].append(index)
        }
        return families.map { family in
            let indices = members[family] ?? []
            let base = indices.reduce(indices[0]) { entries[$1].share > entries[$0].share ? $1 : $0 }
            let entry = entries[base]
            // The mix as its recipe gives it, before any water is added or taken away.
            let mixed = entry.overridden ? nil : mixRecipes[entry.group].flatMap { $0.indices.contains(entry.chosen) ? $0[entry.chosen] : nil }
            let recipe = mixed ?? entry.recipe
            let used: [MixBlock.Part] = (recipe?.paints ?? []).enumerated().compactMap { i, item in
                paints[item.paintID].map { MixBlock.Part(id: item.paintID, paint: $0, share: item.share, parts: parts(recipe?.parts[i] ?? 1)) }
            }
            return MixBlock(
                id: family,
                number: String(entry.label.prefix { $0.isNumber }),
                base: base,
                hex: recipe?.hex ?? entry.targetHex,
                names: recipe == nil ? L("No paints selected") : used.isEmpty ? L("Paper white") : used.map(\.paint.displayName).joined(separator: " + "),
                paints: used,
                dilution: entry.recipe.map { $0.paints.isEmpty ? "" : short($0) } ?? "",
                share: indices.reduce(0) { $0 + entries[$1].share },
                changed: indices.contains { entries[$0].overridden },
                washes: indices.map { i in
                    let wash = entries[i].recipe
                    return MixBlock.Wash(id: i, label: entries[i].label, letter: entries[i].letter, hex: wash?.hex ?? entries[i].targetHex, share: entries[i].share, dilution: wash.map(short) ?? "")
                }
            )
        }
    }

    /// With a colour selected only its mix stays in the picture: all its washes, the rest goes blank.
    func isShown(_ entry: Int) -> Bool {
        guard let selected, entries.indices.contains(entry) else { return true }
        return entries[entry].family == selected.family
    }

    // MARK: Selection and changes

    /// A tap on an area: its colour goes on the colour card, the picture stays as it is.
    /// The same area again closes the card; a tap on the blanked part brings the whole picture back.
    func inspect(region: Int?) {
        guard let region, regionEntry.indices.contains(region), region != selectedRegion else {
            selectedRegion = nil
            inspectedEntry = nil
            return
        }
        guard isShown(regionEntry[region]) else {
            select(entry: nil)
            return
        }
        selectedRegion = region
        inspectedEntry = regionEntry[region]
    }

    /// Puts a colour on the colour card without tapping an area.
    func inspect(entry: Int?) {
        inspectedEntry = entry.flatMap { entries.indices.contains($0) ? $0 : nil }
        selectedRegion = nil
    }

    /// Shows one colour on its own in the picture, and on the colour card.
    func select(entry: Int?) {
        selectedEntry = entry
        selectedRegion = nil
        inspectedEntry = entry
        render()
    }

    func setTarget(_ index: Int, hex: String) {
        guard entries.indices.contains(index), entries[index].targetHex.lowercased() != hex.lowercased() else { return }
        applyTarget(index, hex: hex)
        relabel()
        render()
    }

    private func applyTarget(_ index: Int, hex: String) {
        entries[index].targetHex = hex
        entries[index].overridden = hex.lowercased() != entries[index].sourceHex.lowercased()
        recomputeRecipes(index)
    }

    func resetTarget(_ index: Int) {
        setTarget(index, hex: entries[index].sourceHex)
    }

    /// A recipe is picked for the whole mix: all its washes change with it.
    func chooseRecipe(_ index: Int, _ recipe: Int) {
        let family = entries[index].family
        for i in entries.indices where entries[i].family == family && entries[i].recipes.indices.contains(recipe) {
            entries[i].chosen = recipe
        }
        render()
    }

    /// Labels of the other colours painted with the same mix as the entry.
    func washes(of index: Int) -> [String] {
        guard entries.indices.contains(index) else { return [] }
        return order.filter { $0 != index && entries[$0].family == entries[index].family }.map { entries[$0].label }
    }

    /// Number of areas that share the entry's colour.
    func areaCount(of entry: Int) -> Int {
        regionEntry.reduce(0) { $1 == entry ? $0 + 1 : $0 }
    }

    /// Gives the selected area its own entry so it can be recoloured on its own.
    func detachSelectedRegion() {
        guard let region = selectedRegion, let segmentation else { return }
        let from = regionEntry[region]
        let source = entries[from]
        let share = Double(segmentation.regions[region].size) / Double(segmentation.width * segmentation.height)
        var entry = PaletteEntry(id: entries.count, group: source.group, letter: source.letter, sourceHex: source.sourceHex, targetHex: source.targetHex, share: share)
        entry.overridden = source.overridden
        entry.recipes = source.recipes
        entry.chosen = source.chosen
        entry.family = source.family
        entry.label = source.label
        entries.append(entry)
        entries[from].share -= share
        regionEntry[region] = entry.id
        if let position = order.firstIndex(of: from) { order.insert(entry.id, at: position + 1) } else { order.append(entry.id) }
        inspectedEntry = entry.id
        if selectedEntry != nil { selectedEntry = entry.id }
        render()
    }

    /// Colour changes worth saving. Detached areas are not kept: they depend on the exact area ids.
    func exportEdits() -> [EntryEdit] {
        // Saved in layer mode before the mixes were ever built: the changes it was opened with.
        if entries.isEmpty, let pending = pendingEdits, pending.serial == pictureSerial { return pending.edits }
        return entries.prefix(baseEntries).enumerated().compactMap { index, entry in
            entry.overridden || entry.chosen != 0
                ? EntryEdit(index: index, targetHex: entry.overridden ? entry.targetHex : nil, chosen: entry.chosen)
                : nil
        }
    }

    /// Colour of an entry in the current view.
    func displayHex(_ entry: PaletteEntry) -> String {
        settings.view == .target ? entry.targetHex : entry.recipe?.hex ?? entry.targetHex
    }

    // MARK: Drawing

    /// Draws the areas (or the photo) with their outlines. Numbers are drawn by the view, at reading size.
    func render(selection: Bool = true) {
        if layerMode {
            rendered = layerPicture(show: layerView, step: currentStep, stepView: layerStepView, outlines: settings.outlines, onPhoto: settings.view == .original)
            return
        }
        rendered = makeImage(highlight: selection ? selectedEntry : nil)
    }

    /// The picture as it is shown, without dimming the unselected areas: for the printed sheet.
    func printImage() -> CGImage? {
        makeImage(highlight: nil)
    }

    private func makeImage(highlight: Int?) -> CGImage? {
        guard let seg = segmentation, regionEntry.count == seg.regions.count, !entries.isEmpty else { return nil }
        let scale = Self.renderScale
        let w = seg.width, h = seg.height
        let outW = w * scale, outH = h * scale
        var out: [UInt8]

        // Entry index per working pixel.
        let entryMap = seg.regionMap.map { regionEntry[Int($0)] }

        let onPhoto = settings.view == .original || settings.view == .overlay
        if onPhoto, originalPixels == nil, let image {
            // The photo as the analysis sees it, with saturation and contrast applied.
            originalPixels = Pictures.pixels(of: image, width: outW, height: outH).map {
                ColorMath.adjust(rgba: $0, saturation: Double(settings.saturation) / 100, contrast: Double(settings.contrast) / 100)
            }
        }
        let blank = [UInt8](repeating: 255, count: outW * outH * 4)
        if settings.view == .original {
            out = originalPixels ?? blank
        } else {
            // Overlay: the colour areas at half strength over the photo. Template: the areas stay empty.
            let fill = settings.view != .template
            let keep = settings.view == .overlay ? 0.5 : 0
            out = settings.view == .overlay ? originalPixels ?? blank : blank
            let colours: [(UInt8, UInt8, UInt8)] = entries.enumerated().map { index, entry in
                var c = ColorMath.rgb(hex: displayHex(entry))
                if let highlight, entries.indices.contains(highlight), entries[highlight].family != entry.family { c = Vec3(255, 255, 255) }
                return (UInt8(c.x.rounded()), UInt8(c.y.rounded()), UInt8(c.z.rounded()))
            }
            if fill { out.withUnsafeMutableBufferPointer { out in
                for y in 0..<h {
                    for x in 0..<w {
                        let c = colours[entryMap[y * w + x]]
                        for dy in 0..<scale {
                            for dx in 0..<scale {
                                let o = ((y * scale + dy) * outW + x * scale + dx) * 4
                                if keep == 0 {
                                    out[o] = c.0; out[o + 1] = c.1; out[o + 2] = c.2
                                } else {
                                    out[o] = UInt8(Double(out[o]) * keep + Double(c.0) * (1 - keep))
                                    out[o + 1] = UInt8(Double(out[o + 1]) * keep + Double(c.1) * (1 - keep))
                                    out[o + 2] = UInt8(Double(out[o + 2]) * keep + Double(c.2) * (1 - keep))
                                }
                            }
                        }
                    }
                }
            } }
        }

        // The template always has its outlines, in light blue: they are what is painted into. Full
        // blue and no yellow, so a printer uses no black ink, which water does not dissolve.
        if settings.outlines || settings.view == .template {
            let line: (Double, Double, Double, Double) = switch settings.view {
            case .original: (255, 255, 255, 0.75)
            case .template: (205, 230, 255, 1)
            default: (40, 36, 30, 0.55)
            }
            out.withUnsafeMutableBufferPointer { out in
                func blend(_ x: Int, _ y: Int) {
                    let o = (y * outW + x) * 4
                    out[o] = UInt8(Double(out[o]) * (1 - line.3) + line.0 * line.3)
                    out[o + 1] = UInt8(Double(out[o + 1]) * (1 - line.3) + line.1 * line.3)
                    out[o + 2] = UInt8(Double(out[o + 2]) * (1 - line.3) + line.2 * line.3)
                }
                for y in 0..<h {
                    for x in 0..<w {
                        let e = entryMap[y * w + x]
                        if x < w - 1, entryMap[y * w + x + 1] != e {
                            for dy in 0..<scale { blend((x + 1) * scale - 1, y * scale + dy) }
                        }
                        if y < h - 1, entryMap[(y + 1) * w + x] != e {
                            for dx in 0..<scale { blend(x * scale + dx, (y + 1) * scale - 1) }
                        }
                    }
                }
            }
        }
        return Pictures.image(rgba: out, width: outW, height: outH)
    }
}
