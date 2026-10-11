import Foundation
import Observation

struct PaintBox: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var paintIDs: [String]
    /// The app picks the paints for each picture.
    var auto: Bool {
        get { autoFlag ?? false }
        set { autoFlag = newValue }
    }

    /// Nil in boxes saved before Auto existed.
    fileprivate var autoFlag: Bool?

    /// Layer mode: the base paints, one layer each, kept apart from the selection for mixing.
    var layerIDs: [String] {
        get { savedLayerIDs ?? [] }
        set { savedLayerIDs = newValue }
    }

    /// Layer mode: the app proposes the base paints for each picture.
    var layerAuto: Bool {
        get { layerAutoFlag ?? true }
        set { layerAutoFlag = newValue }
    }

    /// Keys of the paint groups Auto does not choose from. The travel box is a set of its own.
    var autoOff: [String] {
        get { savedAutoOff ?? ["travelbox"] }
        set { savedAutoOff = newValue }
    }

    /// Nil in boxes saved before layer mode existed.
    fileprivate var savedLayerIDs: [String]?
    fileprivate var layerAutoFlag: Bool?
    /// Nil in boxes saved before the groups could be ticked for Auto.
    fileprivate var savedAutoOff: [String]?

    private enum CodingKeys: String, CodingKey {
        case id, name, paintIDs
        case autoFlag = "auto"
        case savedLayerIDs = "layerIDs"
        case layerAutoFlag = "layerAuto"
        case savedAutoOff = "autoOff"
    }

    init(id: String, name: String, paintIDs: [String], auto: Bool = false) {
        self.id = id
        self.name = name
        self.paintIDs = paintIDs
        autoFlag = auto
    }
}

/// All known paints (the built-in stock plus the user's own) and the paint boxes made from them.
@MainActor
@Observable
final class Library {
    /// Layer mode takes at most this many base paints by hand: every one is a layer to paint and to let dry.
    static let maxLayerPaints = 6

    private struct Saved: Codable {
        var custom: [Paint]
        var boxes: [PaintBox]
        var activeID: String
    }

    let stock: [Paint]
    let chart: [ChartColour]
    private(set) var custom: [Paint] = []
    private(set) var boxes: [PaintBox] = []
    private(set) var activeID = ""
    /// Bumped whenever the paints available for mixing changed.
    private(set) var revision = 0

    private let file = Storage.directory.appendingPathComponent("library.json")

    init() {
        stock = Storage.bundled("paints", as: [Paint].self) ?? []
        chart = Storage.bundled("horadam", as: [ChartColour].self) ?? []
        if let data = try? Data(contentsOf: file), let saved = try? JSONDecoder().decode(Saved.self, from: data), !saved.boxes.isEmpty {
            custom = saved.custom
            boxes = saved.boxes
            activeID = saved.activeID
            // Boxes saved before Auto existed: an untouched default selection counts as Auto.
            let defaults = Set(defaultIDs)
            for index in boxes.indices where boxes[index].autoFlag == nil {
                boxes[index].auto = Set(boxes[index].paintIDs) == defaults
            }
        } else {
            let box = PaintBox(id: "box-1", name: "My paint box", paintIDs: defaultIDs, auto: true)
            boxes = [box]
            activeID = box.id
        }
    }

    private var defaultIDs: [String] { stock.filter(\.enabled).map(\.id) }

