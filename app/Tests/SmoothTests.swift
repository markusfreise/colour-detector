import XCTest
@testable import Watercolourlove

/// The checks of src/__tests__/smooth.test.js: patches, details, joining, rounding and smooth drawing.
final class SmoothTests: XCTestCase {
    private typealias P = TestPictures

    private func outline(_ l: [Int32], _ w: Int, _ h: Int) -> Int {
        var n = 0
        for y in 0..<(h - 1) { for x in 0..<(w - 1) { let p = y * w + x; n += (l[p] != l[p + 1] ? 1 : 0) + (l[p] != l[p + w] ? 1 : 0) } }
        return n
    }

    private func segment(_ rgba: [UInt8], _ w: Int, _ h: Int, colours: Int, simplify: Int, geometric: Bool = false, anchors: [String]? = nil, focus: [Details.Box]? = nil) -> Segmentation {
        Segmenter.segment(rgba: rgba, width: w, height: h, colours: colours, simplify: simplify, geometric: geometric, anchors: anchors, focus: focus)
    }

    func testTakesTheNoiseOutAndLeavesTheEdges() {
        let w = 120, h = 90
        let lab = Segmenter.oklabPixels(P.noisy(w, h), count: w * h)
        let calm = Smooth.patchColours(lab, w, h, Smooth.compactPatches(lab, w, h, step: 5))
        func spread(_ pixels: [Float], _ x0: Int, _ x1: Int) -> Double {
            var sum = 0.0, sq = 0.0, n = 0.0
            for y in 0..<30 { for x in x0..<x1 { let L = Double(pixels[(y * w + x) * 3]); sum += L; sq += L * L; n += 1 } }
            return (sq / n - (sum / n) * (sum / n)).squareRoot()
        }
        XCTAssertLessThan(spread(calm, 5, 50), spread(lab, 5, 50) / 4)
        // The two halves are still two colours, right up to the edge between them.
        func L(_ x: Int) -> Double { Double(calm[(20 * w + x) * 3]) }
        XCTAssertGreaterThan(abs(L(56) - L(63)), 0.1)
        XCTAssertLessThan(abs(L(56) - L(20)), 0.03)
    }

    func testFindsTheSameAreasAsConnectedComponents() {
        let w = 37, h = 23
        let rand = P.random(2)
        let labels = (0..<(w * h)).map { _ in Int32((rand() * 3).rounded(.down)) }
        let a = Smooth.findAreas(labels, w, h)
        let b = Segmenter.connectedComponents(labels, w, h)
        XCTAssertEqual(a.areaOf, b.regionMap)
        XCTAssertEqual(a.labelOf.map { Int($0) }, b.regionCluster)
        XCTAssertEqual(a.sizeOf.map { Int($0) }, b.regionSize)
        XCTAssertEqual(a.count, b.regionSize.count)
    }

    func testRoundsAJaggedOutline() {
        let w = 60, h = 60
        var labels = [Int32](repeating: 0, count: w * h)
        for y in 0..<h { for x in 0..<w { labels[y * w + x] = x < 30 + (y % 4 < 2 ? 2 : -2) ? 0 : 1 } }
        let out = Smooth.roundOutlines(labels, w, h, k: 2, radius: 3, passes: 3)
        XCTAssertLessThan(outline(out, w, h), outline(labels, w, h) / 2)
        XCTAssertLessThan(outline(out, w, h), h + 6)
    }

    func testTakesAThinTongueOffButNeverTouchesADetail() {
        let w = 40, h = 40
        let (labels, _) = P.drawn(w, h, 0.3, [(1, 0.9, 19, 5, 21, 35)])
        let gone = Smooth.roundOutlines(labels, w, h, k: 2, radius: 3, passes: 2)
        XCTAssertEqual(Set(gone).count, 1)
        let fixed = labels.map { UInt8($0) }
        let kept = Smooth.roundOutlines(labels, w, h, k: 2, radius: 3, passes: 2, fixed: fixed)
        XCTAssertEqual(kept, labels)
        // With a mask, nothing outside it changes.
        var only = [UInt8](repeating: 0, count: w * h)
        for i in 0..<(20 * w) { only[i] = 1 }
        let half = Smooth.roundOutlines(labels, w, h, k: 2, radius: 3, passes: 2, only: only)
        XCTAssertEqual(half[10 * w + 19], 0)
        XCTAssertEqual(half[30 * w + 19], 1)
    }

    func testAlwaysFinishesJoiningSmallAreasEvenInPureNoise() {
        let w = 120, h = 100
        let rand = P.random(11)
        let labels = (0..<(w * h)).map { _ in Int32((rand() * 6).rounded(.down)) }
        var lab = [Float](repeating: 0, count: w * h * 3)
        for p in 0..<(w * h) { lab[p * 3] = Float(0.3 + Double(labels[p]) * 0.1) }
        let out = Smooth.mergeAreas(labels, lab, w, h, stages: [Smooth.Stage(minSize: 40)])
        XCTAssertGreaterThanOrEqual(P.sizes(out, w, h).min()!, 40)
        // Only what is too small joins: the picture does not run into one area.
        XCTAssertGreaterThan(P.sizes(out, w, h).count, 20)
    }

