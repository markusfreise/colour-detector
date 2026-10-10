import CoreGraphics
import Foundation
import Observation

enum ViewMode: String, Codable, CaseIterable, Identifiable {
    case mixed, target, original, overlay

    var id: String { rawValue }
    var title: String {
        switch self {
        case .mixed: "Mixed paint"
        case .target: "Photo colour"
        case .original: "Photo"
        case .overlay: "Overlay"
        }
    }

    /// For narrow screens.
    var shortTitle: String {
        switch self {
        case .mixed: "Mixed"
        case .target: "Colour"
        case .original: "Photo"
        case .overlay: "Overlay"
        }
    }
}

struct AnalysisSettings: Codable, Equatable {
    /// Number of mixes; each is painted in one or more washes.
    var colours = 20
    var simplify = 0
    var maxPaints = 3
    /// 0 = the picture as accurate as possible, 10 = small areas of another hue keep their mix.
    var variety = 5
    /// Percent, applied to the photo before the analysis.
    var saturation = 200
    var contrast = 100
    var view = ViewMode.mixed
    var outlines = true
    var numbers = true
    /// Colour list: every wash of a mix, or only its base colour.
    var washes = true

    init() {}

    // Pictures saved by earlier versions lack the newer settings.
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let defaults = AnalysisSettings()
        colours = try values.decodeIfPresent(Int.self, forKey: .colours) ?? defaults.colours
        simplify = try values.decodeIfPresent(Int.self, forKey: .simplify) ?? defaults.simplify
        maxPaints = try values.decodeIfPresent(Int.self, forKey: .maxPaints) ?? defaults.maxPaints
        variety = try values.decodeIfPresent(Int.self, forKey: .variety) ?? defaults.variety
        saturation = try values.decodeIfPresent(Int.self, forKey: .saturation) ?? 100
        contrast = try values.decodeIfPresent(Int.self, forKey: .contrast) ?? 100
        view = try values.decodeIfPresent(ViewMode.self, forKey: .view) ?? defaults.view
        outlines = try values.decodeIfPresent(Bool.self, forKey: .outlines) ?? defaults.outlines
        numbers = try values.decodeIfPresent(Bool.self, forKey: .numbers) ?? defaults.numbers
        washes = try values.decodeIfPresent(Bool.self, forKey: .washes) ?? defaults.washes
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
    /// Mix (group) -> its recipes, fitted to the largest wash of the mix.
    @ObservationIgnored private var mixRecipes: [Int: [Recipe]] = [:]

    var imageName = ""
    /// Id in the collection when the picture was saved or opened from it.
    var savedID: String?
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
    private(set) var selectedEntry: Int?
    private(set) var selectedRegion: Int?
    private(set) var busy = false
    var error: String?

    var settings = AnalysisSettings() {
        didSet {
            guard settings != oldValue else { return }
            if settings.saturation != oldValue.saturation || settings.contrast != oldValue.contrast { originalPixels = nil }
            if settings.maxPaints != oldValue.maxPaints || settings.variety != oldValue.variety { recomputeAllRecipes() } else { render() }
        }
    }

    init(library: Library) {
        self.library = library
    }

    var selected: PaletteEntry? { selectedEntry.flatMap { entries.indices.contains($0) ? entries[$0] : nil } }

    var usedPaintIDs: Set<String> {
        Set(entries.flatMap { $0.recipe?.paints.map(\.paintID) ?? [] })
    }

    /// Number of different mixes; the washes of a mix count once.
    var mixCount: Int { Set(entries.map(\.family)).count }

    /// The colour of an entry's mix as its recipe gives it, before any water is added or taken away.
    func baseHex(of entry: PaletteEntry) -> String {
        let recipes = entry.overridden ? entry.recipes : mixRecipes[entry.group] ?? entry.recipes
        return (recipes.indices.contains(entry.chosen) ? recipes[entry.chosen].hex : nil) ?? entry.recipe?.hex ?? entry.targetHex
    }

    // MARK: Loading

    /// Loads the next sample photo; `restart` goes back to the first one (used at start).
    func loadSample(restart: Bool = false) {
        if restart { nextSample = 0 }
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
        guard let decoded = Pictures.decode(data, maxSide: Self.sourceSize) else {
            error = "Could not open this picture."
            return false
        }
        let scale = min(1, (Double(Self.workPixels) / Double(decoded.width * decoded.height)).squareRoot())
        let side = Int((Double(max(decoded.width, decoded.height)) * scale).rounded())
        guard let work = Pictures.pixels(of: decoded, maxSide: max(1, side)) else {
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
        // "Colours" counts mixes. The analysis is asked for more, and the planning joins them down
        // to the wanted number once the paints are known.
        let colours = Mixes.toRequest(wanted: settings.colours)
        let simplify = settings.simplify
        let saturation = Double(settings.saturation) / 100
        let contrast = Double(settings.contrast) / 100
        busy = true
        Task {
            let result = await Task.detached(priority: .userInitiated) {
                let adjusted = ColorMath.adjust(rgba: pixels.rgba, saturation: saturation, contrast: contrast)
                return Segmenter.segment(rgba: adjusted, width: pixels.width, height: pixels.height, colours: colours, simplify: simplify)
            }.value
            guard run == analysisRun else { return } // a newer analysis superseded this one
            segmentation = result
            entries = []
            order = []
            baseEntries = 0
            regionEntry = []
            selectedEntry = nil
            selectedRegion = nil
            recomputeAllRecipes(edits: edits)
        }
    }

    /// What `buildPalette` hands back.
    private struct Palette: Sendable {
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
        let candidates = library.activeBox.auto ? library.autoCandidates.map(\.mixPaint) : nil
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
            if let ids = palette.paintIDs, Set(ids) != library.enabledIDs || !library.activeBox.auto { library.setEnabled(ids, auto: true) }
            mixRecipes = palette.mixRecipes
            entries = palette.entries
            baseEntries = palette.baseEntries
            regionEntry = palette.regionEntry
            for edit in edits where edit.index < baseEntries {
                if let hex = edit.targetHex { applyTarget(edit.index, hex: hex) }
                if entries[edit.index].recipes.indices.contains(edit.chosen) { entries[edit.index].chosen = edit.chosen }
            }
            if let selectedEntry, !entries.indices.contains(selectedEntry) { self.selectedEntry = nil }
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
    ) -> Palette {
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
        return Palette(entries: entries, baseEntries: baseEntries, regionEntry: regionEntry, mixRecipes: mixRecipes, paintIDs: picked)
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
            // Overlay: the colour areas at half strength over the photo.
            let keep = settings.view == .overlay ? 0.5 : 0
            out = settings.view == .overlay ? originalPixels ?? blank : blank
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
