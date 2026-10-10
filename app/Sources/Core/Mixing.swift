import Foundation

// Subtractive watercolour mixing. A port of src/lib/mixing.js; keep the two in step.
//
// Model: transparent watercolour behaves roughly like a filter over white paper
// (Beer-Lambert). Each paint's swatch colour gives a per-channel absorbance
// A = -ln(reflectance). A mix of paints with amounts a_i reflects
// exp(-sum d(a_i) * A_i). An amount of 1 means "as strong as the reference swatch";
// smaller amounts mean more water, larger amounts mean a richer, darker layer.
//
// d(a) is the depth a paint reaches at amount a. It is 1 at amount 1 and levels off at
// maxDepth: a paint laid on thickly approaches its masstone and does not keep getting
// darker and more saturated. Without that limit a thick yellow-orange would turn into a
// deep red-orange, which no amount of that paint gives on paper.
//
// Finding a recipe is a non-negative least-squares problem in absorbance space,
// followed by a small perceptual (OKLab) refinement.

struct RecipeItem: Hashable, Sendable {
    let paintID: String
    let amount: Double
    let share: Double
}

struct Recipe: Hashable, Sendable {
    let paints: [RecipeItem]
    /// Simple ratio parts, in the order of `paints`.
    let parts: [Double]
    let strength: Double
    let dilution: String
    let hex: String
    let deltaE: Double

    var quality: String { Mixing.matchQuality(deltaE) }
}

/// What the mixing model needs to know about a paint.
struct MixPaint: Sendable {
    let id: String
    let hex: String
}

enum Mixing {
    private static let minReflectance = 0.0005
    private static let maxAmount = 4.0
    /// Depth of the masstone relative to the reference swatch. An estimate: the stock data holds
    /// one colour per paint, not its masstone.
    static let maxDepth = 1.6
    private static let depthRate = -1 / log(1 - 1 / maxDepth)

    /// Depth reached by a paint at the given amount: 0 at 0, 1 at 1, maxDepth for a thick layer.
    static func depth(_ amount: Double) -> Double {
        maxDepth * (1 - exp(-amount / depthRate))
    }

    /// Amount needed for a depth; depths the paint cannot reach give the largest amount.
    private static func amount(forDepth d: Double) -> Double {
        d >= depth(maxAmount) ? maxAmount : -depthRate * log(1 - d / maxDepth)
    }
    /// Each extra paint in a recipe must buy at least this much deltaE to be preferred.
    private static let extraPaintPenalty = 1.2

    static func absorbance(linear: Vec3) -> Vec3 {
        Vec3(
            -log(min(1, max(minReflectance, linear.x))),
            -log(min(1, max(minReflectance, linear.y))),
            -log(min(1, max(minReflectance, linear.z)))
        )
    }

    static func absorbance(hex: String) -> Vec3 {
        absorbance(linear: ColorMath.linear(rgb: ColorMath.rgb(hex: hex)))
    }

    static func mix(_ absorbances: [Vec3], _ amounts: [Double]) -> Vec3 {
        var total = Vec3(0, 0, 0)
        for (a, amount) in zip(absorbances, amounts) { total += a * depth(amount) }
        return Vec3(exp(-total.x), exp(-total.y), exp(-total.z))
    }

    /// Predicted colour of mixing the given paints with the given amounts on white paper.
    static func mixHex(_ paints: [MixPaint], _ amounts: [Double]) -> String {
        ColorMath.hex(rgb: ColorMath.rgb(linear: mix(paints.map { absorbance(hex: $0.hex) }, amounts)))
    }

    private static func dot(_ a: Vec3, _ b: Vec3) -> Double { (a * b).sum() }

    /// Solve the 3xk least-squares system M*a = t via normal equations (k <= 3).
    private static func leastSquares(_ columns: [Vec3], _ t: Vec3) -> [Double]? {
        let n = columns.count
        var m = (0..<n).map { i in columns.map { dot(columns[i], $0) } + [dot(columns[i], t)] }
        for col in 0..<n {
            var pivot = col
            for r in (col + 1)..<max(col + 1, n) where abs(m[r][col]) > abs(m[pivot][col]) { pivot = r }
            if abs(m[pivot][col]) < 1e-10 { return nil }
            m.swapAt(col, pivot)
            for r in 0..<n where r != col {
                let f = m[r][col] / m[col][col]
                for c in col...n { m[r][c] -= f * m[col][c] }
            }
        }
        return (0..<n).map { m[$0][n] / m[$0][$0] }
    }

    private static func evaluate(_ absorbances: [Vec3], _ amounts: [Double], _ targetLab: Vec3) -> Double {
        ColorMath.deltaE(ColorMath.oklab(linear: mix(absorbances, amounts)), targetLab)
    }

