import XCTest
@testable import Watercolourlove

/// The dialog that adds colours to a box, as paintbox.test.js checks it on the web.
final class PaintBoxTests: XCTestCase {
    func testHueGroups() {
        let expected: [(String, HueGroup)] = [
            ("#e73e46", .red), // Scarlet
            ("#ef89a6", .red), // Madder rose
            ("#ec680f", .orange),
            ("#f3d104", .yellow),
            ("#60b236", .green),
            ("#00c9c9", .turquoise),
            ("#3280c2", .blue),
            ("#852677", .violet),
            ("#95503a", .brown), // Mahogany
            ("#7d6441", .brown), // Vandyke brown
            ("#706c63", .grey), // Ivory black
        ]
        for (hex, group) in expected { XCTAssertEqual(ColorMath.hueGroup(hex: hex), group, hex) }
    }

    func testEveryFilterSwatchIsInItsOwnGroup() {
        for group in HueGroup.allCases { XCTAssertEqual(ColorMath.hueGroup(hex: group.hex), group, group.rawValue) }
    }

    func testOwnFormsKnowLiquidAndOther() {
        XCTAssertEqual(PaintForm.own("liquid"), .liquid)
        XCTAssertEqual(PaintForm.own("stick"), .pan)
        XCTAssertEqual(PaintForm.own(nil), .pan)
        XCTAssertEqual(paint("x", vendor: "A", number: "1", forms: ["other"]).ownForm, .other)
        XCTAssertEqual(paint("x", vendor: "A", number: "1", forms: []).ownForm, .pan)
    }

    private func paint(_ id: String, vendor: String, number: String, name: String = "", hex: String = "#000000", forms: [String] = ["pan"]) -> Paint {
        Paint(id: id, vendor: vendor, number: number, name: name, hex: hex, forms: forms)
    }

    private let catalogue = [
        ChartColour(number: "1", name: "Red", hex: "#cc2222", names: ["de": "Rot"], pigments: ["PR254"]),
        ChartColour(number: "2", name: "Grey", hex: nil),
    ]

    private var paints: [Paint] {
        [
            paint("a", vendor: "acme", number: "1", name: "Own red", hex: "#aa0000"),
            paint("b", vendor: "Acme", number: "9", name: "Mud", hex: "#665544"),
            paint("c", vendor: "Other", number: "1", name: "Blue", hex: "#0000ff"),
        ]
    }

    func testSortsByNumberPrefixedNumbersToo() {
        let chart = ["W201", "12", "W17", "3"].map { ChartColour(number: $0, name: $0, hex: "#000000") }
        XCTAssertEqual(SeriesColours.list(vendor: "Acme", catalogue: chart, paints: []).map(\.number), ["3", "12", "W17", "W201"])
    }

    func testListsTheChartWithKnownPaintsInPlaceAndPaintsOffTheChart() {
        let colours = SeriesColours.list(vendor: "Acme", catalogue: catalogue, paints: paints)
        XCTAssertEqual(colours.map(\.number), ["1", "2", "9"])
        XCTAssertEqual(colours.map(\.paintID), ["a", nil, "b"])
        XCTAssertEqual(colours.map(\.hex), ["#aa0000", nil, "#665544"])
    }

    func testNamesChartColoursInTheLanguageShown() {
        XCTAssertEqual(SeriesColours.list(vendor: "Acme", catalogue: catalogue, paints: [], locale: "de").first?.name, "Rot")
    }

    func testListsOnlyTheKnownPaintsWithoutTheChart() {
        XCTAssertEqual(SeriesColours.list(vendor: "Acme", catalogue: [], paints: paints).map(\.paintID), ["a", "b"])
    }

    func testFiltersByWordsAndByHue() {
        let colours = SeriesColours.list(vendor: "Acme", catalogue: catalogue, paints: [])
        XCTAssertEqual(SeriesColours.filter(colours, query: "pr254").map(\.number), ["1"])
        XCTAssertEqual(SeriesColours.filter(colours, query: "acme rot").map(\.number), ["1"])
        XCTAssertEqual(SeriesColours.filter(colours, hue: .red).map(\.number), ["1"])
        XCTAssertEqual(SeriesColours.filter(colours, hue: .blue), [])
        XCTAssertEqual(SeriesColours.filter(colours).count, 2)
    }
}