    func testJoinsLargeAreasOfNearlyOneColourAndKeepsDifferentOnesApart() {
        let w = 90, h = 40
        // Three stripes: two shades of one colour, and a much lighter one.
        let (labels, lab) = P.drawn(w, h, 0.4, [(1, 0.42, 30, 0, 60, h), (2, 0.8, 60, 0, 90, h)])
        let out = Smooth.mergeAreas(labels, lab, w, h, stages: [Smooth.Stage(limit: 0.02)])
        XCTAssertEqual(out[5], out[45])
        XCTAssertEqual(out[75], 2)
        XCTAssertEqual(P.sizes(out, w, h), [60 * h, 30 * h])
        // On equal sizes the lower area gives its label.
        XCTAssertEqual(out[45], 0)
    }

    func testFindsTheDetails() {
        let w = 100, h = 60
        let (labels, lab) = P.drawn(w, h, 0.7, [
            (1, 0.2, 10, 10, 16, 15), // dark on light: an eye
            (2, 0.68, 30, 10, 36, 15), // nearly the colour around it
            (3, 0.2, 60, 0, 100, h), // a large dark area ...
            (4, 0.45, 58, 0, 60, h), // ... and the strip between it and the light one
            (5, 0.25, 10, 40, 40, 41), // a wire: large, but thin
            (6, 0.2, 20, 22, 22, 24), // dark, but smaller than the smallest area
        ])
        let details = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: 40)
        func at(_ x: Int, _ y: Int) -> Float { details.worth[y * w + x] }
        // The eye: 30 pixels with 22 of outline, 0.5 from the colour around it.
        XCTAssertEqual(Double(at(12, 12)), (30.0 / 22) * 0.25, accuracy: 0.005)
        XCTAssertEqual(at(32, 12), 0)
        XCTAssertEqual(at(80, 30), 0)
        XCTAssertEqual(at(58, 30), 0)
        XCTAssertGreaterThan(at(25, 40), 0.04)
        XCTAssertEqual(at(20, 22), 0)
        // All of an area or none of it.
        for p in 0..<(w * h) where labels[p] == 1 { XCTAssertEqual(details.worth[p], details.worth[12 * w + 12]) }
        // On its own a detail counts as large as it is; what is none counts as nothing.
        XCTAssertEqual(details.span[12 * w + 12], 30)
        XCTAssertEqual(details.span[12 * w + 32], 0)
    }

    func testKeepsOrDropsTheLettersOfALineTogether() {
        let w = 80, h = 30
        // Strokes of one colour close together; the last one is fainter than a detail on its own may be.
        let strokes: [(Int32, Float, Int, Int, Int, Int)] = [(1, 0.1, 10, 10, 12, 20), (2, 0.1, 16, 10, 18, 20), (3, 0.1, 22, 10, 24, 20), (4, 0.2, 28, 10, 29, 20)]
        let (labels, lab) = P.drawn(w, h, 0.95, strokes)
        func worth(_ map: [Float]) -> [Double] { strokes.map { (Double(map[$0.3 * w + $0.2]) * 100).rounded() / 100 } }
        // Together all are worth the best of them, the faint one at most twice its own worth.
        let together = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: 40)
        XCTAssertEqual(worth(together.worth), [0.6, 0.6, 0.6, 0.51])
        // And all count as large as the largest of them (20 pixels), the narrow one of 10 too.
        XCTAssertEqual(strokes.map { together.span[$0.3 * w + $0.2] }, [20, 20, 20, 20])
        // Far from the others the faint stroke is judged on its own.
        let lone = P.drawn(w, h, 0.95, Array(strokes[0..<3]) + [(4, 0.2, 60, 10, 61, 20)])
        let details = Smooth.findDetails(lone.labels, lone.lab, w, h, minSize: 6, maxSize: 40)
        XCTAssertEqual(Double(details.worth[10 * w + 10]), 0.6, accuracy: 0.005)
        XCTAssertEqual(Double(details.worth[10 * w + 60]), 0.26, accuracy: 0.005)
        XCTAssertEqual(details.span[10 * w + 60], 10)
    }

    func testKeepsADetailAsItWasFound() {
        let w = 60, h = 40
        // An eye on skin, with a scrap right beside it that is closer to the colour of the eye than
        // to the skin, and a second scrap of nearly the colour of the skin.
        let (labels, lab) = P.drawn(w, h, 0.7, [(1, 0.2, 10, 10, 18, 15), (2, 0.35, 18, 11, 20, 14), (3, 0.69, 30, 10, 33, 13)])
        let details = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: 60)
        XCTAssertGreaterThan(details.worth[12 * w + 12], 0.04)
        XCTAssertLessThan(details.worth[12 * w + 18], 0.04)
        let out = Smooth.mergeAreas(labels, lab, w, h, stages: [Smooth.Stage(minSize: 60, limit: 0.02, detailLimit: 0.04, floor: 6)], details: details)
        // The scraps go into the skin, although the eye would be the cheaper neighbour of the first.
        XCTAssertEqual(out[12 * w + 18], 0)
        XCTAssertEqual(out[11 * w + 31], 0)
        let eye = Smooth.findAreas(out, w, h)
        XCTAssertEqual(eye.sizeOf[Int(eye.areaOf[12 * w + 12])], 40)
        // Without the eye being a detail it is too small to stay.
        let gone = Smooth.mergeAreas(labels, lab, w, h, stages: [Smooth.Stage(minSize: 60, limit: 0.02, floor: 6)])
        XCTAssertEqual(P.sizes(gone, w, h), [w * h])
    }

    func testDropsADetailTooSmallOrTooLargeForTheStep() {
        let w = 60, h = 40
        // Details of 20, 4 and 64 pixels.
        let (labels, lab) = P.drawn(w, h, 0.7, [(1, 0.2, 10, 10, 15, 14), (2, 0.2, 40, 10, 42, 12), (3, 0.2, 30, 25, 38, 33)])
        let details = Smooth.findDetails(labels, lab, w, h, minSize: 1, maxSize: 100)
        // The room a detail takes is its size; a thin or very small one takes none.
        XCTAssertEqual(details.room[28 * w + 34], 64)
        XCTAssertEqual(details.room[12 * w + 12], 0)
        func left(_ change: (inout Smooth.Stage) -> Void) -> [Int] {
            var stage = Smooth.Stage(minSize: 100, limit: 0.02, detailLimit: 0.04)
            change(&stage)
            return P.sizes(Smooth.mergeAreas(labels, lab, w, h, stages: [stage], details: details), w, h).sorted()
        }
        // All three stay when nothing more is asked of them.
        XCTAssertEqual(Array(left { _ in }.prefix(3)), [4, 20, 64])
        // The floor takes the one of 4 pixels, a least size of 30 the one of 20 as well.
        XCTAssertEqual(Array(left { $0.floor = 6 }.prefix(2)), [20, 64])
        XCTAssertEqual(left { $0.floor = 6; $0.detailSize = 30 }, [64, w * h - 64])
        // A step with room for 50 pixels has none for the one of 64, which is then too small to stay.
        XCTAssertEqual(left { $0.floor = 6; $0.detailRoom = 50 }, [20, w * h - 20])
        XCTAssertEqual(Array(left { $0.floor = 6; $0.detailRoom = 64 }.prefix(2)), [20, 64])
    }

    func testWorksOutEveryRoundAnew() {
        let w = 40, h = 10
        // Four stripes side by side, each 0.05 lighter than the one before: in one round the outer
        // pairs join; the two halves that are left are 0.1 apart and stay two areas.
        let (labels, lab) = P.drawn(w, h, 0.4, [(1, 0.45, 10, 0, 20, h), (2, 0.5, 20, 0, 30, h), (3, 0.55, 30, 0, 40, h)])
        let out = Smooth.mergeAreas(labels, lab, w, h, stages: [Smooth.Stage(limit: 0.05)])
        XCTAssertEqual(P.sizes(out, w, h), [20 * h, 20 * h])
        XCTAssertEqual(out[5], out[15])
        XCTAssertEqual(out[25], out[35])
        XCTAssertNotEqual(out[15], out[25])
    }

    func testCountsTwoDarkColoursAsCloserThanTwoLightOnes() {
        let light = Smooth.apart(0.6, 0, 0, 0.7, 0, 0), dark = Smooth.apart(0.1, 0, 0, 0.2, 0, 0)
        XCTAssertEqual(light, 0.01, accuracy: 1e-6)
        XCTAssertLessThan(dark, light / 2)
        // A dark thing on a light ground counts in full.
        XCTAssertEqual(Smooth.apart(0.1, 0, 0, 0.6, 0, 0), 0.25, accuracy: 1e-6)
        XCTAssertEqual(Smooth.apart(0.2, 0.01, 0, 0.1, 0, 0), Smooth.apart(0.1, 0, 0, 0.2, 0.01, 0))
    }

    func testTakesNoiseFromPixelToPixelForOneColourButNotFineLines() throws {
        let w = 100, h = 60
        let rand = P.random(4)
        // Left: every pixel its own colour. Right: black lines one pixel wide on white.
        let rgba = P.makeImage(w, h) { x, y in
            if x < 50 { let r = rand() * 255, g = rand() * 255, b = rand() * 255; return (r, g, b) }
            return y % 6 == 0 || x % 9 == 0 ? (0, 0, 0) : (255, 255, 255)
        }
        let lab = Segmenter.oklabPixels(rgba, count: w * h)
        var patches = Smooth.compactPatches(lab, w, h, step: 5)
        let restless = try XCTUnwrap(Smooth.settlePatches(lab, w, h, &patches))
        func at(_ x: Int, _ y: Int) -> UInt8 { restless[(y / 5) * patches.cols + x / 5] }
        XCTAssertEqual(at(20, 30), 1)
        XCTAssertEqual(at(80, 30), 0)
        // In the noise every pixel is back in the square of the grid it lies in.
        XCTAssertEqual(Int(patches.patchOf[30 * w + 20]), 6 * patches.cols + 4)
        let calm = Smooth.patchColours(lab, w, h, patches, restless: restless)
        func L(_ x: Int, _ y: Int) -> Double { Double(calm[(y * w + x) * 3]) }
        for (x, y) in [(10, 10), (30, 40), (20, 25)] { XCTAssertLessThan(abs(L(x, y) - L(22, 30)), 0.05) }
        // The lines are still black on white.
        XCTAssertLessThan(L(81, 20), 0.3)
        XCTAssertGreaterThan(L(84, 21), 0.9)
        // A picture without such noise is left alone.
        let flat = Segmenter.oklabPixels(P.noisy(w, h), count: w * h)
        var flatPatches = Smooth.compactPatches(flat, w, h, step: 5)
        XCTAssertNil(Smooth.settlePatches(flat, w, h, &flatPatches))
    }

    func testOneCalmAreaOfNoiseAndFewerAreasOfSpecksWithEveryStep() {
        let w = 160, h = 120
        let rand = P.random(8)
        let noise = P.makeImage(w, h) { _, _ in let r = rand() * 255, g = rand() * 255, b = rand() * 255; return (r, g, b) }
        for simplify in [0, 4, 10] { XCTAssertLessThan(segment(noise, w, h, colours: 8, simplify: simplify).regions.count, 6) }
        // Pixels in two greys are a picture of specks: Simplify takes them away.
        let specks = P.makeImage(w, h) { _, _ in rand() < 0.5 ? (90, 90, 90) : (190, 190, 190) }
        let counts = [0, 4, 8, 10].map { segment(specks, w, h, colours: 8, simplify: $0).regions.count }
        for i in 1..<counts.count { XCTAssertLessThanOrEqual(counts[i], counts[i - 1]) }
        XCTAssertGreaterThan(counts[0], 50)
        XCTAssertLessThan(counts[3], counts[0] / 8)
    }

    // A rough field: grains of 3 x 3 pixels every `pitch` pixels, each with a label of its own kind
    // (`kinds` of them in turn), and a photo that is noisier than the picture without noise.
    private func grainField(_ w: Int, _ h: Int, _ pitch: Int, _ kinds: Int, _ extra: [(Int32, Float, Int, Int, Int, Int)] = []) -> (labels: [Int32], lab: [Float], photo: [Float]) {
        var shapes: [(Int32, Float, Int, Int, Int, Int)] = []
        var i = 0
        for y in stride(from: 4, to: h - 3, by: pitch) {
            for x in stride(from: 4, to: w - 3, by: pitch) { shapes.append((Int32(1 + i % kinds), 0.4, x, y, x + 3, y + 3)); i += 1 }
        }
        let (labels, lab) = P.drawn(w, h, 0.7, shapes + extra)
        return (labels, lab, P.noisyPhoto(lab))
    }

    func testTellsTextureFromDetails() {
        let w = 120, h = 90
        // Grains all over the left half, and one dark piece of their size alone on the right.
        let field = grainField(60, h, 8, 2)
        var wide = P.drawn(w, h, 0.7, [(9, 0.4, 90, 40, 93, 43)])
        for y in 0..<h { for x in 0..<60 { wide.labels[y * w + x] = field.labels[y * 60 + x]; wide.lab[(y * w + x) * 3] = field.lab[(y * 60 + x) * 3] } }
        let noisy = P.noisyPhoto(wide.lab)
        let plain = Smooth.findDetails(wide.labels, wide.lab, w, h, minSize: 6, maxSize: 40)
        let details = Smooth.findDetails(wide.labels, wide.lab, w, h, minSize: 6, maxSize: 40, photo: noisy, cell: 16, findTexture: true)
        // Without the photo every grain is a detail; with it none is, and the lone piece still is.
        XCTAssertGreaterThan(plain.worth[5 * w + 5], 0)
        XCTAssertEqual(details.worth[5 * w + 5], 0)
        XCTAssertEqual(details.worth[45 * w + 29], 0)
        XCTAssertGreaterThan(details.worth[41 * w + 91], 0)
        // The zone of texture is where the grains are.
        XCTAssertEqual(details.textured?[40 * w + 30], 1)
        XCTAssertEqual(details.textured?[40 * w + 100], 0)
    }

    func testNeverTakesForTextureALongLineALargePieceOrOneOnCalmGround() {
        let w = 120, h = 90
        // A wire right across the grains and a window among them.
        let field = grainField(w, h, 8, 2, [(7, 0.2, 0, 44, w, 45), (8, 0.2, 60, 60, 70, 72)])
        let details = Smooth.findDetails(field.labels, field.lab, w, h, minSize: 6, maxSize: 200, photo: field.photo, cell: 16, pieceSize: 72)
        XCTAssertEqual(details.worth[5 * w + 5], 0)
        XCTAssertGreaterThan(details.worth[44 * w + 50], 0)
        XCTAssertGreaterThan(details.worth[65 * w + 65], 0)
        // The same grains on a ground the photo shows as calm as the picture: letters, not texture.
        let calm = Smooth.findDetails(field.labels, field.lab, w, h, minSize: 6, maxSize: 200, photo: field.lab, cell: 16, pieceSize: 72)
        XCTAssertGreaterThan(calm.worth[5 * w + 5], 0)
    }

    func testJudgesTextureTheSameWhateverTheSizeOfThePicture() {
        func verdict(_ scale: Int) -> [Bool] {
            let w = 96 * scale, h = 64 * scale
            var shapes: [(Int32, Float, Int, Int, Int, Int)] = []
            // Grains on the left half, two pieces of their size on their own on the right.
            for y in stride(from: 4, to: 61, by: 8) {
                for x in stride(from: 4, to: 45, by: 8) { shapes.append((Int32(1 + ((x + y) >> 3) % 2), 0.4, x * scale, y * scale, (x + 3) * scale, (y + 3) * scale)) }
            }
            shapes.append((5, 0.4, 70 * scale, 20 * scale, 73 * scale, 23 * scale))
            shapes.append((6, 0.4, 80 * scale, 44 * scale, 83 * scale, 47 * scale))
            let (labels, lab) = P.drawn(w, h, 0.7, shapes)
            let details = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: Double(40 * scale * scale), photo: P.noisyPhoto(lab), cell: 16 * scale)
            func kept(_ x: Int, _ y: Int) -> Bool { details.worth[(y * scale + 1) * w + x * scale + 1] > 0 }
            return [kept(4, 4), kept(20, 28), kept(44, 60), kept(70, 20), kept(80, 44)]
        }
        XCTAssertEqual(verdict(1), [false, false, false, true, true])
        XCTAssertEqual(verdict(2), verdict(1))
        XCTAssertEqual(verdict(3), verdict(1))
    }

    func testKeepsThePartsOfASmallFace() {
        let w = 120, h = 90
        // Twelve strong pieces close together, each of a kind of its own; and twelve of one kind.
        var many: [(Int32, Float, Int, Int, Int, Int)] = [], same: [(Int32, Float, Int, Int, Int, Int)] = []
        for i in 0..<12 {
            let x = 10 + (i % 4) * 7, y = 10 + (i / 4) * 7
            many.append((Int32(1 + i), 0.2, x, y, x + 3, y + 3))
            same.append((20, 0.2, x + 60, y + 40, x + 63, y + 43))
        }
        let (labels, lab) = P.drawn(w, h, 0.7, many + same)
        let details = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: 40, photo: P.noisyPhoto(lab), cell: 16)
        XCTAssertGreaterThan(details.worth[18 * w + 18], 0)
        XCTAssertEqual(details.worth[58 * w + 78], 0)
    }

    func testCountsWouldBeDetailsThatTouchAsOneThing() {
        let w = 60, h = 40
        // A dark mark of 12 pixels with a rim of 8 in another dark colour, and a mark of 12 alone.
        let (labels, lab) = P.drawn(w, h, 0.9, [(1, 0.2, 10, 10, 14, 13), (2, 0.3, 14, 10, 16, 14), (3, 0.2, 40, 10, 44, 13)])
        let details = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: 40)
        XCTAssertEqual(details.span[11 * w + 11], 20)
        XCTAssertEqual(details.span[11 * w + 15], 20)
        XCTAssertEqual(details.span[11 * w + 41], 12)
    }

    func testJoinsAreasInAZoneOfTextureOnlyWhatDoesNotStandOut() {
        let w = 60, h = 40
        // Two areas of 100 pixels on a ground of 0.5: one nearly its colour, one far from it.
        let (labels, lab) = P.drawn(w, h, 0.5, [(1, 0.56, 5, 5, 15, 15), (2, 0.2, 35, 5, 45, 15)])
        let stage = [Smooth.Stage(minSize: 50, roughSize: 200, limit: 0)]
        // Outside a zone of texture both are large enough.
        XCTAssertEqual(P.sizes(Smooth.mergeAreas(labels, lab, w, h, stages: stage), w, h).sorted(), [100, 100, w * h - 200])
        // Inside one the near colour runs into the ground, the far one stays (a window in a house front).
        let rough = [UInt8](repeating: 1, count: w * h)
        XCTAssertEqual(P.sizes(Smooth.mergeAreas(labels, lab, w, h, stages: stage, rough: rough), w, h).sorted(), [100, w * h - 100])
    }

    func testLeavesADetailAndTheHoleInsideItAlone() {
        let w = 60, h = 40
        // A dark ring (a letter o) with a light middle, and a small light patch that is no detail.
        let (labels, lab) = P.drawn(w, h, 0.7, [(1, 0.1, 10, 10, 20, 20), (2, 0.72, 13, 13, 17, 17), (3, 0.72, 40, 10, 45, 15)])
        let details = Smooth.findDetails(labels, lab, w, h, minSize: 6, maxSize: 200)
        let stage = Smooth.Stage(minSize: 200, limit: 0.02, detailLimit: 0.04)
        let out = Smooth.mergeAreas(labels, lab, w, h, stages: [stage], details: details)
        XCTAssertEqual(out[11 * w + 11], 1)
        XCTAssertEqual(out[12 * w + 42], 0)
        XCTAssertEqual(P.sizes(out, w, h).sorted(), [16, 84, w * h - 100])
        // The middle is nearly the colour of the ground around the letter: it is painted with it.
        XCTAssertEqual(out[15 * w + 15], 0)
        // A middle of another colour (the white of an eye) keeps its own.
        let eye = P.drawn(w, h, 0.7, [(1, 0.1, 10, 10, 20, 20), (2, 0.95, 13, 13, 17, 17)])
        let white = Smooth.mergeAreas(eye.labels, eye.lab, w, h, stages: [stage], details: Smooth.findDetails(eye.labels, eye.lab, w, h, minSize: 6, maxSize: 200))
        XCTAssertEqual(white[15 * w + 15], 2)
        // When the letter is not worth keeping, it goes whole, with its inside.
        var strict = stage
        strict.detailLimit = 5
        XCTAssertEqual(P.sizes(Smooth.mergeAreas(labels, lab, w, h, stages: [strict], details: details), w, h), [w * h])
    }

    func testJoinsInStagesEachOnWhatTheOneBeforeLeft() {
        let w = 120, h = 100
        let rand = P.random(11)
        let labels = (0..<(w * h)).map { _ in Int32((rand() * 6).rounded(.down)) }
        var lab = [Float](repeating: 0, count: w * h * 3)
        for p in 0..<(w * h) { lab[p * 3] = Float(0.3 + Double(labels[p]) * 0.1) }
        let stages = [Smooth.Stage(minSize: 10), Smooth.Stage(minSize: 30, limit: 0.01), Smooth.Stage(minSize: 80, limit: 0.05)]
        var before: Smooth.Areas?
        for n in 1...stages.count {
            let areas = Smooth.findAreas(Smooth.mergeAreas(labels, lab, w, h, stages: Array(stages[0..<n])), w, h)
            if let before {
                // Every area of the stage before lies in one area of this stage.
                var holder = [Int32](repeating: -1, count: before.count)
                var inOne = true
                for p in 0..<(w * h) {
                    let b = Int(before.areaOf[p])
                    if holder[b] == -1 { holder[b] = areas.areaOf[p] }
                    if areas.areaOf[p] != holder[b] { inOne = false }
                }
                XCTAssertTrue(inOne)
                XCTAssertLessThan(areas.count, before.count)
            }
            before = areas
        }
    }

    func testGetsFinerWithEveryStepBelowSimplifyZero() {
        // Texture: blotches of three pixels in many shades of green, which Simplify 0 runs together.
        let w = 160, h = 120, size = 3
        let rand = P.random(11)
        let cols = (w + size - 1) / size
        let blotch = (0..<(cols * ((h + size - 1) / size))).map { _ -> (Double, Double, Double) in let t = rand(); return (50 + 70 * t, 80 + 80 * t, 40 + 30 * rand()) }
        let rgba = P.makeImage(w, h) { x, y in blotch[(y / size) * cols + x / size] }
        var counts: [Int] = []
        for simplify in stride(from: 0, through: Segmenter.finest, by: -1) { counts.append(segment(rgba, w, h, colours: 6, simplify: simplify).regions.count) }
        for i in 1..<counts.count { XCTAssertGreaterThan(counts[i], counts[i - 1]) }
        XCTAssertGreaterThan(counts.last!, counts[0] * 8)
        // Even at the lowest step no area is smaller than a touch of the brush.
        let finest = segment(rgba, w, h, colours: 6, simplify: Segmenter.finest)
        XCTAssertEqual(finest.regions.filter { $0.size < 6 }.count, 0)
        // Geometric areas take a step below 0 as 0.
        XCTAssertGreaterThan(segment(rgba, w, h, colours: 6, simplify: Segmenter.finest, geometric: true).regions.count, 0)
    }

    func testGivesANoisyPictureAFewCalmAreasAndKeepsWhatStandsOut() {
        let w = 120, h = 90
        let rgba = P.noisy(w, h)
        for simplify in [0, 4, 8] {
            let seg = segment(rgba, w, h, colours: 6, simplify: simplify)
            // The pixels are noise, the areas are not: far fewer areas than the noise has grains.
            XCTAssertLessThan(seg.regions.count, 10)
            XCTAssertEqual(seg.regions.filter { $0.size < 6 }.count, 0)
            if simplify == 0 {
                // The dark square is an area of its own, about its size.
                let dark = seg.regions[Int(seg.regionMap[46 * w + 36])]
                XCTAssertGreaterThan(dark.size, 100)
                XCTAssertLessThan(dark.size, 200)
            }
        }
    }

    func testNeverKeepsAnAreaUnderSixPixelsHoweverSmallThePicture() {
        let rand = P.random(9)
        for (w, h) in [(24, 18), (60, 40)] {
            let rgba = P.makeImage(w, h) { _, _ in let r = rand() * 255, g = rand() * 255, b = rand() * 255; return (r, g, b) }
            for simplify in [0, 3] {
                let seg = segment(rgba, w, h, colours: 5, simplify: simplify)
                XCTAssertGreaterThanOrEqual(seg.regions.map(\.size).min()!, 6)
                XCTAssertEqual(seg.regions.reduce(0) { $0 + $1.size }, w * h)
            }
        }
    }

    func testKeepsTheEyesOfAFaceWholeAtSimplifyFourAndNeverHalfOfOne() {
        let w = 160, h = 120
        let rgba = P.face(w, h)
        for simplify in 0...10 {
            let seg = segment(rgba, w, h, colours: 6, simplify: simplify)
            let eyes = P.eyes.map { seg.regions[Int(seg.regionMap[$0.1 * w + $0.0])] }
            // 45 pixels each: an eye is there about whole, or it has gone into the skin around it.
            for eye in eyes { XCTAssertTrue(eye.size > 1000 || (eye.size >= 36 && eye.size <= 60), "simplify \(simplify): \(eye.size)") }
            if simplify <= 4 { for eye in eyes { XCTAssertLessThanOrEqual(eye.size, 60) } }
        }
    }

    func testNeverHasMoreAreasAtAHigherSimplify() {
        let w = 120, h = 90
        let rgba = P.blobs(w, h)
        for focus in [nil, [Details.Box(left: 0.2, top: 0.2, right: 0.6, bottom: 0.7)]] {
            var before = Int.max
            for simplify in 0...10 {
                let areas = segment(rgba, w, h, colours: 8, simplify: simplify, focus: focus).regions.count
                XCTAssertLessThanOrEqual(areas, before)
                before = areas
            }
        }
    }

    func testGivesTheSameAreasEveryTime() {
        let w = 120, h = 90
        let rgba = P.noisy(w, h)
        let box = [Details.Box(left: 0.1, top: 0.1, right: 0.4, bottom: 0.9)]
        let options: [(Bool, [String]?, [Details.Box]?)] = [(false, nil, nil), (false, nil, box), (true, nil, box), (false, ["#c89670", "#5a82b4", "#281e1e"], nil)]
        for (geometric, anchors, focus) in options {
            let a = segment(rgba, w, h, colours: 6, simplify: 2, geometric: geometric, anchors: anchors, focus: focus)
            let b = segment(rgba, w, h, colours: 6, simplify: 2, geometric: geometric, anchors: anchors, focus: focus)
            XCTAssertEqual(a.regionMap, b.regionMap)
            XCTAssertEqual(a.regions.reduce(0) { $0 + $1.size }, w * h)
            XCTAssertGreaterThanOrEqual(a.regions.map(\.size).min()!, 6)
        }
    }

    func testKeepsAFocusBoxAsFineAsSimplifyZero() {
        let w = 160, h = 120
        let rgba = P.face(w, h)
        let box = Details.Box(left: 0.25, top: 0.3, right: 0.75, bottom: 0.7)
        func inBox(_ seg: Segmentation) -> [Int] {
            var ids = Set<Int32>()
            for y in Int((box.top * Double(h)).rounded(.down))..<Int((box.bottom * Double(h)).rounded(.up)) {
                for x in Int((box.left * Double(w)).rounded(.down))..<Int((box.right * Double(w)).rounded(.up)) { ids.insert(seg.regionMap[y * w + x]) }
            }
            return ids.map { seg.regions[Int($0)].size }
        }
        let plain = segment(rgba, w, h, colours: 6, simplify: 0)
        let fine = segment(rgba, w, h, colours: 6, simplify: 0, focus: [box])
        let high = segment(rgba, w, h, colours: 6, simplify: 10)
        let highFine = segment(rgba, w, h, colours: 6, simplify: 10, focus: [box])
        // The eyes are gone at Simplify 10, and there again with the box.
        XCTAssertGreaterThan(high.regions[Int(high.regionMap[60 * w + 60])].size, 1000)
        for (x, y) in P.eyes { XCTAssertLessThanOrEqual(highFine.regions[Int(highFine.regionMap[y * w + x])].size, 60) }
        // No specks from the box: nothing under six pixels, and hardly more small areas than without it.
        for seg in [fine, highFine] {
            XCTAssertGreaterThanOrEqual(inBox(seg).min()!, 6)
            XCTAssertLessThanOrEqual(inBox(seg).filter { $0 < 40 }.count, inBox(plain).filter { $0 < 40 }.count + 2)
            XCTAssertLessThanOrEqual(inBox(seg).count, inBox(plain).count + 4)
        }
        // Outside the box nothing changes.
        func label(_ seg: Segmentation, _ p: Int) -> Int { seg.regions[Int(seg.regionMap[p])].cluster }
        for x in stride(from: 0, to: w, by: 7) { XCTAssertEqual(label(highFine, 5 * w + x), label(high, 5 * w + x)) }
    }

    // MARK: Smooth drawing

    // A map of two labels, 1 where `inside` says so.
    private func shape(_ w: Int, _ h: Int, _ inside: (Int, Int) -> Bool) -> [Int32] {
        (0..<(w * h)).map { inside($0 % w, $0 / w) ? 1 : 0 }
    }

    // The longest level piece of outline in the columns `from` to `to` of a map, in pixels.
    private func longestStep(_ l: [Int32], _ w: Int, _ h: Int, _ from: Int = 1, _ to: Int? = nil) -> Int {
        let to = to ?? w - 1
        var most = 0
        for y in 0..<(h - 1) {
            var run = 0
            for x in from..<to {
                // A level side that goes on from the one before, with no upright side between them.
                let level = l[y * w + x] != l[(y + 1) * w + x]
                let straight = level && l[y * w + x - 1] == l[y * w + x] && l[(y + 1) * w + x - 1] == l[(y + 1) * w + x]
                run = level ? (straight ? run + 1 : 1) : 0
                most = max(most, run)
            }
        }
        return most
    }

    func testDrawsAStaircaseAsTheSlantedLineItStandsFor() {
        let w = 80, h = 40
        // A line that falls one pixel in eight: steps of 8 pixels, 16 when enlarged pixel by pixel.
        let labels = shape(w, h) { x, y in y >= 10 + x / 8 }
        let big = Smooth.upscaleAreas(labels, w, h, scale: 2)
        XCTAssertEqual(big.count, w * 2 * h * 2)
        // Twice as many steps of half the height: 8 enlarged pixels each, away from the ends.
        XCTAssertLessThanOrEqual(longestStep(big, w * 2, h * 2, 24, w * 2 - 24), 9)
        // As many pixels on each side as before, give or take a few at the ends.
        let ones = big.filter { $0 == 1 }.count
        XCTAssertLessThan(abs(ones - 4 * labels.filter { $0 == 1 }.count), 24)
    }

    func testGivesEveryEnlargedPixelTheLabelOfItsPixelOrOfOneBeside() {
        let w = 50, h = 40
        let rand = P.random(8)
        // Blobs of five labels with ragged outlines.
        let labels = (0..<(w * h)).map { p -> Int32 in Int32(Int(((sin(Double(p % w) / 5) + cos(Double(p / w) / 4) + 2 + rand() * 0.6) * 1.2).rounded(.down)) % 5) }
        let big = Smooth.upscaleAreas(labels, w, h, scale: 2)
        var allNear = true
        for y in 0..<(h * 2) {
            for x in 0..<(w * 2) {
                let sx = x >> 1, sy = y >> 1, l = big[y * w * 2 + x]
                let near = [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)].contains { dx, dy in sx + dx >= 0 && sx + dx < w && sy + dy >= 0 && sy + dy < h && labels[(sy + dy) * w + sx + dx] == l }
                if !near { allNear = false }
            }
        }
        XCTAssertTrue(allNear)
        // Every pixel is still there with at least one of its four.
        for p in 0..<(w * h) {
            let o = (p / w) * 2 * w * 2 + (p % w) * 2
            XCTAssertTrue([big[o], big[o + 1], big[o + w * 2], big[o + w * 2 + 1]].contains(labels[p]))
        }
        XCTAssertEqual(Smooth.upscaleAreas(labels, w, h, scale: 2), big)
        // The same drawing as the web app's (reference value from src/lib/smooth.js, scale 3).
        XCTAssertEqual(P.fnv(Smooth.upscaleAreas(labels, w, h, scale: 3)), 609_639_345)
    }

    func testKeepsBoxesThinLinesAndDotsExactly() {
        let w = 60, h = 40
        let labels = shape(w, h) { x, y in
            (x >= 5 && x < 25 && y >= 5 && y < 20) || (y == 30 && x >= 5 && x < 40) || (x == 50 && y >= 5 && y < 30) || (x == 45 && y == 35) || (x >= 30 && x < 32 && y >= 5 && y < 7)
        }
        let big = Smooth.upscaleAreas(labels, w, h, scale: 2)
        var same = true
        for y in 0..<(h * 2) { for x in 0..<(w * 2) where big[y * w * 2 + x] != labels[(y >> 1) * w + (x >> 1)] { same = false } }
        XCTAssertTrue(same)
        let (dx, dy) = Smooth.outlineShifts(labels, w, h)
        XCTAssertTrue(dx.allSatisfy { $0 == 0 } && dy.allSatisfy { $0 == 0 })
    }

    func testMovesNoOutlineByMoreThanHalfAPixel() {
        let w = 40, h = 40
        let labels = (0..<(w * h)).map { p -> Int32 in let x = p % w, y = p / w; return y < 12 + x / 3 ? (x < 20 + y / 4 ? 0 : 1) : 2 }
        let (dx, dy) = Smooth.outlineShifts(labels, w, h)
        var moved = 0
        for c in 0..<dx.count {
            XCTAssertLessThanOrEqual(abs(dx[c]), 0.5)
            XCTAssertLessThanOrEqual(abs(dy[c]), 0.5)
            if dx[c] != 0 || dy[c] != 0 { moved += 1 }
            let x = c % (w + 1), y = c / (w + 1)
            if x == 0 || y == 0 || x == w || y == h { continue }
            let around = Set([labels[(y - 1) * w + x - 1], labels[(y - 1) * w + x], labels[y * w + x - 1], labels[y * w + x]])
            if around.count > 2 { XCTAssertTrue(dx[c] == 0 && dy[c] == 0) }
        }
        XCTAssertGreaterThan(moved, 20)
    }

    func testDrawsAStaircaseOfOneUpAndOneAlongInHalfSteps() {
        let w = 40, h = 40
        let insides: [(Int, Int) -> Bool] = [{ $0 > $1 }, { $0 + $1 > 39 }, { $0 < $1 }, { $0 + $1 < 39 }]
        for inside in insides {
            let labels = shape(w, h, inside)
            let big = Smooth.upscaleAreas(labels, w, h, scale: 2)
            // Enlarged pixel by pixel every step is 2 long; drawn smooth none is longer than 1.
            XCTAssertEqual(longestStep(big, w * 2, h * 2, 8, w * 2 - 8), 1)
            let ones = big.filter { $0 == 1 }.count
            XCTAssertLessThanOrEqual(abs(ones - 4 * labels.filter { $0 == 1 }.count), 2 * w)
        }
    }

    func testLosesNothingInDensePatternsOrAtTheEdge() {
        let w = 48, h = 36
        let rand = P.random(21)
        let maps = [
            shape(w, h) { ($0 + $1) % 2 == 0 }, // single pixels
            shape(w, h) { (($0 >> 1) + ($1 >> 1)) % 2 == 0 }, // squares of 2
            shape(w, h) { (($0 >> 2) + ($1 >> 2)) % 2 == 0 }, // squares of 4
            shape(w, h) { x, _ in x % 2 == 0 }, // lines of one pixel
            shape(w, h) { (($0 + $1) >> 1) % 2 == 0 }, // slanted stripes
            (0..<(w * h)).map { _ in Int32((rand() * 4).rounded(.down)) }, // noise in four labels
            shape(w, h) { x, y in x + y < 6 || x == w - 1 || y == 0 }, // shapes at the edge
        ]
        for labels in maps {
            for scale in [2, 3] {
                let W = w * scale
                let big = Smooth.upscaleAreas(labels, w, h, scale: scale)
                var counts = [0, 0, 0, 0], drawnAs = [0, 0, 0, 0]
                var allNear = true, allOwn = true
                for p in 0..<(w * h) {
                    counts[Int(labels[p])] += scale * scale
                    let x = p % w, y = p / w
                    var own = 0
                    for j in 0..<scale {
                        for i in 0..<scale {
                            let l = big[(y * scale + j) * W + x * scale + i]
                            drawnAs[Int(l)] += 1
                            if l == labels[p] { own += 1 }
                            // The label of the pixel or of one beside it, never from further away.
                            let near = [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)].contains { dx, dy in x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && labels[(y + dy) * w + x + dx] == l }
                            if !near { allNear = false }
                        }
                    }
                    // Every pixel keeps at least one of its enlarged pixels.
                    if own == 0 { allOwn = false }
                }
                XCTAssertTrue(allNear)
                XCTAssertTrue(allOwn)
                // No label gains or loses more than a twentieth of its pixels by the drawing.
                for l in 0..<4 where counts[l] > 0 { XCTAssertLessThanOrEqual(Double(abs(drawnAs[l] - counts[l])), Double(counts[l]) * 0.05) }
            }
        }
    }

    func testEnlargesByAnyWholeNumberAndByOneNotAtAll() {
        let w = 30, h = 20
        let labels = shape(w, h) { x, y in y >= 4 + x / 3 }
        XCTAssertEqual(Smooth.upscaleAreas(labels, w, h, scale: 1), labels)
        let big = Smooth.upscaleAreas(labels, w, h, scale: 3)
        XCTAssertEqual(big.count, w * 3 * h * 3)
        XCTAssertLessThan(longestStep(big, w * 3, h * 3), 9)
    }
}