    /// Pattern search on the amounts to minimise perceptual error.
    private static func refine(_ absorbances: [Vec3], _ amounts: [Double], _ targetLab: Vec3) -> (amounts: [Double], deltaE: Double) {
        var best = amounts
        var bestErr = evaluate(absorbances, best, targetLab)
        var step = 0.25
        var iter = 0
        while iter < 40 && step > 0.005 {
            var improved = false
            for i in best.indices {
                for dir in [1.0, -1.0] {
                    var trial = best
                    trial[i] = min(maxAmount, max(0.01, trial[i] * (1 + dir * step) + dir * step * 0.05))
                    let err = evaluate(absorbances, trial, targetLab)
                    if err < bestErr {
                        best = trial
                        bestErr = err
                        improved = true
                    }
                }
            }
            if !improved { step /= 2 }
            iter += 1
        }
        return (best, bestErr)
    }

    private struct Candidate {
        var indices: [Int] // into the pool; empty = plain paper
        var amounts: [Double]
        var deltaE: Double
    }

    /// The best watercolour recipes for a target colour, best first.
    static func findRecipes(target targetHex: String, paints: [MixPaint], maxPaints: Int = 3, limit: Int = 5) -> [Recipe] {
        let targetLinear = ColorMath.linear(rgb: ColorMath.rgb(hex: targetHex))
        let targetLab = ColorMath.oklab(linear: targetLinear)
        let t = absorbance(linear: targetLinear)
        let pool = paints.map { absorbance(hex: $0.hex) }

        // Plain paper is a legitimate answer for near-white targets.
        var results = [Candidate(indices: [], amounts: [], deltaE: ColorMath.deltaE(ColorMath.oklab(linear: Vec3(1, 1, 1)), targetLab))]

        func consider(_ indices: [Int]) {
            let columns = indices.map { pool[$0] }
            guard let a = leastSquares(columns, t), a.allSatisfy({ $0 > 0 }) else { return }
            // The least-squares solution is in depths; turn them into amounts.
            let amounts = a.map { amount(forDepth: $0) }
            results.append(Candidate(indices: indices, amounts: amounts, deltaE: evaluate(columns, amounts, targetLab)))
        }

        let n = pool.count
        for i in 0..<n { consider([i]) }
        if maxPaints >= 2 {
            for i in 0..<n { for j in (i + 1)..<max(i + 1, n) { consider([i, j]) } }
        }
        if maxPaints >= 3 {
            // Triples only among paints that already performed well, to keep it fast.
            var shortlist = Set<Int>()
            for r in results.sorted(by: { $0.deltaE < $1.deltaE }).prefix(30) { shortlist.formUnion(r.indices) }
            let short = Array((0..<n).filter { shortlist.contains($0) }.prefix(14))
            let m = short.count
            for i in 0..<m { for j in (i + 1)..<max(i + 1, m) { for k in (j + 1)..<max(j + 1, m) { consider([short[i], short[j], short[k]]) } } }
        }

        // Perceptual refinement is the expensive part: only do it for the most promising candidates.
        results.sort { $0.deltaE < $1.deltaE }
        for i in results.indices.prefix(40) where !results[i].indices.isEmpty {
            let refined = refine(results[i].indices.map { pool[$0] }, results[i].amounts, targetLab)
            results[i].amounts = refined.amounts
            results[i].deltaE = refined.deltaE
        }

        func score(_ r: Candidate) -> Double { r.deltaE + extraPaintPenalty * Double(max(0, r.indices.count - 1)) }
        var seen = Set<[Int]>()
        var recipes: [Recipe] = []
        for r in results.sorted(by: { score($0) < score($1) }) {
            guard seen.insert(r.indices.sorted()).inserted else { continue }
            recipes.append(recipe(r, paints: paints, pool: pool))
            if recipes.count == limit { break }
        }
        return recipes
    }

    private static func recipe(_ r: Candidate, paints: [MixPaint], pool: [Vec3]) -> Recipe {
        recipe(ids: r.indices.map { paints[$0].id }, absorbances: r.indices.map { pool[$0] }, amounts: r.amounts, deltaE: r.deltaE)
    }

    private static func recipe(ids: [String], absorbances: [Vec3], amounts: [Double], deltaE: Double) -> Recipe {
        let strength = amounts.reduce(0, +)
        let items = zip(ids, amounts)
            .map { RecipeItem(paintID: $0, amount: $1, share: strength > 0 ? $1 / strength : 0) }
            .sorted { $0.amount > $1.amount }
        return Recipe(
            paints: items,
            parts: toParts(amounts.sorted(by: >)),
            strength: strength,
            dilution: describeDilution(strength),
            hex: ColorMath.hex(rgb: ColorMath.rgb(linear: mix(absorbances, amounts))),
            deltaE: deltaE
        )
    }

