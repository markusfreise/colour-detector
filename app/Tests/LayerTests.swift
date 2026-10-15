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
        XCTAssertEqual(Layers.referenceWater, 4)
    }

    func testCoatsAddUpToTheLimitOfThePaint() {
        assertClose([Layers.coatAmount(0, 0.3), Layers.coatAmount(1, 0.3), Layers.coatAmount(3, 0.3), Layers.coatAmount(3, 0.3, ratio: 1.7), Layers.coatAmount(2, 0.5, ratio: 3), Layers.coatAmount(4, 0.1, ratio: 1.0000001)],
                    [0, 0.3, 0.8999999999999999, 1.6769999999999996, 2, 0.4], accuracy: 1e-12, "amount")
        assertClose([Layers.coatDepth(1, 0.3, limit: 1.6), Layers.coatDepth(3, 0.3, limit: 1.6), Layers.coatDepth(3, 0.3, limit: 4), Layers.coatDepth(3, 0.4, limit: 1.9, ratio: 1.7), Layers.coatDepth(0, 1, limit: 1.6)],
                    [0.40785422772604324, 0.9381674485467582, 0.9124419731057181, 1.5426063759817028, 0], accuracy: 1e-12, "depth")
    }

    func testSaysHowToPrepareAWash() {
        let clear = Layers.washGuide(0)
        XCTAssertEqual(clear.water, .infinity)
        XCTAssertEqual(clear.consistency, "water")
        XCTAssertEqual(clear.guide, "clear water")
        let expected: [(strength: Double, water: Double, consistency: String, parts: String)] = [
            (0.02, 200, "tea", "200 parts water"), (0.05, 80, "tea", "80 parts water"), (0.07, 60, "tea", "60 parts water"), (0.13, 30, "tea", "30 parts water"),
            (0.19, 20, "tea", "20 parts water"), (0.2, 20, "tea", "20 parts water"), (0.21, 20, "tea", "20 parts water"), (0.3, 15, "coffee", "15 parts water"),
            (0.41, 10, "coffee", "10 parts water"), (0.5, 8, "coffee", "8 parts water"), (0.55, 7, "milk", "7 parts water"), (0.8, 5, "milk", "5 parts water"),
            (1, 4, "milk", "4 parts water"), (1.2, 3, "milk", "3 parts water"), (1.5, 2.5, "cream", "2.5 parts water"), (1.7, 2.5, "cream", "2.5 parts water"),
            (2, 2, "cream", "2 parts water"), (2.9, 1.5, "cream", "1.5 parts water"), (3.2, 1.5, "cream", "1.5 parts water"), (4, 1, "butter", "1 part water"),
            (6, 0.5, "butter", "hardly any water"), (10, 0.5, "butter", "hardly any water"), (20, 0, "butter", "hardly any water"),
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
        XCTAssertEqual(layer.top, 2)
        XCTAssertEqual(layer.strength, 0.30055745188604743, accuracy: 1e-9)
        XCTAssertEqual(layer.ratio, 1)
        XCTAssertEqual(layer.dilution, "very watery wash")
        XCTAssertEqual(layer.guide, "1 part paint to 15 parts water, like coffee")
        XCTAssertEqual(layer.hexes, ["#ffffff", "#87b2db", "#4f84c2", "#4f84c2"])
        assertClose(layer.depths, [0, 0.38238881561051496, 0.6876922829160714, 0.6876922829160714], "depths")
        XCTAssertEqual(layer.washes.map(\.strength), [layer.strength, layer.strength, layer.strength])
        XCTAssertEqual(fit.coats, [[1], [2], [2]])
        XCTAssertEqual(fit.hexes, ["#87b2db", "#4f84c2", "#4f84c2"])
        assertClose(fit.deltaE, [0.08902608597420054, 5.164091098959807, 0.9204527178679777], "deltaE")
        XCTAssertEqual(fit.error, 2.057856634267328, accuracy: 1e-9)
    }

    private let mixed: [(hex: String, weight: Double)] = [("#fae409", 3), ("#2b61ab", 2), ("#5a9a50", 4), ("#e6331d", 1), ("#f08a20", 2), ("#7a3a80", 1), ("#ffffff", 5), ("#303030", 1)]

    func testFitsWashesAnAccentAndAnUnusedPaint() {
        let fit = Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black])
        XCTAssertEqual(fit.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top)" }, ["wash - y 2", "wash - r 1", "wash - b 2", "accent colour r 1", "wash - k 0"])
        assertClose(fit.layers.map(\.strength), [0.29789693851087523, 0.27440581804701325, 0.4476289027651123, 0.7231703163201547, 0], "strength")
        XCTAssertEqual(fit.layers.map(\.guide), ["1 part paint to 15 parts water, like coffee", "1 part paint to 15 parts water, like coffee", "1 part paint to 9 parts water, like coffee", "1 part paint to 6 parts water, like milk", "clear water"])
        XCTAssertEqual(fit.layers.map(\.hexes), [
            ["#ffffff", "#fdf455", "#fbec21", "#fbec21"], ["#ffffff", "#f58f79", "#f58f79", "#f58f79"], ["#ffffff", "#6699ce", "#3268b0", "#3268b0"],
            ["#ffffff", "#ea472f", "#ea472f", "#ea472f"], ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        ])
        // The accent is of the red that is a wash too: it only adds what is left up to the limit of the paint.
        assertClose(fit.layers[3].depths, [0, 0.6210234947749971, 0.6210234947749971, 0.6210234947749971], "depths")
        XCTAssertEqual(fit.coats, [[2, 0, 0, 0, 0], [0, 0, 2, 0, 0], [1, 0, 1, 0, 0], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 0, 0], [1, 1, 2, 0, 0]])
        XCTAssertEqual(fit.hexes, ["#fbec21", "#3268b0", "#659243", "#e6331d", "#f38924", "#625460", "#ffffff", "#2f3415"])
        assertClose(fit.deltaE, [1.8594428272649473, 2.322950487130788, 2.4192643149444497, 0.018057362473525226, 0.6816151811449211, 10.295661453659164, 0, 5.029027415914721], "deltaE")
        XCTAssertEqual(fit.error, 1.926698068956393, accuracy: 1e-9)
    }

    func testGradesTheCoatsOnlyWhenAskedTo() {
        let fit = Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black], graded: true, accents: 3)
        XCTAssertEqual(fit.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top)" }, ["wash - y 2", "wash - r 1", "wash - b 2", "accent colour r 1", "wash - k 0"])
        assertClose(fit.layers.map(\.strength), [0.26619991396506676, 0.27440581804701325, 0.423144846484091, 0.7014710677017026, 0], "strength")
        assertClose(fit.layers.map(\.ratio), [2.752473604712105, 1, 1.3754074300634596, 1, 1], "ratio")
        // The second coat of a graded layer is a stronger wash.
        XCTAssertEqual(fit.layers[0].washes[1].strength, 0.26619991396506676 * 2.752473604712105, accuracy: 1e-9)
        XCTAssertEqual(fit.hexes, ["#fae409", "#2b61ab", "#6a964c", "#e6341e", "#f38928", "#675661", "#ffffff", "#283017"])
        // The first colour is nearly hit; what is left of its distance is rounding of the search.
        assertClose(Array(fit.deltaE.dropFirst()), [0.10559169849222881, 1.8679392078481696, 0.18426124242015005, 0.810487291815244, 10.372344534892216, 0, 4.517031380460484], "deltaE")
        XCTAssertEqual(fit.deltaE[0], 0.0040880583740055465, accuracy: 1e-9)
        XCTAssertEqual(fit.error, 1.2836745339422364, accuracy: 1e-9)
        XCTAssertTrue(Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black]).layers.allSatisfy { $0.ratio == 1 })
    }

    func testProposesPaintsFromTheStock() throws {
        let hexes = ["#a88b4c", "#715611", "#634908", "#392620", "#bb3405", "#7a7d08", "#3e3d34", "#3f3815", "#c14b03", "#772411", "#465d1e", "#464d0d"]
        let colours = Layers.colourSet(hexes.enumerated().map { (hex: $1, weight: Double(100 + $0 * 50)) })
        let paints = try stock()
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints), ["schmincke-horadam-496", "schmincke-horadam-526", "schmincke-horadam-659", "schmincke-horadam-344"])
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints, count: 3, accents: 0), ["schmincke-horadam-509", "schmincke-horadam-659", "schmincke-horadam-369"])
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
        XCTAssertEqual(all, [87, 140, 199])
        XCTAssertEqual(one, [172, 204, 232])
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: [0]), [255, 255, 255])
        // A layer `coats` does not mention is off.
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: []), [255, 255, 255])
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: [9]), all)
        XCTAssertEqual(Layers.compositeColours(layers: fit.layers, combos: combos, coats: [.max]), all)
    }

    // MARK: Layers of a picture

    private static let sceneGiven = Reference(
        paintIDs: ["y", "r", "b", "k"],
        layers: ["wash - y 1 #ffffff #fdf671 #fdf671 #fdf671", "wash - r 2 #ffffff #f8a591 #f27259 #f27259", "wash - b 3 #ffffff #bdd7ed #8fb8de #6e9fd1", "accent colour r 1 #ffffff #d91004 #d91004 #d91004", "accent dark b 1 #ffffff #1e52a0 #1e52a0 #1e52a0", "wash - k 0 #ffffff #ffffff #ffffff #ffffff"],
        strengths: [0.21517699410626448, 0.20273281368119608, 0.13515520912079737, 3.4, 1.2747145059320477, 0],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 20 parts water, like tea", "1 part paint to 20 parts water, like tea", "1 part paint to 30 parts water, like tea", "1 part paint to 1 part water, like butter", "1 part paint to 3 parts water, like milk", "clear water"],
        coatMaps: ["1464470981", "915263189", "2770657239", "2812767124", "3837734117", "1213797829"],
        regions: ["3 3128365380", "38 1114917765", "47 2583460814", "12 2468791726", "11 2097133671", "1 2176614741"],
        buys: [4.57902398606653, 7.006438829230815, 4.7824957374677, 10.441355012449993, 4.57902398606653, 12.443029844532791, 4.41787283733872, 21.23178291334675, 4.57902398606653, 19.411647044270367, 4.500792472575261, 21.74907317740935, 4.57902398606653, 7.454051748182061, 4.677611155225224, 38.89988829882001, 4.57902398606653, 6.346034800597673, 5.9566807644420185, 42.83342819813541, 4.57902398606653, 4.57902398606653, 0, 0],
        steps: ["0 wash y 1 #fdf671 1", "1 wash r 1 #f8a591 23", "1 wash r 2 #f27259 24", "2 wash b 1 #bdd7ed 1", "2 wash b 2 #8fb8de 5", "2 wash b 3 #6e9fd1 12", "3 accent r 1 #d91004 11", "4 accent b 1 #1e52a0 10"],
        shares: [0.42895833333333333, 0.46770833333333334, 0.18739583333333334, 0.8599479166666667, 0.5738020833333334, 0.1684375, 0.08401041666666667, 0.04791666666666667],
        comboCount: 20,
        combos: "1469117921",
        comboMap: "553415415",
        render: "2464788775",
        renderPart: "3554681549",
        area: 2.8181770833333335,
        deltaE: [4.57902398606653, 10.21469783782959, 0.053072916666666664]
    )

    private static let sceneProposal = Reference(
        paintIDs: ["schmincke-horadam-226", "schmincke-horadam-509", "schmincke-horadam-473", "schmincke-horadam-344", "schmincke-horadam-787"],
        layers: ["wash - schmincke-horadam-226 1 #ffffff #faea64 #faea64 #faea64", "wash - schmincke-horadam-509 2 #ffffff #b4f4f7 #7feaef #7feaef", "wash - schmincke-horadam-473 2 #ffffff #e4dbee #cebedf #cebedf", "wash - schmincke-horadam-344 2 #ffffff #f292a1 #e85d70 #e85d70", "accent any schmincke-horadam-787 1 #ffffff #c7d1d8 #c7d1d8 #c7d1d8", "accent dark schmincke-horadam-473 1 #ffffff #5f418c #5f418c #5f418c"],
        strengths: [0.27457128507695644, 0.07948708552373193, 0.13515520912079734, 0.2644655290525568, 0.25, 1.767749662115934],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 15 parts water, like coffee", "1 part paint to 50 parts water, like tea", "1 part paint to 30 parts water, like tea", "1 part paint to 15 parts water, like coffee", "1 part paint to 15 parts water, like coffee", "1 part paint to 2.5 parts water, like cream"],
        coatMaps: ["549294540", "571852046", "2056696493", "4043717301", "1329492581", "3837734117"],
        regions: ["22 3533599161", "36 954139749", "76 4049692307", "9 1082488450", "25 1706771812", "11 2097133671"],
        buys: [4.327038191881696, 8.647541871309478, 3.692462746645244, 11.73450546550257, 4.327038191881696, 11.614107394138717, 3.6044664879415196, 13.596733927117072, 4.327038191881696, 9.337546541762674, 4.53590223337509, 10.77709597398205, 4.327038191881696, 16.427597365959365, 3.647305210839078, 25.183339336005016, 4.327038191881696, 4.541097943527083, 6.3052350852937895, 9.842194837093661, 4.327038191881696, 5.070722420985323, 6.640011568878194, 22.16037808930172],
        steps: ["0 wash schmincke-horadam-226 1 #faea64 2", "1 wash schmincke-horadam-509 1 #b4f4f7 2", "1 wash schmincke-horadam-509 2 #7feaef 25", "2 wash schmincke-horadam-473 1 #e4dbee 2", "2 wash schmincke-horadam-473 2 #cebedf 41", "3 wash schmincke-horadam-344 1 #f292a1 2", "3 wash schmincke-horadam-344 2 #e85d70 3", "4 accent schmincke-horadam-787 1 #c7d1d8 24", "5 accent schmincke-horadam-473 1 #5f418c 10"],
        shares: [0.5372395833333333, 0.7292708333333333, 0.25078125, 0.8028125, 0.26416666666666666, 0.561875, 0.20583333333333334, 0.060520833333333336, 0.04791666666666667],
        comboCount: 37,
        combos: "1698751268",
        comboMap: "2707117360",
        render: "134606337",
        renderPart: "1946426972",
        area: 3.460416666666667,
        deltaE: [4.327038191881696, 9.117109298706055, 0.03505208333333333]
    )

    private static let sceneCoarse = Reference(
        paintIDs: ["schmincke-horadam-496", "schmincke-horadam-526", "schmincke-horadam-365", "schmincke-horadam-225", "schmincke-horadam-669"],
        layers: ["wash - schmincke-horadam-496 2 #ffffff #c6ddf0 #9dc2e3", "wash - schmincke-horadam-526 2 #ffffff #b2df92 #86c95e", "wash - schmincke-horadam-365 2 #ffffff #f79b86 #f0674e", "accent colour schmincke-horadam-225 1 #ffffff #f4d406 #f4d406", "accent dark schmincke-horadam-669 1 #ffffff #694f2d #694f2d"],
        strengths: [0.11190722569127808, 0.2745712850769565, 0.2319358715821383, 0.9, 1.315178287938866],
        ratios: [1, 1, 1, 1, 1],
        guides: ["1 part paint to 40 parts water, like tea", "1 part paint to 15 parts water, like coffee", "1 part paint to 15 parts water, like coffee", "1 part paint to 4 parts water, like milk", "1 part paint to 3 parts water, like milk"],
        coatMaps: ["1082794269", "3121968309", "3975826901", "3237457724", "1159309733"],
        regions: ["32 1107515819", "12 1346421789", "13 3793780999", "7 3295514556", "11 1084351786"],
        buys: [4.977839699810558, 11.942851472800294, 5.235073662930078, 14.739729466682592, 4.977839699810558, 10.933472506373112, 5.0052934927781045, 16.79706911295207, 4.977839699810558, 15.848536048577625, 4.8433147403029775, 24.77491787335582, 4.977839699810558, 5.236027457040922, 10.543315172319957, 20.775326687393868, 4.977839699810558, 6.229760195539681, 6.987281607852548, 32.8890849677654],
        steps: ["0 wash schmincke-horadam-496 1 #c6ddf0 6", "0 wash schmincke-horadam-496 2 #9dc2e3 14", "1 wash schmincke-horadam-526 1 #b2df92 1", "1 wash schmincke-horadam-526 2 #86c95e 3", "2 wash schmincke-horadam-365 1 #f79b86 2", "2 wash schmincke-horadam-365 2 #f0674e 2", "3 accent schmincke-horadam-225 1 #f4d406 5", "4 accent schmincke-horadam-669 1 #694f2d 10"],
        shares: [0.7328, 0.32893333333333336, 0.5050666666666667, 0.2288, 0.5454, 0.2541333333333333, 0.025233333333333333, 0.04833333333333333],
        comboCount: 29,
        combos: "714324355",
        comboMap: "2988124990",
        render: "1489958360",
        renderPart: "2548977164",
        area: 2.6687000000000003,
        deltaE: [4.977839699810558, 12.360596656799316, 0.08326666666666667]
    )

    private static let sceneGraded = Reference(
        paintIDs: ["y", "r", "b"],
        layers: ["wash - y 1 #ffffff #fdf773 #fdf773 #fdf773 #fdf773", "wash - r 2 #ffffff #f79f8a #f0684f #f0684f #f0684f", "wash - b 4 #ffffff #c6ddf0 #99bfe2 #76a5d4 #5a8fc8"],
        strengths: [0.21118001425124588, 0.21924962433955425, 0.11204760383490227],
        ratios: [1, 1.0982851403078262, 1.098285140307826],
        guides: ["1 part paint to 20 parts water, like tea", "1 part paint to 20 parts water, like tea", "1 part paint to 40 parts water, like tea"],
        coatMaps: ["3907480349", "525241636", "48024422"],
        regions: ["3 1695201763", "7 189803020", "27 4060329741"],
        buys: [5.091133781480078, 7.849906201656575, 5.018937346837272, 11.681633003112594, 5.091133781480078, 15.345705726705864, 5.387780901628015, 25.946179288214125, 5.091133781480078, 22.27254542796679, 5.059352409737456, 23.22072124989087],
        steps: ["0 wash y 1 #fdf773 1", "1 wash r 1 #f79f8a 4", "1 wash r 2 #f0684f 2", "2 wash b 1 #c6ddf0 1", "2 wash b 2 #99bfe2 2", "2 wash b 3 #76a5d4 12", "2 wash b 4 #5a8fc8 11"],
        shares: [0.4140625, 0.4988020833333333, 0.24416666666666667, 0.9460416666666667, 0.67359375, 0.3384375, 0.13104166666666667],
        comboCount: 17,
        combos: "3306099471",
        comboMap: "2208705611",
        render: "114062053",
        renderPart: "2097911891",
        area: 3.246145833333333,
        deltaE: [5.091133781480078, 14.374917984008789, 0.09921875]
    )

    private static let sceneUnused = Reference(
        paintIDs: ["schmincke-horadam-347", "schmincke-horadam-208"],
        layers: ["wash - schmincke-horadam-347 3 #ffffff #f19993 #e76962 #e15049", "accent colour schmincke-horadam-208 1 #ffffff #f7d700 #f7d700 #f7d700", "accent any schmincke-horadam-347 1 #ffffff #d32923 #d32923 #d32923"],
        strengths: [0.35743893884340633, 3.0004894687876247, 4],
        ratios: [1, 1, 1],
        guides: ["1 part paint to 10 parts water, like coffee", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1 part water, like butter"],
        coatMaps: ["1012759550", "2936161116", "4165066981"],
        regions: ["9 2744007414", "5 3583978412", "16 2284099866"],
        buys: [16.81549992827896, 32.63615703252806, 18.2599259991232, 37.5643093146684, 16.81549992827896, 16.979227111761688, 10.14644499043456, 12.813494133139585, 16.81549992827896, 17.364444284623673, 19.892267092183985, 24.567818392280905],
        steps: ["0 wash schmincke-horadam-347 1 #f19993 1", "0 wash schmincke-horadam-347 2 #e76962 2", "0 wash schmincke-horadam-347 3 #e15049 1", "1 accent schmincke-horadam-208 1 #f7d700 3", "2 accent schmincke-horadam-347 1 #d32923 13"],
        shares: [0.8195370370370371, 0.5475, 0.4671296296296296, 0.06138888888888889, 0.1174074074074074],
        comboCount: 12,
        combos: "3641807541",
        comboMap: "1737593242",
        render: "3480303334",
        renderPart: "1968941294",
        area: 2.012962962962963,
        deltaE: [16.81549992827896, 37.36347198486328, 0.8516666666666667]
    )

    private static let cwm = Reference(
        paintIDs: ["schmincke-horadam-218", "schmincke-horadam-787", "schmincke-horadam-485", "schmincke-horadam-786", "schmincke-horadam-663"],
        layers: ["wash - schmincke-horadam-218 1 #ffffff #fcdfb1 #fcdfb1 #fcdfb1", "wash - schmincke-horadam-787 2 #ffffff #f2f4f6 #e6eaee #e6eaee", "wash - schmincke-horadam-485 1 #ffffff #cdd5e0 #cdd5e0 #cdd5e0", "wash - schmincke-horadam-786 3 #ffffff #8d8a85 #5d5953 #45413b", "accent any schmincke-horadam-663 1 #ffffff #dad3ca #dad3ca #dad3ca", "accent dark schmincke-horadam-786 1 #ffffff #46423c #46423c #46423c"],
        strengths: [0.10382119970818253, 0.051910599854091265, 0.2119655613966185, 1.274714505932048, 0.2579358518747757, 3.734169477046608],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 40 parts water, like tea", "1 part paint to 80 parts water, like tea", "1 part paint to 20 parts water, like tea", "1 part paint to 3 parts water, like milk", "1 part paint to 15 parts water, like coffee", "1 part paint to 1 part water, like butter"],
        coatMaps: ["1620958100", "4229927831", "1059820885", "2222570255", "2868393020", "3783924285"],
        regions: ["13 3464819591", "70 2887472491", "23 1249573158", "32 1182400700", "38 3899874614", "26 1521720603"],
        buys: [3.443579374767303, 4.6108338063151715, 4.693846166379575, 7.348415670127291, 3.443579374767303, 4.4626752598226, 2.1935173291914887, 4.783042562641846, 3.443579374767303, 5.2423596514079085, 4.300715759629484, 8.497886696724008, 3.443579374767303, 24.97544255702345, 4.5869275483945176, 40.31565453203484, 3.443579374767303, 3.834887602740078, 5.367300177367001, 10.840374485708725, 3.443579374767303, 3.5910428281515845, 3.484549282940073, 10.800084402725528],
        steps: ["0 wash schmincke-horadam-218 1 #fcdfb1 5", "1 wash schmincke-horadam-787 1 #f2f4f6 21", "1 wash schmincke-horadam-787 2 #e6eaee 38", "2 wash schmincke-horadam-485 1 #cdd5e0 7", "3 wash schmincke-horadam-786 1 #8d8a85 1", "3 wash schmincke-horadam-786 2 #5d5953 6", "3 wash schmincke-horadam-786 3 #45413b 7", "4 accent schmincke-horadam-663 1 #dad3ca 24", "5 accent schmincke-horadam-786 1 #46423c 24"],
        shares: [0.4397151515151515, 0.39354545454545453, 0.17564242424242424, 0.428569696969697, 0.6026484848484849, 0.3188060606060606, 0.15606060606060607, 0.0714969696969697, 0.020157575757575756],
        comboCount: 89,
        combos: "786348300",
        comboMap: "674599489",
        render: "3485518388",
        renderPart: "2087267204",
        area: 2.606642424242424,
        deltaE: [3.443579374767303, 10.73163890838623, 0.058606060606060606]
    )

    private static let dusk = Reference(
        paintIDs: ["schmincke-horadam-480", "schmincke-horadam-369", "schmincke-horadam-496", "schmincke-horadam-780", "schmincke-horadam-225", "schmincke-horadam-498"],
        layers: ["wash - schmincke-horadam-480 1 #ffffff #cee8f6 #cee8f6 #cee8f6", "wash - schmincke-horadam-369 1 #ffffff #f3b2d9 #f3b2d9 #f3b2d9", "wash - schmincke-horadam-496 2 #ffffff #b2d0ea #80add9 #80add9", "wash - schmincke-horadam-780 2 #ffffff #5e5a50 #2c2820 #2c2820", "accent colour schmincke-horadam-225 1 #ffffff #f9e736 #f9e736 #f9e736", "accent dark schmincke-horadam-780 1 #ffffff #36322a #36322a #36322a", "accent any schmincke-horadam-498 1 #ffffff #5c78a6 #5c78a6 #5c78a6"],
        strengths: [0.10382119970818252, 0.1630283016083242, 0.1630283016083242, 1.2510362859519217, 0.3757652251253904, 2.1323131158479574, 1.0522066015525542],
        ratios: [1, 1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 40 parts water, like tea", "1 part paint to 25 parts water, like tea", "1 part paint to 25 parts water, like tea", "1 part paint to 3 parts water, like milk", "1 part paint to 10 parts water, like coffee", "1 part paint to 2 parts water, like cream", "1 part paint to 4 parts water, like milk"],
        coatMaps: ["488881212", "1278686348", "819743636", "4203813615", "2110824037", "3143882373", "1614373252"],
        regions: ["28 2478577170", "15 2446251032", "28 251220223", "12 323058197", "13 1594197862", "28 1936178061", "26 1447510165"],
        buys: [4.844725108397774, 5.663816363091383, 3.6883990317782707, 5.515325262694535, 4.844725108397774, 6.561126718548556, 4.195579181039159, 7.560605384307011, 4.844725108397774, 12.74958644982752, 4.6511684048679705, 13.714588233975016, 4.844725108397774, 21.835211016474933, 4.636270562450148, 36.497564040524736, 4.844725108397774, 4.889933917957244, 10.468525473696914, 13.86623710590955, 4.844725108397774, 5.668460869252971, 5.200690182082664, 16.68346389664716, 4.844725108397774, 5.591224570040841, 8.562617993120373, 29.63782852653796],
        steps: ["0 wash schmincke-horadam-480 1 #cee8f6 23", "1 wash schmincke-horadam-369 1 #f3b2d9 9", "2 wash schmincke-horadam-496 1 #b2d0ea 3", "2 wash schmincke-horadam-496 2 #80add9 9", "3 wash schmincke-horadam-780 1 #5e5a50 3", "3 wash schmincke-horadam-780 2 #2c2820 2", "4 accent schmincke-horadam-225 1 #f9e736 12", "5 accent schmincke-horadam-780 1 #36322a 24", "6 accent schmincke-horadam-498 1 #5c78a6 24"],
        shares: [0.4483439127604167, 0.51007080078125, 0.8721720377604166, 0.5550537109375, 0.53326416015625, 0.22934977213541666, 0.0133056640625, 0.07173665364583333, 0.035420735677083336],
        comboCount: 102,
        combos: "442665253",
        comboMap: "2904066697",
        render: "3582809505",
        renderPart: "1131431052",
        area: 3.268717447916667,
        deltaE: [4.844725108397774, 13.007940292358398, 0.08677164713541667]
    )

    private static let sceneLarge = Reference(
        paintIDs: ["schmincke-horadam-208", "schmincke-horadam-494", "schmincke-horadam-480", "schmincke-horadam-363", "schmincke-horadam-787", "schmincke-horadam-672"],
        layers: ["wash - schmincke-horadam-208 1 #ffffff #fdf564 #fdf564 #fdf564", "wash - schmincke-horadam-494 2 #ffffff #d9e2f2 #bacae7 #bacae7", "wash - schmincke-horadam-480 2 #ffffff #b1d9ef #7fbce2 #7fbce2", "wash - schmincke-horadam-363 2 #ffffff #f6999f #ef666e #ef666e", "accent any schmincke-horadam-787 1 #ffffff #c9d2d9 #c9d2d9 #c9d2d9", "accent dark schmincke-horadam-672 1 #ffffff #843d28 #843d28 #843d28"],
        strengths: [0.25, 0.06347172697261363, 0.1824404494214849, 0.27457128507695644, 0.24230830861908603, 1.315178287938866],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 15 parts water, like coffee", "1 part paint to 60 parts water, like tea", "1 part paint to 20 parts water, like tea", "1 part paint to 15 parts water, like coffee", "1 part paint to 15 parts water, like coffee", "1 part paint to 3 parts water, like milk"],
        coatMaps: ["3737345125", "4236871157", "2021575565", "3018012461", "3425734173", "3271656805"],
        regions: ["13 4247651209", "58 2993944256", "30 2526708309", "24 2091220403", "14 1424998243", "11 3619376383"],
        buys: [3.8877364149537534, 8.404932617373891, 3.709276368119564, 12.106202156833493, 3.8877364149537534, 8.082501229546855, 4.056591263167089, 10.147104433414048, 3.8877364149537534, 13.523401551620081, 3.3210648660100484, 17.034467379129623, 3.8877364149537534, 13.584083759442336, 3.4970314319729052, 24.197292619282717, 3.8877364149537534, 4.195224151466356, 4.2502709764163775, 8.89217918896035, 3.8877364149537534, 5.8414510056247835, 4.69600803916445, 44.09865524597556],
        steps: ["0 wash schmincke-horadam-208 1 #fdf564 2", "1 wash schmincke-horadam-494 1 #d9e2f2 18", "1 wash schmincke-horadam-494 2 #bacae7 40", "2 wash schmincke-horadam-480 1 #b1d9ef 4", "2 wash schmincke-horadam-480 2 #7fbce2 12", "3 wash schmincke-horadam-363 1 #f6999f 2", "3 wash schmincke-horadam-363 2 #ef666e 10", "4 accent schmincke-horadam-787 1 #c9d2d9 12", "5 accent schmincke-horadam-672 1 #843d28 10"],
        shares: [0.5379583333333333, 0.6887375, 0.25976666666666665, 0.7026458333333333, 0.3123666666666667, 0.46841666666666665, 0.18107916666666668, 0.06624166666666667, 0.04958333333333333],
        comboCount: 39,
        combos: "414247731",
        comboMap: "3012539970",
        render: "1208355541",
        renderPart: "1768383935",
        area: 3.2667958333333336,
        deltaE: [3.8877364149537534, 7.686824798583984, 0.015204166666666666]
    )

    func testPlansGivenPaintsOnAPicture() {
        let plan = Layers.layerImage(rgba: scene(160, 120), width: 160, height: 120, paints: [yellow, blue, red, black], paintIDs: ["y", "b", "r", "k"])
        check(plan, Self.sceneGiven)
        XCTAssertEqual(plan.combos.map { "\($0.coats.map(String.init).joined()) \($0.hex) \($0.pixelCount)" }, [
            "000000 #ffffff 1046", "002000 #8fb8de 2889", "003000 #6e9fd1 89", "001000 #bdd7ed 3693", "021000 #b35f52 687", "000100 #e5301a 691", "101000 #bbd069 188",
            "103000 #6e9a5c 650", "102000 #8eb162 22", "113000 #6a6130 2368", "112000 #8a7134 2982", "111000 #b68538 32", "100000 #fdf671 32", "122000 #864d1d 1035",
            "121000 #b15b1f 894", "123000 #68421a 33", "000110 #320f0f 920", "022000 #87504c 855", "023000 #684447 92", "023100 #5d0602 2",
        ])
        // The red wash: two coats, the second inside the first.
        let wash = plan.layers[1]
        XCTAssertEqual(wash.coats.map(\.hex), ["#f8a591", "#f27259", "#f27259"])
        assertClose(wash.coats.map(\.share), [0.46770833333333334, 0.18739583333333334, 0], accuracy: 1e-12, "share")
        assertClose(wash.coats.map(\.only), [0.2803125, 0.18739583333333334, 0], accuracy: 1e-12, "only")
        XCTAssertEqual(wash.coats.map(\.shapes), [23, 24, 0])
        assertClose(wash.depths, [0, 0.2885185776370083, 0.525010299247965, 0.525010299247965], "depths")
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
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints), ["schmincke-horadam-226", "schmincke-horadam-509", "schmincke-horadam-473", "schmincke-horadam-344"])
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
            (0, "2536265450", 112, "168 165 0 0 984 189 0 0 3434 3939 980 0 0 0 1492 1864 67 766 2318 103 1487 0 0 0 0 2670 94 0 0 0 98 193 0 0 0 295 1629 3086 2199 0 0 0 0 1780"),
            (4, "1052538219", 60, "0 982 2080 4915 2527 0 1854 823 795 2832 0 850 3194 78 2749 0 495 0 0 0 1031 2461 759 0 214 203 1158"),
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
        XCTAssertEqual(hash(plan.comboMap), "2720942601")
        XCTAssertEqual(plan.steps.count, 8)
        XCTAssertEqual(plan.layers.map { hash($0.coatMap) }.joined(separator: " "), "2481784556 3519746823 209799118 3992623957 3837734117 1213797829")
        XCTAssertEqual(plan.deltaE.mean, 4.609486767598869, accuracy: 1e-9)
        consistent(plan)
    }
}
