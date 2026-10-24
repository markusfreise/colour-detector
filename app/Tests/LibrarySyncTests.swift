import XCTest
@testable import Watercolourlove

/// Merging the paint boxes and one's own paints of two devices (`SyncedLibrary`).
final class LibrarySyncTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_000)
    private let t1 = Date(timeIntervalSince1970: 2_000)
    private let t2 = Date(timeIntervalSince1970: 3_000)

    private func box(_ id: String, _ name: String, _ paints: [String] = []) -> PaintBox {
        PaintBox(id: id, name: name, paintIDs: paints)
    }

    private func paint(_ id: String, _ hex: String) -> Paint {
        Paint(id: id, vendor: "Own", number: id, name: id, hex: hex, forms: ["pan"], source: "custom", custom: true)
    }

    func testStampsOnlyWhatChanged() {
        let first = SyncedLibrary().updated(boxes: [box("a", "A"), box("b", "B")], paints: [], at: t0)
        let second = first.updated(boxes: [box("a", "A"), box("b", "Bee")], paints: [], at: t1)
        XCTAssertEqual(second.boxes["a"]?.at, t0)
        XCTAssertEqual(second.boxes["b"]?.at, t1)
        XCTAssertEqual(second.boxes["b"]?.value?.name, "Bee")
        XCTAssertEqual(second.order?.at, t0)
    }

    func testChangesOnTwoDevicesBothSurvive() {
        let start = SyncedLibrary().updated(boxes: [box("a", "A"), box("b", "B")], paints: [paint("p", "#112233")], at: t0)
        // One device renames A, the other adds a paint to B and a paint of its own.
        let phone = start.updated(boxes: [box("a", "Studio"), box("b", "B")], paints: [paint("p", "#112233")], at: t1)
        let mac = start.updated(boxes: [box("a", "A"), box("b", "B", ["q"])], paints: [paint("p", "#112233"), paint("q", "#445566")], at: t2)
        let merged = phone.merged(with: mac)
        XCTAssertEqual(merged.liveBoxes.map(\.name), ["Studio", "B"])
        XCTAssertEqual(merged.liveBoxes[1].paintIDs, ["q"])
        XCTAssertEqual(merged.livePaints.map(\.id), ["p", "q"])
        XCTAssertEqual(merged, mac.merged(with: phone))
    }

    func testADeletionIsNotUndoneByADeviceThatStillHadTheBox() {
        let start = SyncedLibrary().updated(boxes: [box("a", "A"), box("b", "B")], paints: [], at: t0)
        let deleted = start.updated(boxes: [box("a", "A")], paints: [], at: t1)
        XCTAssertNil(deleted.boxes["b"]?.value)
        XCTAssertEqual(deleted.merged(with: start).liveBoxes.map(\.id), ["a"])
        XCTAssertEqual(start.merged(with: deleted).liveBoxes.map(\.id), ["a"])
    }

    func testABoxFromAnotherDeviceComesAfterTheOrderedOnes() {
        let here = SyncedLibrary().updated(boxes: [box("b", "B"), box("a", "A")], paints: [], at: t1)
        let there = SyncedLibrary().updated(boxes: [box("c", "C")], paints: [], at: t0)
        XCTAssertEqual(here.merged(with: there).liveBoxes.map(\.id), ["b", "a", "c"])
    }

    func testSurvivesTheRoundTripThroughICloud() throws {
        let synced = SyncedLibrary().updated(boxes: [box("a", "A", ["p"])], paints: [paint("p", "#112233")], at: t0)
        let decoded = try JSONDecoder().decode(SyncedLibrary.self, from: JSONEncoder().encode(synced))
        XCTAssertEqual(decoded, synced)
    }
}