    /// The same mix with more or less water: every amount scaled by one factor so the result
    /// comes as close to the target as that mix can get. Nil when the recipe has no paints (paper white).
    static func washRecipe(_ recipe: Recipe, target targetHex: String, paints: [String: MixPaint]) -> Recipe? {
        guard !recipe.paints.isEmpty else { return nil }
        let targetLab = ColorMath.oklab(hex: targetHex)
        let ids = recipe.paints.map(\.paintID)
        let absorbances = ids.map { absorbance(hex: paints[$0]?.hex ?? "#ffffff") }
        let base = recipe.paints.map(\.amount)
        let largest = base.max() ?? 1
        func error(_ logT: Double) -> Double { evaluate(absorbances, base.map { $0 * exp(logT) }, targetLab) }
        // Coarse scan over the water level, then golden-section search around the best step.
        let lo = log(0.02 / largest)
        let hi = log(maxAmount / largest)
        let steps = 48
        var best = lo
        var bestErr = Double.infinity
        for i in 0...steps {
            let t = lo + (hi - lo) * Double(i) / Double(steps)
            let err = error(t)
            if err < bestErr { bestErr = err; best = t }
        }
        var a = max(lo, best - (hi - lo) / Double(steps))
        var b = min(hi, best + (hi - lo) / Double(steps))
        let phi = (5.0.squareRoot() - 1) / 2
        for _ in 0..<24 {
            let c = b - (b - a) * phi
            let d = a + (b - a) * phi
            if error(c) < error(d) { b = d } else { a = c }
        }
        let logT = (a + b) / 2
        return self.recipe(ids: ids, absorbances: absorbances, amounts: base.map { $0 * exp(logT) }, deltaE: error(logT))
    }

    /// Propose a small set of paints that mixes all the given target colours.
    /// Works through the targets from the largest area down and, among the recipes that are
    /// nearly as close as the best one, takes the recipe needing the fewest paints not chosen yet.
    static func proposePaints(targets: [(hex: String, weight: Double)], paints: [MixPaint], maxPaints: Int = 3, tolerance: Double = 2) -> [String] {
        var chosen: [String] = []
        func newPaints(_ r: Recipe) -> Int { r.paints.filter { !chosen.contains($0.paintID) }.count }
        for target in targets.sorted(by: { $0.weight > $1.weight }) {
            let recipes = findRecipes(target: target.hex, paints: paints, maxPaints: maxPaints, limit: 8)
            guard let best = recipes.map(\.deltaE).min() else { continue }
            let pick = recipes
                .filter { $0.deltaE <= best + tolerance }
                .min { (newPaints($0), $0.deltaE) < (newPaints($1), $1.deltaE) }
            for item in pick?.paints ?? [] where !chosen.contains(item.paintID) { chosen.append(item.paintID) }
        }
        return chosen
    }

    /// Express amounts as simple ratio parts, e.g. [0.9, 0.3] -> [3, 1].
    static func toParts(_ amounts: [Double]) -> [Double] {
        guard let smallest = amounts.min() else { return [] }
        // Round to halves, cap the largest ratio so it stays practical on a palette.
        return amounts.map { min(20, (($0 / smallest) * 2).rounded() / 2) }
    }

    static func describeDilution(_ strength: Double) -> String {
        if strength <= 0.02 { return "paper only" }
        if strength < 0.35 { return "very watery wash" }
        if strength < 0.8 { return "light wash" }
        if strength < 1.5 { return "medium" }
        if strength < 2.5 { return "rich" }
        return "very concentrated (layer/glaze)"
    }

    /// Letters for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
    static let washLetters: [(letter: String, label: String)] = [
        ("W", "very watery"), ("L", "light"), ("M", "medium"), ("R", "rich"), ("C", "concentrated"),
    ]

    static func washLetter(_ strength: Double) -> String {
        if strength <= 0.02 { return "" }
        if strength < 0.35 { return "W" }
        if strength < 0.8 { return "L" }
        if strength < 1.5 { return "M" }
        if strength < 2.5 { return "R" }
        return "C"
    }

    /// Match quality label for a deltaE (OKLab x100) value.
    static func matchQuality(_ dE: Double) -> String {
        if dE < 2 { return "excellent" }
        if dE < 5 { return "good" }
        if dE < 10 { return "fair" }
        return "rough"
    }
}
