import CoreGraphics
import Foundation
import Observation

enum ViewMode: String, Codable, CaseIterable, Identifiable {
    case mixed, target, original

    var id: String { rawValue }
    var title: String {
        switch self {
        case .mixed: "Mixed paint"
        case .target: "Photo colour"
        case .original: "Photo"
        }
    }
}

struct AnalysisSettings: Codable, Equatable {
    var colours = 12
    var simplify = 4
    var maxPaints = 3
    var view = ViewMode.mixed
    var outlines = true
    var numbers = true
}

/// One colour of the picture with the recipes that mix it.
struct PaletteEntry: Identifiable {
    let id: Int
    let sourceHex: String
    var targetHex: String
    var overridden = false
    var share: Double
    var recipes: [Recipe] = []
    var chosen = 0

    var recipe: Recipe? { recipes.indices.contains(chosen) ? recipes[chosen] : nil }
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
    static let workSize = 640 // longest side the analysis runs on
    static let sourceSize = 1600 // longest side that is kept and saved
    static let renderScale = 2 // picture pixels per working pixel, keeps outlines crisp

    /// Sample photos; "Sample" steps through them, the first one loads at start.
    private static let samples = [
        (file: "sample-street-dusk", name: "Street at dusk (sample)"),
        (file: "sample-cwm-idwal", name: "Cwm Idwal (sample)"),
    ]

    @ObservationIgnored private let library: Library
    @ObservationIgnored private var nextSample = 0
    @ObservationIgnored private var pixels: (rgba: [UInt8], width: Int, height: Int)?
    @ObservationIgnored private var originalPixels: [UInt8]? // the photo at render size, for the "Photo" view
    @ObservationIgnored private var analysisRun = 0
    @ObservationIgnored private var recipeRun = 0

    var imageName = ""
    /// Id in the collection when the picture was saved or opened from it.
    var savedID: String?
    private(set) var image: CGImage?
    private(set) var segmentation: Segmentation?
    private(set) var entries: [PaletteEntry] = []
    /// Entries that came from the analysis; detached areas are appended after them.
    private(set) var baseEntries = 0
    /// Region id -> entry index.
    private(set) var regionEntry: [Int] = []
    /// The areas with their outlines, ready to show.
    private(set) var rendered: CGImage?
    private(set) var selectedEntry: Int?
    private(set) var selectedRegion: Int?
    private(set) var busy = false
    var error: String?

    var settings = AnalysisSettings() {
        didSet {
            guard settings != oldValue else { return }
            if settings.maxPaints != oldValue.maxPaints { recomputeAllRecipes() } else { render() }
        }
    }

    init(library: Library) {
        self.library = library
    }

    var selected: PaletteEntry? { selectedEntry.flatMap { entries.indices.contains($0) ? entries[$0] : nil } }

    var usedPaintIDs: Set<String> {
        Set(entries.flatMap { $0.recipe?.paints.map(\.paintID) ?? [] })
    }

    // MARK: Loading

    func loadSample() {
        let sample = Self.samples[nextSample]
        nextSample = (nextSample + 1) % Self.samples.count
        guard let url = Bundle.main.url(forResource: sample.file, withExtension: "webp"), let data = try? Data(contentsOf: url) else {
            error = "The sample photo is missing."
            return
        }
        load(data, name: sample.name)
    }

    /// Opens a new photo. Returns false when the data is not a picture.
    @discardableResult
    func load(_ data: Data, name: String, settings: AnalysisSettings? = nil, edits: [EntryEdit] = []) -> Bool {
        guard let decoded = Pictures.decode(data, maxSide: Self.sourceSize),
              let work = Pictures.pixels(of: decoded, maxSide: Self.workSize) else {
            error = "Could not open this picture."
            return false
        }
        error = nil
        image = decoded
        pixels = work
        originalPixels = nil
        imageName = name
        savedID = nil
        if let settings { self.settings = settings }
        analyse(edits: edits)
        return true
    }

    // MARK: Analysis

    /// Finds the colour areas again, e.g. after the number of colours changed.
    func analyse(edits: [EntryEdit] = []) {
        guard let pixels else { return }
        analysisRun += 1
        let run = analysisRun
        let colours = settings.colours
        let simplify = settings.simplify
        busy = true
        Task {
            let result = await Task.detached(priority: .userInitiated) {
                Segmenter.segment(rgba: pixels.rgba, width: pixels.width, height: pixels.height, colours: colours, simplify: simplify)
            }.value
            guard run == analysisRun else { return } // a newer analysis superseded this one
            apply(result, edits: edits)
        }
    }

