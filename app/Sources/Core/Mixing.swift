import Foundation

// Subtractive watercolour mixing. A port of src/lib/mixing.js; keep the two in step.
//
// Model: paints mix like filters over white paper (Beer-Lambert), water thins the mix like
// opacity. Each paint's swatch colour gives a per-channel absorbance A = -ln(reflectance).
// A mix with amounts a_i is first taken at full strength, its largest amount (its fullness f)
// raised to 1: that mix reflects exp(-d(S)/S * sum a_i * A_i) with S = sum a_i. The wash is that
// colour laid over the paper at opacity f, in sRGB: an M wash at fullness 0.5 is the full mix
// at 50 % (decided 2026-10-18; until then water only scaled the absorbance, which kept a paint
// with an empty channel, like cobalt turquoise without red, vivid at every dilution).
// An amount of 1 means "as strong as the reference swatch"; smaller amounts mean more water.
// No paint counts for more than 1 (maxAmount): a paint is never darker than its swatch.
//
// d(S) is the depth a wash reaches with the total amount S of paint in it. It is 1 at
// amount 1 and levels off at maxDepth, which matters for a mix of several paints (S above 1):
// their depths do not simply add up.
// The limit holds for the mix as a whole, not for each paint: a brush only carries so much
// pigment, so three bright paints together do not add up to black. Watery mixes still add
// up paint by paint.
// How deep a paint can go depends on the paint: blacks, greys and earths have a masstone far
// darker than their wash, bright paints do not. The limit of a mix is the limit of its paints,
// weighted by their amounts.
//
// Finding a recipe starts from a non-negative least-squares fit in absorbance space, which gives
// the proportions; the water is then fitted and the amounts refined perceptually (OKLab).
//
// Value mode (`values: true`): the picture is grey, and the paints and their mixes stand for its
// values, whatever their hue; only lightness counts (see `valueRecipes`).

struct RecipeItem: Hashable, Sendable {
    let paintID: String
    let amount: Double
    let share: Double
}

struct Recipe: Hashable, Sendable {
    let paints: [RecipeItem]
    /// Simple ratio parts, in the order of `paints`.
    let parts: [Double]
    /// Sum of the amounts of all paints.
    let strength: Double
    /// How little water: the largest amount of a paint, 1 = that paint as its swatch shows it.
    /// The water level of a wash (`Mixing.washLetter`, `dilution`) is told by this.
    let fullness: Double
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
    /// The most of one paint in a mix or on the paper: the paint as its swatch shows it. Water only
    /// makes a paint lighter, so nothing is ever darker than the swatch of a paint unless a second
    /// paint is mixed in or laid over it (decided 2026-10-12; until then four times as much was
    /// allowed, on the way to an estimated masstone).
    static let maxAmount = 1.0
    /// Where the water levels of a wash begin, as fullness: paper, W, L, M, R, C, and the swatch itself.
    private static let washLimits = [0.02, 0.1, 0.25, 0.5, 0.8, 1]
    /// Depth of the masstone relative to the reference swatch, for a bright paint and for a neutral
    /// one. Estimates: the stock data holds one colour per paint, not its masstone.
    static let maxDepth = 1.6
    static let maxDepthNeutral = 4.0
    /// OKLab chroma from which a paint counts as fully bright.
    private static let brightChroma = 0.15

    /// How deep the paint with this absorbance can go: maxDepth for a bright paint, more the greyer it is.
    static func depthLimit(_ a: Vec3) -> Double {
        let lab = ColorMath.oklab(linear: Vec3(exp(-a.x), exp(-a.y), exp(-a.z)))
        let grey = max(0, 1 - hypot(lab.y, lab.z) / brightChroma)
        return maxDepth + (maxDepthNeutral - maxDepth) * grey
    }

    /// Depth reached with the given total amount of paint: 0 at 0, 1 at 1, `limit` for a thick layer.
    static func depth(_ amount: Double, limit: Double = maxDepth) -> Double {
        limit * (1 - pow(1 - 1 / limit, amount))
    }