    var all: [Paint] { stock + custom }
    var byID: [String: Paint] { Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }) }

    private var activeIndex: Int { boxes.firstIndex { $0.id == activeID } ?? 0 }
    var activeBox: PaintBox { boxes[activeIndex] }
    var enabledIDs: Set<String> { Set(activeBox.paintIDs) }
    var enabled: [Paint] {
        let ids = enabledIDs
        return all.filter { ids.contains($0.id) }
    }

    /// The paint box screen: the selected paints as one list, the rest grouped by form.
    var selected: [Paint] { enabled.sortedForBox() }
    var available: [PaintGroup] {
        let ids = enabledIDs
        return all.groupedByForm { !ids.contains($0.id) }
    }

    // MARK: Selection

    func toggle(_ id: String) {
        var ids = activeBox.paintIDs
        if let index = ids.firstIndex(of: id) { ids.remove(at: index) } else { ids.append(id) }
        setEnabled(ids)
    }

    /// Any selection made by hand switches Auto off for the box.
    func setEnabled(_ ids: [String], auto: Bool = false) {
        boxes[activeIndex].paintIDs = ids
        boxes[activeIndex].auto = auto
        changed()
    }

    /// Lets the app pick the paints for each picture from now on.
    func switchToAuto() {
        boxes[activeIndex].auto = true
        changed()
    }

    /// Paints Auto may choose from: the groups ticked for Auto in the paint box. A Schmincke stock paint
    /// outside the default selection is held back (its colour is not checked yet).
    var autoCandidates: [Paint] {
        let off = Set(activeBox.autoOff)
        return all.filter { paint in
            let held = !paint.enabled && !paint.isCustom && paint.vendor == Paint.houseVendor
            return !held && paint.groupKeys.contains { !off.contains($0) }
        }
    }

    /// Whether Auto may choose from the paints of a group (`key` as in the paint box groups).
    func setAutoGroup(_ key: String, on: Bool) {
        var off = Set(activeBox.autoOff)
        if on { off.remove(key) } else { off.insert(key) }
        boxes[activeIndex].autoOff = off.sorted()
        changed()
    }

    func clear() { setEnabled([]) }

    // MARK: Base paints of layer mode

    var layerPaints: [Paint] {
        let byID = byID
        return activeBox.layerIDs.compactMap { byID[$0] }
    }

    /// Choosing the base paints by hand switches their Auto off and is limited to `maxLayerPaints`;
    /// a proposal may add a paint or two for its accents.
    func setLayerPaints(_ ids: [String], auto: Bool = false, box: String? = nil) {
        guard let index = boxes.firstIndex(where: { $0.id == box ?? activeID }) else { return }
        boxes[index].layerIDs = auto ? ids : Array(ids.prefix(Self.maxLayerPaints))
        boxes[index].layerAuto = auto
        changed()
    }

    func toggleLayerPaint(_ id: String) {
        var ids = activeBox.layerIDs
        if let index = ids.firstIndex(of: id) { ids.remove(at: index) } else { ids.append(id) }
        setLayerPaints(ids)
    }

    /// Back to the default selection.
    func revert() { setEnabled(defaultIDs) }

    // MARK: Boxes

    func addBox(named name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let box = PaintBox(id: "box-\(UUID().uuidString.prefix(8))", name: trimmed.isEmpty ? "Box \(boxes.count + 1)" : trimmed, paintIDs: [])
        boxes.append(box)
        activeID = box.id
        changed()
    }

    func selectBox(_ id: String) {
        guard id != activeID else { return }
        activeID = id
        changed()
    }

    func renameBox(_ id: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = boxes.firstIndex(where: { $0.id == id }) else { return }
        boxes[index].name = trimmed
        save()
    }

    /// The last box cannot be deleted.
    func deleteBox(_ id: String) {
        guard boxes.count > 1 else { return }
        boxes.removeAll { $0.id == id }
        if activeID == id { activeID = boxes[0].id }
        changed()
    }

    // MARK: Own paints

    /// Adds a paint to the library, or updates the one with the same id. New paints go into the active box.
    func savePaint(_ paint: Paint) {
        if let index = custom.firstIndex(where: { $0.id == paint.id }) {
            custom[index] = paint
        } else {
            custom.append(paint)
            boxes[activeIndex].paintIDs.append(paint.id)
        }
        changed()
    }

    func deletePaint(_ id: String) {
        custom.removeAll { $0.id == id }
        for index in boxes.indices {
            boxes[index].paintIDs.removeAll { $0 == id }
            boxes[index].layerIDs.removeAll { $0 == id }
        }
        changed()
    }

    func chartColour(number: String) -> ChartColour? {
        chart.first { $0.number == number.trimmingCharacters(in: .whitespaces) }
    }

    private func changed() {
        revision += 1
        save()
    }

    private func save() {
        let saved = Saved(custom: custom, boxes: boxes, activeID: activeID)
        try? JSONEncoder().encode(saved).write(to: file, options: .atomic)
    }
}

enum Storage {
    /// Application Support/Tintmap, created on first use.
    static let directory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("Tintmap", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    static func bundled<T: Decodable>(_ name: String, as type: T.Type) -> T? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
