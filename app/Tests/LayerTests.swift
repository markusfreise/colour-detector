import ImageIO
import XCTest
@testable import Watercolourlove

/// Layer mode against the web app: every reference value below was computed by src/lib/layers.js
/// (in Node) on the same colours and the same pictures, so both implementations stay in step.
final class LayerTests: XCTestCase {
    private let yellow = MixPaint(id: "y", hex: "#fae409")
    private let blue = MixPaint(id: "b", hex: "#2b61ab")
    private let red = MixPaint(id: "r", hex: "#e6331d")
    private let black = MixPaint(id: "k", hex: "#706c63")

    // MARK: Helpers

    private struct StockPaint: Decodable {
        let id: String
        let hex: String
        let enabled: Bool?
    }

    /// The default paint box of the app: the enabled paints of the bundled stock, in its order.
    private func stock() throws -> [MixPaint] {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "paints", withExtension: "json"))
        return try JSONDecoder().decode([StockPaint].self, from: Data(contentsOf: url)).filter { $0.enabled == true }.map { MixPaint(id: $0.id, hex: $0.hex) }
    }

    /// A picture both sides build from the same whole-number formula: sky and ground as gradients, a
    /// red disc, a small yellow square, dark stripes, a thin turquoise line, a patch of white paper
    /// with grey specks, and a little noise from the shared random generator on everything.
    private func scene(_ w: Int, _ h: Int) -> [UInt8] {
        var random = Segmenter.Mulberry32(seed: 11)
        var rgba = [UInt8](repeating: 255, count: w * h * 4)
        let hy = h * 45 / 100
        for y in 0..<h {
            for x in 0..<w {
                var r: Int, g: Int, b: Int
                if y < hy {
                    r = 120 + 100 * y / hy; g = 170 + 60 * y / hy; b = 235 - 20 * y / hy
                } else {
                    let t = y - hy, n = h - hy
                    r = 70 + 90 * t / n + 40 * x / w; g = 110 - 50 * t / n + 30 * x / w; b = 40 + 20 * t / n
                }
                let dx = x - w * 7 / 10, dy = y - h * 3 / 10, rad = min(w, h) / 8
                if dx * dx + dy * dy < rad * rad { r = 215; g = 50; b = 40 }
                if x >= w / 5 && x < w / 5 + w / 20 && y >= h * 6 / 10 && y < h * 6 / 10 + h / 15 { r = 245; g = 215; b = 30 }
                if y > h * 8 / 10 && (x / max(1, w / 40)) % 4 == 0 { r = 30; g = 28; b = 35 }
                if abs(y - h / 2 - x / 8) <= 1 && x * 2 > w { r = 20; g = 170; b = 170 }
                let speck = random.next()
                if x < w / 4 && y < h / 4 { r = speck < 0.1 ? 120 : 250; g = r; b = r }
                let i = (y * w + x) * 4
                rgba[i] = UInt8(max(0, min(255, r + Int(random.next() * 13) - 6)))
                rgba[i + 1] = UInt8(max(0, min(255, g + Int(random.next() * 13) - 6)))
                rgba[i + 2] = UInt8(max(0, min(255, b + Int(random.next() * 13) - 6)))
            }
        }
        return rgba
    }

    private func picture(_ width: Int, _ height: Int, _ colour: (Int, Int) -> (UInt8, UInt8, UInt8)) -> [UInt8] {
        var rgba = [UInt8](repeating: 255, count: width * height * 4)
        for p in 0..<(width * height) {
            let c = colour(p % width, p / width)
            rgba[p * 4] = c.0; rgba[p * 4 + 1] = c.1; rgba[p * 4 + 2] = c.2
        }
        return rgba
    }

    /// A bundled sample photo as it is in the file, every 4 x 4 pixels averaged in whole numbers.
    /// Scaled by the system it would not be the picture the web app sees: every scaler has its own
    /// filter. Nil when this system's decoder gives other pixels than the reference was made from.
    private func sample(_ name: String, fullHash: String) throws -> (rgba: [UInt8], width: Int, height: Int)? {
        let url = try XCTUnwrap(Bundle.main.url(forResource: name, withExtension: "webp"))
        let source = try XCTUnwrap(CGImageSourceCreateWithURL(url as CFURL, nil))
        let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
        let fullWidth = image.width, fullHeight = image.height
        var full = [UInt8](repeating: 255, count: fullWidth * fullHeight * 4)
        let drawn = full.withUnsafeMutableBytes { buffer -> Bool in
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let context = CGContext(data: buffer.baseAddress, width: fullWidth, height: fullHeight, bitsPerComponent: 8, bytesPerRow: fullWidth * 4, space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: fullWidth, height: fullHeight))
            return true
        }
        XCTAssertTrue(drawn)
        if hash(full) != fullHash { return nil }
        let width = fullWidth / 4, height = fullHeight / 4
        var rgba = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                for c in 0..<3 {
                    var sum = 0
                    for dy in 0..<4 {
                        for dx in 0..<4 { sum += Int(full[((y * 4 + dy) * fullWidth + x * 4 + dx) * 4 + c]) }
                    }
                    rgba[(y * width + x) * 4 + c] = UInt8((sum + 8) / 16)
                }
            }
        }
        return (rgba, width, height)
    }

    /// FNV-1a over whole numbers (both halves of 32 bits), to compare maps without listing them.
    private func hash<S: Sequence>(_ values: S) -> String where S.Element: BinaryInteger {
        var h: UInt32 = 2_166_136_261
        for value in values {
            let v = UInt32(truncatingIfNeeded: Int(value))
            h ^= v & 0xffff; h = h &* 16_777_619; h ^= (v >> 16) & 0xffff; h = h &* 16_777_619
        }
        return String(h)
    }

    private func assertClose(_ found: [Double], _ expected: [Double], accuracy: Double = 1e-9, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(found.count, expected.count, what, file: file, line: line)
        for (i, pair) in zip(found, expected).enumerated() {
            XCTAssertEqual(pair.0, pair.1, accuracy: accuracy * max(1, abs(pair.1)), "\(what) [\(i)]", file: file, line: line)
        }
    }

    /// What the web app's `layerImage` gives for a picture.
    private struct Reference {
        let paintIDs: [String]
        /// Per layer: kind, role, paint, coats, and the colour of 0...maxCoats coats on white paper.
        let layers: [String]
        let strengths: [Double]
        let ratios: [Double]
        let guides: [String]
        /// Per layer the hash of its coats per pixel.
        let coatMaps: [String]
        /// Per layer the number of its areas and the hash of their coats, sizes and label anchors.
        let regions: [String]
        /// Per layer: with, without, areaWith, areaWithout.
        let buys: [Double]
        /// Per step: layer, kind, paint, coat, colour, shapes.
        let steps: [String]
        let shares: [Double]
        let comboCount: Int
        /// Hash of the coats and then the pixel counts of all combinations.
        let combos: String
        let comboMap: String
        /// Hash of the picture with all layers, and with every third layer cut to one coat and every third off.
        let render: String
        let renderPart: String
        let area: Double
        /// mean, p95, rough.
        let deltaE: [Double]
    }

    private func check(_ plan: LayerPlan, _ expected: Reference, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(plan.paintIDs, expected.paintIDs, file: file, line: line)
        XCTAssertEqual(plan.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top) \($0.hexes.joined(separator: " "))" }, expected.layers, file: file, line: line)
        XCTAssertEqual(plan.layers.map(\.index), Array(plan.layers.indices), file: file, line: line)
        assertClose(plan.layers.map(\.strength), expected.strengths, "strength", file: file, line: line)
        assertClose(plan.layers.map(\.ratio), expected.ratios, "ratio", file: file, line: line)
        XCTAssertEqual(plan.layers.map(\.guide), expected.guides, file: file, line: line)
        XCTAssertEqual(plan.layers.map { hash($0.coatMap) }, expected.coatMaps, file: file, line: line)
        XCTAssertEqual(plan.layers.map { layer in
            "\(layer.regions.count) " + hash(layer.regions.flatMap { [$0.id, $0.coats, $0.size, $0.anchorX, $0.anchorY, Int((Double($0.anchorDist) * 1000 + 0.5).rounded(.down))] })
        }, expected.regions, file: file, line: line)
        assertClose(plan.layers.compactMap(\.buys).flatMap { [$0.with, $0.without, $0.areaWith, $0.areaWithout] }, expected.buys, "buys", file: file, line: line)
        XCTAssertEqual(plan.steps.map { "\($0.layer) \($0.kind.rawValue) \($0.paintID) \($0.coat) \($0.hex) \($0.shapes)" }, expected.steps, file: file, line: line)
        assertClose(plan.steps.map(\.share), expected.shares, "share", file: file, line: line)
        XCTAssertEqual(plan.combos.count, expected.comboCount, file: file, line: line)
        XCTAssertEqual(hash(plan.combos.flatMap(\.coats) + plan.combos.map(\.pixelCount)), expected.combos, file: file, line: line)
        XCTAssertEqual(hash(plan.comboMap), expected.comboMap, file: file, line: line)
        XCTAssertEqual(hash(Layers.renderLayers(plan)), expected.render, file: file, line: line)
        let part = plan.layers.indices.map { $0 % 3 == 0 ? 1 : $0 % 3 == 1 ? Int.max : 0 }
        XCTAssertEqual(hash(Layers.renderLayers(plan, coats: part)), expected.renderPart, file: file, line: line)
        XCTAssertEqual(plan.work.steps, expected.steps.count, file: file, line: line)
        XCTAssertEqual(plan.work.area, expected.area, accuracy: 1e-9, file: file, line: line)
        assertClose([plan.deltaE.mean, plan.deltaE.p95, plan.deltaE.rough], expected.deltaE, "deltaE", file: file, line: line)
        consistent(plan, file: file, line: line)
    }

    /// What holds for every plan, whatever the picture.
    private func consistent(_ plan: LayerPlan, file: StaticString = #filePath, line: UInt = #line) {
        let pixels = plan.width * plan.height
        XCTAssertEqual(plan.comboMap.count, pixels, file: file, line: line)
        XCTAssertTrue(plan.comboMap.allSatisfy { Int($0) < plan.combos.count }, file: file, line: line)
        XCTAssertEqual(plan.combos.reduce(0) { $0 + $1.pixelCount }, pixels, file: file, line: line)
        for layer in plan.layers {
            XCTAssertEqual(layer.coatMap.count, pixels, file: file, line: line)
            XCTAssertEqual(layer.regionMap.count, pixels, file: file, line: line)
            XCTAssertEqual(layer.coats.count, plan.maxCoats, file: file, line: line)
            XCTAssertEqual(layer.washes.count, plan.maxCoats, file: file, line: line)
            XCTAssertEqual(layer.filters.count, (plan.maxCoats + 1) * 3, file: file, line: line)
            XCTAssertLessThanOrEqual(Int(layer.coatMap.max() ?? 0), layer.top, file: file, line: line)
            XCTAssertEqual(layer.regions.reduce(0) { $0 + $1.size }, pixels, file: file, line: line)
            XCTAssertTrue(layer.regions.allSatisfy { $0.anchorX >= 0 && $0.anchorX < plan.width && $0.anchorY >= 0 && $0.anchorY < plan.height }, file: file, line: line)
        }
        XCTAssertTrue(plan.steps.allSatisfy { $0.share > 0 }, file: file, line: line)
        XCTAssertTrue([plan.deltaE.mean, plan.deltaE.p95, plan.deltaE.rough].allSatisfy(\.isFinite), file: file, line: line)
        XCTAssertEqual(Layers.renderLayers(plan).count, pixels * 4, file: file, line: line)
    }

    // MARK: Coats and washes

    func testConstants() {
        XCTAssertEqual(Layers.maxCoats, 3)
        XCTAssertEqual(Layers.maxLayers, 7)
        XCTAssertEqual(Layers.accents, 2)
        XCTAssertEqual(Layers.referenceWater, 1)
    }

    func testCoatsAddUpToTheLimitOfThePaint() {
        assertClose([Layers.coatAmount(0, 0.3), Layers.coatAmount(1, 0.3), Layers.coatAmount(3, 0.3), Layers.coatAmount(3, 0.3, ratio: 1.7), Layers.coatAmount(2, 0.5, ratio: 3), Layers.coatAmount(4, 0.1, ratio: 1.0000001)],
                    [0, 0.3, 0.8999999999999999, 1.6769999999999996, 2, 0.4], accuracy: 1e-12, "amount")
        assertClose([Layers.coatDepth(1, 0.3, limit: 1.6), Layers.coatDepth(3, 0.3, limit: 1.6), Layers.coatDepth(3, 0.3, limit: 4), Layers.coatDepth(3, 0.4, limit: 1.9, ratio: 1.7), Layers.coatDepth(0, 1, limit: 1.6)],
                    // The fourth is more paint than its swatch: it stops at the swatch, depth 1.
                    [0.40785422772604324, 0.9381674485467582, 0.9124419731057181, 0.9999999999999999, 0], accuracy: 1e-12, "depth")
    }

    func testSaysHowToPrepareAWash() {
        let clear = Layers.washGuide(0)
        XCTAssertEqual(clear.water, .infinity)
        XCTAssertEqual(clear.consistency, "water")
        XCTAssertEqual(clear.guide, "clear water")
        let expected: [(strength: Double, water: Double, consistency: String, parts: String)] = [
            // Strength 1 is the paint as its swatch shows it: hardly thinned.
            (0.02, 50, "tea", "50 parts water"), (0.05, 20, "tea", "20 parts water"), (0.07, 15, "coffee", "15 parts water"), (0.13, 8, "coffee", "8 parts water"),
            (0.19, 5, "milk", "5 parts water"), (0.2, 5, "milk", "5 parts water"), (0.21, 5, "milk", "5 parts water"), (0.3, 3, "milk", "3 parts water"),
            (0.41, 2.5, "cream", "2.5 parts water"), (0.5, 2, "cream", "2 parts water"), (0.55, 2, "cream", "2 parts water"), (0.8, 1.5, "cream", "1.5 parts water"),
            (1, 1, "butter", "1 part water"), (1.2, 1, "butter", "1 part water"), (1.5, 0.5, "butter", "hardly any water"), (1.7, 0.5, "butter", "hardly any water"),
            (2, 0.5, "butter", "hardly any water"), (2.9, 0.5, "butter", "hardly any water"), (3.2, 0.5, "butter", "hardly any water"), (4, 0.5, "butter", "hardly any water"),
            (6, 0, "butter", "hardly any water"), (10, 0, "butter", "hardly any water"), (20, 0, "butter", "hardly any water"),
        ]
        for row in expected {
            let guide = Layers.washGuide(row.strength)
            XCTAssertEqual(guide.water, row.water, "strength \(row.strength)")
            XCTAssertEqual(guide.consistency, row.consistency, "strength \(row.strength)")
            XCTAssertEqual(guide.guide, "1 part paint to \(row.parts), like \(row.consistency)")
        }
    }

    func testColourSet() {
        let set = Layers.colourSet([(hex: "#fae409", weight: 3), (hex: "#2b61ab", weight: 1), (hex: "#fff", weight: 1), (hex: "#000000", weight: 0.5)])
        assertClose(set.points, [0.9083627400483955, -0.04042313699040828, 0.18511212309363634, 0.4955955227659272, -0.029315587079380867, -0.1281346171930634, 0.9999999934735462, 8.095285553011422e-11, 3.727390762708893e-08, 0, 0, 0], accuracy: 1e-12, "points")
        XCTAssertEqual(set.counts, [3, 1, 1, 0.5])
        XCTAssertEqual(Layers.colourSet(["#fae409", "#2b61ab"]).counts, [1, 1])
    }

    // MARK: Fitting layers to colours

    func testFindsTheWashAndCountsTheCoatsOfASinglePaint() throws {
        let fit = Layers.fit(colours: Layers.colourSet(["#87b2db", "#5f95cb", "#4a82bf"]), paints: [blue])
        XCTAssertEqual(fit.layers.count, 1)
        let layer = try XCTUnwrap(fit.layers.first)
        XCTAssertEqual(layer.paintID, "b")
        XCTAssertEqual(layer.kind, .wash)
        XCTAssertNil(layer.role)
        XCTAssertEqual(layer.top, 3)
        XCTAssertEqual(layer.strength, 0.2547317212630066, accuracy: 1e-9)
        XCTAssertEqual(layer.ratio, 1)
        XCTAssertEqual(layer.dilution, "medium")
        XCTAssertEqual(layer.guide, "1 part paint to 4 parts water, like milk")
        XCTAssertEqual(layer.hexes, ["#ffffff", "#c9d7ea", "#93afd4", "#5d86bf"])
        assertClose(layer.depths, [0, 0.3295006361588009, 0.6017646507305562, 0.8267344550225383], "depths")
        XCTAssertEqual(layer.washes.map(\.strength), [layer.strength, layer.strength, layer.strength])
        XCTAssertEqual(fit.coats, [[2], [3], [3]])
        XCTAssertEqual(fit.hexes, ["#93afd4", "#5d86bf", "#5d86bf"])
        assertClose(fit.deltaE, [1.66315443420509, 4.16579109780773, 2.4671640271902295], "deltaE")
        XCTAssertEqual(fit.error, 2.7653698530676833, accuracy: 1e-9)
    }

    private let mixed: [(hex: String, weight: Double)] = [("#fae409", 3), ("#2b61ab", 2), ("#5a9a50", 4), ("#e6331d", 1), ("#f08a20", 2), ("#7a3a80", 1), ("#ffffff", 5), ("#303030", 1)]

    func testFitsWashesAnAccentAndAnUnusedPaint() {
        let fit = Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black])
        XCTAssertEqual(fit.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top)" }, ["wash - y 2", "wash - r 1", "wash - b 2", "accent colour r 1", "wash - k 0"])
        assertClose(fit.layers.map(\.strength), [0.6714433541476684, 0.5164247858550346, 0.6347172697261365, 0.6, 0], "strength")
        XCTAssertEqual(fit.layers.map(\.guide), ["1 part paint to 1.5 parts water, like cream", "1 part paint to 2 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "clear water"])
        XCTAssertEqual(fit.layers.map(\.hexes), [
            ["#ffffff", "#fced5a", "#fae409", "#fae409"], ["#ffffff", "#f2968a", "#f2968a", "#f2968a"], ["#ffffff", "#789bca", "#2b61ab", "#2b61ab"],
            ["#ffffff", "#f08577", "#f08577", "#f08577"], ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        ])
        // Two coats of the blue reach its swatch: depth 1, never more.
        assertClose(fit.layers[2].depths, [0, 0.7177472680344829, 1, 1], "depths")
        // The accent is of the red that is a wash too: it only adds what is left up to the limit of the paint.
        assertClose(fit.layers[3].depths, [0, 0.36413793577771914, 0.36413793577771914, 0.36413793577771914], "depths")
        XCTAssertEqual(fit.coats, [[2, 0, 0, 0, 0], [0, 0, 2, 0, 0], [1, 0, 1, 0, 0], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 0, 0], [1, 1, 2, 0, 0]])
        XCTAssertEqual(fit.hexes, ["#fae409", "#2b61ab", "#778f45", "#e6331d", "#ef8b2d", "#72596c", "#ffffff", "#28311a"])
        assertClose(fit.deltaE, [0, 0, 3.9995128866364507, 0, 0.6043696896388387, 9.381511373110058, 0, 4.2136695170723355], accuracy: 1e-7, "deltaE")
        XCTAssertEqual(fit.error, 1.6211564113687302, accuracy: 1e-9)
    }

    func testGradesTheCoatsOnlyWhenAskedTo() {
        // As in the web test: a very light and a deep blue (glazes of 0.08, 0.4 and 2 of the blue),
        // which one wash painted up to three times cannot do both well. Since water thins a paint
        // like opacity, the mixed colours above come out the same graded or not.
        let colours = Layers.colourSet(["#eef2f8", "#aac0dd", "#2b61ab"])
        let even = Layers.fit(colours: colours, paints: [blue], accents: 0)
        XCTAssertEqual(even.layers[0].ratio, 1)
        XCTAssertEqual(even.layers[0].washes.map(\.strength), [0.4, 0.4, 0.4])
        XCTAssertEqual(even.error, 1.404340782666911, accuracy: 1e-9)
        let fit = Layers.fit(colours: colours, paints: [blue], graded: true, accents: 0)
        XCTAssertEqual(fit.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top)" }, ["wash - b 3"])
        XCTAssertEqual(fit.layers[0].strength, 0.0921143464644889, accuracy: 1e-9)
        XCTAssertEqual(fit.layers[0].ratio, 3.294855420923478, accuracy: 1e-9)
        // Every coat of a graded layer is a stronger wash than the one before, the third as strong as the paint goes.
        assertClose(fit.layers[0].washes.map(\.strength), [0.0921143464644889, 0.3035034537933447, 1], "washes")
        XCTAssertEqual(fit.layers[0].hexes, ["#ffffff", "#ebf0f7", "#abc0de", "#2b61ab"])
        XCTAssertEqual(fit.coats, [[1], [2], [3]])
        XCTAssertEqual(fit.hexes, ["#ebf0f7", "#abc0de", "#2b61ab"])
        assertClose(Array(fit.deltaE.prefix(2)), [0.5385330386411741, 0.222197882349868], "deltaE")
        XCTAssertEqual(fit.deltaE[2], 0, accuracy: 1e-7)
        XCTAssertEqual(fit.error, 0.2535769736636807, accuracy: 1e-9)
        XCTAssertLessThan(fit.error, even.error - 1)
        XCTAssertTrue(Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black]).layers.allSatisfy { $0.ratio == 1 })
    }

    func testProposesPaintsFromTheStock() throws {
        let hexes = ["#a88b4c", "#715611", "#634908", "#392620", "#bb3405", "#7a7d08", "#3e3d34", "#3f3815", "#c14b03", "#772411", "#465d1e", "#464d0d"]
        let colours = Layers.colourSet(hexes.enumerated().map { (hex: $1, weight: Double(100 + $0 * 50)) })
        let paints = try stock()
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints), ["schmincke-horadam-526", "schmincke-horadam-498", "schmincke-horadam-659", "schmincke-horadam-346"])
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints, count: 3, accents: 0), ["schmincke-horadam-526", "schmincke-horadam-655", "schmincke-horadam-218"])
    }

    func testEmptyResultsForNoColoursOrNoPaints() {
        let none = Layers.colourSet([String]())
        XCTAssertEqual(Layers.proposePaints(colours: none, paints: [blue]), [])
        let empty = Layers.fit(colours: none, paints: [blue])
        XCTAssertTrue(empty.coats.isEmpty && empty.hexes.isEmpty && empty.deltaE.isEmpty)
        XCTAssertEqual(empty.error, 0)
        let fit = Layers.fit(colours: Layers.colourSet(["#336699"]), paints: [])
        XCTAssertTrue(fit.layers.isEmpty)
        XCTAssertEqual(fit.coats, [[]])
        XCTAssertEqual(fit.hexes, ["#ffffff"])
    }

    func testShowsPartOfTheCoatsOfALayer() {
        // Three depths of one blue: a layer with three coats.
        let fit = Layers.fit(colours: Layers.colourSet(["#b9cde6", "#84a4d0", "#5f86be"]), paints: [blue], maxCoats: 3, accents: 0)
        XCTAssertEqual(fit.layers[0].top, 3)
        let combos = [LayerPlan.Combo(coats: [3], hex: "", pixelCount: 0)]
        let all = Layers.compositeColours(layers: fit.layers, combos: combos)
        let one = Layers.compositeColours(layers: fit.layers, combos: combos, coats: [1])
        XCTAssertEqual(all, [87, 130, 188])
        XCTAssertEqual(one, [199, 213, 233])
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: [0]), [255, 255, 255])
        // A layer `coats` does not mention is off.
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: []), [255, 255, 255])
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: [9]), all)
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: [.max]), all)
    }

    // MARK: Layers of a picture

    private static let sceneGiven = Reference(
        paintIDs: ["y", "r", "b", "k"],
        layers: ["wash - y 1 #ffffff #fbec52 #fbec52 #fbec52", "wash - r 2 #ffffff #f5afa6 #eb5f4e #eb5f4e", "wash - b 3 #ffffff #c9d7ea #93afd4 #5d86bf", "accent any b 1 #ffffff #d2dded #d2dded #d2dded", "accent colour r 1 #ffffff #f9ccc7 #f9ccc7 #f9ccc7", "wash - k 0 #ffffff #ffffff #ffffff #ffffff"],
        strengths: [0.7015987978865738, 0.3925698750991109, 0.2547317212630066, 0.21383633182685566, 0.25, 0],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 1.5 parts water, like cream", "1 part paint to 2.5 parts water, like cream", "1 part paint to 4 parts water, like milk", "1 part paint to 5 parts water, like milk", "1 part paint to 4 parts water, like milk", "clear water"],
        coatMaps: ["4071626068", "2056567757", "696145574", "255141909", "1213797829", "1213797829"],
        regions: ["4 3215604929", "10 558654709", "30 1390978789", "19 1334404890", "1 2176614741", "1 2176614741"],
        buys: [4.9199569706760355, 8.786640235055108, 5.112921386795978, 14.826426381703516, 4.9199569706760355, 12.745908186794656, 4.9147916145410875, 23.040034479375425, 4.9199569706760355, 21.850047827518413, 4.879312181005764, 22.827395911963485, 4.9199569706760355, 5.439867930060609, 4.478452306579418, 14.24585976272797, 4.9199569706760355, 4.9199569706760355, 0, 0, 4.9199569706760355, 4.9199569706760355, 0, 0],
        steps: ["0 wash y 1 #fbec52 2", "1 wash r 1 #f5afa6 5", "1 wash r 2 #eb5f4e 2", "2 wash b 1 #c9d7ea 1", "2 wash b 2 #93afd4 2", "2 wash b 3 #5d86bf 12", "3 accent b 1 #d2dded 17"],
        shares: [0.39807291666666667, 0.4317708333333333, 0.2165625, 0.94328125, 0.6375520833333334, 0.24546875, 0.05322916666666667],
        comboCount: 23,
        combos: "69893973",
        comboMap: "4031614372",
        render: "3781598500",
        renderPart: "2990986851",
        area: 2.9259375000000003,
        deltaE: [4.9199569706760355, 9.268444061279297, 0.047135416666666666]
    )

    private static let sceneProposal = Reference(
        paintIDs: ["schmincke-horadam-208", "schmincke-horadam-496", "schmincke-horadam-509", "schmincke-horadam-353", "schmincke-horadam-365", "schmincke-horadam-472"],
        layers: ["wash - schmincke-horadam-208 1 #ffffff #fcee63 #fcee63 #fcee63", "wash - schmincke-horadam-496 2 #ffffff #dce5f1 #b9cbe3 #b9cbe3", "wash - schmincke-horadam-509 2 #ffffff #b1e4e9 #63cad3 #63cad3", "wash - schmincke-horadam-353 2 #ffffff #f09bb2 #e54e77 #e54e77", "accent colour schmincke-horadam-365 1 #ffffff #e83f2b #e83f2b #e83f2b", "accent dark schmincke-horadam-472 1 #ffffff #852677 #852677 #852677"],
        strengths: [0.6347172697261364, 0.16611391953309204, 0.30726510767451215, 0.5671816683912356, 0.9394130628134758, 1],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 1.5 parts water, like cream", "1 part paint to 6 parts water, like milk", "1 part paint to 3 parts water, like milk", "1 part paint to 2 parts water, like cream", "1 part paint to 1 part water, like butter", "1 part paint to 1 part water, like butter"],
        coatMaps: ["2905973397", "3191118012", "209787518", "3118357972", "2841730909", "871958837"],
        regions: ["20 3307329680", "51 1580140236", "23 2403753193", "49 3669216333", "22 2023602389", "19 2751151562"],
        buys: [4.740740780438651, 9.18291257522555, 4.532609040582674, 13.18267987830158, 4.740740780438651, 9.538752360828681, 5.027037828223515, 11.990664885710045, 4.740740780438651, 11.678594185827588, 4.696883116987997, 14.670436979182258, 4.740740780438651, 14.310246923927368, 4.337835019008853, 21.858052236037956, 4.740740780438651, 5.5138192170246265, 2.702621495670656, 21.25650397373403, 4.740740780438651, 5.132873072335478, 8.006456866953533, 17.512694246270513],
        steps: ["0 wash schmincke-horadam-208 1 #fcee63 2", "1 wash schmincke-horadam-496 1 #dce5f1 10", "1 wash schmincke-horadam-496 2 #b9cbe3 14", "2 wash schmincke-horadam-509 1 #b1e4e9 5", "2 wash schmincke-horadam-509 2 #63cad3 11", "3 wash schmincke-horadam-353 1 #f09bb2 2", "3 wash schmincke-horadam-353 2 #e54e77 30", "4 accent schmincke-horadam-365 1 #e83f2b 20", "5 accent schmincke-horadam-472 1 #852677 17"],
        shares: [0.5135416666666667, 0.6890104166666666, 0.41020833333333334, 0.695625, 0.20744791666666668, 0.5461979166666666, 0.15979166666666667, 0.041666666666666664, 0.04125],
        comboCount: 39,
        combos: "3930929483",
        comboMap: "1606591205",
        render: "2090837348",
        renderPart: "2384709981",
        area: 3.3047395833333333,
        deltaE: [4.740740780438651, 11.186729431152344, 0.0615625]
    )

    private static let sceneCoarse = Reference(
        paintIDs: ["schmincke-horadam-480", "schmincke-horadam-360", "schmincke-horadam-525", "schmincke-horadam-365", "schmincke-horadam-645"],
        layers: ["wash - schmincke-horadam-480 2 #ffffff #c8ddef #91bbde", "wash - schmincke-horadam-360 1 #ffffff #f29576 #f29576", "wash - schmincke-horadam-525 2 #ffffff #afb384 #757b2a", "accent colour schmincke-horadam-365 1 #ffffff #e73924 #e73924", "accent dark schmincke-horadam-645 1 #ffffff #7a3e3b #7a3e3b"],
        strengths: [0.2694710377211579, 0.7562422245216477, 0.5779166506324931, 0.9692332344763441, 1],
        ratios: [1, 1, 1, 1, 1],
        guides: ["1 part paint to 4 parts water, like milk", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1 part water, like butter", "1 part paint to 1 part water, like butter"],
        coatMaps: ["3574251046", "1701723389", "62457885", "2288269037", "1159309733"],
        regions: ["26 3242072994", "10 2628014984", "5 2620726792", "12 220823321", "11 1084351786"],
        buys: [4.739721224485589, 10.855477786600073, 4.566376553249659, 14.010101942555654, 4.739721224485589, 8.990058320256125, 4.4225286808728095, 17.372976870301585, 4.739721224485589, 16.77425545967975, 5.173929557358627, 26.381402951145187, 4.739721224485589, 5.307812478252945, 6.440203865530851, 13.373783040885073, 4.739721224485589, 5.364793405763894, 9.315372892283317, 22.247900780800013],
        steps: ["0 wash schmincke-horadam-480 1 #c8ddef 5", "0 wash schmincke-horadam-480 2 #91bbde 8", "1 wash schmincke-horadam-360 1 #f29576 2", "2 wash schmincke-horadam-525 1 #afb384 1", "2 wash schmincke-horadam-525 2 #757b2a 1", "3 accent schmincke-horadam-365 1 #e73924 11", "4 accent schmincke-horadam-645 1 #7a3e3b 10"],
        shares: [0.6476, 0.20083333333333334, 0.3282, 0.5674666666666667, 0.19726666666666667, 0.08193333333333333, 0.04833333333333333],
        comboCount: 20,
        combos: "417814752",
        comboMap: "1975765714",
        render: "911188338",
        renderPart: "1704147571",
        area: 2.071633333333333,
        deltaE: [4.739721224485589, 11.895895004272461, 0.07256666666666667]
    )

    private static let sceneGraded = Reference(
        paintIDs: ["y", "r", "b", "k"],
        layers: ["wash - y 1 #ffffff #fcee63 #fcee63 #fcee63 #fcee63", "wash - r 2 #ffffff #f5aaa1 #ea5643 #ea5643 #ea5643", "wash - b 2 #ffffff #b9cbe3 #4776b6 #4776b6 #4776b6", "wash - k 2 #ffffff #e0dfdd #c1c0bc #c1c0bc #c1c0bc", "accent any b 1 #ffffff #cad8ea #cad8ea #cad8ea #cad8ea"],
        strengths: [0.6347172697261365, 0.41528479883273006, 0.3300977832152303, 0.21517699410626445, 0.25],
        ratios: [1, 1, 1.6282405261455102, 1, 1],
        guides: ["1 part paint to 1.5 parts water, like cream", "1 part paint to 2.5 parts water, like cream", "1 part paint to 3 parts water, like milk", "1 part paint to 5 parts water, like milk", "1 part paint to 4 parts water, like milk"],
        coatMaps: ["202091541", "1001934271", "4250503791", "2826011149", "1464574780"],
        regions: ["4 2162465384", "4 1190749788", "18 633447116", "23 379068060", "27 880114503"],
        buys: [4.596273549405782, 8.221294849729441, 4.283205357667, 12.598666405004408, 4.596273549405782, 12.285334924296116, 4.001653575426087, 22.935856268499585, 4.596273549405782, 15.996053172899565, 4.273475020558081, 18.544569026627094, 4.596273549405782, 8.12045772298351, 4.982094385035449, 10.496710206770706, 4.596273549405782, 5.391310593743912, 3.6977879484232936, 12.22079813898279],
        steps: ["0 wash y 1 #fcee63 2", "1 wash r 1 #f5aaa1 2", "1 wash r 2 #ea5643 2", "2 wash b 1 #b9cbe3 2", "2 wash b 2 #4776b6 11", "3 wash k 1 #e0dfdd 2", "3 wash k 2 #c1c0bc 7", "4 accent b 1 #cad8ea 24"],
        shares: [0.4359375, 0.40609375, 0.18078125, 0.7988020833333334, 0.11119791666666666, 0.6390625, 0.22604166666666667, 0.09328125],
        comboCount: 35,
        combos: "1473530292",
        comboMap: "442567225",
        render: "1928854838",
        renderPart: "515117332",
        area: 2.8911979166666666,
        deltaE: [4.596273549405782, 8.73929214477539, 0.03473958333333333]
    )

    private static let sceneUnused = Reference(
        paintIDs: ["schmincke-horadam-347", "schmincke-horadam-208"],
        layers: ["wash - schmincke-horadam-347 3 #ffffff #f5c5c3 #eb8b87 #e2544d", "accent any schmincke-horadam-347 1 #ffffff #f8d4d3 #f8d4d3 #f8d4d3", "accent colour schmincke-horadam-208 1 #ffffff #fae409 #fae409 #fae409"],
        strengths: [0.3378880228019934, 0.25, 1],
        ratios: [1, 1, 1],
        guides: ["1 part paint to 3 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 1 part water, like butter"],
        coatMaps: ["1084253614", "3309584709", "696405316"],
        regions: ["8 1499550706", "1 2228538357", "9 2292651897"],
        buys: [16.09045873003955, 35.65776290159438, 16.760999409444352, 37.49354969422728, 16.09045873003955, 16.09045873003955, 0, 0, 16.09045873003955, 16.38157937843702, 18.953912843298717, 24.255941515630344],
        steps: ["0 wash schmincke-horadam-347 1 #f5c5c3 2", "0 wash schmincke-horadam-347 2 #eb8b87 1", "0 wash schmincke-horadam-347 3 #e2544d 2", "2 accent schmincke-horadam-208 1 #fae409 7"],
        shares: [0.9437962962962962, 0.5886111111111111, 0.5178703703703704, 0.054907407407407405],
        comboCount: 6,
        combos: "3677656951",
        comboMap: "2767669776",
        render: "2075360143",
        renderPart: "976872585",
        area: 2.105185185185185,
        deltaE: [16.09045873003955, 41.91835021972656, 0.7187962962962963]
    )

    private static let cwm = Reference(
        paintIDs: ["schmincke-horadam-494", "schmincke-horadam-663", "schmincke-horadam-662", "schmincke-horadam-515"],
        layers: ["wash - schmincke-horadam-494 2 #ffffff #f3f4f9 #e7eaf3 #e7eaf3", "wash - schmincke-horadam-663 1 #ffffff #c0b6ab #c0b6ab #c0b6ab", "wash - schmincke-horadam-662 2 #ffffff #968c87 #53433a #53433a", "accent any schmincke-horadam-515 1 #ffffff #afc7b5 #afc7b5 #afc7b5"],
        strengths: [0.05566460917971317, 0.5888548126486663, 0.6113561310312158, 0.4257977835671438],
        ratios: [1, 1, 1, 1],
        guides: ["1 part paint to 20 parts water, like tea", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "1 part paint to 2.5 parts water, like cream"],
        coatMaps: ["2661927221", "3428216820", "4267260893", "1761479404"],
        regions: ["53 1649416766", "17 1956038070", "14 584913793", "32 1656297515"],
        buys: [4.043439801177975, 5.153000619908911, 2.495329152912395, 4.8691367237149885, 4.043439801177975, 7.959795714353714, 5.668876585021102, 13.049028547400894, 4.043439801177975, 22.90616094736056, 5.570235625758194, 36.74048088484667, 4.043439801177975, 4.313724859120932, 4.153121631832106, 10.000379342673659],
        steps: ["0 wash schmincke-horadam-494 1 #f3f4f9 15", "0 wash schmincke-horadam-494 2 #e7eaf3 26", "1 wash schmincke-horadam-663 1 #c0b6ab 2", "2 wash schmincke-horadam-662 1 #968c87 1", "2 wash schmincke-horadam-662 2 #53433a 6", "3 accent schmincke-horadam-515 1 #afc7b5 24"],
        shares: [0.46741818181818184, 0.22774545454545456, 0.530660606060606, 0.6051515151515151, 0.26063030303030305, 0.046224242424242425],
        comboCount: 32,
        combos: "2800486873",
        comboMap: "3164836519",
        render: "1960079707",
        renderPart: "1142862093",
        area: 2.137830303030303,
        deltaE: [4.043439801177975, 11.664291381835938, 0.0728]
    )

    private static let dusk = Reference(
        paintIDs: ["schmincke-horadam-480", "schmincke-horadam-672", "schmincke-horadam-494", "schmincke-horadam-208", "schmincke-horadam-485", "schmincke-horadam-645"],
        layers: ["wash - schmincke-horadam-480 2 #ffffff #c5dbee #8ab7dc #8ab7dc", "wash - schmincke-horadam-672 3 #ffffff #d5bab2 #ac7664 #95503a", "wash - schmincke-horadam-494 2 #ffffff #6377af #243f8f #243f8f", "accent colour schmincke-horadam-208 1 #ffffff #fbe727 #fbe727 #fbe727", "accent any schmincke-horadam-485 1 #ffffff #b0bac8 #b0bac8 #b0bac8", "accent dark schmincke-horadam-645 1 #ffffff #7a3e3b #7a3e3b #7a3e3b"],
        strengths: [0.2850632022210701, 0.3925698750991109, 0.7102944875339455, 0.8786281122462608, 0.5132071963844536, 1],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 4 parts water, like milk", "1 part paint to 2.5 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1 part water, like butter", "1 part paint to 2 parts water, like cream", "1 part paint to 1 part water, like butter"],
        coatMaps: ["3188553205", "3843947111", "3913614117", "346995772", "1929237821", "4045137613"],
        regions: ["32 2549524833", "35 2745078869", "8 2196086929", "12 1902664748", "27 725232736", "27 98424633"],
        buys: [4.956090110412711, 12.019945218479446, 4.574321071730187, 14.521109769137324, 4.956090110412711, 14.71268465484324, 4.866910890977796, 21.231780364355185, 4.956090110412711, 17.327247849199008, 4.6705627441851965, 25.781073269695813, 4.956090110412711, 5.013853805612845, 6.542973943453506, 10.026656331768868, 4.956090110412711, 5.403367027239483, 6.970264706539456, 13.060169143068437, 4.956090110412711, 5.642595256554462, 4.259943680396777, 20.54522405836964],
        steps: ["0 wash schmincke-horadam-480 1 #c5dbee 9", "0 wash schmincke-horadam-480 2 #8ab7dc 12", "1 wash schmincke-horadam-672 1 #d5bab2 1", "1 wash schmincke-horadam-672 2 #ac7664 5", "1 wash schmincke-horadam-672 3 #95503a 14", "2 wash schmincke-horadam-494 1 #6377af 1", "2 wash schmincke-horadam-494 2 #243f8f 3", "3 accent schmincke-horadam-208 1 #fbe727 11", "4 accent schmincke-horadam-485 1 #b0bac8 24", "5 accent schmincke-horadam-645 1 #7a3e3b 24"],
        shares: [0.7101643880208334, 0.4598795572916667, 0.59619140625, 0.4800008138020833, 0.21966552734375, 0.5860188802083334, 0.1636962890625, 0.016581217447916668, 0.07344563802083333, 0.042154947916666664],
        comboCount: 105,
        combos: "4123587329",
        comboMap: "373692414",
        render: "2892878291",
        renderPart: "4082943845",
        area: 3.3477986653645835,
        deltaE: [4.956090110412711, 11.941279411315918, 0.06886800130208333]
    )

    private static let sceneLarge = Reference(
        paintIDs: ["schmincke-horadam-225", "schmincke-horadam-476", "schmincke-horadam-509", "schmincke-horadam-920", "schmincke-horadam-480"],
        layers: ["wash - schmincke-horadam-225 1 #ffffff #f7e15a #f7e15a #f7e15a", "wash - schmincke-horadam-476 2 #ffffff #e9e4f0 #d4c9e0 #d4c9e0", "wash - schmincke-horadam-509 3 #ffffff #bce8ec #79d1d9 #36bac7", "wash - schmincke-horadam-920 3 #ffffff #f8c3d8 #f187b2 #eb4b8b", "accent any schmincke-horadam-480 1 #ffffff #b7d2e9 #b7d2e9 #b7d2e9"],
        strengths: [0.6589710841846954, 0.17246146414154104, 0.2644655290525569, 0.2717138360138737, 0.3529987610338382],
        ratios: [1, 1, 1, 1, 1],
        guides: ["1 part paint to 1.5 parts water, like cream", "1 part paint to 6 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 3 parts water, like milk"],
        coatMaps: ["3901381676", "1576975765", "2601193590", "3321846916", "958524197"],
        regions: ["4 777934530", "17 3656739599", "23 4192505301", "10 3724676959", "12 1756890073"],
        buys: [3.651274309387879, 10.526840399992961, 2.962911826250961, 14.729131734803726, 3.651274309387879, 7.587065101958746, 3.777337666825148, 8.986309758967707, 3.651274309387879, 13.938837018674356, 3.3746326546735648, 15.182085078336852, 3.651274309387879, 14.237141148422154, 2.9916485489212112, 21.156494694950105, 3.651274309387879, 3.7266974666232984, 5.847858679885967, 15.585114051860508],
        steps: ["0 wash schmincke-horadam-225 1 #f7e15a 2", "1 wash schmincke-horadam-476 1 #e9e4f0 2", "1 wash schmincke-horadam-476 2 #d4c9e0 5", "2 wash schmincke-horadam-509 1 #bce8ec 1", "2 wash schmincke-horadam-509 2 #79d1d9 11", "2 wash schmincke-horadam-509 3 #36bac7 11", "3 wash schmincke-horadam-920 1 #f8c3d8 2", "3 wash schmincke-horadam-920 2 #f187b2 2", "3 wash schmincke-horadam-920 3 #eb4b8b 6", "4 accent schmincke-horadam-480 1 #b7d2e9 9"],
        shares: [0.5843479166666666, 0.7555791666666667, 0.38790833333333335, 0.8712770833333333, 0.28990625, 0.05348958333333333, 0.5827666666666667, 0.3704625, 0.11638125, 0.007745833333333334],
        comboCount: 49,
        combos: "3084788149",
        comboMap: "884840629",
        render: "2733132980",
        renderPart: "3372759386",
        area: 4.019864583333333,
        deltaE: [3.651274309387879, 6.929898262023926, 0.016404166666666668]
    )

    func testPlansGivenPaintsOnAPicture() {
        let plan = Layers.layerImage(rgba: scene(160, 120), width: 160, height: 120, paints: [yellow, blue, red, black], paintIDs: ["y", "b", "r", "k"])
        check(plan, Self.sceneGiven)
        XCTAssertEqual(plan.combos.map { "\($0.coats.map(String.init).joined()) \($0.hex) \($0.pixelCount)" }, [
            "000000 #ffffff 1040", "000100 #8dc2e7 13", "002000 #93afd4 3085", "001000 #c9d7ea 3665", "021000 #b94f46 1767", "101000 #c6c74b 143", "003000 #5d86bf 17",
            "103000 #5c7c3b 2822", "101100 #6c9643 15", "113000 #585323 963", "102100 #4e793c 74", "112000 #8b6d28 3167", "100000 #fbec52 36", "022000 #873e3f 1051",
            "122000 #85390e 139", "023000 #552e38 3", "023100 #2b2032 906", "022100 #482d38 10", "123100 #2a1d09 1", "113100 #2d3d1f 1", "112100 #4a5124 1",
            "122100 #47290b 1", "121000 #b74810 280",
        ])
        // The red wash: two coats, the second inside the first.
        let wash = plan.layers[1]
        XCTAssertEqual(wash.coats.map(\.hex), ["#f5afa6", "#eb5f4e", "#eb5f4e"])
        assertClose(wash.coats.map(\.share), [0.4317708333333333, 0.2165625, 0], accuracy: 1e-12, "share")
        assertClose(wash.coats.map(\.only), [0.21520833333333333, 0.2165625, 0], accuracy: 1e-12, "only")
        XCTAssertEqual(wash.coats.map(\.shapes), [5, 2, 0])
        assertClose(wash.depths, [0, 0.5113269036302833, 0.8592443057754835, 0.8592443057754835], "depths")
        // The black is not needed: it keeps a layer without coats at the end.
        XCTAssertEqual(plan.layers[5].top, 0)
        XCTAssertEqual(plan.layers[5].water, .infinity)
    }

    func testProposesPaintsForAPicture() throws {
        let paints = try stock()
        let rgba = scene(160, 120)
        check(Layers.layerImage(rgba: rgba, width: 160, height: 120, paints: paints), Self.sceneProposal)
        // The colours of the picture, and the proposal from the colours alone.
        let colours = Layers.pictureColours(rgba: rgba, width: 160, height: 120)
        XCTAssertEqual(colours.counts.count, 619)
        XCTAssertEqual(hash(colours.counts.map { Int($0) }), "2821364139")
        XCTAssertEqual(colours.points[0], 0.898113793763683, accuracy: 1e-12)
        XCTAssertEqual(colours.points[colours.points.count - 1], 0.08629648884137471, accuracy: 1e-12)
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints), ["schmincke-horadam-208", "schmincke-horadam-496", "schmincke-horadam-509", "schmincke-horadam-353"])
    }

    func testPlansCoarseAreasWithTwoCoats() throws {
        check(Layers.layerImage(rgba: scene(200, 150), width: 200, height: 150, paints: try stock(), count: 3, maxCoats: 2, simplify: 8), Self.sceneCoarse)
    }

    func testPlansGradedCoats() {
        check(Layers.layerImage(rgba: scene(160, 120), width: 160, height: 120, paints: [yellow, blue, red, black], maxCoats: 4, graded: true, accents: 1), Self.sceneGraded)
    }

    func testSkipsUnknownAndRepeatedBasePaints() throws {
        let plan = Layers.layerImage(rgba: scene(120, 90), width: 120, height: 90, paints: try stock(), count: 1, paintIDs: ["schmincke-horadam-208", "schmincke-horadam-347", "nope", "schmincke-horadam-208"])
        check(plan, Self.sceneUnused)
    }

    func testPlansTheSamplePhotos() throws {
        let paints = try stock()
        guard let cwm = try sample("sample-llyn-idwal", fullHash: "3722326108"), let dusk = try sample("sample-bielefeld", fullHash: "460611925") else {
            throw XCTSkip("This system decodes the sample photos to other pixels than the reference values were made from.")
        }
        XCTAssertEqual([cwm.width, cwm.height, dusk.width, dusk.height], [500, 330, 192, 256])
        XCTAssertEqual([hash(cwm.rgba), hash(dusk.rgba)], ["3712278041", "1750660364"])
        check(Layers.layerImage(rgba: cwm.rgba, width: cwm.width, height: cwm.height, paints: paints), Self.cwm)
        check(Layers.layerImage(rgba: dusk.rgba, width: dusk.width, height: dusk.height, paints: paints, simplify: 6, accents: 3), Self.dusk)
    }

    func testPlansAPictureAtWorkingSizeInGoodTime() throws {
        let paints = try stock()
        let rgba = scene(800, 600)
        let start = Date()
        let plan = Layers.layerImage(rgba: rgba, width: 800, height: 600, paints: paints)
        let seconds = Date().timeIntervalSince(start)
        print("Layers.layerImage 800 x 600: \(String(format: "%.2f", seconds)) s")
        check(plan, Self.sceneLarge)
    }

    // MARK: Edge cases

    func testHandlesAPictureOfOnePixel() {
        consistent(Layers.layerImage(rgba: picture(1, 1) { _, _ in (40, 90, 160) }, width: 1, height: 1, paints: [yellow, blue], paintIDs: ["y", "b"], simplify: 4))
    }

    func testLeavesAWhitePictureUnpainted() {
        let plan = Layers.layerImage(rgba: picture(12, 8) { _, _ in (255, 255, 255) }, width: 12, height: 8, paints: [yellow, blue], paintIDs: ["y", "b"])
        consistent(plan)
        XCTAssertTrue(plan.steps.isEmpty)
        XCTAssertEqual(plan.combos.map(\.hex), ["#ffffff"])
        XCTAssertTrue(plan.layers.allSatisfy { $0.coats.allSatisfy { $0.share == 0 } })
    }

    func testWorksWithASinglePaintAndASingleCoat() throws {
        let plan = Layers.layerImage(rgba: picture(16, 8) { x, _ in x < 8 ? (255, 255, 255) : (60, 110, 180) }, width: 16, height: 8, paints: [blue], paintIDs: ["b"], maxCoats: 1, simplify: 0)
        consistent(plan)
        XCTAssertEqual(plan.layers.count, 1)
        XCTAssertEqual(plan.steps.count, 1)
        let step = try XCTUnwrap(plan.steps.first)
        XCTAssertEqual([step.layer, step.coat], [0, 1])
        XCTAssertEqual(step.paintID, "b")
    }

    func testGivesWhitePaperWhenNoBasePaintExists() {
        let rgba = picture(8, 8) { _, _ in (60, 110, 180) }
        let known = Layers.layerImage(rgba: rgba, width: 8, height: 8, paints: [blue], paintIDs: ["gone", "b"])
        XCTAssertEqual(known.paintIDs, ["b"])
        consistent(known)
        let plan = Layers.layerImage(rgba: rgba, width: 8, height: 8, paints: [blue], paintIDs: ["gone"])
        XCTAssertTrue(plan.layers.isEmpty && plan.paintIDs.isEmpty && plan.steps.isEmpty)
        consistent(plan)
        XCTAssertEqual(Array(Layers.renderLayers(plan).prefix(4)), [255, 255, 255, 255])
    }

    func testProposesNoMorePaintsThanThereAre() {
        let pool = [yellow, blue, red]
        let plan = Layers.layerImage(rgba: picture(16, 8) { x, y in (UInt8(x * 15), 120, UInt8(y * 30)) }, width: 16, height: 8, paints: pool, count: 9, maxCoats: 1)
        XCTAssertLessThanOrEqual(plan.paintIDs.count, 3)
        XCTAssertEqual(Set(plan.paintIDs).count, plan.paintIDs.count)
        consistent(plan)
    }

    // MARK: Geometric areas (reference values from src/lib/geometric.js)

    func testStraightensALabelMapAsTheWebLogicDoes() {
        // A label map from a whole-number formula: blobs of five labels.
        let w = 90, h = 70
        var labels = [Int32](repeating: 0, count: w * h)
        for y in 0..<h {
            for x in 0..<w { labels[y * w + x] = Int32(((x * x + 3 * y * y) / 700 + (x + 2 * y) / 23) % 5) }
        }
        XCTAssertEqual([2, 3.5, 6].map { hash(Geometric.straighten(labels, w, h, tolerance: $0)) }, ["3813744525", "4280727336", "1708339919"])
        XCTAssertEqual([0, 5].map { hash(Geometric.areas(labels, w, h, simplify: $0)) }, ["1148268832", "1599230887"])
        // One label and one pixel stay as they are.
        XCTAssertEqual(Geometric.straighten([Int32](repeating: 3, count: 12), 4, 3, tolerance: 2), [Int32](repeating: 3, count: 12))
        XCTAssertEqual(Geometric.straighten([0], 1, 1, tolerance: 2), [0])
    }

    func testGeometricMixesMatchTheWebLogic() {
        let expected: [(simplify: Int, map: String, regions: Int, pixels: String)] = [
            (0, "1114228175", 31, "4227 0 1980 4363 985 3057 5935 0 99 325 1995 0 1845 0 0 0 1450 3739"),
            (4, "419052205", 29, "6197 0 0 4397 957 3060 5923 0 92 344 1990 0 1849 0 0 0 1452 3739"),
        ]
        for e in expected {
            let result = Segmenter.segment(rgba: scene(200, 150), width: 200, height: 150, colours: 12, simplify: e.simplify, geometric: true)
            XCTAssertEqual(hash(result.regionMap), e.map, "simplify \(e.simplify)")
            XCTAssertEqual(result.regions.count, e.regions, "simplify \(e.simplify)")
            XCTAssertEqual(result.clusters.map { String($0.pixelCount) }.joined(separator: " "), e.pixels, "simplify \(e.simplify)")
        }
    }

    func testGeometricLayersMatchTheWebLogic() {
        let plan = Layers.layerImage(rgba: scene(160, 120), width: 160, height: 120, paints: [yellow, blue, red, black], paintIDs: ["y", "b", "r", "k"], geometric: true)
        XCTAssertEqual(hash(plan.comboMap), "745994912")
        XCTAssertEqual(plan.steps.count, 8)
        XCTAssertEqual(plan.layers.map { hash($0.coatMap) }.joined(separator: " "), "404282004 559090231 1769919780 21410365 2340494645 1213797829")
        XCTAssertEqual(plan.deltaE.mean, 5.067861876030574, accuracy: 1e-9)
        consistent(plan)
    }
}
