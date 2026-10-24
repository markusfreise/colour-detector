import Foundation

/// The paint boxes and one's own paints as iCloud keeps them. Every box and paint carries the time
/// it last changed, and a deleted one stays as a dated mark without a value, so that two devices
/// merge item by item: the later change of each wins, and a deletion is not undone by a device that
/// still had the item. The palette of the picture on screen stays on its device.
struct SyncedLibrary: Codable, Equatable {
    struct Stamped<Value: Codable & Equatable>: Codable, Equatable {
        /// Nil once deleted.
        var value: Value?
        var at: Date
    }

    var boxes: [String: Stamped<PaintBox>] = [:]
    var paints: [String: Stamped<Paint>] = [:]
    /// The order of the boxes, as last arranged on any device.
    var order: Stamped<[String]>?

    /// The boxes in their order: those the order does not know yet (made elsewhere) at the end.
    var liveBoxes: [PaintBox] {
        let live = boxes.compactMapValues(\.value)
        let ordered = (order?.value ?? []).compactMap { live[$0] }
        let rest = live.values.filter { !(order?.value ?? []).contains($0.id) }.sorted { $0.id < $1.id }
        return ordered + rest
    }

    var livePaints: [Paint] { paints.values.compactMap(\.value).sorted { $0.id < $1.id } }

    /// Stamped with `now` wherever `boxes` and `paints` differ from what is recorded.
    func updated(boxes current: [PaintBox], paints currentPaints: [Paint], at now: Date) -> SyncedLibrary {
        var next = self
        next.boxes = Self.stamp(boxes, current, at: now)
        next.paints = Self.stamp(paints, currentPaints, at: now)
        let ids = current.map(\.id)
        if order?.value != ids { next.order = Stamped(value: ids, at: now) }
        return next
    }

    /// Item by item, the later of the two; the order too.
    func merged(with other: SyncedLibrary) -> SyncedLibrary {
        SyncedLibrary(
            boxes: Self.later(boxes, other.boxes),
            paints: Self.later(paints, other.paints),
            order: [order, other.order].compactMap { $0 }.max { $0.at < $1.at }
        )
    }

    private static func stamp<Value: Identifiable & Codable & Equatable>(_ recorded: [String: Stamped<Value>], _ current: [Value], at now: Date) -> [String: Stamped<Value>] where Value.ID == String {
        var next = recorded
        let ids = Set(current.map(\.id))
        for item in current where recorded[item.id]?.value != item {
            next[item.id] = Stamped(value: item, at: now)
        }
        for (id, stamped) in recorded where stamped.value != nil && !ids.contains(id) {
            next[id] = Stamped(value: nil, at: now)
        }
        return next
    }

    private static func later<Value>(_ a: [String: Stamped<Value>], _ b: [String: Stamped<Value>]) -> [String: Stamped<Value>] {
        a.merging(b) { mine, theirs in theirs.at > mine.at ? theirs : mine }
    }
}

/// Where the synced library is kept: iCloud's key-value store, or a stand-in in the tests.
protocol LibraryCloud: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
    @discardableResult func synchronize() -> Bool
}

extension NSUbiquitousKeyValueStore: LibraryCloud {
    func set(_ data: Data?, forKey key: String) {
        set(data as Any?, forKey: key)
    }
}
