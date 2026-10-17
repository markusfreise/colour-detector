import Foundation
import Observation

/// A set of the paints one owns: pans, tubes, a travel box, a brand. The paints Auto chooses from
/// are those of the boxes ticked for it.
struct PaintBox: Codable, Identifiable, Hashable {
    var id: String
    /// The first boxes carry an English name ("Pans") that is shown in the chosen language.
    var name: String
    var paintIDs: [String]

    var displayName: String { L(name) }
}

/// The paints chosen for one picture, saved with it.
struct Palette: Codable, Hashable {
    var paintIDs: [String]
    /// The app picks the paints for the picture.
    var auto: Bool
    /// Layer mode: the base paints, one layer each, kept apart from the selection for mixing.
    var layerIDs: [String] = []
    /// Layer mode: the app proposes the base paints for the picture.
    var layerAuto = true
    /// Ids of the paint boxes Auto does not choose from. The travel box is a set of its own.
    var autoOff: [String] = ["travelbox"]

    init(paintIDs: [String], auto: Bool) {
        self.paintIDs = paintIDs
        self.auto = auto
    }

    private enum CodingKeys: String, CodingKey { case paintIDs, auto, layerIDs, layerAuto, autoOff }

    /// Fills in what palettes saved by older versions lack.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        paintIDs = try c.decodeIfPresent([String].self, forKey: .paintIDs) ?? []
        auto = try c.decodeIfPresent(Bool.self, forKey: .auto) ?? false
        layerIDs = try c.decodeIfPresent([String].self, forKey: .layerIDs) ?? []
        layerAuto = try c.decodeIfPresent(Bool.self, forKey: .layerAuto) ?? true
        autoOff = try c.decodeIfPresent([String].self, forKey: .autoOff) ?? ["travelbox"]
    }
}

/// A paint box as a file to keep, the same format as the web app's: its name and its colours.
struct PaintBoxFile: Codable {
    static let format = "watercolourlove-paintbox"

    struct Colour: Codable {
        var vendor: String
        var number: String
        var name: String
        var hex: String
        var form: String?
    }

    var format = Self.format
    var version = 1
    var name: String
    var paints: [Colour]
}

/// All known paints (the built-in stock plus the user's own), the paint boxes they are kept in, and
/// the palette of the picture on screen.
@MainActor
@Observable
final class Library {
    /// Layer mode takes at most this many base paints by hand: every one is a layer to paint and to let dry.
    static let maxLayerPaints = 6

    private struct Saved: Codable {
        var custom: [Paint]
        var paintBoxes: [PaintBox]
        var palette: Palette
    }

    /// Before paint boxes held paints, "boxes" were named selections; the active one becomes the palette.
    private struct OldSaved: Decodable {
        var custom: [Paint]
        var boxes: [OldBox]
        var activeID: String
    }

    private struct OldBox: Decodable {
        var id: String
        var paintIDs: [String]
        var auto: Bool?
        var layerIDs: [String]?
        var layerAuto: Bool?
        var autoOff: [String]?

        /// Nil in boxes saved before Auto existed.
        var autoMissing: Bool { auto == nil }
        var palette: Palette {
            var palette = Palette(paintIDs: paintIDs, auto: auto ?? false)
            palette.layerIDs = layerIDs ?? []
            palette.layerAuto = layerAuto ?? true
            palette.autoOff = autoOff ?? ["travelbox"]
            return palette
        }
    }

    let stock: [Paint]
    let libraries: [PaintLibrary]
    private(set) var custom: [Paint] = []
    /// At least one.
    private(set) var boxes: [PaintBox] = []
    private(set) var palette = Palette(paintIDs: [], auto: true)
    /// Bumped whenever the paints available for mixing changed.
    private(set) var revision = 0

    private let file = Storage.directory.appendingPathComponent("library.json")

    init() {
        stock = Storage.bundled("paints", as: [Paint].self) ?? []
        libraries = Storage.bundled("libraries", as: [PaintLibrary].self) ?? []
        let data = try? Data(contentsOf: file)
        if let data, let saved = try? JSONDecoder().decode(Saved.self, from: data), !saved.paintBoxes.isEmpty {
            custom = Self.renamedHouseVendor(saved.custom)
            boxes = saved.paintBoxes
            palette = saved.palette
        } else if let data, let old = try? JSONDecoder().decode(OldSaved.self, from: data), let active = old.boxes.first(where: { $0.id == old.activeID }) ?? old.boxes.first {
            custom = Self.renamedHouseVendor(old.custom)
            palette = active.palette
            // Boxes saved before Auto existed: an untouched default selection counts as Auto.
            if active.autoMissing { palette.auto = Set(palette.paintIDs) == Set(defaultIDs) }
            boxes = seedBoxes()
            save()
        } else {
            palette = Palette(paintIDs: defaultIDs, auto: true)
            boxes = seedBoxes()
        }
    }

