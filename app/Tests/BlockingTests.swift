import XCTest
@testable import Watercolourlove

/// The checks of src/__tests__/blocking.test.js, and the masses the web app finds for the same
/// pictures (reference values from src/lib/blocking.js, run in node).
final class BlockingTests: XCTestCase {
    private typealias P = TestPictures

    private func picture(_ w: Int, _ h: Int, _ at: @escaping (Int, Int) -> (Double, Double, Double)) -> [UInt8] { P.makeImage(w, h, at) }
    private func grey(_ v: Double) -> (Double, Double, Double) { (v, v, v) }

    // MARK: Lightness

    func testLightnessIsCIELStar() {
        XCTAssertEqual(Blocking.lightnessOf(255, 255, 255), 100, accuracy: 1e-3)
        XCTAssertEqual(Blocking.lightnessOf(0, 0, 0), 0, accuracy: 1e-3)
        XCTAssertEqual(Blocking.lightnessOf(119, 119, 119), 50, accuracy: 0.5)
        // Pure yellow looks far lighter than pure blue, though both average to 170.
        XCTAssertGreaterThan(Blocking.lightnessOf(255, 255, 0), 95)
        XCTAssertLessThan(Blocking.lightnessOf(0, 0, 255), 35)
    }

    func testCountsThePixelsPerStepOfLStar() {
        XCTAssertEqual(Blocking.histogram([0, 49.9, 50, 100], bins: 2), [2, 2])
    }

    // MARK: Where the photo divides

    func testSplitsTwoGroupsOfLightnessBetweenThem() {
        let L = (0..<1000).map { (i: Int) -> Float in Float(i < 600 ? 85 + i % 5 : 15 + i % 5) }
        let t = Blocking.naturalSplit(Blocking.histogram(L), tones: 2)[0]
        XCTAssertGreaterThan(t, 19)
        XCTAssertLessThanOrEqual(t, 85)
    }

    func testFindsThreeGroupsForThreeTones() {
        let L = (0..<900).map { Float([90, 50, 10][$0 % 3]) }
        let split = Blocking.naturalSplit(Blocking.histogram(L), tones: 3)
        XCTAssertGreaterThan(split[0], 10)
        XCTAssertLessThanOrEqual(split[0], 50)
        XCTAssertGreaterThan(split[1], 50)
        XCTAssertLessThanOrEqual(split[1], 90)
    }

    func testNumbersTheTonesFromTheLightest() {
        XCTAssertEqual(Blocking.toneOf(80, [40]), 0)
        XCTAssertEqual(Blocking.toneOf(20, [40]), 1)
        XCTAssertEqual(Blocking.toneOf(50, [35, 65]), 1)
        XCTAssertEqual(Blocking.toneOf(10, [35, 65]), 2)
        XCTAssertEqual(Blocking.toneOfHex("#ffffff", [35, 65]), 0)
        XCTAssertEqual(Blocking.toneOfHex("#000000", [35, 65]), 2)
    }

    func testShowsTheTonesAsPaperWhiteDownToAStrongDark() {
        XCTAssertTrue(Blocking.toneGrey(0, tones: 2) == (255, 255, 255))
        XCTAssertLessThan(Blocking.toneGrey(1, tones: 2).r, 70)
        let light = Blocking.toneGrey(0, tones: 3).r, middle = Blocking.toneGrey(1, tones: 3).r, dark = Blocking.toneGrey(2, tones: 3).r
        XCTAssertGreaterThan(light, middle)
        XCTAssertGreaterThan(middle, dark)
    }

    // MARK: The masses of a picture

    func testGivesALightAndADarkHalfAsTwoMasses() {
        let rgba = picture(120, 80) { x, _ in self.grey(x < 60 ? 230 : 30) }
        let result = Blocking.blockImage(rgba: rgba, width: 120, height: 80, tones: 2)
        XCTAssertEqual(result.regions.count, 2)
        XCTAssertEqual(result.shares[0], 0.5, accuracy: 0.05)
        XCTAssertEqual(result.toneMap[0], 0)
        XCTAssertEqual(result.toneMap[119], 1)
    }

