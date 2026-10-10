import XCTest
@testable import Tintmap

/// The same checks as the web app's Vitest suite, so both implementations stay in step.
final class CoreTests: XCTestCase {
    private let yellow = MixPaint(id: "y", hex: "#fae409")
    private let blue = MixPaint(id: "b", hex: "#2b61ab")
    private let red = MixPaint(id: "r", hex: "#e6331d")

    func testHexRoundTrip() {
        XCTAssertEqual(ColorMath.hex(oklab: ColorMath.oklab(hex: "#8a7a52")), "#8a7a52")
    }

    func testPaintAtAmountOneGivesThePaint() {
        let mixed = ColorMath.oklab(hex: Mixing.mixHex([yellow], [1]))
        XCTAssertLessThan(ColorMath.deltaE(mixed, ColorMath.oklab(hex: "#fae409")), 0.5)
    }

    func testYellowAndBlueGiveGreen() {
        let lab = ColorMath.oklab(hex: Mixing.mixHex([yellow, blue], [1, 1]))
        XCTAssertLessThan(lab.y, -0.05) // negative a = green
        XCTAssertGreaterThan(lab.x, 0.3)
    }

    func testFindsTheExactPaint() throws {
        let best = try XCTUnwrap(Mixing.findRecipes(target: "#e6331d", paints: [yellow, blue, red], maxPaints: 2).first)
        XCTAssertEqual(best.paints.map(\.paintID), ["r"])
        XCTAssertLessThan(best.deltaE, 0.5)
    }

    func testPaperForWhite() throws {
        let best = try XCTUnwrap(Mixing.findRecipes(target: "#ffffff", paints: [yellow, blue, red]).first)
        XCTAssertTrue(best.paints.isEmpty)
    }

    func testRespectsMaxPaints() {
        for recipe in Mixing.findRecipes(target: "#6a7a5a", paints: [yellow, blue, red], maxPaints: 2) {
            XCTAssertLessThanOrEqual(recipe.paints.count, 2)
        }
    }

    func testParts() {
        XCTAssertEqual(Mixing.toParts([0.9, 0.3]), [3, 1])
    }

    func testProposesAndReusesPaints() {
        let targets = [(hex: "#e6331d", weight: 0.6), (hex: "#e6331d", weight: 0.3), (hex: "#fae409", weight: 0.1)]
        XCTAssertEqual(Mixing.proposePaints(targets: targets, paints: [yellow, blue, red]).sorted(), ["r", "y"])
        XCTAssertEqual(Mixing.proposePaints(targets: [(hex: "#ffffff", weight: 1)], paints: [yellow, blue, red]), [])
    }

    func testRandomGeneratorMatchesTheWebApp() {
        // First values of mulberry32(7) in src/lib/segment.js.
        var random = Segmenter.Mulberry32(seed: 7)
        XCTAssertEqual(random.next(), 0.011704753153026104, accuracy: 1e-12)
        XCTAssertEqual(random.next(), 0.06195825757458806, accuracy: 1e-12)
    }

    func testSegmentsTwoHalves() {
        let width = 40, height = 20
        var rgba = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width where x >= width / 2 {
                let o = (y * width + x) * 4
                rgba[o] = 20; rgba[o + 1] = 60; rgba[o + 2] = 160
            }
        }
        let result = Segmenter.segment(rgba: rgba, width: width, height: height, colours: 2, simplify: 0)
        XCTAssertEqual(result.regions.count, 2)
        XCTAssertEqual(result.clusters.filter { $0.pixelCount > 0 }.count, 2)
        XCTAssertNotEqual(result.regionMap[0], result.regionMap[width - 1])
    }
}