    /// Total amount needed for a depth; depths that cannot be reached give `most`, the largest amount.
    private static func amount(forDepth d: Double, limit: Double, most: Double = maxAmount) -> Double {
        d >= depth(most, limit: limit) ? most : log(1 - d / limit) / log(1 - 1 / limit)
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
        var sum = 0.0
        var limit = 0.0
        // No paint counts for more than its swatch (maxAmount), whatever amount is asked for.
        let capped = amounts.map { max(0, min(maxAmount, $0)) }
        let fullness = capped.max() ?? 0
        guard fullness > 0 else { return Vec3(1, 1, 1) }
        // The mix at full strength; the water comes in below, as opacity.
        let used = capped.map { $0 / fullness }
        for (a, amount) in zip(absorbances, used) {
            sum += amount
            limit += amount * depthLimit(a)
        }
        // Every paint contributes by its share of the depth the whole mix reaches.
        let scale = sum > 0 ? depth(sum, limit: limit / sum) / sum : 0
        for (a, amount) in zip(absorbances, used) { total += a * (amount * scale) }
        return Vec3(thinned(exp(-total.x), fullness), thinned(exp(-total.y), fullness), thinned(exp(-total.z), fullness))
    }

    /// A reflectance (linear) laid over white paper at that opacity, blended in sRGB.
    private static func thinned(_ reflectance: Double, _ opacity: Double) -> Double {
        ColorMath.srgbToLinear(255 - opacity * (255 - ColorMath.linearToSrgb(reflectance)))
    }

