import XCTest
@testable import Watercolourlove

/// The checks of src/__tests__/segment.test.js and details.test.js, and the areas the web app finds
/// for the same pictures (reference values from src/lib/segment.js, run in node).
final class SegmentationSyncTests: XCTestCase {
    private typealias P = TestPictures

    func testSplitsATwoColourImageIntoTwoAreas() {
        let rgba = P.makeImage(40, 20) { x, _ in x < 20 ? (200, 40, 30) : (30, 60, 160) }
        let seg = Segmenter.segment(rgba: rgba, width: 40, height: 20, colours: 2, simplify: 0)
        XCTAssertEqual(seg.regions.count, 2)
        XCTAssertEqual(seg.clusters.filter { $0.pixelCount > 0 }.count, 2)
    }

    func testMergesSpeckleNoiseIntoTheSurroundingArea() {
        let rgba = P.makeImage(60, 60) { x, y in (x * 7 + y * 13) % 97 == 0 ? (255, 255, 255) : (90, 120, 60) }
        XCTAssertEqual(Segmenter.segment(rgba: rgba, width: 60, height: 60, colours: 2, simplify: 4).regions.count, 1)
    }

    func testKeepsASmallColourfulPartOfAMostlyDarkPicture() {
        // A dark, nearly neutral gradient with a muted red patch covering 1% of the picture.
        let picture = P.makeImage(100, 100) { x, y in
            if x >= 45 && x < 55 && y >= 45 && y < 55 { return (150, 80, 70) }
            let v = 20 + Smooth.jsRound(Double(x + y) * 0.5)
            return (v + 6, v, v - 6)
        }
        let seg = Segmenter.segment(rgba: picture, width: 100, height: 100, colours: 3, simplify: 0)
        let reds = seg.clusters.filter { $0.pixelCount > 0 && ColorMath.oklab(hex: $0.hex).y > 0.05 }
        XCTAssertEqual(reds.count, 1)
        // The patch is 100 pixels; its corners are rounded off like every outline.
        XCTAssertGreaterThanOrEqual(reds.first?.pixelCount ?? 0, 92)
        XCTAssertLessThanOrEqual(reds.first?.pixelCount ?? 0, 100)
    }

    func testPaintsOneHueInSeveralWashesInsteadOfSeveralMixes() {
        // The same blue from pale to deep, next to a flat red.
        let picture = P.makeImage(120, 40) { x, y in
            if y >= 30 { return (200, 60, 50) }
            let t = pow(0.9 - 0.75 * (Double(x) / 119), 1 / 2.2)
            return (Smooth.jsRound(255 * pow(t, 3)), Smooth.jsRound(255 * pow(t, 1.6)), Smooth.jsRound(255 * pow(t, 0.5)))
        }
        let used = Segmenter.segment(rgba: picture, width: 120, height: 40, colours: 2, simplify: 0).clusters.filter { $0.pixelCount > 0 }
        XCTAssertEqual(Set(used.map(\.group)).count, 2)
        XCTAssertGreaterThan(used.count, 3)
        let blues = used.filter { ColorMath.oklab(hex: $0.hex).z < 0 }
        XCTAssertEqual(Set(blues.map(\.group)).count, 1)
        XCTAssertGreaterThan(blues.count, 2)
    }

    func testLabelsFourConnectedComponents() {
        let labels: [Int32] = [0, 0, 1, 1, 0, 1, 1, 1, 0]
        XCTAssertEqual(Segmenter.connectedComponents(labels, 3, 3).regionCluster, [0, 1, 1, 0])
    }

    func testSimplifyScaleMatchesTheWebApp() {
        XCTAssertEqual(Segmenter.finest, -4)
        XCTAssertEqual(Segmenter.simplifyZero, -2)
        XCTAssertEqual(Segmenter.topSimplify, 10)
    }

    func testHypotMatchesTheWebApp() {
        // Math.hypot in V8 for these values.
        XCTAssertEqual(Segmenter.hypot3(1, 2, 2), 3)
        XCTAssertEqual(Segmenter.hypot3(0.1, 0.2, 0.3), 0.37416573867739417)
    }