    func testLeavesTextureOut() {
        // A light field with dark single pixels every few pixels, and one large dark block.
        let rgba = picture(200, 140) { x, y in x > 140 && y > 80 ? self.grey(20) : (x * 7 + y * 13) % 23 == 0 ? self.grey(25) : self.grey(225) }
        let result = Blocking.blockImage(rgba: rgba, width: 200, height: 140, tones: 2, forms: 6)
        XCTAssertLessThanOrEqual(result.regions.count, 3)
        XCTAssertEqual(result.toneMap[10 * 200 + 10], 0)
        XCTAssertEqual(result.toneMap[120 * 200 + 180], 1)
    }

    func testKeepsMoreOfTheSmallShapesAtFormsZero() {
        let rgba = picture(200, 140) { x, y in (x / 6 + y / 6) % 2 == 1 ? self.grey(220) : self.grey(40) }
        let fine = Blocking.blockImage(rgba: rgba, width: 200, height: 140, tones: 2, forms: 0).regions.count
        let large = Blocking.blockImage(rgba: rgba, width: 200, height: 140, tones: 2, forms: 10).regions.count
        XCTAssertGreaterThan(fine, large)
    }

    func testPutsThreeBandsInThreeTonesInOrder() {
        let rgba = picture(90, 60) { x, _ in self.grey(x < 30 ? 235 : x < 60 ? 120 : 25) }
        let result = Blocking.blockImage(rgba: rgba, width: 90, height: 60, tones: 3)
        XCTAssertEqual(result.thresholds.count, 2)
        XCTAssertEqual([result.toneMap[5], result.toneMap[45], result.toneMap[85]], [0, 1, 2])
    }

    func testTakesASplitGivenByHandAndGivesTheSameMassesEveryTime() {
        let rgba = picture(100, 60) { x, _ in self.grey(Smooth.jsRound(Double(x) / 99 * 255)) }
        let a = Blocking.blockImage(rgba: rgba, width: 100, height: 60, tones: 2, split: [30])
        let b = Blocking.blockImage(rgba: rgba, width: 100, height: 60, tones: 2, split: [70])
        XCTAssertEqual(a.thresholds, [30])
        XCTAssertGreaterThan(a.shares[0], b.shares[0])
        XCTAssertEqual(Blocking.blockImage(rgba: rgba, width: 100, height: 60, tones: 2, split: [30]).toneMap, a.toneMap)
        // A split that does not fit the number of tones is left for the natural one.
        XCTAssertEqual(Blocking.blockImage(rgba: rgba, width: 100, height: 60, tones: 3, split: [30]).thresholds.count, 2)
    }

    func testMeasuresColourByWhatTheEyeSees() {
        let rgba = picture(80, 40) { x, _ in x < 40 ? (250, 220, 40) : (30, 40, 160) }
        let result = Blocking.blockImage(rgba: rgba, width: 80, height: 40, tones: 2)
        XCTAssertEqual(result.toneMap[5], 0)
        XCTAssertEqual(result.toneMap[75], 1)
        XCTAssertGreaterThan(Blocking.lightnessMap(rgba, count: 80 * 40)[5], 80)
    }

    // MARK: The same masses as the web app

    func testFindsTheMassesTheWebAppFinds() {
        let w = 120, h = 90
        let noisy = P.noisy(w, h), blobs = P.blobs(w, h)
        let cases: [(String, BlockedPicture, Int, [Double], [Double], UInt32)] = [
            ("noisy, 2 tones", Blocking.blockImage(rgba: noisy, width: w, height: h, tones: 2), 3, [59], [0.4841666666666667, 0.5158333333333333], 3_100_672_292),
            ("blobs, 3 tones, forms 3", Blocking.blockImage(rgba: blobs, width: w, height: h, tones: 3, forms: 3), 12, [47, 60], [0.3275, 0.3855555555555556, 0.28694444444444445], 3_400_013_343),
            ("blobs, 2 tones, forms 0", Blocking.blockImage(rgba: blobs, width: w, height: h, tones: 2, forms: 0), 30, [53], [0.5450925925925925, 0.4549074074074074], 3_071_671_020),
        ]
        for (name, result, regions, thresholds, shares, hash) in cases {
            XCTAssertEqual(result.regions.count, regions, name)
            XCTAssertEqual(result.thresholds, thresholds, name)
            XCTAssertEqual(result.natural, thresholds, name)
            for (a, b) in zip(result.shares, shares) { XCTAssertEqual(a, b, accuracy: 1e-12, name) }
            XCTAssertEqual(P.fnv(result.toneMap), hash, name)
        }
    }
}
