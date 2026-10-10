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

    // MARK: Washes and mixes (reference values from the web app's logic)

    func testDepthLevelsOff() {
        XCTAssertEqual(Mixing.depth(1), 1, accuracy: 1e-12)
        XCTAssertEqual(Mixing.depth(0.5), 0.6202041028867287, accuracy: 1e-12)
        XCTAssertEqual(Mixing.depth(4), 1.568359375, accuracy: 1e-12)
        // A yellow-orange stays an orange however thickly it is laid on.
        XCTAssertEqual(Mixing.mixHex([MixPaint(id: "o", hex: "#f59e04")], [4]), "#ef7700")
    }

    func testWashDilutesAMix() throws {
        let full = try XCTUnwrap(Mixing.findRecipes(target: "#2b61ab", paints: [blue]).first)
        let wash = try XCTUnwrap(Mixing.washRecipe(full, target: Mixing.mixHex([blue], [0.3]), paints: ["b": blue]))
        XCTAssertEqual(wash.strength, 0.30162887427052304, accuracy: 1e-6)
        XCTAssertEqual(wash.hex, "#80add9")
        XCTAssertEqual(wash.paints.map(\.paintID), ["b"])
        XCTAssertEqual([0.2, 0.5, 1, 2, 3].map(Mixing.washLetter).joined(), "WLMRC")
    }

    func testAdjustsSaturationAndContrast() {
        let pixels: [UInt8] = [200, 60, 50, 255, 90, 120, 60, 255]
        XCTAssertEqual(ColorMath.adjust(rgba: pixels, saturation: 2, contrast: 1.5), [255, 0, 0, 255, 73, 133, 0, 255])
        XCTAssertEqual(ColorMath.adjust(rgba: pixels), pixels)
    }

    func testOneHueInSeveralWashes() {
        // The same blue from pale to deep, next to a flat red.
        let width = 120, height = 40
        var rgba = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let o = (y * width + x) * 4
                if y >= 30 {
                    rgba[o] = 200; rgba[o + 1] = 60; rgba[o + 2] = 50
                } else {
                    let t = pow(0.9 - 0.75 * (Double(x) / 119), 1 / 2.2)
                    rgba[o] = UInt8((255 * pow(t, 3)).rounded())
                    rgba[o + 1] = UInt8((255 * pow(t, 1.6)).rounded())
                    rgba[o + 2] = UInt8((255 * pow(t, 0.5)).rounded())
                }
            }
        }
        let clusters = Segmenter.segment(rgba: rgba, width: width, height: height, colours: 2, simplify: 0).clusters
        XCTAssertEqual(clusters.map(\.group), [0, 1, 1, 1, 1, 1])
        XCTAssertEqual(clusters.map(\.level), [0, 0, 1, 2, 3, 4])
        XCTAssertEqual(clusters.map(\.hex), ["#c83c32", "#d1e6f7", "#b1d2f0", "#83b3e4", "#4f88d2", "#2359b7"])
        XCTAssertEqual(clusters.map(\.pixelCount), [1200, 360, 600, 840, 960, 840])
    }

    private func cluster(_ index: Int, _ hex: String, _ pixels: Int) -> Segmentation.Cluster {
        Segmentation.Cluster(index: index, group: index, level: 0, hex: hex, pixelCount: pixels)
    }

    func testJoinsWashesBeforeGivingUpAHue() {
        // Two blues that differ only in strength, found as separate mixes, and a small red.
        let clusters = [cluster(0, "#1c4f9e", 6000), cluster(1, "#6a9ccf", 3000), cluster(2, "#e6331d", 100)]
        let mixes = Mixes.plan(clusters: clusters, paints: [yellow, blue, red], wanted: 2, variety: 10)
        XCTAssertEqual(mixes.count, 2)
        XCTAssertEqual(mixes.map { $0.clusters.map(\.index).sorted() }.sorted { $0.count > $1.count }, [[0, 1], [2]])
    }

    func testPlansTheSameMixesAsTheWebApp() {
        let hexes = ["#997939", "#452901", "#250f00", "#180702", "#8a1500", "#474701", "#271f0f", "#180b00", "#8b1b00", "#410b02", "#293604", "#191400"]
        let clusters = hexes.enumerated().map { cluster($0, $1, 100 + $0 * 50) }
        // Per variety: the mix that survives (first number) and the colours painted with it.
        let expected = [
            0: [[1, 0, 1, 2, 3], [4, 4, 8, 9], [6, 6, 7], [10, 5, 10, 11]],
            10: [[1, 0, 1, 2, 3], [4, 4, 8, 9], [5, 5, 10, 11], [6, 6, 7]],
        ]
        for (variety, groups) in expected {
            let mixes = Mixes.plan(clusters: clusters, paints: [yellow, blue, red], wanted: 4, variety: variety)
            XCTAssertEqual(mixes.sorted { $0.group < $1.group }.map { [$0.group] + $0.clusters.map(\.index).sorted() }, groups, "variety \(variety)")
        }
        XCTAssertGreaterThan(Mixes.toRequest(wanted: 5), 5)
        XCTAssertLessThanOrEqual(Mixes.toRequest(wanted: 32), 48)
    }
}