    // MARK: Boxes (details.test.js)

    func testBoxesMarkTheirPixelsALittleWiderAndStayInsideThePicture() {
        let mask = Details.boxMask([Details.Box(left: 0.5, top: 0.5, right: 0.75, bottom: 0.75), Details.Box(left: 0.9, top: 0.9, right: 1.2, bottom: 1.2)], 20, 20, pad: 0)
        XCTAssertEqual(mask[10 * 20 + 10], 1)
        XCTAssertEqual(mask[5 * 20 + 5], 0)
        XCTAssertEqual(mask[19 * 20 + 19], 1)
        let padded = Details.boxMask([Details.Box(left: 0.5, top: 0.5, right: 0.75, bottom: 0.75)], 20, 20, pad: 0.5)
        XCTAssertEqual(padded[8 * 20 + 8], 1)
        XCTAssertFalse(Details.boxMask([], 4, 4).contains(1))
    }

    // MARK: The same areas as the web app

    private struct Reference {
        let regions: Int
        let hash: UInt32
        let counts: [Int]
    }

    private func check(_ seg: Segmentation, _ expected: Reference, _ name: String) {
        XCTAssertEqual(seg.regions.count, expected.regions, name)
        XCTAssertEqual(seg.clusters.map(\.pixelCount), expected.counts, name)
        XCTAssertEqual(P.fnv(seg.regionMap), expected.hash, name)
    }

    func testFindsTheAreasTheWebAppFinds() {
        let w = 120, h = 90
        let noisy = P.noisy(w, h), blobs = P.blobs(w, h)
        let calmNoisy = Reference(regions: 3, hash: 3_842_603_237, counts: [5256, 5400, 144, 0, 0, 0])
        let expected: [(String, [UInt8], Int, Reference)] = [
            ("noisy/-4", noisy, -4, Reference(regions: 487, hash: 2_916_246_016, counts: [746, 2131, 1649, 1273, 2002, 521, 31, 113, 348, 1058, 928])),
            ("noisy/-2", noisy, -2, calmNoisy),
            ("noisy/0", noisy, 0, calmNoisy),
            ("noisy/3", noisy, 3, calmNoisy),
            ("noisy/8", noisy, 8, calmNoisy),
            ("blobs/-4", blobs, -4, Reference(regions: 204, hash: 4_143_466_932, counts: [256, 1065, 977, 246, 773, 449, 231, 700, 474, 323, 934, 870, 662, 1059, 472, 300, 704, 305])),
            ("blobs/-2", blobs, -2, Reference(regions: 76, hash: 3_058_861_917, counts: [319, 580, 1324, 524, 619, 545, 378, 674, 704, 1019, 311, 818, 565, 739, 1215, 466])),
            ("blobs/0", blobs, 0, Reference(regions: 38, hash: 4_051_074_892, counts: [892, 441, 0, 1430, 1033, 373, 1921, 1126, 520, 836, 1137, 467, 624])),
            ("blobs/3", blobs, 3, Reference(regions: 20, hash: 3_324_105_587, counts: [964, 369, 0, 1747, 1061, 177, 2039, 1020, 182, 551, 1493, 858, 339])),
            ("blobs/8", blobs, 8, Reference(regions: 9, hash: 173_662_859, counts: [828, 369, 0, 4313, 0, 0, 2939, 0, 0, 0, 1493, 858, 0])),
        ]
        for (name, rgba, simplify, reference) in expected {
            check(Segmenter.segment(rgba: rgba, width: w, height: h, colours: 6, simplify: simplify), reference, name)
        }
        check(Segmenter.segment(rgba: blobs, width: w, height: h, colours: 6, simplify: 2, geometric: true, focus: [Details.Box(left: 0.2, top: 0.2, right: 0.6, bottom: 0.7)]),
              Reference(regions: 38, hash: 3_553_823_060, counts: [885, 433, 432, 1716, 562, 419, 2001, 952, 342, 801, 1157, 470, 630]), "focus and geometric")
        check(Segmenter.segment(rgba: blobs, width: w, height: h, colours: 6, simplify: 0, anchors: ["#c89670", "#5a82b4", "#281e1e"]),
              Reference(regions: 26, hash: 4_262_768_690, counts: [2591, 2984, 275, 355, 740, 2302, 1553]), "anchors")
        // Value mode as the web asks for it: one mix in many values.
        check(Segmenter.segment(rgba: blobs, width: w, height: h, colours: 1, simplify: -2, maxWashes: 24, washStep: 0.15),
              Reference(regions: 42, hash: 2_749_720_452, counts: [232, 836, 2493, 1388, 3091, 1793, 502, 465]), "values")
    }