    /// Own paints saved while the house series was called "Schmincke" belong to it under its new name.
    private static func renamedHouseVendor(_ paints: [Paint]) -> [Paint] {
        paints.map { paint in
            var paint = paint
            if paint.vendor == Paint.oldHouseVendor { paint.vendor = Paint.houseVendor }
            return paint
        }
    }

    private var defaultIDs: [String] { stock.filter(\.enabled).map(\.id) }

    /// The first paint boxes are the groups the paints used to be listed in. Their ids are the keys
    /// of those groups, so that the groups switched off for Auto stay off.
    private func seedBoxes() -> [PaintBox] {
        let names = ["pan": "Pans", "tube": "Tubes", "travelbox": "Travelbox"]
        return all.groupedByForm().map { PaintBox(id: $0.id, name: names[$0.id] ?? $0.title, paintIDs: $0.paints.map(\.id)) }
    }

    var all: [Paint] { stock + custom }
    var byID: [String: Paint] { Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }) }

    var enabledIDs: Set<String> { Set(palette.paintIDs) }
    var enabled: [Paint] {
        let ids = enabledIDs
        return all.filter { ids.contains($0.id) }
    }

    /// The palette as one list, in colour order.
    var selected: [Paint] { enabled.sortedForBox() }

    /// The paints of a box in their order: the travel box by its places, every other by colour.
    func paints(in box: PaintBox) -> [Paint] {
        let byID = byID
        let paints = box.paintIDs.compactMap { byID[$0] }
        guard box.id == PaintForm.travelbox.rawValue else { return paints.sortedForBox() }
        return paints.sorted { $0.number.compare($1.number, options: .numeric) == .orderedAscending }
    }

    // MARK: Palette

    func toggle(_ id: String) {
        var ids = palette.paintIDs
        if let index = ids.firstIndex(of: id) { ids.remove(at: index) } else { ids.append(id) }
        setEnabled(ids)
    }

    /// Any selection made by hand switches Auto off for the palette.
    func setEnabled(_ ids: [String], auto: Bool = false) {
        palette.paintIDs = ids
        palette.auto = auto
        changed()
    }

    /// Lets the app pick the paints for the picture from now on.
    func switchToAuto() {
        palette.auto = true
        changed()
    }

    /// The palette of a saved picture takes the place of the one on screen.
    func setPalette(_ saved: Palette) {
        palette = saved
        changed()
    }

    /// Paints Auto may choose from: those in the paint boxes ticked for Auto. A Schmincke stock paint
    /// outside the default selection is held back (its colour is not checked yet).
    var autoCandidates: [Paint] {
        let off = Set(palette.autoOff)
        let ids = Set(boxes.filter { !off.contains($0.id) }.flatMap(\.paintIDs))
        return all.filter { paint in
            let held = !paint.enabled && !paint.isCustom && paint.vendor == Paint.houseVendor
            return !held && ids.contains(paint.id)
        }
    }

    /// Whether Auto may choose from the paints of a box.
    func setAutoBox(_ id: String, on: Bool) {
        var off = Set(palette.autoOff)
        if on { off.remove(id) } else { off.insert(id) }
        palette.autoOff = off.sorted()
        changed()
    }

    func clear() { setEnabled([]) }

    /// Back to the default selection.
    func revert() { setEnabled(defaultIDs) }

    // MARK: Base paints of layer mode

    var layerPaints: [Paint] {
        let byID = byID
        return palette.layerIDs.compactMap { byID[$0] }
    }

    /// Choosing the base paints by hand switches their Auto off and is limited to `maxLayerPaints`;
    /// a proposal may add a paint or two for its accents.
    func setLayerPaints(_ ids: [String], auto: Bool = false) {
        palette.layerIDs = auto ? ids : Array(ids.prefix(Self.maxLayerPaints))
        palette.layerAuto = auto
        changed()
    }

    func toggleLayerPaint(_ id: String) {
        var ids = palette.layerIDs
        if let index = ids.firstIndex(of: id) { ids.remove(at: index) } else { ids.append(id) }
        setLayerPaints(ids)
    }

    // MARK: Paint boxes

    @discardableResult
    func addBox(named name: String) -> PaintBox {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let box = PaintBox(id: "box-\(UUID().uuidString.prefix(8))", name: trimmed.isEmpty ? L("Box %lld", boxes.count + 1) : trimmed, paintIDs: [])
        boxes.append(box)
        save()
        return box
    }

    func renameBox(_ id: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = boxes.firstIndex(where: { $0.id == id }) else { return }
        boxes[index].name = trimmed
        save()
    }

    /// The last box cannot be deleted. Its paints stay in the palette and among one's own paints.
    func deleteBox(_ id: String) {
        guard boxes.count > 1 else { return }
        boxes.removeAll { $0.id == id }
        palette.autoOff.removeAll { $0 == id }
        changed()
    }

    func addToBox(_ boxID: String, paint paintID: String) {
        guard let index = boxes.firstIndex(where: { $0.id == boxID }), !boxes[index].paintIDs.contains(paintID) else { return }
        boxes[index].paintIDs.append(paintID)
        changed()
    }

    func removeFromBox(_ boxID: String, paint paintID: String) {
        guard let index = boxes.firstIndex(where: { $0.id == boxID }) else { return }
        boxes[index].paintIDs.removeAll { $0 == paintID }
        changed()
    }

    /// A colour of a series, as the colour chart or a box file has it: the paint already known with
    /// that series and number, or a new paint of one's own.
    private func paintID(vendor: String, number: String, name: String, hex: String, form: String) -> String {
        let same = { (a: String, b: String) in a.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(b.trimmingCharacters(in: .whitespaces)) == .orderedSame }
        if let known = all.first(where: { same($0.vendor, vendor) && same($0.number, number) }) { return known.id }
        let paint = Paint(id: "custom-\(UUID().uuidString.prefix(8))", vendor: vendor.trimmingCharacters(in: .whitespaces), number: number.trimmingCharacters(in: .whitespaces), name: name.trimmingCharacters(in: .whitespaces), hex: hex, forms: [form], source: "custom", custom: true)
        custom.append(paint)
        return paint.id
    }

    /// A colour of a library's chart into a box.
    /// The search offers only colours with a value; one without is entered through the form.
    func addChartColour(_ colour: ChartColour, of library: PaintLibrary, to boxID: String) {
        guard let hex = colour.hex else { return }
        addToBox(boxID, paint: paintID(vendor: library.name, number: colour.number, name: colour.name, hex: hex, form: boxID == "tube" ? "tube" : "pan"))
    }

    /// A box as a JSON file to keep, as a backup or to take to the web app.
    func exportBox(_ id: String) -> Data? {
        guard let box = boxes.first(where: { $0.id == id }) else { return nil }
        let colours = paints(in: box).map { PaintBoxFile.Colour(vendor: $0.vendor, number: $0.number, name: $0.name, hex: $0.hex, form: $0.comes(as: .tube) && !$0.comes(as: .pan) ? "tube" : "pan") }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try? encoder.encode(PaintBoxFile(name: box.displayName, paints: colours))
    }

    enum ImportError: LocalizedError {
        case notABox
        var errorDescription: String? { L("This is not a paint box file.") }
    }

    /// A box file read back: a new box.
    @discardableResult
    func importBox(_ data: Data) throws -> PaintBox {
        guard let file = try? JSONDecoder().decode(PaintBoxFile.self, from: data), file.format == PaintBoxFile.format else { throw ImportError.notABox }
        var box = addBox(named: file.name)
        for colour in file.paints where !colour.vendor.isEmpty && !colour.name.isEmpty && colour.hex.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil {
            let id = paintID(vendor: colour.vendor, number: colour.number, name: colour.name, hex: colour.hex, form: colour.form == "tube" ? "tube" : "pan")
            if !box.paintIDs.contains(id) { box.paintIDs.append(id) }
        }
        if let index = boxes.firstIndex(where: { $0.id == box.id }) { boxes[index] = box }
        changed()
        return box
    }

    // MARK: Own paints

    /// Adds a paint to the library, or updates the one with the same id. New paints go into the box `boxID`.
    func savePaint(_ paint: Paint, into boxID: String? = nil) {
        if let index = custom.firstIndex(where: { $0.id == paint.id }) {
            custom[index] = paint
        } else {
            custom.append(paint)
            if let boxID, let index = boxes.firstIndex(where: { $0.id == boxID }) { boxes[index].paintIDs.append(paint.id) }
        }
        changed()
    }

    func deletePaint(_ id: String) {
        custom.removeAll { $0.id == id }
        for index in boxes.indices { boxes[index].paintIDs.removeAll { $0 == id } }
        palette.paintIDs.removeAll { $0 == id }
        palette.layerIDs.removeAll { $0 == id }
        changed()
    }

    /// The library of a series, however it is capitalised or spaced; nil for a series of one's own.
    func library(named name: String) -> PaintLibrary? {
        let wanted = name.trimmingCharacters(in: .whitespaces).lowercased()
        return libraries.first { $0.name.lowercased() == wanted }
    }

    /// The series on offer for a paint: the house series, the libraries and those in use, by name.
    var seriesNames: [String] {
        Set([Paint.houseVendor] + libraries.map(\.name) + all.map(\.vendor).filter { !$0.isEmpty })
            .sorted { $0.localizedCompare($1) == .orderedAscending }
    }

    private func changed() {
        revision += 1
        save()
    }

    private func save() {
        let saved = Saved(custom: custom, paintBoxes: boxes, palette: palette)
        try? JSONEncoder().encode(saved).write(to: file, options: .atomic)
    }
}

enum Storage {
    /// Application Support/Watercolourlove, created on first use.
    static let directory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("Watercolourlove", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    static func bundled<T: Decodable>(_ name: String, as type: T.Type) -> T? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