    private func apply(_ result: Segmentation, edits: [EntryEdit]) {
        // Entries ordered by area (largest first) so numbers are stable and meaningful.
        let used = result.clusters.filter { $0.pixelCount > 0 }.sorted { $0.pixelCount > $1.pixelCount }
        let total = Double(result.width * result.height)
        var clusterToEntry = [Int: Int]()
        for (i, cluster) in used.enumerated() { clusterToEntry[cluster.index] = i }
        var next = used.enumerated().map { i, c in
            PaletteEntry(id: i, sourceHex: c.hex, targetHex: c.hex, share: Double(c.pixelCount) / total)
        }
        var chosen = [Int: Int]()
        for edit in edits where next.indices.contains(edit.index) {
            if let hex = edit.targetHex {
                next[edit.index].targetHex = hex
                next[edit.index].overridden = true
            }
            chosen[edit.index] = edit.chosen
        }
        entries = next
        baseEntries = next.count
        regionEntry = result.regions.map { clusterToEntry[$0.cluster] ?? 0 }
        segmentation = result
        selectedEntry = nil
        selectedRegion = nil
        recomputeAllRecipes(chosen: chosen)
    }

    /// Mixes every colour again, e.g. after the paint box changed.
    func recomputeAllRecipes(chosen: [Int: Int] = [:]) {
        guard !entries.isEmpty else { return }
        recipeRun += 1
        let run = recipeRun
        let targets = entries.map(\.targetHex)
        let paints = library.enabled.map(\.mixPaint)
        let maxPaints = settings.maxPaints
        busy = true
        Task {
            let recipes = await Task.detached(priority: .userInitiated) {
                var byHex = [String: [Recipe]]()
                for hex in targets where byHex[hex] == nil {
                    byHex[hex] = Mixing.findRecipes(target: hex, paints: paints, maxPaints: maxPaints)
                }
                return byHex
            }.value
            guard run == recipeRun, targets.count == entries.count else { return }
            for i in entries.indices {
                entries[i].recipes = recipes[entries[i].targetHex] ?? []
                let wanted = chosen[i] ?? 0
                entries[i].chosen = entries[i].recipes.indices.contains(wanted) ? wanted : 0
            }
            busy = false
            render()
        }
    }

    // MARK: Selection and changes

    func select(region: Int?) {
        if let region, regionEntry.indices.contains(region), region != selectedRegion {
            selectedRegion = region
            selectedEntry = regionEntry[region]
        } else {
            selectedRegion = nil
            selectedEntry = nil
        }
        render()
    }

    func select(entry: Int?) {
        selectedEntry = entry
        selectedRegion = nil
        render()
    }

    func setTarget(_ index: Int, hex: String) {
        guard entries.indices.contains(index), entries[index].targetHex.lowercased() != hex.lowercased() else { return }
        entries[index].targetHex = hex
        entries[index].overridden = hex.lowercased() != entries[index].sourceHex.lowercased()
        entries[index].recipes = Mixing.findRecipes(target: hex, paints: library.enabled.map(\.mixPaint), maxPaints: settings.maxPaints)
        entries[index].chosen = 0
        render()
    }

    func resetTarget(_ index: Int) {
        setTarget(index, hex: entries[index].sourceHex)
    }

    func chooseRecipe(_ index: Int, _ recipe: Int) {
        entries[index].chosen = recipe
        render()
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
        var entry = PaletteEntry(id: entries.count, sourceHex: source.sourceHex, targetHex: source.targetHex, share: share)
        entry.overridden = source.overridden
        entry.recipes = source.recipes
        entry.chosen = source.chosen
        entries.append(entry)
        entries[from].share -= share
        regionEntry[region] = entry.id
        selectedEntry = entry.id
        render()
    }

    /// Colour changes worth saving. Detached areas are not kept: they depend on the exact area ids.
    func exportEdits() -> [EntryEdit] {
        entries.prefix(baseEntries).enumerated().compactMap { index, entry in
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

        if settings.view == .original {
            if originalPixels == nil, let image {
                originalPixels = Pictures.pixels(of: image, width: outW, height: outH)
            }
            out = originalPixels ?? [UInt8](repeating: 255, count: outW * outH * 4)
        } else {
            out = [UInt8](repeating: 255, count: outW * outH * 4)
            let colours: [(UInt8, UInt8, UInt8)] = entries.enumerated().map { index, entry in
                var c = ColorMath.rgb(hex: displayHex(entry))
                if let highlight, highlight != index { c = c * 0.35 + Vec3(255, 255, 255) * 0.65 }
                return (UInt8(c.x.rounded()), UInt8(c.y.rounded()), UInt8(c.z.rounded()))
            }
            out.withUnsafeMutableBufferPointer { out in
                for y in 0..<h {
                    for x in 0..<w {
                        let c = colours[entryMap[y * w + x]]
                        for dy in 0..<scale {
                            for dx in 0..<scale {
                                let o = ((y * scale + dy) * outW + x * scale + dx) * 4
                                out[o] = c.0; out[o + 1] = c.1; out[o + 2] = c.2
                            }
                        }
                    }
                }
            }
        }

        if settings.outlines {
            let line: (Double, Double, Double, Double) = settings.view == .original ? (255, 255, 255, 0.75) : (40, 36, 30, 0.55)
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
