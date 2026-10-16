import XCTest
@testable import Watercolourlove

/// The mixing model against the web app since a paint is never darker than its swatch
/// (src/lib/mixing.js, MAX_AMOUNT = 1) and with value mode. Reference values were computed by
/// src/lib (in Node) on the same inputs.
final class MixingSyncTests: XCTestCase {
    private let yellow = MixPaint(id: "y", hex: "#fae409")
    private let blue = MixPaint(id: "b", hex: "#2b61ab")
    private let red = MixPaint(id: "r", hex: "#e6331d")
    private let black = MixPaint(id: "k", hex: "#706c63")

    private struct StockPaint: Decodable {
        let id: String
        let hex: String
        let enabled: Bool?
    }

    private func stock() throws -> [MixPaint] {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "paints", withExtension: "json"))
        return try JSONDecoder().decode([StockPaint].self, from: Data(contentsOf: url)).filter { $0.enabled == true }.map { MixPaint(id: $0.id, hex: $0.hex) }
    }

    private func describe(_ r: Recipe) -> String {
        r.paints.map(\.paintID).joined(separator: "+")
    }

    // MARK: No paint darker than its swatch

    func testNeverMakesAPaintDarkerThanItsSwatch() {
        XCTAssertEqual(Mixing.maxAmount, 1)
        for hex in ["#706c63", "#fae409", "#2b61ab"] {
            let paint = MixPaint(id: "p", hex: hex)
            XCTAssertEqual(Mixing.mixHex([paint], [4]), Mixing.mixHex([paint], [1]))
            XCTAssertLessThan(ColorMath.deltaE(ColorMath.oklab(hex: Mixing.mixHex([paint], [1])), ColorMath.oklab(hex: hex)), 0.5)
        }
        // A second paint in the mix does make it darker.
        let one = ColorMath.oklab(hex: Mixing.mixHex([blue], [1])).x
        let two = ColorMath.oklab(hex: Mixing.mixHex([blue, red], [1, 1])).x
        XCTAssertLessThan(two, one)
    }

    func testFindsNoRecipeThatUsesMoreOfAPaintThanItsSwatch() {
        let recipes = Mixing.findRecipes(target: "#101010", paints: [black, blue, red], maxPaints: 3, limit: 5)
        for recipe in recipes {
            for p in recipe.paints { XCTAssertLessThanOrEqual(p.amount, 1.0001) }
            XCTAssertLessThanOrEqual(recipe.fullness, 1.0001)
        }
        XCTAssertEqual(recipes.map(describe), ["k+b+r", "b+r", "k+b", "b", "k"])
        XCTAssertEqual(recipes.map(\.hex), ["#29191a", "#45262a", "#1a3653", "#2b61ab", "#706c63"])
        XCTAssertEqual(recipes[0].paints.map(\.amount)[2], 0.8798547329943823, accuracy: 1e-6)
        XCTAssertEqual(recipes[0].deltaE, 6.613352207430983, accuracy: 1e-6)
        XCTAssertEqual(recipes[1].deltaE, 14.441904860360205, accuracy: 1e-6)
    }

    func testMatchesLandscapeColoursFromTheStock() throws {
        let paints = try stock()
        let expected: [(target: String, ids: String, hex: String, deltaE: Double)] = [
            ("#8a7a52", "schmincke-horadam-662+schmincke-horadam-208", "#8a7a52", 0.005854795256479304),
            ("#5f6b7d", "schmincke-horadam-496+schmincke-horadam-672", "#5f6b7d", 0.01895939020552394),
            ("#a9b4c2", "schmincke-horadam-485", "#a6b5c6", 0.602410311003794),
            ("#4a4a3a", "schmincke-horadam-662+schmincke-horadam-515", "#4a4a3b", 0.14964155088389408),
        ]
        for e in expected {
            let best = try XCTUnwrap(Mixing.findRecipes(target: e.target, paints: paints).first)
            XCTAssertEqual(describe(best), e.ids, e.target)
            XCTAssertEqual(best.hex, e.hex, e.target)
            XCTAssertEqual(best.deltaE, e.deltaE, accuracy: 1e-4, e.target)
        }
    }

    func testNamesTheWaterLevelByFullness() {
        XCTAssertEqual([0.01, 0.02, 0.021, 0.099, 0.1, 0.3, 0.49, 0.5, 0.79, 0.8, 0.95, 1, 1.5].map { Mixing.washLetter($0, fine: true) },
                       ["", "", "W1", "W5", "L1", "M2", "M5", "R1", "R5", "C1", "C4", "C5", "C5"])
        XCTAssertEqual([0.01, 0.05, 0.2, 0.4, 0.7, 1].map(Mixing.describeDilution),
                       ["paper only", "very watery wash", "light wash", "medium", "rich", "concentrated (hardly any water)"])
    }

    // MARK: Value mode

    func testValueRecipesMatchTheLightnessAlone() throws {
        let paints = [yellow, blue, red, black]
        let expected: [(target: String, ids: [String], hexes: [String], first: [Double], deltaE: [Double])] = [
            ("#f2f2f2", ["y", "", "k", "y+k", "y+b"], ["#fef887", "#ffffff", "#f3f2f1", "#f7f5ca", "#f2f6d5"], [0.1660543246049216], [0, 3.884863962880103, 0, 0, 0]),
            ("#d0d0d0", ["y+k", "k", "y+r", "y+b", "b"], ["#ded658", "#d2d0cc", "#fac85b", "#ccdb77", "#b8d4ec"], [0.2875418561928659, 0.14377092809643294], [0, 0, 0, 0, 0]),
            ("#a0a0a0", ["y+b", "k", "y+k", "y+r", "r"], ["#92ae22", "#a3a099", "#aea42c", "#f17b1a", "#f2765d"], [0.6435710139321797, 0.3217855069660899], [0, 0, 0, 0, 0]),
            ("#777777", ["k", "b", "b+y", "r+k", "k+b"], ["#7b776e", "#4279bb", "#558552", "#be503a", "#667a89"], [0.8769620840842896], [0, 0, 0, 0, 0]),
            ("#505050", ["b+r", "b+k", "k+r", "b+r+k", "y+b+k"], ["#4e4e63", "#345370", "#793c2c", "#624949", "#405a17"], [0.67749594149713, 0.338747970748565], [0, 0, 0, 0, 0]),
            ("#2a2a2a", ["b+r+k", "b+r", "b+k", "r+k", "y+b+k"], ["#3a2324", "#45262a", "#1a3653", "#781f10", "#2e470b"], [0.7154499941573107, 0.7154499941573107, 0.7154499941573107], [0, 2.4540620901711554, 4.014952678468875, 9.766046159342007, 8.05688538534104]),
            ("#101010", ["b+r+k", "b+r", "b+k", "r+k", "y+b+k"], ["#2b1717", "#45262a", "#1a3653", "#781f10", "#2e470b"], [1, 1, 1], [5.839223111821496, 13.651571544637985, 15.212462132935705, 20.963555613808836, 19.25439483980787]),
        ]
        for e in expected {
            let recipes = Mixing.findRecipes(target: e.target, paints: paints, values: true)
            XCTAssertEqual(recipes.map(describe), e.ids, e.target)
            XCTAssertEqual(recipes.map(\.hex), e.hexes, e.target)
            XCTAssertEqual(recipes.count, e.deltaE.count, e.target)
            for (found, wanted) in zip(recipes.map(\.deltaE), e.deltaE) { XCTAssertEqual(found, wanted, accuracy: 1e-5, e.target) }
            for (found, wanted) in zip(recipes.first?.paints.map(\.amount) ?? [], e.first) { XCTAssertEqual(found, wanted, accuracy: 1e-6, e.target) }
        }
        // `deltaE` is the difference in lightness: a value hit is a match, whatever the hue.
        let blueGrey = try XCTUnwrap(Mixing.findRecipes(target: "#777777", paints: paints, values: true).first { $0.paints.map(\.paintID) == ["b"] })
        XCTAssertEqual(ColorMath.oklab(hex: blueGrey.hex).x, ColorMath.oklab(hex: "#777777").x, accuracy: 0.003)
    }

    func testValueRecipesKeepToMaxPaintsAndTheLimit() throws {
        let recipes = Mixing.findRecipes(target: "#606060", paints: [yellow, blue, red], maxPaints: 2, limit: 8, values: true)
        XCTAssertEqual(recipes.map(describe), ["b", "r+b", "b+y", "r", "r+y", "y", ""])
        XCTAssertEqual(recipes.map(\.hex), ["#2b61ab", "#904840", "#3c6e3a", "#e6331d", "#e84208", "#fae409", "#ffffff"])
        let expected = [0.6539077431909623, 0, 0, 11.414932016446194, 13.038937541736855, 41.93062947143778, 51.09435546659824]
        for (found, wanted) in zip(recipes.map(\.deltaE), expected) { XCTAssertEqual(found, wanted, accuracy: 1e-5) }

        let stockRecipes = Mixing.findRecipes(target: "#5a5a5a", paints: try stock(), values: true)
        XCTAssertEqual(stockRecipes.map(describe), ["schmincke-horadam-645", "schmincke-horadam-472", "schmincke-horadam-662", "schmincke-horadam-494", "schmincke-horadam-485+schmincke-horadam-494"])
        XCTAssertEqual(stockRecipes[0].paints[0].amount, 0.8948883749403834, accuracy: 1e-6)
    }

    func testValueReachIsTheDarkestThePaintsGo() {
        XCTAssertEqual(Mixing.valueReach(paints: [yellow]), 0.9083627400483955, accuracy: 1e-9)
        XCTAssertEqual(Mixing.valueReach(paints: [yellow, red]), 0.6032057654984796, accuracy: 1e-9)
        XCTAssertEqual(Mixing.valueReach(paints: [yellow, blue, red]), 0.30955802303920454, accuracy: 1e-9)
        XCTAssertEqual(Mixing.valueReach(paints: [yellow, blue, red], maxPaints: 1), 0.4955955227659273, accuracy: 1e-9)
        XCTAssertEqual(Mixing.valueReach(paints: [black]), 0.5321242615010684, accuracy: 1e-9)
        XCTAssertEqual(Mixing.valueReach(paints: []), 1)
    }

    func testValueWashMatchesTheLightness() throws {
        let full = try XCTUnwrap(Mixing.findRecipes(target: "#2b61ab", paints: [blue]).first)
        let value = try XCTUnwrap(Mixing.washRecipe(full, target: "#c0c0c0", paints: ["b": blue], values: true))
        XCTAssertEqual(value.strength, 0.2095359124734937, accuracy: 1e-5)
        XCTAssertEqual(value.hex, "#a1c5e5")
        XCTAssertLessThan(value.deltaE, 1e-4)
        let colour = try XCTUnwrap(Mixing.washRecipe(full, target: "#c0c0c0", paints: ["b": blue]))
        XCTAssertEqual(colour.strength, 0.18843555249615795, accuracy: 1e-5)
        XCTAssertEqual(colour.hex, "#a9cae7")
        XCTAssertEqual(colour.deltaE, 5.677442957174838, accuracy: 1e-5)
    }

    func testProposesPaintsForTheValues() {
        let greys = ["#f2f2f2", "#d0d0d0", "#a0a0a0", "#777777", "#505050", "#2a2a2a", "#101010"]
        let targets = greys.enumerated().map { (hex: $1, weight: Double(10 - $0)) }
        XCTAssertEqual(Mixing.proposePaints(targets: targets, paints: [yellow, blue, red, black], values: true), ["k", "r", "b"])
        XCTAssertEqual(Mixing.proposePaints(targets: targets, paints: [yellow, blue, red, black]), ["k", "b", "r"])
    }

    private func cluster(_ index: Int, _ hex: String, _ pixels: Int) -> Segmentation.Cluster {
        Segmentation.Cluster(index: index, group: index, level: 0, hex: hex, pixelCount: pixels)
    }

    func testPlansValueMixesAsTheWebApp() {
        let hexes = ["#a88b4c", "#715611", "#634908", "#392620", "#bb3405", "#7a7d08", "#3e3d34", "#3f3815", "#c14b03", "#772411", "#465d1e", "#464d0d"]
        // In value mode every colour starts as a mix of its own, whatever group the analysis gave it.
        let clusters = hexes.enumerated().map { Segmentation.Cluster(index: $0, group: 0, level: $0, hex: $1, pixelCount: 100 + $0 * 50) }
        for variety in [0, 10] {
            let mixes = Mixes.plan(clusters: clusters, paints: [yellow, blue, red], wanted: 4, variety: variety, values: true)
            XCTAssertEqual(mixes.sorted { $0.group < $1.group }.map { [$0.group] + $0.clusters.map(\.index).sorted() },
                           [[0, 0], [2, 1, 2, 6, 9, 11], [3, 3, 7, 10], [4, 4, 5, 8]], "variety \(variety)")
            XCTAssertEqual(mixes.map { $0.recipes.first.map(describe) ?? "" }, ["r", "b+r", "b+r", "b"], "variety \(variety)")
            XCTAssertEqual(mixes.map { $0.recipes.first?.hex ?? "" }, ["#ed553c", "#4b4b60", "#45262a", "#356bb2"], "variety \(variety)")
        }
    }

    func testPlansColourMixesWithoutValueMode() {
        let hexes = ["#a88b4c", "#715611", "#634908", "#392620", "#bb3405", "#7a7d08", "#3e3d34", "#3f3815", "#c14b03", "#772411", "#465d1e", "#464d0d"]
        let clusters = hexes.enumerated().map { cluster($0, $1, 100 + $0 * 50) }
        let mixes = Mixes.plan(clusters: clusters, paints: [yellow, blue, red], wanted: 4, variety: 0)
        XCTAssertEqual(mixes.sorted { $0.group < $1.group }.map { [$0.group] + $0.clusters.map(\.index).sorted() }, [[1, 0, 1, 2, 11], [4, 4, 8], [7, 3, 6, 7, 9], [10, 5, 10]])
    }
}