    func testCutsTheSamePatchesAsTheWebApp() {
        let w = 120, h = 90
        let lab = Segmenter.oklabPixels(P.noisy(w, h), count: w * h)
        let patches = Smooth.compactPatches(lab, w, h, step: 5)
        XCTAssertEqual(P.fnv(patches.patchOf), 2_156_494_139)
        let calm = Smooth.patchColours(lab, w, h, patches)
        XCTAssertEqual(calm[0], 0.7118161916732788, accuracy: 1e-6)
        XCTAssertEqual(calm[1], 0.041137438267469406, accuracy: 1e-6)
        XCTAssertEqual(calm[(45 * w + 60) * 3], 0.5977897644042969, accuracy: 1e-6)
        XCTAssertEqual(calm[(45 * w + 60) * 3 + 1], -0.021976405754685402, accuracy: 1e-6)
    }

    // MARK: Speed

    func testSegmentsAPictureOfTheWorkingSizeInReasonableTime() {
        // 800 x 600 pixels, as the web app works on.
        let w = 800, h = 600
        let rgba = P.makeImage(w, h) { x, y in
            let fx = Double(x), fy = Double(y)
            let v = sin(fx / 40) + cos(fy / 30) + sin((fx + fy) / 70)
            return (128 + 60 * v + Double((x * 7 + y * 13) % 23), 128 - 50 * sin(fx / 55), 100 + 40 * cos(fy / 25))
        }
        let start = Date()
        let seg = Segmenter.segment(rgba: rgba, width: w, height: h, colours: 24, simplify: Segmenter.simplifyZero)
        let seconds = Date().timeIntervalSince(start)
        print("segment 800x600 at Simplify 0: \(seg.regions.count) areas in \(String(format: "%.2f", seconds)) s")
        XCTAssertGreaterThan(seg.regions.count, 1)
        // The same size under heavy noise, the hardest case for the patches and the joining.
        let noisy = P.blobs(w, h)
        let noisyStart = Date()
        let rough = Segmenter.segment(rgba: noisy, width: w, height: h, colours: 24, simplify: Segmenter.simplifyZero)
        print("segment 800x600 noisy at Simplify 0: \(rough.regions.count) areas in \(String(format: "%.2f", Date().timeIntervalSince(noisyStart))) s")
        let fineStart = Date()
        let fine = Segmenter.segment(rgba: noisy, width: w, height: h, colours: 24, simplify: Segmenter.finest)
        print("segment 800x600 noisy at the finest step: \(fine.regions.count) areas in \(String(format: "%.2f", Date().timeIntervalSince(fineStart))) s")
        let blockStart = Date()
        let blocked = Blocking.blockImage(rgba: noisy, width: w, height: h, tones: 3)
        print("blockImage 800x600 noisy: \(blocked.regions.count) masses in \(String(format: "%.2f", Date().timeIntervalSince(blockStart))) s")
        let drawStart = Date()
        let regionLabels = seg.regionMap
        let big = Smooth.upscaleAreas(regionLabels, w, h, scale: 2)
        print("upscaleAreas 800x600 x 2: \(String(format: "%.2f", Date().timeIntervalSince(drawStart))) s")
        XCTAssertEqual(big.count, w * h * 4)
    }
}