    /// One paint alone on white paper at that amount (capped at maxAmount): its swatch at that opacity, linear RGB.
    static func paintFilter(_ a: Vec3, _ amount: Double) -> Vec3 {
        let f = max(0, min(maxAmount, amount))
        return Vec3(thinned(exp(-a.x), f), thinned(exp(-a.y), f), thinned(exp(-a.z), f))
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

    /// How far a mix is from a target. With `values` only its lightness counts (see `valueRecipes`).
    private static func evaluate(_ absorbances: [Vec3], _ amounts: [Double], _ targetLab: Vec3, values: Bool = false) -> Double {
        let lab = ColorMath.oklab(linear: mix(absorbances, amounts))
        return values ? abs(lab.x - targetLab.x) * 100 : ColorMath.deltaE(lab, targetLab)
    }

    // MARK: Value mode

    /// Value mode: among the mixes that reach a value, the one that needs least change in water wins;
    /// every factor e of more or less water than the mix's own strength counts as this much error.
    static let valueWaterPenalty = 2.0
    /// Value mode: the proportions a mix of two is tried in; three paints are tried in equal parts,
    /// and only while the paint box is small enough to try every three of them.
    private static let valuePairParts: [[Double]] = [[1, 1], [2, 1], [1, 2]]
    private static let valueTriplesUpTo = 12

    /// One mix of value mode: paints (indices into the pool) in fixed proportions.
    private struct ValueMix {
        let indices: [Int]
        let absorbances: [Vec3]
        /// The proportions, adding up to 1.
        let base: [Double]
        /// The logT at which its largest amount is as much as a recipe takes.
        let most: Double

        /// Amounts at a strength of e^logT times that of one paint.
        func amounts(at logT: Double) -> [Double] { base.map { $0 * exp(logT) } }

        /// Lightness (OKLab) at a strength of e^logT times that of one paint.
        func lightness(at logT: Double) -> Double { ColorMath.oklab(linear: Mixing.mix(absorbances, amounts(at: logT))).x }
    }

    /// The mixes of value mode: every paint, every two and three of them in their proportions.
    private static func valueMixes(_ pool: [Vec3], maxPaints: Int) -> [ValueMix] {
        func make(_ indices: [Int], _ parts: [Double]) -> ValueMix {
            let whole = parts.reduce(0, +)
            let base = parts.map { $0 / whole }
            return ValueMix(indices: indices, absorbances: indices.map { pool[$0] }, base: base, most: log(maxAmount / (base.max() ?? 1)))
        }
        let n = pool.count
        var mixes = (0..<n).map { make([$0], [1]) }
        if maxPaints >= 2 {
            for i in 0..<n {
                for j in (i + 1)..<max(i + 1, n) {
                    for parts in valuePairParts { mixes.append(make([i, j], parts)) }
                }
            }
        }
        if maxPaints >= 3 && n <= valueTriplesUpTo {
            for i in 0..<n {
                for j in (i + 1)..<max(i + 1, n) {
                    for k in (j + 1)..<max(j + 1, n) { mixes.append(make([i, j, k], [1, 1, 1])) }
                }
            }
        }
        return mixes
    }

    /// Value mode: the darkest the paints reach, alone or mixed, as lightness in OKLab (1 = paper,
    /// which is also the answer without paints). A yellow alone stays light; the values of a picture
    /// that go deeper have to be brought into what the paints reach before they are matched.
    static func valueReach(paints: [MixPaint], maxPaints: Int = 3) -> Double {
        var darkest = 1.0
        for mix in valueMixes(paints.map { absorbance(hex: $0.hex) }, maxPaints: maxPaints) {
            darkest = min(darkest, mix.lightness(at: mix.most))
        }
        return darkest
    }

    /// Value mode: the picture is grey, and the paints and their mixes stand for its values, whatever
    /// their hue. Every paint, every two (and three) of them in a few plain proportions is a mix with
    /// a value of its own; each is given as much water as brings it to the lightness of the target,
    /// and the mix whose own strength is closest to that wins. So a yellow takes the lights, a mix of
    /// two darks the darks, and what lies between is built from the rest.
    /// `deltaE` of a recipe is then the difference in lightness alone.
    private static func valueRecipes(_ targetLab: Vec3, paints: [MixPaint], maxPaints: Int, limit: Int) -> [Recipe] {
        let pool = paints.map { absorbance(hex: $0.hex) }
        let paper = abs(1 - targetLab.x) * 100
        var results: [(indices: [Int], amounts: [Double], deltaE: Double, score: Double)] = [([], [], paper, paper)]
        for mix in valueMixes(pool, maxPaints: maxPaints) {
            // More paint is darker: the water with the lightness of the target, or the end that comes closest.
            var lo = log(0.02), hi = mix.most
            if mix.lightness(at: lo) <= targetLab.x {
                hi = lo
            } else if mix.lightness(at: hi) >= targetLab.x {
                lo = hi
            } else {
                for _ in 0..<30 {
                    let mid = (lo + hi) / 2
                    if mix.lightness(at: mid) > targetLab.x { lo = mid } else { hi = mid }
                }
            }
            let logT = (lo + hi) / 2
            let amounts = mix.amounts(at: logT)
            let err = evaluate(mix.absorbances, amounts, targetLab, values: true)
            results.append((mix.indices, amounts, err, err + valueWaterPenalty * abs(logT) + extraPaintPenalty * Double(mix.indices.count - 1)))
        }
        // The best proportion of every set of paints.
        var seen = Set<[Int]>()
        var recipes: [Recipe] = []
        for r in results.sorted(by: { $0.score < $1.score }) {
            guard seen.insert(r.indices.sorted()).inserted else { continue }
            recipes.append(recipe(ids: r.indices.map { paints[$0].id }, absorbances: r.indices.map { pool[$0] }, amounts: r.amounts, deltaE: r.deltaE))
            if recipes.count == limit { break }
        }
        return recipes
    }

    // MARK: Recipes

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
    /// - Parameter values: value mode: paints and their mixes matched by lightness alone (`valueRecipes`).
    static func findRecipes(target targetHex: String, paints: [MixPaint], maxPaints: Int = 3, limit: Int = 5, values: Bool = false) -> [Recipe] {
        let targetLinear = ColorMath.linear(rgb: ColorMath.rgb(hex: targetHex))
        let targetLab = ColorMath.oklab(linear: targetLinear)
        if values { return valueRecipes(targetLab, paints: paints, maxPaints: maxPaints, limit: limit) }
        let t = absorbance(linear: targetLinear)
        let pool = paints.map { absorbance(hex: $0.hex) }

        // Plain paper is a legitimate answer for near-white targets.
        var results = [Candidate(indices: [], amounts: [], deltaE: ColorMath.deltaE(ColorMath.oklab(linear: Vec3(1, 1, 1)), targetLab))]

        func consider(_ indices: [Int]) {
            let columns = indices.map { pool[$0] }
            guard let a = leastSquares(columns, t), a.allSatisfy({ $0 > 0 }) else { return }
            // The least-squares solution is in depths, which add up to the depth of the whole mix:
            // find the total amount for that depth and share it out in the same proportions.
            let reach = a.reduce(0, +)
            let limit = zip(a, columns).reduce(0) { $0 + $1.0 * depthLimit($1.1) } / reach
            let sum = amount(forDepth: reach, limit: limit, most: Double(indices.count) * maxAmount)
            var amounts = a.map { $0 * sum / reach }
            // With the proportions kept, no paint above its swatch.
            let most = amounts.max() ?? 0
            if most > maxAmount { amounts = amounts.map { $0 * maxAmount / most } }
            // The fit is in absorbance, where water is not: it gives the proportions, the water is fitted here.
            let fitted = fitWater(columns, amounts, targetLab, steps: 12, fine: false)
            results.append(Candidate(indices: indices, amounts: fitted.amounts, deltaE: fitted.deltaE))
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
            recipes.append(recipe(ids: r.indices.map { paints[$0].id }, absorbances: r.indices.map { pool[$0] }, amounts: r.amounts, deltaE: r.deltaE))
            if recipes.count == limit { break }
        }
        return recipes
    }

    private static func recipe(ids: [String], absorbances: [Vec3], amounts: [Double], deltaE: Double) -> Recipe {
        let strength = amounts.reduce(0, +)
        // How little water: the largest amount of a paint, 1 = that paint as its swatch shows it.
        let fullness = amounts.reduce(0) { max($0, $1) }
        let items = zip(ids, amounts)
            .map { RecipeItem(paintID: $0, amount: $1, share: strength > 0 ? $1 / strength : 0) }
            .sorted { $0.amount > $1.amount }
        return Recipe(
            paints: items,
            parts: toParts(amounts.sorted(by: >)),
            strength: strength,
            fullness: fullness,
            dilution: describeDilution(fullness),
            hex: ColorMath.hex(rgb: ColorMath.rgb(linear: mix(absorbances, amounts))),
            deltaE: deltaE
        )
    }

    /// The same mix with more or less water: every amount scaled by one factor so the result
    /// comes as close to the target as that mix can get. Nil when the recipe has no paints (paper white).
    /// - Parameter values: value mode: as close in lightness as the mix can get.
    static func washRecipe(_ recipe: Recipe, target targetHex: String, paints: [String: MixPaint], values: Bool = false) -> Recipe? {
        guard !recipe.paints.isEmpty else { return nil }
        let targetLab = ColorMath.oklab(hex: targetHex)
        let ids = recipe.paints.map(\.paintID)
        let absorbances = ids.map { absorbance(hex: paints[$0]?.hex ?? "#ffffff") }
        let fitted = fitWater(absorbances, recipe.paints.map(\.amount), targetLab, values: values)
        return self.recipe(ids: ids, absorbances: absorbances, amounts: fitted.amounts, deltaE: fitted.deltaE)
    }

    /// The amounts scaled by the one factor that brings the mix closest to the target: a coarse scan
    /// over the water level, then (with `fine`) a golden-section search around the best step.
    private static func fitWater(_ absorbances: [Vec3], _ base: [Double], _ targetLab: Vec3, values: Bool = false, steps: Int = 48, fine: Bool = true) -> (amounts: [Double], deltaE: Double) {
        let largest = base.max() ?? 1
        func error(_ logT: Double) -> Double { evaluate(absorbances, base.map { $0 * exp(logT) }, targetLab, values: values) }
        let lo = log(0.02 / largest)
        let hi = log(maxAmount / largest)
        var best = lo
        var bestErr = Double.infinity
        for i in 0...steps {
            let t = lo + (hi - lo) * Double(i) / Double(steps)
            let err = error(t)
            if err < bestErr { bestErr = err; best = t }
        }
        var logT = best
        if fine {
            var a = max(lo, best - (hi - lo) / Double(steps))
            var b = min(hi, best + (hi - lo) / Double(steps))
            let phi = (5.0.squareRoot() - 1) / 2
            for _ in 0..<24 {
                let c = b - (b - a) * phi
                let d = a + (b - a) * phi
                if error(c) < error(d) { b = d } else { a = c }
            }
            logT = (a + b) / 2
        }
        return (base.map { $0 * exp(logT) }, error(logT))
    }

    /// Propose a small set of paints that mixes all the given target colours.
    /// Works through the targets from the largest area down and, among the recipes that are
    /// nearly as close as the best one, takes the recipe needing the fewest paints not chosen yet.
    /// - Parameters:
    ///   - tolerance: allowed extra deltaE over the best recipe
    ///   - values: value mode, as in `findRecipes`
    static func proposePaints(targets: [(hex: String, weight: Double)], paints: [MixPaint], maxPaints: Int = 3, tolerance: Double = 2, values: Bool = false) -> [String] {
        var chosen: [String] = []
        func newPaints(_ r: Recipe) -> Int { r.paints.filter { !chosen.contains($0.paintID) }.count }
        for target in targets.sorted(by: { $0.weight > $1.weight }) {
            let recipes = findRecipes(target: target.hex, paints: paints, maxPaints: maxPaints, limit: 8, values: values)
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

    /// The water of a wash in words. `fullness` = its paint with least water, 1 = as the swatch shows it.
    static func describeDilution(_ fullness: Double) -> String {
        if fullness <= washLimits[0] { return "paper only" }
        if fullness < washLimits[1] { return "very watery wash" }
        if fullness < washLimits[2] { return "light wash" }
        if fullness < washLimits[3] { return "medium" }
        if fullness < washLimits[4] { return "rich" }
        return "concentrated (hardly any water)"
    }

    /// Letters for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
    static let washLetters: [(letter: String, label: String)] = [
        ("W", "very watery"), ("L", "light"), ("M", "medium"), ("R", "rich"), ("C", "concentrated"),
    ]

    /// A value study needs more steps of water than five: with `fine` every level is split in this many.
    private static let washFine = 5

    /// The letter of the water level for the fullness of a recipe (its paint with least water, at most 1).
    /// With `fine` the level and its step within it, W1 to C5 (value mode).
    static func washLetter(_ fullness: Double, fine: Bool = false) -> String {
        if fullness <= washLimits[0] { return "" }
        var level = 0
        while level < washLetters.count - 1 && fullness >= washLimits[level + 1] { level += 1 }
        let letter = washLetters[level].letter
        if !fine { return letter }
        // Steps of water are even on a log scale.
        let lo = log(washLimits[level]), hi = log(washLimits[level + 1])
        let step = min(washFine - 1, max(0, Int(((log(fullness) - lo) / (hi - lo) * Double(washFine)).rounded(.down))))
        return "\(letter)\(step + 1)"
    }

    /// Match quality label for a deltaE (OKLab x100) value.
    static func matchQuality(_ dE: Double) -> String {
        if dE < 2 { return "excellent" }
        if dE < 5 { return "good" }
        if dE < 10 { return "fair" }
        return "rough"
    }
}
