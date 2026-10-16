import XCTest
@testable import Watercolourlove

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
        XCTAssertEqual(Mixing.depth(0.5), 0.6202041028867289, accuracy: 1e-12)
        XCTAssertEqual(Mixing.depth(4), 1.568359375, accuracy: 1e-12)
        // Neutral paints go deeper than bright ones.
        XCTAssertEqual(Mixing.depth(2, limit: 4), 1.75, accuracy: 1e-12)
        XCTAssertEqual(Mixing.depthLimit(Mixing.absorbance(hex: "#706c63")), 3.7659923729408993, accuracy: 1e-9)
        XCTAssertEqual(Mixing.depthLimit(Mixing.absorbance(hex: "#2b61ab")), 1.8968741728394982, accuracy: 1e-9)
        // A yellow-orange stays an orange however thickly it is laid on.
        XCTAssertEqual(Mixing.mixHex([MixPaint(id: "o", hex: "#f59e04")], [4]), "#ef7700")
    }

    func testWashDilutesAMix() throws {
        let full = try XCTUnwrap(Mixing.findRecipes(target: "#2b61ab", paints: [blue]).first)
        let wash = try XCTUnwrap(Mixing.washRecipe(full, target: Mixing.mixHex([blue], [0.3]), paints: ["b": blue]))
        XCTAssertEqual(wash.strength, 0.2992782217119186, accuracy: 1e-4)
        XCTAssertEqual(wash.hex, "#87b2db")
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
        let clusters = [cluster(0, "#1a4c9c", 6000), cluster(1, "#70a0d2", 3000), cluster(2, "#e6331d", 100)]
        let mixes = Mixes.plan(clusters: clusters, paints: [yellow, blue, red], wanted: 2, variety: 10)
        XCTAssertEqual(mixes.count, 2)
        XCTAssertEqual(mixes.map { $0.clusters.map(\.index).sorted() }.sorted { $0.count > $1.count }, [[0, 1], [2]])
    }

    func testPlansTheSameMixesAsTheWebApp() {
        let hexes = ["#a88b4c", "#715611", "#634908", "#392620", "#bb3405", "#7a7d08", "#3e3d34", "#3f3815", "#c14b03", "#772411", "#465d1e", "#464d0d"]
        let clusters = hexes.enumerated().map { cluster($0, $1, 100 + $0 * 50) }
        // Per variety: the mix that survives (first number) and the colours painted with it.
        let expected = [
            0: [[1, 0, 1, 2, 9], [4, 4, 8], [6, 3, 6, 7], [10, 5, 10, 11]],
            10: [[3, 3, 6], [4, 4, 8], [9, 9], [10, 0, 1, 2, 5, 7, 10, 11]],
        ]
        for (variety, groups) in expected {
            let mixes = Mixes.plan(clusters: clusters, paints: [yellow, blue, red], wanted: 4, variety: variety)
            XCTAssertEqual(mixes.sorted { $0.group < $1.group }.map { [$0.group] + $0.clusters.map(\.index).sorted() }, groups, "variety \(variety)")
        }
        XCTAssertGreaterThan(Mixes.toRequest(wanted: 5), 5)
        XCTAssertLessThanOrEqual(Mixes.toRequest(wanted: 32), 48)
    }

    // MARK: Close-ups

    func testCloseupRectIsTheSameFromEitherCorner() throws {
        let rect = try XCTUnwrap(Closeups.rect(from: CGPoint(x: 0.6, y: 0.7), to: CGPoint(x: 0.2, y: 0.3)))
        XCTAssertEqual(rect.minX, 0.2, accuracy: 1e-9)
        XCTAssertEqual(rect.minY, 0.3, accuracy: 1e-9)
        XCTAssertEqual(rect.width, 0.4, accuracy: 1e-9)
        XCTAssertEqual(rect.height, 0.4, accuracy: 1e-9)
    }

    func testCloseupRectStaysInsideThePicture() {
        XCTAssertEqual(Closeups.rect(from: CGPoint(x: -0.3, y: 0.5), to: CGPoint(x: 0.5, y: 1.4)), CGRect(x: 0, y: 0.5, width: 0.5, height: 0.5))
    }

    func testCloseupRectTakesAShortDragForASlip() {
        XCTAssertNil(Closeups.rect(from: CGPoint(x: 0.5, y: 0.5), to: CGPoint(x: 0.51, y: 0.9)))
        XCTAssertNil(Closeups.rect(from: CGPoint(x: 0.5, y: 0.5), to: CGPoint(x: 0.9, y: 0.51)))
    }

    func testCloseupSizeShrinksALargePartAndKeepsItsShape() {
        let work = 800 * 600
        let size = Closeups.size(sourceWidth: 4000, sourceHeight: 3000, rect: CGRect(x: 0.25, y: 0.25, width: 0.5, height: 0.5), workPixels: work)
        XCTAssertEqual([size.sx, size.sy, size.sw, size.sh], [1000, 750, 2000, 1500])
        XCTAssertLessThanOrEqual(Double(size.width * size.height), Double(work) * 1.01)
        XCTAssertEqual(Double(size.width) / Double(size.height), 2000.0 / 1500, accuracy: 0.01)
    }

    func testCloseupSizeEnlargesASmallPartUpToTheLimit() {
        let size = Closeups.size(sourceWidth: 800, sourceHeight: 600, rect: CGRect(x: 0, y: 0, width: 0.1, height: 0.1), workPixels: 800 * 600)
        XCTAssertEqual(size.width, 80 * Int(Closeups.maxEnlarge))
        XCTAssertEqual(size.height, 60 * Int(Closeups.maxEnlarge))
    }

    func testCloseupSizeNeverReachesPastTheSource() {
        let size = Closeups.size(sourceWidth: 101, sourceHeight: 51, rect: CGRect(x: 0.9, y: 0.9, width: 0.1, height: 0.1), workPixels: 800 * 600)
        XCTAssertLessThanOrEqual(size.sx + size.sw, 101)
        XCTAssertLessThanOrEqual(size.sy + size.sh, 51)
    }
}
