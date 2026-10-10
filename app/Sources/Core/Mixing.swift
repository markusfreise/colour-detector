import Foundation

// Subtractive watercolour mixing. A port of src/lib/mixing.js; keep the two in step.
//
// Model: transparent watercolour behaves roughly like a filter over white paper
// (Beer-Lambert). Each paint's swatch colour gives a per-channel absorbance
// A = -ln(reflectance). A mix of paints with amounts a_i reflects
// exp(-sum a_i * A_i). An amount of 1 means "as strong as the reference swatch";
// smaller amounts mean more water, larger amounts mean a richer, darker layer.
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
        for (a, amount) in zip(absorbances, amounts) { total += a * amount }
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
            let amounts = a.map { min(maxAmount, $0) }
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
        let strength = r.amounts.reduce(0, +)
        let linear = mix(r.indices.map { pool[$0] }, r.amounts)
        let items = zip(r.indices, r.amounts)
            .map { RecipeItem(paintID: paints[$0].id, amount: $1, share: strength > 0 ? $1 / strength : 0) }
            .sorted { $0.amount > $1.amount }
        return Recipe(
            paints: items,
            parts: toParts(r.amounts.sorted(by: >)),
            strength: strength,
            dilution: describeDilution(strength),
            hex: ColorMath.hex(rgb: ColorMath.rgb(linear: linear)),
            deltaE: r.deltaE
        )
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

    /// Match quality label for a deltaE (OKLab x100) value.
    static func matchQuality(_ dE: Double) -> String {
        if dE < 2 { return "excellent" }
        if dE < 5 { return "good" }
        if dE < 10 { return "fair" }
        return "rough"
    }
}
