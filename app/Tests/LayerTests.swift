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
        XCTAssertEqual(layer.top, 2)
        XCTAssertEqual(layer.strength, 0.30055745188604743, accuracy: 1e-9)
        XCTAssertEqual(layer.ratio, 1)
        XCTAssertEqual(layer.dilution, "medium")
        XCTAssertEqual(layer.guide, "1 part paint to 3 parts water, like milk")
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
        XCTAssertEqual(fit.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top)" }, ["wash - y 1", "wash - r 1", "wash - b 3", "accent colour r 1", "wash - k 0"])
        assertClose(fit.layers.map(\.strength), [1, 0.24535617193694428, 0.3852777670883287, 0.7284082891040274, 0], "strength")
        XCTAssertEqual(fit.layers.map(\.guide), ["1 part paint to 1 part water, like butter", "1 part paint to 4 parts water, like milk", "1 part paint to 2.5 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "clear water"])
        XCTAssertEqual(fit.layers.map(\.hexes), [
            ["#ffffff", "#fae409", "#fae409", "#fae409"], ["#ffffff", "#f69782", "#f69782", "#f69782"], ["#ffffff", "#73a3d3", "#3c73b7", "#2b61ab"],
            ["#ffffff", "#ea462e", "#ea462e", "#ea462e"], ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        ])
        // Three coats of the blue stop at its swatch: depth 1, never more.
        assertClose(fit.layers[2].depths, [0, 0.4755113014696748, 0.831820706965981, 1], "depths")
        // The accent is of the red that is a wash too: it only adds what is left up to the limit of the paint.
        assertClose(fit.layers[3].depths, [0, 0.642143677297917, 0.642143677297917, 0.642143677297917], "depths")
        XCTAssertEqual(fit.coats, [[1, 0, 0, 0, 0], [0, 0, 3, 0, 0], [1, 0, 1, 0, 0], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 0, 0], [0, 0, 2, 1, 0]])
        XCTAssertEqual(fit.hexes, ["#fae409", "#2b61ab", "#709106", "#e6341e", "#f18702", "#6e5f6a", "#ffffff", "#38262f"])
        assertClose(fit.deltaE, [0, 2.3551386880256624e-14, 4.983788423441313, 0.2008902968221035, 0.8601961815394906, 11.243991344919877, 0, 3.488694814917516], accuracy: 1e-7, "deltaE")
        XCTAssertEqual(fit.error, 1.9257432901844092, accuracy: 1e-9)
    }

    func testGradesTheCoatsOnlyWhenAskedTo() {
        let fit = Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black], graded: true, accents: 3)
        XCTAssertEqual(fit.layers.map { "\($0.kind.rawValue) \($0.role?.rawValue ?? "-") \($0.paintID) \($0.top)" }, ["wash - y 2", "wash - r 1", "wash - b 2", "accent colour r 1", "wash - k 0"])
        assertClose(fit.layers.map(\.strength), [0.2691463487291838, 0.2745712850769565, 0.4201785143808835, 0.7059975220676764, 0], "strength")
        assertClose(fit.layers.map(\.ratio), [3.715450737941105, 1, 1.822118800390509, 1, 1], "ratio")
        // The second coat of a graded layer is a stronger wash: here as strong as the paint goes.
        XCTAssertEqual(fit.layers[0].washes[1].strength, 0.2691463487291838 * 3.715450737941105, accuracy: 1e-9)
        XCTAssertEqual(fit.layers[0].washes[1].strength, 1, accuracy: 1e-9)
        XCTAssertEqual(fit.hexes, ["#fae409", "#2b61ab", "#6b964b", "#e6341e", "#f38928", "#675661", "#ffffff", "#293017"])
        // The first two colours are the paints as their swatches show them.
        assertClose(Array(fit.deltaE.dropFirst(2)), [1.865493670084113, 0.14761639776492247, 0.7958556498236992, 10.387578121149826, 0, 4.548985344402148], "deltaE")
        XCTAssertEqual(fit.deltaE[0], 0, accuracy: 1e-7)
        XCTAssertEqual(fit.deltaE[1], 0, accuracy: 1e-7)
        XCTAssertEqual(fit.error, 1.2704139917526733, accuracy: 1e-9)
        XCTAssertTrue(Layers.fit(colours: Layers.colourSet(mixed), paints: [yellow, blue, red, black]).layers.allSatisfy { $0.ratio == 1 })
    }

    func testProposesPaintsFromTheStock() throws {
        let hexes = ["#a88b4c", "#715611", "#634908", "#392620", "#bb3405", "#7a7d08", "#3e3d34", "#3f3815", "#c14b03", "#772411", "#465d1e", "#464d0d"]
        let colours = Layers.colourSet(hexes.enumerated().map { (hex: $1, weight: Double(100 + $0 * 50)) })
        let paints = try stock()
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints), ["schmincke-horadam-225", "schmincke-horadam-509", "schmincke-horadam-496", "schmincke-horadam-365"])
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints, count: 3, accents: 0), ["schmincke-horadam-509", "schmincke-horadam-365", "schmincke-horadam-525"])
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
        layers: ["wash - y 1 #ffffff #fdf671 #fdf671 #fdf671", "wash - r 2 #ffffff #f8a591 #f27259 #f27259", "wash - b 3 #ffffff #bdd7ed #8fb8de #6e9fd1", "accent any b 1 #ffffff #6d9ed1 #6d9ed1 #6d9ed1", "accent colour r 1 #ffffff #ed543b #ed543b #ed543b", "wash - k 0 #ffffff #ffffff #ffffff #ffffff"],
        strengths: [0.21517699410626448, 0.20273281368119608, 0.13515520912079737, 0.41269736299964116, 0.6, 0],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 5 parts water, like milk", "1 part paint to 5 parts water, like milk", "1 part paint to 7 parts water, like milk", "1 part paint to 2.5 parts water, like cream", "1 part paint to 1.5 parts water, like cream", "clear water"],
        coatMaps: ["4111623140", "3212265519", "1370707247", "3713559301", "3126508476", "1213797829"],
        regions: ["3 1561875687", "52 4032700893", "47 1245734400", "25 34032581", "37 1605982742", "1 2176614741"],
        buys: [4.697107196544072, 7.145642883972272, 4.666801418406821, 10.346623237740085, 4.697107196544072, 13.99378246803121, 4.703445051229568, 21.70469900042033, 4.697107196544072, 20.280377840130775, 4.603520370216601, 21.501678980680047, 4.697107196544072, 5.420918217873636, 7.161164096079295, 20.028915586382645, 4.697107196544072, 5.338310870183066, 6.3040461029903305, 21.947134456063605, 4.697107196544072, 4.697107196544072, 0, 0],
        steps: ["0 wash y 1 #fdf671 1", "1 wash r 1 #f8a591 2", "1 wash r 2 #f27259 25", "2 wash b 1 #bdd7ed 6", "2 wash b 2 #8fb8de 2", "2 wash b 3 #6e9fd1 15", "3 accent b 1 #6d9ed1 24", "4 accent r 1 #ed543b 24"],
        shares: [0.43109375, 0.5468229166666667, 0.22838541666666667, 0.9221875, 0.6218229166666667, 0.20098958333333333, 0.05625, 0.040989583333333336],
        comboCount: 32,
        combos: "750751781",
        comboMap: "4212725152",
        render: "903613214",
        renderPart: "126839133",
        area: 3.0485416666666674,
        deltaE: [4.697107196544072, 10.047600746154785, 0.05036458333333333]
    )

    private static let sceneProposal = Reference(
        paintIDs: ["schmincke-horadam-226", "schmincke-horadam-509", "schmincke-horadam-472", "schmincke-horadam-344", "schmincke-horadam-365"],
        layers: ["wash - schmincke-horadam-226 1 #ffffff #fae963 #fae963 #fae963", "wash - schmincke-horadam-509 3 #ffffff #c2f7f8 #94eff2 #71e7ec", "wash - schmincke-horadam-472 2 #ffffff #f3dff1 #e8c4e4 #e8c4e4", "wash - schmincke-horadam-344 2 #ffffff #f297a6 #e96375 #e96375", "accent colour schmincke-horadam-365 1 #ffffff #e73620 #e73620 #e73620", "accent dark schmincke-horadam-472 1 #ffffff #852677 #852677 #852677"],
        strengths: [0.27976806422819517, 0.0622927198249095, 0.05, 0.24535617193694428, 0.9394130628134758, 1],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 4 parts water, like milk", "1 part paint to 15 parts water, like coffee", "1 part paint to 20 parts water, like tea", "1 part paint to 4 parts water, like milk", "1 part paint to 1 part water, like butter", "1 part paint to 1 part water, like butter"],
        coatMaps: ["826100372", "2958482709", "3361317566", "4183840326", "2102683205", "3837734117"],
        regions: ["14 3129707486", "30 1516616094", "30 3460429248", "24 1353553835", "12 1440169284", "11 2097133671"],
        buys: [4.128849340135076, 8.577574824079349, 3.30725766961851, 11.677226243036493, 4.128849340135076, 14.051152265764209, 3.792948356355508, 15.107131523719808, 4.128849340135076, 8.362747438873075, 4.078662313274647, 9.981279470969223, 4.128849340135076, 16.03195641511954, 3.1288386305969262, 25.72967484892182, 4.128849340135076, 4.576017879184197, 9.689490144637642, 18.94125302151602, 4.128849340135076, 4.651260890199182, 9.75260051165826, 20.65510242603961],
        steps: ["0 wash schmincke-horadam-226 1 #fae963 2", "1 wash schmincke-horadam-509 1 #c2f7f8 1", "1 wash schmincke-horadam-509 2 #94eff2 6", "1 wash schmincke-horadam-509 3 #71e7ec 12", "2 wash schmincke-horadam-472 1 #f3dff1 10", "2 wash schmincke-horadam-472 2 #e8c4e4 15", "3 wash schmincke-horadam-344 1 #f297a6 2", "3 wash schmincke-horadam-344 2 #e96375 10", "4 accent schmincke-horadam-365 1 #e73620 11", "5 accent schmincke-horadam-472 1 #852677 10"],
        shares: [0.5315104166666667, 0.8769791666666666, 0.5095833333333334, 0.2171875, 0.7172916666666667, 0.36578125, 0.5266666666666666, 0.19932291666666666, 0.04833333333333333, 0.04791666666666667],
        comboCount: 45,
        combos: "843078756",
        comboMap: "3646247916",
        render: "3728101380",
        renderPart: "2585802987",
        area: 4.040572916666667,
        deltaE: [4.128849340135076, 10.152939796447754, 0.0509375]
    )

    private static let sceneCoarse = Reference(
        paintIDs: ["schmincke-horadam-496", "schmincke-horadam-526", "schmincke-horadam-365", "schmincke-horadam-226", "schmincke-horadam-645"],
        layers: ["wash - schmincke-horadam-496 2 #ffffff #c6ddf0 #9dc2e3", "wash - schmincke-horadam-526 2 #ffffff #b2df92 #86c95e", "wash - schmincke-horadam-365 2 #ffffff #f79b86 #f0674e", "accent colour schmincke-horadam-226 1 #ffffff #f5d520 #f5d520", "accent dark schmincke-horadam-645 1 #ffffff #7c403d #7c403d"],
        strengths: [0.11190722569127808, 0.2745712850769565, 0.2319358715821383, 0.6798890718400957, 0.9692332344763441],
        ratios: [1, 1, 1, 1, 1],
        guides: ["1 part paint to 9 parts water, like coffee", "1 part paint to 4 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 1.5 parts water, like cream", "1 part paint to 1 part water, like butter"],
        coatMaps: ["2101068013", "780497623", "4272944887", "3042896981", "1159309733"],
        regions: ["17 1845159745", "8 2920767114", "16 1337580205", "6 1644485124", "11 1084351786"],
        buys: [4.73386536757953, 12.510989889455686, 4.937972240717407, 15.083812197939897, 4.73386536757953, 10.653417835527554, 4.330882777130277, 17.468899647622315, 4.73386536757953, 15.840674771295198, 4.395447608054148, 24.761212665903194, 4.73386536757953, 4.990279901329605, 11.188204239930126, 24.315228152050064, 4.73386536757953, 5.91638733019591, 7.095462761982835, 31.561434402321694],
        steps: ["0 wash schmincke-horadam-496 1 #c6ddf0 4", "0 wash schmincke-horadam-496 2 #9dc2e3 6", "1 wash schmincke-horadam-526 1 #b2df92 1", "1 wash schmincke-horadam-526 2 #86c95e 2", "2 wash schmincke-horadam-365 1 #f79b86 2", "2 wash schmincke-horadam-365 2 #f0674e 2", "3 accent schmincke-horadam-226 1 #f5d520 4", "4 accent schmincke-horadam-645 1 #7c403d 10"],
        shares: [0.7665333333333333, 0.3728666666666667, 0.45056666666666667, 0.2155, 0.5453666666666667, 0.23963333333333334, 0.019533333333333333, 0.04833333333333333],
        comboCount: 26,
        combos: "1652993040",
        comboMap: "1622203282",
        render: "821137595",
        renderPart: "3311100063",
        area: 2.6583333333333337,
        deltaE: [4.73386536757953, 11.027115821838379, 0.06496666666666667]
    )

    private static let sceneGraded = Reference(
        paintIDs: ["y", "r", "b"],
        layers: ["wash - y 1 #ffffff #fdf55f #fdf55f #fdf55f #fdf55f", "wash - r 3 #ffffff #fbc9bb #f6917b #ef6047 #ef6047", "wash - b 4 #ffffff #c7def0 #9bc1e3 #79a8d6 #5e92ca", "accent any b 1 #ffffff #70a0d2 #70a0d2 #70a0d2 #70a0d2"],
        strengths: [0.2644655290525568, 0.10627135860362891, 0.10996628460655557, 0.4],
        ratios: [1, 1.510589542307673, 1.077884150884632, 1],
        guides: ["1 part paint to 4 parts water, like milk", "1 part paint to 9 parts water, like coffee", "1 part paint to 9 parts water, like coffee", "1 part paint to 2.5 parts water, like cream"],
        coatMaps: ["2980720668", "2952763917", "3308462497", "3837734117"],
        regions: ["3 4133037234", "6 51486174", "29 3006989690", "11 2097133671"],
        buys: [4.032853391711609, 7.169805347530436, 3.60624691456546, 11.896608587204305, 4.032853391711609, 14.514075210516392, 3.861210878329294, 22.57419757361043, 4.032853391711609, 20.90053271407005, 3.934548914789655, 21.821406475227125, 4.032853391711609, 4.523558794626606, 4.9233138551007585, 15.164122263761563],
        steps: ["0 wash y 1 #fdf55f 1", "1 wash r 1 #fbc9bb 1", "1 wash r 2 #f6917b 2", "1 wash r 3 #ef6047 2", "2 wash b 1 #c7def0 1", "2 wash b 2 #9bc1e3 3", "2 wash b 3 #79a8d6 9", "2 wash b 4 #5e92ca 12", "3 accent b 1 #70a0d2 10"],
        shares: [0.37838541666666664, 0.5601041666666666, 0.3854166666666667, 0.21395833333333333, 0.9430208333333333, 0.6788020833333334, 0.37364583333333334, 0.15640625, 0.04791666666666667],
        comboCount: 27,
        combos: "3600682343",
        comboMap: "989604153",
        render: "1796104350",
        renderPart: "3762903600",
        area: 3.7376562499999997,
        deltaE: [4.032853391711609, 8.020135879516602, 0.03526041666666667]
    )

    private static let sceneUnused = Reference(
        paintIDs: ["schmincke-horadam-347", "schmincke-horadam-208"],
        layers: ["wash - schmincke-horadam-347 3 #ffffff #f29e98 #e96e67 #e2544d", "accent any schmincke-horadam-347 1 #ffffff #f5afaa #f5afaa #f5afaa", "accent colour schmincke-horadam-208 1 #ffffff #fae409 #fae409 #fae409"],
        strengths: [0.3311961896822165, 0.25, 1],
        ratios: [1, 1, 1],
        guides: ["1 part paint to 3 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 1 part water, like butter"],
        coatMaps: ["3933017254", "3309584709", "3091386068"],
        regions: ["11 3792561014", "1 2228538357", "6 3429709657"],
        buys: [17.38117623823272, 36.01241406722016, 18.8835879240633, 41.47451287669195, 17.38117623823272, 17.38117623823272, 0, 0, 17.38117623823272, 17.52181313517432, 21.70647663625874, 29.41651971732103],
        steps: ["0 wash schmincke-horadam-347 1 #f29e98 1", "0 wash schmincke-horadam-347 2 #e96e67 2", "0 wash schmincke-horadam-347 3 #e2544d 2", "2 accent schmincke-horadam-208 1 #fae409 4"],
        shares: [0.8247222222222222, 0.5591666666666667, 0.5075, 0.01824074074074074],
        comboCount: 6,
        combos: "1520372848",
        comboMap: "2949627245",
        render: "628807302",
        renderPart: "4019304038",
        area: 1.9096296296296296,
        deltaE: [17.38117623823272, 42.333251953125, 0.8683333333333333]
    )

    private static let cwm = Reference(
        paintIDs: ["schmincke-horadam-972", "schmincke-horadam-485", "schmincke-horadam-780", "schmincke-horadam-662", "schmincke-horadam-669", "schmincke-horadam-645"],
        layers: ["wash - schmincke-horadam-972 1 #ffffff #f6f4fa #f6f4fa #f6f4fa", "wash - schmincke-horadam-485 1 #ffffff #e4e9ef #e4e9ef #e4e9ef", "wash - schmincke-horadam-780 1 #ffffff #89867d #89867d #89867d", "wash - schmincke-horadam-662 3 #ffffff #b3a8a1 #807168 #5e4e45", "accent any schmincke-horadam-669 1 #ffffff #d2c6b1 #d2c6b1 #d2c6b1", "accent dark schmincke-horadam-645 1 #ffffff #7c403d #7c403d #7c403d"],
        strengths: [0.05888548126486663, 0.10578621162102275, 0.7274957073091007, 0.29287603741542023, 0.24230830861908603, 0.9692332344763441],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 15 parts water, like coffee", "1 part paint to 9 parts water, like coffee", "1 part paint to 1.5 parts water, like cream", "1 part paint to 3 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 1 part water, like butter"],
        coatMaps: ["1915535932", "1512451652", "1016977597", "4005246204", "317845084", "3951957557"],
        regions: ["17 685832421", "47 3989128399", "20 207891496", "55 2328854596", "26 980365519", "25 2096100640"],
        buys: [4.632712133608084, 5.0840594821018135, 2.200266286352619, 3.7602552367175712, 4.632712133608084, 5.464610629056465, 4.89844137905201, 7.174667300631013, 4.632712133608084, 10.41045895792685, 6.654300020001349, 21.278590165620187, 4.632712133608084, 18.421584357481613, 6.507639850545199, 30.202080826364, 4.632712133608084, 5.109227198555209, 8.378875080716355, 18.357931523954882, 4.632712133608084, 4.777855007013209, 6.64855833434572, 33.557068572374426],
        steps: ["0 wash schmincke-horadam-972 1 #f6f4fa 9", "1 wash schmincke-horadam-485 1 #e4e9ef 33", "2 wash schmincke-horadam-780 1 #89867d 4", "3 wash schmincke-horadam-662 1 #b3a8a1 4", "3 wash schmincke-horadam-662 2 #807168 11", "3 wash schmincke-horadam-662 3 #5e4e45 9", "4 accent schmincke-horadam-669 1 #d2c6b1 24", "5 accent schmincke-horadam-645 1 #7c403d 24"],
        shares: [0.2893272727272727, 0.3654727272727273, 0.39507878787878786, 0.5819454545454545, 0.4080121212121212, 0.14178181818181818, 0.04775151515151515, 0.005393939393939394],
        comboCount: 60,
        combos: "3704774853",
        comboMap: "1202750192",
        render: "2383832010",
        renderPart: "3122190003",
        area: 2.234763636363636,
        deltaE: [4.632712133608084, 15.849043846130371, 0.11283030303030303]
    )

    private static let dusk = Reference(
        paintIDs: ["schmincke-horadam-480", "schmincke-horadam-496", "schmincke-horadam-645", "schmincke-horadam-780", "schmincke-horadam-225", "schmincke-horadam-485", "schmincke-horadam-662"],
        layers: ["wash - schmincke-horadam-480 1 #ffffff #cde8f5 #cde8f5 #cde8f5", "wash - schmincke-horadam-496 3 #ffffff #accce8 #79a7d6 #578cc7", "wash - schmincke-horadam-645 2 #ffffff #b68785 #894e4b #894e4b", "wash - schmincke-horadam-780 1 #ffffff #706c63 #706c63 #706c63", "accent colour schmincke-horadam-225 1 #ffffff #f9e733 #f9e733 #f9e733", "accent any schmincke-horadam-485 1 #ffffff #aebbcb #aebbcb #aebbcb", "accent dark schmincke-horadam-662 1 #ffffff #605047 #605047 #605047"],
        strengths: [0.10578621162102275, 0.1790515611060449, 0.4075707540208105, 1, 0.3876932937905377, 0.37576522512539035, 0.8553453273074226],
        ratios: [1, 1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 9 parts water, like coffee", "1 part paint to 6 parts water, like milk", "1 part paint to 2.5 parts water, like cream", "1 part paint to 1 part water, like butter", "1 part paint to 2.5 parts water, like cream", "1 part paint to 2.5 parts water, like cream", "1 part paint to 1 part water, like butter"],
        coatMaps: ["4223214613", "2495044829", "1438384678", "4274926076", "2878312036", "4141442268", "54219485"],
        regions: ["31 2361300491", "29 227364000", "19 1899091101", "4 948993446", "8 954183227", "29 3658017870", "26 2659464189"],
        buys: [4.644875730255588, 5.634368271093883, 4.146962260973781, 6.1500733551782165, 4.644875730255588, 15.08001014114731, 4.641487180464975, 16.337023072932343, 4.644875730255588, 15.862346324348968, 4.76286886006097, 23.750440822348175, 4.644875730255588, 8.320910636371412, 4.4298398667748975, 16.617662308960636, 4.644875730255588, 4.704576008945742, 8.548600846780952, 15.453043430730249, 4.644875730255588, 5.102167373490648, 8.31231634137911, 15.056030367268605, 4.644875730255588, 5.019290385496095, 3.749677250933273, 16.184291530920756],
        steps: ["0 wash schmincke-horadam-480 1 #cde8f5 26", "1 wash schmincke-horadam-496 1 #accce8 1", "1 wash schmincke-horadam-496 2 #79a7d6 5", "1 wash schmincke-horadam-496 3 #578cc7 8", "2 wash schmincke-horadam-645 1 #b68785 1", "2 wash schmincke-horadam-645 2 #894e4b 5", "3 wash schmincke-horadam-780 1 #706c63 2", "4 accent schmincke-horadam-225 1 #f9e733 7", "5 accent schmincke-horadam-485 1 #aebbcb 24", "6 accent schmincke-horadam-662 1 #605047 24"],
        shares: [0.4939778645833333, 0.8922322591145834, 0.5537109375, 0.2850138346354167, 0.5907796223958334, 0.3953653971354167, 0.3016153971354167, 0.008646647135416666, 0.06781005859375, 0.030110677083333332],
        comboCount: 117,
        combos: "599091724",
        comboMap: "2117372030",
        render: "382014682",
        renderPart: "701772237",
        area: 3.6192626953125,
        deltaE: [4.644875730255588, 12.811756134033203, 0.07698567708333333]
    )

    private static let sceneLarge = Reference(
        paintIDs: ["schmincke-horadam-208", "schmincke-horadam-494", "schmincke-horadam-480", "schmincke-horadam-363", "schmincke-horadam-787"],
        layers: ["wash - schmincke-horadam-208 1 #ffffff #fdf563 #fdf563 #fdf563", "wash - schmincke-horadam-494 2 #ffffff #d9e2f2 #bacae7 #bacae7", "wash - schmincke-horadam-480 2 #ffffff #b1d9ef #7fbce2 #7fbce2", "wash - schmincke-horadam-363 2 #ffffff #f6999f #ef666e #ef666e", "accent any schmincke-horadam-787 1 #ffffff #c9d2d9 #c9d2d9 #c9d2d9", "accent dark schmincke-horadam-494 1 #ffffff #314e9b #314e9b #314e9b"],
        strengths: [0.2547317212630066, 0.06347172697261363, 0.1824404494214849, 0.27457128507695644, 0.24230830861908603, 0.8],
        ratios: [1, 1, 1, 1, 1, 1],
        guides: ["1 part paint to 4 parts water, like milk", "1 part paint to 15 parts water, like coffee", "1 part paint to 5 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 4 parts water, like milk", "1 part paint to 1.5 parts water, like cream"],
        coatMaps: ["1619388917", "2964893702", "395940567", "3055838751", "2414671708", "3271656805"],
        regions: ["12 1098677254", "65 3769803866", "31 3323601298", "7 2365695413", "15 1289776501", "11 3619376383"],
        buys: [3.8980398734925137, 8.448286415751397, 3.6749079751938396, 12.05602209754325, 3.8980398734925137, 8.083944511370857, 4.044530021893833, 10.12262006691123, 3.8980398734925137, 12.937335430754427, 3.1890809009980026, 16.915703511213273, 3.8980398734925137, 14.335451471554759, 3.6423548897330407, 23.791879168184806, 3.8980398734925137, 4.129225159964598, 4.595866797035071, 8.07833776852741, 3.8980398734925137, 5.442960367695155, 5.194292326827979, 36.35235271410799],
        steps: ["0 wash schmincke-horadam-208 1 #fdf563 2", "1 wash schmincke-horadam-494 1 #d9e2f2 31", "1 wash schmincke-horadam-494 2 #bacae7 34", "2 wash schmincke-horadam-480 1 #b1d9ef 9", "2 wash schmincke-horadam-480 2 #7fbce2 2", "3 wash schmincke-horadam-363 1 #f6999f 2", "3 wash schmincke-horadam-363 2 #ef666e 3", "4 accent schmincke-horadam-787 1 #c9d2d9 13", "5 accent schmincke-horadam-494 1 #314e9b 10"],
        shares: [0.5429166666666667, 0.6886875, 0.25951875, 0.6585229166666666, 0.2628479166666667, 0.5179979166666666, 0.22569375, 0.06638541666666667, 0.04958333333333333],
        comboCount: 38,
        combos: "1491492835",
        comboMap: "3015715335",
        render: "2593634410",
        renderPart: "1417508676",
        area: 3.272154166666667,
        deltaE: [3.8980398734925137, 7.595681667327881, 0.014341666666666667]
    )

    func testPlansGivenPaintsOnAPicture() {
        let plan = Layers.layerImage(rgba: scene(160, 120), width: 160, height: 120, paints: [yellow, blue, red, black], paintIDs: ["y", "b", "r", "k"])
        check(plan, Self.sceneGiven)
        XCTAssertEqual(plan.combos.map { "\($0.coats.map(String.init).joined()) \($0.hex) \($0.pixelCount)" }, [
            "000000 #ffffff 1046", "002000 #8fb8de 2889", "003000 #6e9fd1 89", "001000 #bdd7ed 3755", "021000 #b35f52 868", "010010 #ec4d34 406", "000010 #f37b63 10",
            "101000 #bbd069 188", "102100 #4a7c53 103", "103000 #6e9a5c 522", "101100 #639159 29", "113000 #6a6130 2348", "112000 #8a7134 2981", "102000 #8eb162 14",
            "102010 #875421 4", "111100 #605c2f 28", "111000 #b68538 4", "100000 #fdf671 32", "101010 #b26324 20", "122000 #864d1d 1082", "121000 #b15b1f 875",
            "123100 #342b15 6", "122100 #453317 1", "022100 #463540 9", "023100 #342d3c 561", "012110 #442225 140", "013110 #331c22 203", "123000 #68421a 40",
            "022000 #87504c 855", "023000 #684447 88", "012010 #84352c 2", "013010 #662d29 2",
        ])
        // The red wash: two coats, the second inside the first.
        let wash = plan.layers[1]
        XCTAssertEqual(wash.coats.map(\.hex), ["#f8a591", "#f27259", "#f27259"])
        assertClose(wash.coats.map(\.share), [0.5468229166666667, 0.22838541666666667, 0], accuracy: 1e-12, "share")
        assertClose(wash.coats.map(\.only), [0.3184375, 0.22838541666666667, 0], accuracy: 1e-12, "only")
        XCTAssertEqual(wash.coats.map(\.shapes), [2, 25, 0])
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
        XCTAssertEqual(Layers.proposePaints(colours: colours, paints: paints), ["schmincke-horadam-226", "schmincke-horadam-509", "schmincke-horadam-472", "schmincke-horadam-344"])
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
        XCTAssertEqual(hash(plan.comboMap), "1959548734")
        XCTAssertEqual(plan.steps.count, 8)
        XCTAssertEqual(plan.layers.map { hash($0.coatMap) }.joined(separator: " "), "346818580 4199021580 3854250687 3067583284 1234519940 1213797829")
        XCTAssertEqual(plan.deltaE.mean, 4.75304255945401, accuracy: 1e-9)
        consistent(plan)
    }
}
