import Foundation

// Layer mode (glazing): the picture as transparent layers painted over each other, light to dark.
// A port of src/lib/layers.js; keep the two in step.
//
// Mix mode mixes every colour on the palette and paints each area once. Layer mode uses what only
// watercolour does: a dried wash is a filter, and a second wash over it filters the light again.
// So the absorbances of separate layers add up, and a few base paints reach the secondary colours
// (yellow over blue is a green) and the darks without any mixing.
//
// Model:
// - A WASH layer is one base paint, painted with ONE prepared wash (its strength = paint to
//   water). Every area gets 0..maxCoats coats of it. Coats are nested: coat 2 lies inside coat 1.
// - An ACCENT layer is one strong wash, painted once, on the small parts the broad washes cannot
//   reach: a small area of another hue, the darkest folds. It is fitted to what the washes leave
//   over and painted last, in a few shapes a brush can do. Its paint may be one of the wash paints
//   or a paint of its own (accent paints come on top of the number of paints asked for).
// - The colour of an area is white paper filtered by every layer:
//   reflectance = exp(-sum over layers of depth * A of the paint).
//   Different paints add up without a common limit, which is what a wet mix cannot do. The coats of
//   ONE paint add up to the paint as its swatch shows it and no further (Mixing.maxAmount): three
//   coats of a light yellow wash come closer to the yellow, they never get darker than it. An
//   accent of a paint that is also a wash adds what is left up to that.
// - Work has a price. Every coat must make the colour it is painted on visibly better, every step
//   (one wash over the dried picture) must make the picture better, and an accent must make its
//   small part much better. What does not pay is left out: a layer can end up with one coat, and
//   fewer paints than asked for are proposed when the rest would only be tints nobody sees.
// - A grey or brown over a clean colour dulls it, and a painter keeps neutrals off clean colour.
//   So a coat of a near-neutral paint costs extra where the picture is saturated: such a paint
//   goes into the shadows and the greys, not as a tint under the reds.
// - Option `graded`: every coat of a wash layer may be a stronger wash than the one before.
//   Measured on the sample pictures this brings the colours about a tenth closer and is not
//   visible once the areas are smoothed, for up to maxCoats washes to prepare per paint instead
//   of one. So one wash per paint is the default.
//
// Fitting works on the colours of the picture (histogram bins), not on its pixels: which paints,
// how strong each wash, and how many coats of each wash every colour gets. The picture comes in
// afterwards: one map of coat counts per layer, each smoothed on its own so that every layer has
// calm shapes to paint.

/// How to prepare a wash: parts of water to one part of paint, rounded as roughly as anyone can
/// measure with a brush, and the consistency painters name it by.
struct WashGuide: Hashable, Sendable {
    /// Parts of water to one part of paint; infinite for clear water.
    let water: Double
    /// tea, coffee, milk, cream or butter.
    let consistency: String
    /// The two in words, e.g. "1 part paint to 20 parts water, like tea".
    let guide: String
}

/// A set of colours to fit layers to: OKLab triples and their weights (e.g. pixel counts).
struct ColourSet: Sendable {
    var points: [Double]
    var counts: [Double]
}

/// One layer of a plan or a fit: a paint, its wash and its coats.
struct Layer: Sendable {
    /// wash = broad, up to maxCoats coats; accent = one strong coat on small parts, painted after all washes.
    enum Kind: String, Sendable {
        case wash, accent
    }

    /// What an accent is for: a missing colour, the darks, whatever is missed most.
    enum Role: String, Sendable {
        case colour, dark, any
    }

    struct Wash: Hashable, Sendable {
        /// Amount of paint, 1 = as strong as the paint's swatch.
        let strength: Double
        /// The wash in words (`Mixing.describeDilution`).
        let dilution: String
        /// Parts of water to one part of paint, roughly (`Layers.washGuide`).
        let water: Double
        let consistency: String
        let guide: String
    }

    /// A connected area of equal coats of one layer (also the unpainted ones, coats 0).
    struct Region: Hashable, Sendable {
        let id: Int
        let coats: Int
        let size: Int
        let anchorX: Int
        let anchorY: Int
        let anchorDist: Float
    }

    /// Legend entry of one coat of a layer.
    struct Coat: Hashable, Sendable {
        let coats: Int
        /// The colour of that many coats on white paper.
        let hex: String
        /// Part of the picture this coat covers (areas with that many coats or more).
        let share: Double
        /// Part of the picture that ends with exactly that many coats.
        let only: Double
        /// Separate shapes this coat is painted in.
        let shapes: Int
    }

    /// What a layer is good for: mean distance of the whole picture with all layers (the same for
    /// every layer) and without this one, the others left as they are, and the same on the part of
    /// the picture this layer paints.
    struct Buys: Hashable, Sendable {
        var with = 0.0
        var without = 0.0
        var areaWith = 0.0
        var areaWithout = 0.0
    }

    /// Place in the painting order, 0 = first.
    var index: Int
    let kind: Kind
    /// Of an accent: what it is for.
    let role: Role?
    let paintID: String
    /// Coats this layer has: 1...maxCoats for a wash, 1 for an accent, 0 = the paint is not used.
    let top: Int
    /// The wash: amount of paint, 1 = as strong as the paint's swatch.
    let strength: Double
    let dilution: String
    let water: Double
    let consistency: String
    /// Water and consistency in words, to print next to the wash.
    let guide: String
    /// 1 = every coat is the same wash; graded: coat c + 1 is this much stronger than coat c.
    let ratio: Double
    /// The wash of coat 1...maxCoats (all the same unless graded).
    let washes: [Wash]
    /// Depth after 0...maxCoats coats (coats above `top` repeat the last one).
    let depths: [Double]
    /// Colour of 0...maxCoats coats on white paper; hexes[0] is the paper, hexes[1] one stroke of the wash.
    let hexes: [String]
    /// (maxCoats + 1) x 3 factors on linear RGB, for `Layers.compositeColours`.
    let filters: [Double]

    // The picture, filled in by `Layers.layerImage` only (empty from `Layers.fit`).

    /// Coats per pixel.
    var coatMap: [UInt8] = []
    /// Region id per pixel.
    var regionMap: [Int32] = []
    var regions: [Region] = []
    /// coats[c - 1] = legend entry of coat c. Always maxCoats entries; coats the layer does not
    /// have (above `top`) have share 0.
    var coats: [Coat] = []
    var buys: Buys?
}

/// One thing to paint: one coat of one layer.
struct LayerStep: Hashable, Sendable {
    let layer: Int
    let kind: Layer.Kind
    let paintID: String
    let coat: Int
    let strength: Double
    let dilution: String
    let water: Double
    let consistency: String
    let guide: String
    /// That many coats on white paper.
    let hex: String
    let share: Double
    /// Separate shapes to fill in this step.
    let shapes: Int
}

/// A picture as layers: the result of `Layers.layerImage`.
struct LayerPlan: Sendable {
    /// A combination of coats that occurs in the picture, with the colour all layers give together.
    struct Combo: Hashable, Sendable {
        /// coats[k] = coats of layer k.
        var coats: [Int]
        let hex: String
        var pixelCount: Int
    }

    struct Work: Hashable, Sendable {
        /// Number of steps.
        let steps: Int
        /// Area painted over all steps (1 = the whole picture once; also the mean number of coats on a spot).
        let area: Double
    }

    /// Distance between the picture as it is (not blurred) and all layers together.
    struct DeltaE: Hashable, Sendable {
        let mean: Double
        let p95: Double
        /// Part of the picture the layers miss by 10 or more.
        let rough: Double
    }

    let width: Int
    let height: Int
    let maxCoats: Int
    /// The paints of the layers, in painting order, each once.
    let paintIDs: [String]
    /// In painting order: the washes of clean colour light to dark, then the washes of neutral
    /// paints, then the accents light to dark. A paint can have two layers, a wash and an accent.
    let layers: [Layer]
    /// Per pixel the index into `combos`.
    let comboMap: [Int32]
    let combos: [Combo]
    /// What to paint, in order: layer by layer, coat 1 before coat 2.
    let steps: [LayerStep]
    let work: Work
    let deltaE: DeltaE
}

/// Layers fitted to a set of colours: the result of `Layers.fit`.
struct LayerFit: Sendable {
    /// In painting order, paints that are not used last (top 0).
    let layers: [Layer]
    /// coats[i][k] = coats of layer k for colour i.
    let coats: [[Int]]
    /// hexes[i] = the colour those coats give.
    let hexes: [String]
    /// deltaE[i] = its distance to colour i.
    let deltaE: [Double]
    /// Mean deltaE weighted by count.
    let error: Double
}

enum Layers {
    /// Coats per wash layer when nothing else is asked for.
    static let maxCoats = 3
    /// Accent layers when nothing else is asked for.
    static let accents = 2
    /// More paints than this are not fitted: every combination of coats is looked at.
    static let maxLayers = 7
    /// Parts of water to one part of paint (as it comes from the tube, or a pan worked up to that
    /// consistency) that are taken to give strength 1, the paint's swatch. An assumption, not a
    /// measurement: swatch a few washes and adjust it.
    static let referenceWater = 1.0
    /// Whether the coats of a layer may differ in strength when nothing else is asked for.
    static let graded = false

    // Combinations of coats of all layers that are still looked at one by one.
    private static let maxCombinations = 40000
    // Wash strengths tried when the paints are chosen; the strengths are tuned freely afterwards.
    private static let strengths = [0.06, 0.1, 0.16, 0.25, 0.4, 0.6, 0.8, 1]
    private static let accentStrengths = [0.25, 0.4, 0.6, 0.8, 1]
    private static let minStrength = 0.05
    // No wash is stronger than the paint as its swatch shows it.
    private static let maxStrength = Mixing.maxAmount
    // Graded coats: every coat this many times stronger than the one before (1 = the same wash again).
    private static let ratios = [1, 1.7, 3]
    private static let maxRatio = 4.0
    // The fit runs on at most about this many colours, however colourful the picture is.
    private static let fitColours = 220
    // The paints are proposed from the picture with this blur, whatever `simplify` is: the proposal
    // should not change when only the size of the areas does.
    private static let proposalBlur = 1
    // While paints and washes are tried out, every colour only looks at its few best combinations of
    // the other layers instead of at all of them.
    private static let shortlistSize = 5
    // How often the chosen paints are gone through to exchange one for a better one.
    private static let swapRounds = 3
    // The price of work, in deltaE. A coat must bring the colour it is painted on this much closer:
    // between two combinations that look alike, the one with fewer coats wins, and one strong wash
    // beats two weak ones.
    private static let coatPrice = 0.3
    // A step (one wash over the dried picture, with its drying time) must bring the mean distance of
    // the whole picture down by this much, or the layer does without that coat.
    private static let stepPrice = 0.25
    // A coat of a neutral paint costs this much more on a fully saturated colour (see `dulling`).
    private static let dullPrice = 4.0
    // A paint counts as neutral below this OKLab chroma of its swatch, the more the greyer it is.
    private static let neutralChroma = 0.12
    // Chroma of the picture from which a neutral coat costs extra, and where it costs dullPrice.
    private static let cleanFrom = 0.12
    private static let cleanFull = 0.2
    // An accent is only put where it brings the colour this much closer: a few clear shapes, not a
    // tint over half the picture.
    private static let accentCoatPrice = 3.0
    // Rounds in which the areas of the smoothed layers are fitted to each other.
    private static let revisions = 2
    // The smallest shape of an accent, as a part of the smallest area of a wash layer: accents are
    // there for the small things.
    private static let accentRegion = 0.1
    // An accent is painted in at most this many shapes: the ones that bring most.
    private static let accentShapes = 24
    // Spots (wash result and picture colour) the accents are chosen on: the worst ones.
    private static let accentSpots = 1500
    // A spot gets an accent together with other washes than its surroundings (a shape left out of a
    // wash) only when that is closer by this much than the accent over the washes as they are.
    private static let carveGain = 3.0
    // An accent covers at most this part of the picture.
    private static let accentShare = 0.2
    // Accents are chosen by the squared distance they take away, so that one bad miss counts for more
    // than many small ones, with the weight of a colour = (its pixel count) ^ detailPower, so that
    // small parts count for more than their area. An accent is used when it lowers the mean squared
    // distance weighted like that by accentPrice.
    private static let detailPower = 0.65
    private static let accentPrice = 0.5
    // For the accent that brings back a missing colour, a miss counts by the chroma of the picture
    // there (times chroma / colourChroma), and a miss in lightness counts colourLightness of one in
    // hue or saturation: a small bright yellow is then worth as much as a much larger dark.
    private static let colourChroma = 0.1
    private static let colourLightness = 0.5
    // The accent for the darks is dark: one coat of it on white paper is darker than darkCoat
    // (OKLab lightness), or there is none. It goes on parts of the picture darker than darkFrom,
    // and a miss counts by how dark the picture is there, fully below darkFull.
    private static let darkCoat = 0.45
    private static let darkFrom = 0.5
    private static let darkFull = 0.3
    // An accent is a step too. It need not pay like a wash, it is there for the small things, but it
    // must lower the mean distance of the whole picture by at least this.
    private static let accentStepPrice = 0.05
    // An accent does not go on near-neutral pixels (below this chroma) in paper-white surroundings
    // (mean lightness above paperLightness over about paperWindow pixels each way): print on white,
    // glints, the grain of a white wall are not what a brush is for.
    private static let clutterChroma = 0.06
    private static let paperLightness = 0.88
    private static let paperWindow = 8

    // MARK: Numbers as the web app has them

    // Math.round: halves go up, also below zero.
    @inline(__always)
    private static func roundHalfUp(_ x: Double) -> Double {
        let floor = x.rounded(.down)
        return x - floor >= 0.5 ? floor + 1 : floor
    }

    // Math.hypot as V8 computes it (scaled by the largest value, compensated sum), so that the
    // last digit agrees with the reference values too.
    @inline(__always)
    private static func hypot(_ x: Double, _ y: Double) -> Double {
        let ax = abs(x), ay = abs(y)
        let largest = max(ax, ay)
        if largest == 0 { return 0 }
        let p = ax / largest, q = ay / largest
        return (p * p + q * q).squareRoot() * largest
    }

    @inline(__always)
    private static func hypot(_ x: Double, _ y: Double, _ z: Double) -> Double {
        let ax = abs(x), ay = abs(y), az = abs(z)
        let largest = max(ax, max(ay, az))
        if largest == 0 { return 0 }
        let p = ax / largest, q = ay / largest, r = az / largest
        let first = p * p
        let second = first + q * q
        let compensation = (second - first) - q * q
        return (second + (r * r - compensation)).squareRoot() * largest
    }

    // How much a neutral coat dulls a colour of the picture: 0 on greys, 1 on a saturated colour.
    @inline(__always)
    private static func dulling(_ a: Double, _ b: Double) -> Double {
        let c = (a * a + b * b).squareRoot()
        return c <= cleanFrom ? 0 : min(2, (c - cleanFrom) / (cleanFull - cleanFrom))
    }

    // OKLab of a linear RGB colour (no allocation in the inner loops).
    @inline(__always)
    private static func lab(_ r: Double, _ g: Double, _ b: Double) -> (l: Double, a: Double, b: Double) {
        let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        return (
            0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        )
    }

    private static func linearHex(_ lin: [Double], _ o: Int = 0) -> String {
        ColorMath.hex(rgb: ColorMath.rgb(linear: Vec3(lin[o], lin[o + 1], lin[o + 2])))
    }

    // OKLab per pixel as the web app has it: the table of linear values is kept in single precision.
    private static func labPixels(_ rgba: [UInt8], count: Int) -> [Float] {
        let lut = (0..<256).map { Double(Float(ColorMath.srgbToLinear(Double($0)))) }
        var out = [Float](repeating: 0, count: count * 3)
        for p in 0..<count {
            let c = lab(lut[Int(rgba[p * 4])], lut[Int(rgba[p * 4 + 1])], lut[Int(rgba[p * 4 + 2])])
            out[p * 3] = Float(c.l); out[p * 3 + 1] = Float(c.a); out[p * 3 + 2] = Float(c.b)
        }
        return out
    }

    // MARK: Coats and washes

    /// Depth of a paint on the paper. However many coats, a paint never gets deeper than its swatch
    /// (`Mixing.maxAmount`): further coats of the same paint add nothing, only another paint over it does.
    private static func depth(_ amount: Double, limit: Double) -> Double {
        Mixing.depth(min(Mixing.maxAmount, amount), limit: limit)
    }

    /// Amount of paint in `coats` coats: the first of the given strength, every further one `ratio` times stronger.
    static func coatAmount(_ coats: Int, _ strength: Double, ratio: Double = 1) -> Double {
        abs(ratio - 1) < 1e-6 ? Double(coats) * strength : (strength * (pow(ratio, Double(coats)) - 1)) / (ratio - 1)
    }

    /// Depth a paint reaches with that many coats. The coats of one paint share the paint's limit.
    static func coatDepth(_ coats: Int, _ strength: Double, limit: Double, ratio: Double = 1) -> Double {
        depth(coatAmount(coats, strength, ratio: ratio), limit: limit)
    }

    /// How to prepare a wash of the given strength.
    static func washGuide(_ strength: Double) -> WashGuide {
        guard strength > 0 else { return WashGuide(water: .infinity, consistency: "water", guide: "clear water") }
        let exact = referenceWater / strength
        let step = exact < 3 ? 0.5 : exact < 10 ? 1 : exact < 30 ? 5 : exact < 100 ? 10 : 50
        let water = roundHalfUp(exact / step) * step
        let consistency = water >= 20 ? "tea" : water >= 8 ? "coffee" : water >= 3 ? "milk" : water > 1 ? "cream" : "butter"
        let number = water == water.rounded() && water < 1e15 ? String(Int(water)) : String(water)
        let parts = water < 1 ? "hardly any water" : "\(number) \(water == 1 ? "part" : "parts") water"
        return WashGuide(water: water, consistency: consistency, guide: "1 part paint to \(parts), like \(consistency)")
    }

    // What a layer does to the light, per number of coats: (top + 1) x 3 factors on linear RGB.
    // `under` = amount of the same paint already on the paper (an accent over its own wash layer).
    private static func filterTable(_ a: Vec3, _ limit: Double, _ strength: Double, _ ratio: Double, _ top: Int, under: Double = 0) -> [Double] {
        var t = [Double](repeating: 0, count: (top + 1) * 3)
        let below = depth(under, limit: limit)
        for c in 0...top {
            let d = depth(under + coatAmount(c, strength, ratio: ratio), limit: limit) - below
            t[c * 3] = exp(-d * a.x); t[c * 3 + 1] = exp(-d * a.y); t[c * 3 + 2] = exp(-d * a.z)
        }
        return t
    }

    // MARK: Combinations of coats

    private typealias Price = (coat: Double, dull: Double)

    private struct Combos {
        var lin: [Double]
        var lab: [Double]
        var work: [Double]
        var dull: [Double]
        var size: Int
    }

    // Every combination of coats of the given layers on white paper: linear RGB, OKLab, the work in
    // it (the price of its coats, as OKLab distance) and how much it dulls (the extra price of its
    // neutral coats on a saturated colour). `prices[k]` = coat and dull price of a coat of layer k.
    // Combination index = coats of layer 0 + levels of layer 0 * (coats of layer 1 + ...).
    private static func combinations(_ tables: [[Double]], _ prices: [Price]) -> Combos {
        var lin: [Double] = [1, 1, 1]
        var work: [Double] = [0], dull: [Double] = [0]
        for (k, t) in tables.enumerated() {
            let levels = t.count / 3, n = lin.count / 3
            var next = [Double](repeating: 0, count: n * levels * 3)
            var more = [Double](repeating: 0, count: n * levels), duller = [Double](repeating: 0, count: n * levels)
            for c in 0..<levels {
                let coats = Double(c) * prices[k].coat / 100, dulls = Double(c) * prices[k].dull / 100
                for i in 0..<n {
                    let o = (c * n + i) * 3
                    next[o] = lin[i * 3] * t[c * 3]; next[o + 1] = lin[i * 3 + 1] * t[c * 3 + 1]; next[o + 2] = lin[i * 3 + 2] * t[c * 3 + 2]
                    more[c * n + i] = work[i] + coats
                    duller[c * n + i] = dull[i] + dulls
                }
            }
            lin = next
            work = more
            dull = duller
        }
        let size = lin.count / 3
        var out = [Double](repeating: 0, count: size * 3)
        for i in 0..<size {
            let c = lab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2])
            out[i * 3] = c.l; out[i * 3 + 1] = c.a; out[i * 3 + 2] = c.b
        }
        return Combos(lin: lin, lab: out, work: work, dull: dull, size: size)
    }

    // The best combination for every colour: the closest one, its work counting as distance.
    // Returns the combination index and the deltaE per colour. `size` = only the first that many
    // combinations are looked at.
    private static func closest(_ combos: Combos, size: Int? = nil, _ points: [Double], _ n: Int) -> (best: [Int32], error: [Double]) {
        var best = [Int32](repeating: 0, count: n)
        var error = [Double](repeating: 0, count: n)
        let size = size ?? combos.size
        combos.lab.withUnsafeBufferPointer { lab in
            combos.work.withUnsafeBufferPointer { work in
                combos.dull.withUnsafeBufferPointer { dull in
                    for i in 0..<n {
                        let l = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
                        let clean = dulling(a, b)
                        var least = Double.infinity, least2 = Double.infinity
                        var bi = 0, bd = 0.0
                        for p in 0..<size {
                            let dL = lab[p * 3] - l, da = lab[p * 3 + 1] - a, db = lab[p * 3 + 2] - b
                            let d2 = dL * dL + da * da + db * db
                            if d2 >= least2 { continue }
                            let cost = d2.squareRoot() + work[p] + clean * dull[p]
                            if cost < least { least = cost; least2 = least * least; bi = p; bd = d2.squareRoot() }
                        }
                        best[i] = Int32(bi)
                        error[i] = bd * 100
                    }
                }
            }
        }
        return (best, error)
    }

    private struct Shortlist {
        var base: [Double]
        var work: [Double]
        var t: Int
    }

    // For every colour its `keep` best combinations of the given layers, as linear RGB and with the
    // work already in them: what the other layers can offer a new layer to work on.
    private static func shortlist(_ tables: [[Double]], _ prices: [Price], _ points: [Double], _ n: Int, keep: Int) -> Shortlist {
        let combos = combinations(tables, prices)
        let t = min(keep, combos.size)
        let size = combos.size
        var base = [Double](repeating: 0, count: n * t * 3)
        var work = [Double](repeating: 0, count: n * t)
        var topD = [Double](repeating: 0, count: t)
        var topI = [Int](repeating: 0, count: t)
        for i in 0..<n {
            let l = points[i * 3], a = points[i * 3 + 1], b = points[i * 3 + 2]
            let clean = dulling(a, b)
            for s in 0..<t { topD[s] = .infinity }
            for p in 0..<size {
                let dL = combos.lab[p * 3] - l, da = combos.lab[p * 3 + 1] - a, db = combos.lab[p * 3 + 2] - b
                let d = (dL * dL + da * da + db * db).squareRoot() + combos.work[p] + clean * combos.dull[p]
                if d < topD[t - 1] {
                    var s = t - 1
                    while s > 0 && topD[s - 1] > d { topD[s] = topD[s - 1]; topI[s] = topI[s - 1]; s -= 1 }
                    topD[s] = d; topI[s] = p
                }
            }
            for s in 0..<t {
                let o = (i * t + s) * 3, p = topI[s] * 3
                base[o] = combos.lin[p]; base[o + 1] = combos.lin[p + 1]; base[o + 2] = combos.lin[p + 2]
                work[i * t + s] = combos.work[topI[s]] + clean * combos.dull[topI[s]]
            }
        }
        return Shortlist(base: base, work: work, t: t)
    }

    // The colours the fit works on (see `fitSet`); weights add up to 100.
    private struct FitSet {
        var points: [Double]
        var weights: [Double]
        var n: Int
    }

    // Weighted mean of distance plus work of the colours when one more wash layer is laid over their
    // shortlisted combinations. Gives up as soon as the sum passes `bound` (the best so far).
    // `levels` = the coats of the table that are looked at, the unpainted one included.
    // `dull` = what a coat of this layer costs extra on a saturated colour.
    private static func errorWith(_ table: [Double], levels: Int, _ rest: Shortlist, _ set: FitSet, bound: Double = .infinity, dull: Double = 0) -> Double {
        let t = rest.t
        var sum = 0.0
        return table.withUnsafeBufferPointer { table -> Double in
            rest.base.withUnsafeBufferPointer { base -> Double in
                rest.work.withUnsafeBufferPointer { work -> Double in
                    for i in 0..<set.n {
                        let l = set.points[i * 3], a = set.points[i * 3 + 1], b = set.points[i * 3 + 2]
                        let coat = (coatPrice + (dull != 0 ? dulling(a, b) * dull : 0)) / 100
                        var least = Double.infinity
                        for s in 0..<t {
                            let o = (i * t + s) * 3
                            let w = work[i * t + s]
                            for c in 0..<levels {
                                let reached = lab(base[o] * table[c * 3], base[o + 1] * table[c * 3 + 1], base[o + 2] * table[c * 3 + 2])
                                let dL = reached.l - l, da = reached.a - a, db = reached.b - b
                                let d = (dL * dL + da * da + db * db).squareRoot() + w + coat * Double(c)
                                if d < least { least = d }
                            }
                        }
                        sum += set.weights[i] * least
                        if sum > bound { return .infinity }
                    }
                    return sum
                }
            }
        }
    }

    // MARK: Colours

    /// A set of colours to fit layers to; weight = e.g. the pixel count.
    static func colourSet(_ colours: [(hex: String, weight: Double)]) -> ColourSet {
        var points = [Double](repeating: 0, count: colours.count * 3)
        var counts = [Double](repeating: 0, count: colours.count)
        for (i, colour) in colours.enumerated() {
            let linear = ColorMath.linear(rgb: ColorMath.rgb(hex: colour.hex))
            let c = lab(linear.x, linear.y, linear.z)
            points[i * 3] = c.l; points[i * 3 + 1] = c.a; points[i * 3 + 2] = c.b
            counts[i] = colour.weight
        }
        return ColourSet(points: points, counts: counts)
    }

    /// A set of colours that all weigh the same.
    static func colourSet(_ hexes: [String]) -> ColourSet {
        colourSet(hexes.map { (hex: $0, weight: 1) })
    }

    /// The colours of a picture, for `proposePaints`. Always taken with the same slight blur, so
    /// that the proposal does not depend on `simplify`. `rgba` is the picture at working resolution.
    static func pictureColours(rgba: [UInt8], width: Int, height: Int) -> ColourSet {
        let count = width * height
        let bins = Segmenter.colourBins(labPixels(Segmenter.boxBlur(rgba, width, height, radius: proposalBlur), count: count), count: count)
        return ColourSet(points: bins.points, counts: bins.counts)
    }

    // The colours the fit works on: the given ones, joined on a coarser grid until few enough are
    // left, sorted by weight so that a bad candidate is given up early.
    private static func fitSet(_ colours: ColourSet) -> FitSet {
        var n = colours.counts.count
        var pts = colours.points, cnt = colours.counts
        var stepL = 0.03, stepAB = 0.015
        while n > fitColours {
            let joined = joinColours(colours.points, colours.counts, stepL, stepAB)
            n = joined.counts.count; pts = joined.points; cnt = joined.counts
            stepL *= 1.3; stepAB *= 1.3
        }
        let order = (0..<n).sorted { cnt[$0] != cnt[$1] ? cnt[$0] > cnt[$1] : $0 < $1 }
        var points = [Double](repeating: 0, count: n * 3), weights = [Double](repeating: 0, count: n)
        var sum = 0.0
        for (j, i) in order.enumerated() {
            points[j * 3] = pts[i * 3]; points[j * 3 + 1] = pts[i * 3 + 1]; points[j * 3 + 2] = pts[i * 3 + 2]
            weights[j] = cnt[i]
            sum += weights[j]
        }
        // Weights add up to 100, so the error of a set of layers reads as a weighted mean deltaE.
        for j in 0..<n { weights[j] *= 100 / sum }
        return FitSet(points: points, weights: weights, n: n)
    }

    // Colours joined on a grid in OKLab: per occupied cell the mean colour and the summed count;
    // `cellOf` = the cell of every colour that came in.
    private static func joinColours(_ points: [Double], _ counts: [Double], _ stepL: Double, _ stepAB: Double) -> (points: [Double], counts: [Double], cellOf: [Int32]) {
        let total = counts.count
        var index = [Int: Int]()
        var sums: [Double] = []
        var cellOf = [Int32](repeating: 0, count: total)
        for i in 0..<total {
            let key = Int(roundHalfUp(points[i * 3] / stepL)) * 1_048_576 + (Int(roundHalfUp(points[i * 3 + 1] / stepAB)) + 512) * 1024 + Int(roundHalfUp(points[i * 3 + 2] / stepAB)) + 512
            let j: Int
            if let known = index[key] {
                j = known
            } else {
                j = sums.count / 4
                index[key] = j
                sums.append(contentsOf: [0, 0, 0, 0])
            }
            sums[j * 4] += points[i * 3] * counts[i]; sums[j * 4 + 1] += points[i * 3 + 1] * counts[i]; sums[j * 4 + 2] += points[i * 3 + 2] * counts[i]
            sums[j * 4 + 3] += counts[i]
            cellOf[i] = Int32(j)
        }
        let n = sums.count / 4
        var pts = [Double](repeating: 0, count: n * 3), cnt = [Double](repeating: 0, count: n)
        for j in 0..<n {
            cnt[j] = sums[j * 4 + 3]
            pts[j * 3] = sums[j * 4] / cnt[j]; pts[j * 3 + 1] = sums[j * 4 + 1] / cnt[j]; pts[j * 3 + 2] = sums[j * 4 + 2] / cnt[j]
        }
        return (pts, cnt, cellOf)
    }

    // MARK: The plan

    private static let noLayer: [Double] = [1, 1, 1]

    // A layer while it is planned. `paint` = place of its paint in the list of paints given;
    // `dull` = what a coat of it costs extra on a saturated colour.
    private struct Planned {
        var paint: Int
        var a: Vec3
        var limit: Double
        var dull: Double
        var strength: Double
        var ratio: Double
        var top: Int
        var kind: Layer.Kind
        var role: Layer.Role?
    }

    // Amount of an accent's paint that its wash layer has already put on the paper (all its coats).
    private static func underOf(_ layer: Planned, _ chosen: [Planned]) -> Double {
        if layer.kind != .accent { return 0 }
        guard let wash = chosen.first(where: { $0.kind == .wash && $0.paint == layer.paint }) else { return 0 }
        return coatAmount(wash.top, wash.strength, ratio: wash.ratio)
    }

    private static func tablesOf(_ chosen: [Planned]) -> [[Double]] {
        chosen.map { filterTable($0.a, $0.limit, $0.strength, $0.ratio, $0.top, under: underOf($0, chosen)) }
    }

    private static func pricesOf(_ chosen: [Planned]) -> [Price] {
        chosen.map { (coat: $0.kind == .accent ? accentCoatPrice : coatPrice, dull: $0.dull) }
    }

    // A paint as the search knows it.
    private struct Known {
        var paint: Int
        var a: Vec3
        var limit: Double
        var dull: Double
    }

    private static func knownPaint(_ paint: Int, _ paints: [MixPaint]) -> Known {
        let a = Mixing.absorbance(hex: paints[paint].hex)
        let linear = ColorMath.linear(rgb: ColorMath.rgb(hex: paints[paint].hex))
        let c = lab(linear.x, linear.y, linear.z)
        let neutral = max(0, 1 - hypot(c.a, c.b) / neutralChroma)
        return Known(paint: paint, a: a, limit: Mixing.depthLimit(a), dull: neutral * dullPrice)
    }

    // Plan the wash layers: which paints, with how many coats of which wash.
    // The search can get stuck, and graded coats give it more room to do so: with `graded` it runs
    // once with even coats and once with graded ones, and the cheaper plan (distance plus work) counts.
    private static func planWashes(_ set: FitSet, _ paints: [MixPaint], count: Int, maxCoats: Int, graded: Bool, start: [Planned]? = nil) -> [Planned] {
        let maxRatio = graded && maxCoats > 1 ? Layers.maxRatio : 1
        var best: (chosen: [Planned], sum: Double)?
        // Adding one paint at a time, the last paint can pay for itself where a plan with one paint
        // less, found on its own, does as well with fewer steps. So that plan is looked at too.
        let counts = start != nil || count < 3 ? [count] : [count, count - 1]
        let starts = maxRatio > 1 && start == nil ? [[1], ratios] : [maxRatio > 1 ? ratios : [1]]
        for count in counts {
            for ratios in starts {
                var chosen = searchWashes(set, paints, count: count, maxCoats: maxCoats, ratios: ratios, maxRatio: maxRatio, start: start)
                var sum = planCost(chosen, set)
                // The search judges a step by a shortcut. Counted exactly, with every colour free to choose
                // among all combinations, a coat or a whole layer may not pay after all: it goes.
                var pruned = true
                while pruned && chosen.count > 1 {
                    pruned = false
                    for k in chosen.indices {
                        var less = chosen
                        less[k].top -= 1
                        less.removeAll { $0.top <= 0 }
                        let cost = planCost(less, set)
                        if cost <= sum + 1e-9 { chosen = less; sum = cost; pruned = true; break }
                    }
                }
                if best == nil || sum < best!.sum - 1e-9 { best = (chosen, sum) }
            }
        }
        return best?.chosen ?? []
    }

    // What a plan of washes costs: the mean distance of the colours, each with the combination that
    // suits it best, plus the work in those combinations, plus the steps.
    private static func planCost(_ chosen: [Planned], _ set: FitSet) -> Double {
        let combos = combinations(tablesOf(chosen), pricesOf(chosen))
        let (best, error) = closest(combos, set.points, set.n)
        var sum = Double(chosen.reduce(0) { $0 + $1.top }) * stepPrice
        for i in 0..<set.n {
            let clean = dulling(set.points[i * 3 + 1], set.points[i * 3 + 2])
            let b = Int(best[i])
            sum += (set.weights[i] / 100) * (error[i] + (combos.work[b] + clean * combos.dull[b]) * 100)
        }
        return sum
    }

    // One run of the search: add the paint that pays most, one at a time, as long as one pays;
    // exchange every chosen paint for a better one as long as that helps; tune strength and number of
    // coats of every layer and drop what no longer pays. `start` = wash layers to go on from.
    private static func searchWashes(_ set: FitSet, _ paints: [MixPaint], count: Int, maxCoats: Int, ratios: [Double], maxRatio: Double, start: [Planned]?) -> [Planned] {
        var grid: [(strength: Double, ratio: Double)] = []
        for ratio in ratios {
            for strength in strengths where strength * pow(ratio, Double(maxCoats - 1)) <= maxStrength { grid.append((strength, ratio)) }
        }
        let pool = paints.indices.map { paint -> (known: Known, tables: [[Double]]) in
            let known = knownPaint(paint, paints)
            return (known, grid.map { filterTable(known.a, known.limit, $0.strength, $0.ratio, maxCoats) })
        }
        let wanted = min(count, pool.count, maxLayers)
        var chosen = start ?? []
        func others(_ skip: Int) -> Shortlist {
            var rest = chosen
            if skip >= 0 { rest.remove(at: skip) }
            return shortlist(tablesOf(rest), pricesOf(rest), set.points, set.n, keep: shortlistSize)
        }

        // The best paint, wash and number of coats for the layer at `skip` (or for a new one).
        // `bound` = distance plus work that it has to beat, the steps of the layer included.
        func bestWash(_ skip: Int, _ rest: Shortlist, _ limit: Double) -> Planned? {
            var bound = limit
            var best: Planned?
            for candidate in pool {
                if chosen.indices.contains(where: { $0 != skip && chosen[$0].paint == candidate.known.paint }) { continue }
                for g in grid.indices {
                    var top = grid[g].ratio == 1 ? 1 : 2
                    while top <= maxCoats {
                        let steps = stepPrice * Double(top)
                        let cost = errorWith(candidate.tables[g], levels: top + 1, rest, set, bound: bound - steps, dull: candidate.known.dull) + steps
                        if cost < bound {
                            bound = cost
                            best = Planned(paint: candidate.known.paint, a: candidate.known.a, limit: candidate.known.limit, dull: candidate.known.dull, strength: grid[g].strength, ratio: grid[g].ratio, top: top, kind: .wash, role: nil)
                        }
                        top += 1
                    }
                }
            }
            return best
        }
        func add() -> Bool {
            var added = false
            while chosen.count < wanted {
                // Every combination of coats is looked at later: no more layers than that can take.
                if chosen.reduce(maxCoats + 1, { $0 * ($1.top + 1) }) > maxCombinations / 4 { break }
                let rest = others(-1)
                guard let next = bestWash(-1, rest, errorWith(noLayer, levels: 1, rest, set) - 1e-6) else { break }
                chosen.append(next)
                added = true
            }
            return added
        }
        func exchange() -> Bool {
            var improved = false
            for _ in 0..<swapRounds {
                var better = false
                for k in chosen.indices {
                    let rest = others(k)
                    let now = errorWith(tablesOf(chosen)[k], levels: chosen[k].top + 1, rest, set, dull: chosen[k].dull) + stepPrice * Double(chosen[k].top)
                    if let next = bestWash(k, rest, now - 0.005) { chosen[k] = next; better = true; improved = true }
                }
                if !better { break }
            }
            return improved
        }

        func clamp(_ s: Double, _ r: Double, _ top: Int) -> (s: Double, r: Double) {
            let ratio = top > 1 ? min(maxRatio, max(1, r)) : 1
            return (min(maxStrength / pow(ratio, Double(top - 1)), max(minStrength, s)), ratio)
        }
        // Pattern search on the water level of the first coat and on how much stronger the next coats are.
        func tuneWash(_ errorAt: ((s: Double, r: Double)) -> Double, _ start: (s: Double, r: Double), _ top: Int) -> (at: (s: Double, r: Double), error: Double) {
            var at = clamp(start.s, start.r, top)
            var best = errorAt(at)
            var step = 0.3
            while step > 0.01 {
                var moved = true
                while moved {
                    moved = false
                    for (ds, dr) in [(1.0, 0.0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)] {
                        if dr != 0 && (maxRatio == 1 || top == 1) { continue }
                        let trial = clamp(at.s * exp(ds * step), at.r * exp(dr * step), top)
                        let e = errorAt(trial)
                        if e < best - 1e-9 { best = e; at = trial; moved = true; break }
                    }
                }
                step /= 2
            }
            return (at, best)
        }
        // Every layer in turn, with the others fixed: its wash, its number of coats, and whether it
        // still pays at all.
        func tune() {
            for _ in 0..<2 {
                for k in chosen.indices {
                    let layer = chosen[k]
                    let rest = others(k)
                    func errorAt(_ top: Int) -> ((s: Double, r: Double)) -> Double {
                        { at in errorWith(filterTable(layer.a, layer.limit, at.s, at.r, top), levels: top + 1, rest, set, dull: layer.dull) + stepPrice * Double(top) }
                    }
                    var top = layer.top
                    var best = tuneWash(errorAt(top), (layer.strength, layer.ratio), top)
                    for other in 1..<(maxCoats + 1) where other != layer.top {
                        // The same amount of paint in fewer or more coats is where to start.
                        let trial = tuneWash(errorAt(other), ((layer.strength * Double(layer.top)) / Double(other), layer.ratio), other)
                        if trial.error < best.error - 1e-6 { best = trial; top = other }
                    }
                    if errorWith(noLayer, levels: 1, rest, set) - best.error < 1e-6 { top = 0 }
                    chosen[k].strength = best.at.s; chosen[k].ratio = best.at.r; chosen[k].top = top
                }
                chosen.removeAll { $0.top <= 0 }
            }
        }

        if add() || start == nil {
            if start == nil { _ = exchange() }
            tune()
            if start == nil && exchange() { tune() }
        }
        return chosen
    }

    // MARK: Accents

    // What the washes leave over at a number of spots: `base` = linear RGB of what the washes give
    // at a spot, `points` = OKLab of what the picture has there, `counts` = how much of the picture
    // that is.
    private typealias Leftover = (base: [Double], points: [Double], counts: [Double])

    // The spots the accents are chosen on; `weights` (area) and `detail` are shares of the whole picture.
    private struct Spots {
        var n: Int
        var base: [Double]
        var points: [Double]
        var weights: [Double]
        var detail: [Double]
    }

    // What the washes leave over, as the accents see it. Only the spots an accent could be worth
    // its while on are kept (missed by more than an accent costs), the worst first.
    private static func residual(_ left: Leftover) -> Spots {
        let (base, points, counts) = left
        let all = counts.count
        var total = 0.0, totalDetail = 0.0
        for i in 0..<all { total += counts[i]; totalDetail += pow(counts[i], detailPower) }
        var kept: [(i: Int, rank: Double)] = []
        for i in 0..<all {
            let c = lab(base[i * 3], base[i * 3 + 1], base[i * 3 + 2])
            let miss = hypot(c.l - points[i * 3], c.a - points[i * 3 + 1], c.b - points[i * 3 + 2])
            if miss * 100 <= accentCoatPrice { continue }
            let chroma = hypot(points[i * 3 + 1], points[i * 3 + 2])
            kept.append((i, pow(counts[i], detailPower) * miss * miss * (1 + chroma / colourChroma)))
        }
        kept.sort { $0.rank != $1.rank ? $0.rank > $1.rank : $0.i < $1.i }
        let n = min(kept.count, accentSpots)
        var out = Spots(n: n, base: [Double](repeating: 0, count: n * 3), points: [Double](repeating: 0, count: n * 3), weights: [Double](repeating: 0, count: n), detail: [Double](repeating: 0, count: n))
        for j in 0..<n {
            let i = kept[j].i
            for c in 0..<3 { out.base[j * 3 + c] = base[i * 3 + c]; out.points[j * 3 + c] = points[i * 3 + c] }
            out.weights[j] = (counts[i] / total) * 100
            out.detail[j] = (pow(counts[i], detailPower) / totalDetail) * 100
        }
        return out
    }

    // What an accent is good for on what the washes leave over: the squared distance (its work
    // included) it takes away, weighted by `detail`, and the part of the picture (of 100) it would be
    // painted on. A spot takes the accent over its washes or, when that is clearly closer, on bare
    // paper (a shape the painter leaves out of the washes). With `apply` the spots get it.
    // `role` says what counts as a miss:
    // - colour: a colour of the picture that is missing. Misses count by the chroma of the picture
    //   and by how much of that colour the washes lack (a hue that is not there at all counts fully,
    //   one that is only too pale hardly), lightness counts less, and the accent must bring hue and
    //   saturation closer. The dark parts of the picture are left to the accent for the darks.
    // - dark: a dark part that comes out too light. Misses count by how dark the picture is there.
    // - any: every miss, saturated ones more.
    private static func accentGain(dull: Double, _ table: [Double], _ spots: inout Spots, _ role: Layer.Role, apply: Bool = false) -> (gain: Double, share: Double) {
        let lightness = role == .colour ? colourLightness : 1
        let coat = accentCoatPrice / 100, carve = carveGain / 100
        let alone = lab(table[3], table[4], table[5])
        var gain = 0.0, share = 0.0
        for i in 0..<spots.n {
            let o = i * 3
            let l = spots.points[o], a = spots.points[o + 1], b = spots.points[o + 2]
            let chroma = (a * a + b * b).squareRoot()
            let price = coat + (dull != 0 ? (dulling(a, b) * dull) / 100 : 0)
            let under = lab(spots.base[o], spots.base[o + 1], spots.base[o + 2])
            let offHue = hypot(under.a - a, under.b - b)
            // How much of the picture's colour is not there yet: 0 = the washes have its hue at full
            // saturation, 1 = they have nothing of it.
            let missing = chroma > 0 ? min(1, max(0, 1 - (under.a * a + under.b * b) / (chroma * chroma))) : 0
            let without = hypot((under.l - l) * lightness, under.a - a, under.b - b)
            let over = lab(spots.base[o] * table[3], spots.base[o + 1] * table[4], spots.base[o + 2] * table[5])
            var withIt = hypot((over.l - l) * lightness, over.a - a, over.b - b) + price
            var onHue = hypot(over.a - a, over.b - b)
            let onPaper = hypot((alone.l - l) * lightness, alone.a - a, alone.b - b) + price + carve
            let reserved = role != .dark && onPaper < withIt
            if reserved { withIt = onPaper; onHue = hypot(alone.a - a, alone.b - b) }
            if withIt >= without { continue }
            var weight = spots.detail[i]
            switch role {
            case .colour:
                if onHue >= offHue || chroma < colourChroma / 2 || l < darkFrom { continue }
                weight *= (chroma / colourChroma) * missing
            case .dark:
                if l >= under.l || l >= darkFrom { continue }
                weight *= min(1, (darkFrom - l) / (darkFrom - darkFull))
            case .any:
                weight *= 1 + chroma / colourChroma
            }
            gain += weight * (without * without - withIt * withIt) * 100
            share += spots.weights[i]
            if apply {
                if reserved {
                    spots.base[o] = table[3]; spots.base[o + 1] = table[4]; spots.base[o + 2] = table[5]
                } else {
                    spots.base[o] *= table[3]; spots.base[o + 1] *= table[4]; spots.base[o + 2] *= table[5]
                }
            }
        }
        return (gain, share)
    }

    // Whether one coat of this wash on white paper is dark enough for the accent for the darks.
    private static func isDarkCoat(_ candidate: Known, _ strength: Double) -> Bool {
        let d = depth(strength, limit: candidate.limit)
        return lab(exp(-d * candidate.a.x), exp(-d * candidate.a.y), exp(-d * candidate.a.z)).l < darkCoat
    }

    // The accents: one strong wash at a time, of the paint and strength that take most away from what
    // is left over, as long as one pays. The first is for a colour of the picture that is missing,
    // the second for the darks, a third for whatever is missed most; a role nothing pays for is
    // passed over, and when no paint is dark enough there is no accent for the darks. So with more
    // accents allowed the first ones stay the same.
    private static func chooseAccents(_ washes: [Planned], _ leftover: Spots, _ paints: [MixPaint], _ count: Int) -> [Planned] {
        var spots = leftover
        var chosen: [Planned] = []
        let pool = paints.indices.map { paint -> (known: Known, under: Double) in
            let wash = washes.first { $0.paint == paint }
            return (knownPaint(paint, paints), wash.map { coatAmount($0.top, $0.strength, ratio: $0.ratio) } ?? 0)
        }
        func tableOf(_ candidate: (known: Known, under: Double), _ strength: Double) -> [Double] {
            filterTable(candidate.known.a, candidate.known.limit, strength, 1, 1, under: candidate.under)
        }
        var size = washes.reduce(1) { $0 * ($1.top + 1) }
        for role in [Layer.Role.colour, .dark, .any] {
            if chosen.count >= count || spots.n == 0 || size * 2 > maxCombinations { break }
            func gainOf(_ candidate: (known: Known, under: Double), _ strength: Double) -> Double {
                if role == .dark && !isDarkCoat(candidate.known, strength) { return 0 }
                let (gain, share) = accentGain(dull: candidate.known.dull, tableOf(candidate, strength), &spots, role)
                return share > accentShare * 100 ? 0 : gain
            }
            var best: (candidate: (known: Known, under: Double), strength: Double)?
            var most = accentPrice
            for candidate in pool {
                if chosen.contains(where: { $0.paint == candidate.known.paint }) { continue }
                for strength in accentStrengths {
                    let gain = gainOf(candidate, strength)
                    if gain > most { most = gain; best = (candidate, strength) }
                }
            }
            guard let found = best else { continue }
            // The strength between the ones tried that takes most away.
            let candidate = found.candidate
            var strength = found.strength
            var step = 0.25
            while step > 0.02 {
                for dir in [1.0, -1.0] {
                    let trial = min(maxStrength, max(minStrength, strength * exp(dir * step)))
                    let gain = gainOf(candidate, trial)
                    if gain > most { most = gain; strength = trial }
                }
                step /= 2
            }
            _ = accentGain(dull: candidate.known.dull, tableOf(candidate, strength), &spots, role, apply: true)
            chosen.append(Planned(paint: candidate.known.paint, a: candidate.known.a, limit: candidate.known.limit, dull: candidate.known.dull, strength: strength, ratio: 1, top: 1, kind: .accent, role: role))
            size *= 2
        }
        return chosen
    }

    // The whole plan: the washes, then accents for what they leave over. The washes do not depend on
    // the accents, so more accents only ever add to a plan.
    // `left(washes)` gives what the washes leave over (see `residual`).
    private static func planLayers(_ set: FitSet, _ left: ([Planned]) -> Leftover, _ paints: [MixPaint], count: Int, maxCoats: Int, graded: Bool, accents: Int) -> [Planned] {
        let washes = planWashes(set, paints, count: min(count, paints.count, maxLayers), maxCoats: maxCoats, graded: graded)
        let extra = min(3, max(0, accents))
        return extra > 0 ? washes + chooseAccents(washes, residual(left(washes)), paints, extra) : washes
    }

    // What the washes leave over when every colour gets the combination that suits it best.
    private static func leftOfColours(_ colours: ColourSet) -> ([Planned]) -> Leftover {
        { washes in
            let combos = combinations(tablesOf(washes), pricesOf(washes))
            let n = colours.counts.count
            let (best, _) = closest(combos, colours.points, n)
            var base = [Double](repeating: 0, count: n * 3)
            for i in 0..<n {
                let o = Int(best[i]) * 3
                base[i * 3] = combos.lin[o]; base[i * 3 + 1] = combos.lin[o + 1]; base[i * 3 + 2] = combos.lin[o + 2]
            }
            return (base, colours.points, colours.counts)
        }
    }

    // MARK: Layers as they are handed out

    private typealias Ordered = (layer: Planned, table: [Double], under: Double)

    // Painting order: the washes of clean colour, lightest first (OKLab lightness of the layer with
    // all its coats on), then the washes of neutral paints, which a painter keeps for late, then the
    // accents, lightest first.
    private static func paintingOrder(_ chosen: [Planned]) -> [Ordered] {
        let tables = tablesOf(chosen)
        let entries = chosen.indices.map { i -> (ordered: Ordered, late: Int, l: Double, i: Int) in
            let layer = chosen[i]
            let o = layer.top * 3
            let late = layer.kind == .accent ? 2 : layer.dull > dullPrice / 2 ? 1 : 0
            return ((layer, tables[i], underOf(layer, chosen)), late, lab(tables[i][o], tables[i][o + 1], tables[i][o + 2]).l, i)
        }
        return entries
            .sorted { x, y in
                if x.late != y.late { return x.late < y.late }
                if x.l != y.l { return x.l > y.l }
                return x.i < y.i
            }
            .map(\.ordered)
    }

    private struct Described {
        var layers: [Layer]
        var tables: [[Double]]
        var prices: [Price]
    }

    // The layers as they are handed out, and their filter tables with the coats each layer really
    // has. The arrays that are handed out all run to maxCoats (the last coat repeated), so that every
    // layer can be asked for any number of coats. Paints without a layer are listed last, unused.
    private static func describeLayers(_ chosen: [Planned], unused: [Int], _ paints: [MixPaint], _ maxCoats: Int) -> Described {
        var ordered = paintingOrder(chosen)
        for paint in unused {
            ordered.append((Planned(paint: paint, a: Vec3(0, 0, 0), limit: 1, dull: 0, strength: 0, ratio: 1, top: 0, kind: .wash, role: nil), noLayer, 0))
        }
        let layers = ordered.enumerated().map { index, entry -> Layer in
            let (layer, table, under) = entry
            var filters = [Double](repeating: 0, count: (maxCoats + 1) * 3)
            for c in 0...maxCoats {
                let o = min(c, layer.top) * 3
                filters[c * 3] = table[o]; filters[c * 3 + 1] = table[o + 1]; filters[c * 3 + 2] = table[o + 2]
            }
            func washAt(_ c: Int) -> Layer.Wash {
                let strength = layer.strength * pow(layer.ratio, Double(min(c, max(0, layer.top - 1))))
                let guide = washGuide(strength)
                return Layer.Wash(strength: strength, dilution: Mixing.describeDilution(strength), water: guide.water, consistency: guide.consistency, guide: guide.guide)
            }
            let first = washAt(0)
            let below = depth(under, limit: layer.limit)
            // Of an accent over its own wash paint, `filters` is what it adds there; the colour to
            // prepare and to test on white paper is that of the wash by itself.
            let hexes: [String]
            if under > 0 {
                let alone = linearHex(filterTable(layer.a, layer.limit, layer.strength, 1, 1), 3)
                hexes = ["#ffffff"] + [String](repeating: alone, count: maxCoats)
            } else {
                hexes = (0...maxCoats).map { linearHex(filters, $0 * 3) }
            }
            return Layer(
                index: index,
                kind: layer.kind,
                role: layer.role,
                paintID: paints[layer.paint].id,
                top: layer.top,
                strength: first.strength,
                dilution: first.dilution,
                water: first.water,
                consistency: first.consistency,
                guide: first.guide,
                ratio: layer.ratio,
                washes: (0..<maxCoats).map(washAt),
                depths: (0...maxCoats).map { depth(under + coatAmount(min($0, layer.top), layer.strength, ratio: layer.ratio), limit: layer.limit) - below },
                hexes: hexes,
                filters: filters
            )
        }
        return Described(layers: layers, tables: ordered.map(\.table), prices: pricesOf(ordered.map(\.layer)))
    }

    // From the colours to the layers, in painting order. `left` as in `planLayers`; without it the
    // accents are fitted to the same colours as the washes.
    private static func layersFor(_ colours: ColourSet, _ paints: [MixPaint], count: Int, maxCoats: Int, graded: Bool, accents: Int, keepUnused: Bool = false, left: (([Planned]) -> Leftover)? = nil) -> Described {
        if paints.isEmpty || colours.counts.isEmpty { return describeLayers([], unused: keepUnused ? Array(paints.indices) : [], paints, maxCoats) }
        let chosen = planLayers(fitSet(colours), left ?? leftOfColours(colours), paints, count: count, maxCoats: maxCoats, graded: graded, accents: accents)
        let unused = keepUnused ? paints.indices.filter { paint in !chosen.contains { $0.paint == paint } } : []
        return describeLayers(chosen, unused: unused, paints, maxCoats)
    }

    // Coats of every layer in a combination (see `combinations`).
    private static func coatsOf(_ combo: Int, _ tables: [[Double]]) -> [Int] {
        var rest = combo
        return tables.map { t in
            let levels = t.count / 3, c = rest % levels
            rest = (rest - c) / levels
            return c
        }
    }

    private static func unique(_ list: [String]) -> [String] {
        var seen = Set<String>()
        return list.filter { seen.insert($0).inserted }
    }

    /// Propose the base paints for a set of colours (from `pictureColours` or `colourSet`).
    ///
    /// - Parameters:
    ///   - count: the most paints to propose for the washes; fewer come back when the rest would not
    ///     pay for its work.
    ///   - graded: coats of a layer may get stronger from coat to coat.
    ///   - accents: 0...3, the most accent layers: the first for a colour of the picture the washes
    ///     miss, the second for the darks, a third for whatever is missed most. One that does not pay
    ///     is not used. An accent may bring a paint of its own, on top of `count`. The washes are the
    ///     same whatever `accents` is. From the colours alone the accents can only be guessed;
    ///     `layerImage` proposes from the picture.
    /// - Returns: paint ids in painting order: washes, then paints only used for accents.
    static func proposePaints(colours: ColourSet, paints: [MixPaint], count: Int = 4, maxCoats: Int = Layers.maxCoats, graded: Bool = Layers.graded, accents: Int = Layers.accents) -> [String] {
        unique(layersFor(colours, paints, count: count, maxCoats: max(1, maxCoats), graded: graded, accents: accents).layers.map(\.paintID))
    }

    /// Fit the layers of the given paints to colours: which paint is a wash (and its wash and coats),
    /// which an accent, which is not needed. Options as in `proposePaints`.
    static func fit(colours: ColourSet, paints: [MixPaint], maxCoats: Int = Layers.maxCoats, graded: Bool = Layers.graded, accents: Int = Layers.accents) -> LayerFit {
        let n = colours.counts.count
        let described = layersFor(colours, paints, count: paints.count, maxCoats: max(1, maxCoats), graded: graded, accents: accents, keepUnused: true)
        let combos = combinations(described.tables, described.prices)
        let (best, error) = closest(combos, colours.points, n)
        var sum = 0.0, total = 0.0
        for i in 0..<n { sum += error[i] * colours.counts[i]; total += colours.counts[i] }
        return LayerFit(
            layers: described.layers,
            coats: best.map { coatsOf(Int($0), described.tables) },
            hexes: best.map { linearHex(combos.lin, Int($0) * 3) },
            deltaE: error,
            error: total != 0 ? sum / total : 0
        )
    }

    /// Colours of coat combinations with only some of the layers switched on (cheap: no fitting, a few
    /// multiplications per combination).
    ///
    /// - Parameters:
    ///   - combos: e.g. `combos` of a `LayerPlan`
    ///   - coats: per layer the most coats to show: 0 = the layer is off, its `top` or more = all its
    ///     coats, a number in between = the picture part-way through the painting; default all
    /// - Returns: RGB triples, one per combination
    static func compositeColours(layers: [Layer], combos: [LayerPlan.Combo], coats: [Int]? = nil) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: combos.count * 3)
        for (i, combo) in combos.enumerated() {
            var r = 1.0, g = 1.0, b = 1.0
            for (k, layer) in layers.enumerated() {
                // A layer `coats` does not mention is off.
                let show = coats.map { k < $0.count ? $0[k] : 0 } ?? .max
                if show <= 0 { continue }
                let o = min(combo.coats[k], show) * 3
                r *= layer.filters[o]; g *= layer.filters[o + 1]; b *= layer.filters[o + 2]
            }
            out[i * 3] = UInt8(ColorMath.linearToSrgb(r).rounded(.toNearestOrEven))
            out[i * 3 + 1] = UInt8(ColorMath.linearToSrgb(g).rounded(.toNearestOrEven))
            out[i * 3 + 2] = UInt8(ColorMath.linearToSrgb(b).rounded(.toNearestOrEven))
        }
        return out
    }

    /// The picture with only some of the layers switched on, as RGBA pixels.
    /// `coats` per layer, see `compositeColours`; default all.
    static func renderLayers(_ plan: LayerPlan, coats: [Int]? = nil) -> [UInt8] {
        var out = [UInt8](repeating: 255, count: plan.comboMap.count * 4)
        renderLayers(plan, coats: coats, into: &out)
        return out
    }

    /// The same into an RGBA buffer to reuse.
    static func renderLayers(_ plan: LayerPlan, coats: [Int]? = nil, into out: inout [UInt8]) {
        let colours = compositeColours(layers: plan.layers, combos: plan.combos, coats: coats)
        let count = plan.comboMap.count
        if out.count != count * 4 { out = [UInt8](repeating: 255, count: count * 4) }
        plan.comboMap.withUnsafeBufferPointer { map in
            out.withUnsafeMutableBufferPointer { out in
                for p in 0..<count {
                    let c = Int(map[p]) * 3
                    out[p * 4] = colours[c]; out[p * 4 + 1] = colours[c + 1]; out[p * 4 + 2] = colours[c + 2]; out[p * 4 + 3] = 255
                }
            }
        }
    }

    // MARK: The picture

    // Separate shapes a brush has to fill per coat of a layer: connected areas of "this coat or more",
    // counted from the layer's areas of equal coats and which of them touch.
    private static func shapesPerCoat(_ regionMap: [Int32], _ regionCoats: [Int], _ width: Int, _ height: Int, _ top: Int) -> [Int] {
        let count = regionCoats.count
        var parents = [[Int32]](repeating: (0..<count).map { Int32($0) }, count: top + 1)
        func find(_ c: Int, _ start: Int) -> Int {
            var i = start
            while Int(parents[c][i]) != i {
                parents[c][i] = parents[c][Int(parents[c][i])]
                i = Int(parents[c][i])
            }
            return i
        }
        func join(_ p: Int, _ q: Int) {
            let r = Int(regionMap[p]), s = Int(regionMap[q])
            if r == s { return }
            var c = min(regionCoats[r], regionCoats[s])
            while c >= 1 {
                let a = find(c, r), b = find(c, s)
                if a == b { break } // joined for this coat means joined for every coat below it
                parents[c][a] = Int32(b)
                c -= 1
            }
        }
        for y in 0..<height {
            for x in 0..<width {
                let p = y * width + x
                if x < width - 1 { join(p, p + 1) }
                if y < height - 1 { join(p, p + width) }
            }
        }
        var shapes = [Int](repeating: 0, count: top + 1)
        for c in 1..<(top + 1) {
            for r in 0..<count where regionCoats[r] >= c && find(c, r) == r { shapes[c] += 1 }
        }
        return shapes
    }

    // Pixels no accent goes on: near-neutral ones in paper-white surroundings (print on white, glints,
    // the grain of a white wall). The surroundings are the mean of 3 x 3 blocks of paperWindow pixels.
    private static func clutterMask(_ rgba: [UInt8], _ lab: [Float], _ width: Int, _ height: Int) -> [Bool] {
        let lut = (0..<256).map { Double(Float(ColorMath.srgbToLinear(Double($0)))) }
        let size = paperWindow
        let gw = (width + size - 1) / size, gh = (height + size - 1) / size
        var sums = [Double](repeating: 0, count: gw * gh), counts = [Double](repeating: 0, count: gw * gh)
        for y in 0..<height {
            let row = (y / size) * gw
            for x in 0..<width {
                let i = (y * width + x) * 4
                let block = row + x / size
                sums[block] += 0.2126 * lut[Int(rgba[i])] + 0.7152 * lut[Int(rgba[i + 1])] + 0.0722 * lut[Int(rgba[i + 2])]
                counts[block] += 1
            }
        }
        // Lightness of a grey of that luminance, per block with its neighbours.
        var paper = [Bool](repeating: false, count: gw * gh)
        for gy in 0..<gh {
            for gx in 0..<gw {
                var sum = 0.0, n = 0.0
                for dy in -1...1 {
                    for dx in -1...1 {
                        let xx = gx + dx, yy = gy + dy
                        if xx < 0 || yy < 0 || xx >= gw || yy >= gh { continue }
                        sum += sums[yy * gw + xx]; n += counts[yy * gw + xx]
                    }
                }
                paper[gy * gw + gx] = cbrt(sum / n) > paperLightness
            }
        }
        var mask = [Bool](repeating: false, count: width * height)
        for y in 0..<height {
            let row = (y / size) * gw
            for x in 0..<width {
                let p = y * width + x
                if paper[row + x / size] && hypot(Double(lab[p * 3 + 1]), Double(lab[p * 3 + 2])) < clutterChroma { mask[p] = true }
            }
        }
        return mask
    }

    private typealias Bins = (points: [Double], counts: [Double], binOf: [Int32])

    /// Full pipeline: picture -> layers.
    ///
    /// - Parameters:
    ///   - rgba: the picture at working resolution
    ///   - paints: the paint box
    ///   - count: without `paintIDs` the most paints proposed for the washes (default 4; up to one
    ///     more per accent comes on top); with `paintIDs` the most wash layers (default: every given
    ///     paint may be one)
    ///   - paintIDs: the base paints; without them paints are proposed from the picture with a fixed blur
    ///   - maxCoats: the most coats a wash layer can get
    ///   - graded, accents: see `proposePaints`
    ///   - simplify: 0...10 as in `Segmenter.segment`: blur, smoothing and the smallest area of every
    ///     layer. The washes are fitted to the blurred picture and get calm areas; the accents are
    ///     fitted to what those washes leave over of the picture as it is, and may stay smaller.
    ///
    /// A proposal only names paints that get something to paint (fewer than asked for when the rest
    /// would not pay for its work); its paints and washes do not depend on `simplify`. A given paint
    /// that is not needed keeps a layer without coats (`top` 0) at the end. Planning given paints
    /// starts afresh from those paints, so it can differ a little from the proposal that named them.
    /// An accent has at most 24 shapes and stays off print and glints on white.
    static func layerImage(rgba: [UInt8], width: Int, height: Int, paints: [MixPaint], count: Int? = nil, paintIDs: [String]? = nil, maxCoats requested: Int = Layers.maxCoats, graded: Bool = Layers.graded, simplify: Int = 4, accents maxAccents: Int = Layers.accents, geometric: Bool = false) -> LayerPlan {
        let pixels = width * height
        let maxCoats = max(1, requested)
        let simple = Double(simplify)
        let blur = Int(roundHalfUp(simple / 3))
        func binsOf(_ radius: Int) -> Bins {
            Segmenter.colourBins(labPixels(Segmenter.boxBlur(rgba, width, height, radius: radius), count: pixels), count: pixels)
        }
        // The picture as it is, and its colours on a coarse grid: what the accents are fitted to.
        let lab = labPixels(rgba, count: pixels)
        let sharp: Bins = Segmenter.colourBins(lab, count: pixels)
        let cells = joinColours(sharp.points, sharp.counts, 0.03, 0.015)
        // Per pixel: how much a neutral coat would dull it, and whether it is clutter no accent goes on.
        var clean = [Float](repeating: 0, count: pixels)
        for p in 0..<pixels { clean[p] = Float(dulling(Double(lab[p * 3 + 1]), Double(lab[p * 3 + 2]))) }
        let clutter = maxAccents > 0 ? clutterMask(rgba, lab, width, height) : [Bool](repeating: false, count: pixels)
        // The picture blurred: what the washes are fitted to.
        let calm = blur > 0 ? binsOf(blur) : sharp
        let bins = calm.counts.count

        // What washes leave over: every pixel gets the washes of its blurred colour and keeps its own
        // colour; pixels alike in both are counted together.
        func left(_ blurred: Bins) -> ([Planned]) -> Leftover {
            { washes in
                let combos = combinations(tablesOf(washes), pricesOf(washes))
                let (best, _) = closest(combos, blurred.points, blurred.counts.count)
                let nc = cells.counts.count
                var seen = [Int: Int]()
                var keys: [Int] = []
                var counts: [Double] = []
                for p in 0..<pixels where !clutter[p] {
                    let key = Int(best[Int(blurred.binOf[p])]) * nc + Int(cells.cellOf[Int(sharp.binOf[p])])
                    if let i = seen[key] {
                        counts[i] += 1
                    } else {
                        seen[key] = keys.count
                        keys.append(key)
                        counts.append(1)
                    }
                }
                var base = [Double](repeating: 0, count: keys.count * 3), points = [Double](repeating: 0, count: keys.count * 3)
                for (i, key) in keys.enumerated() {
                    let cell = key % nc, combo = (key - cell) / nc
                    for c in 0..<3 { base[i * 3 + c] = combos.lin[combo * 3 + c]; points[i * 3 + c] = cells.points[cell * 3 + c] }
                }
                return (base, points, counts)
            }
        }

        // The plan for the given paints, laid over the picture.
        func build(_ described: Described, proposal: Bool = false) -> LayerPlan {
            var layers = described.layers
            let tables = described.tables, prices = described.prices
            let all = combinations(tables, prices)
            let levelsOf = tables.map { $0.count / 3 }
            var radix: [Int] = []
            var place = 1
            for levels in levelsOf { radix.append(place); place *= levels }
            let washes = layers.indices.filter { layers[$0].kind == .wash && levelsOf[$0] > 1 }
            let accents = layers.indices.filter { layers[$0].kind == .accent }

            let passes = Int((simple / 2).rounded(.up))
            let minRegion = max(2, (simplify + 1) * (simplify + 1), Int(roundHalfUp(Double(pixels) * 0.00004 * pow(simple + 1, 2.2))))
            var code = [Int32](repeating: 0, count: pixels)
            var maps = [[Int32]](repeating: [Int32](repeating: 0, count: pixels), count: layers.count)

            // Layers are smoothed one by one, so where their edges moved apart they no longer add up to the
            // colour that was meant. Each area of each of the given layers therefore takes the number of
            // coats that suits the picture best, given what the other layers have become.
            func revise(_ which: [Int]) {
                for _ in 0..<revisions {
                    var changed = false
                    for k in which {
                        let levels = levelsOf[k], place = radix[k]
                        let coat = prices[k].coat, dull = prices[k].dull
                        var calmed = maps[k]
                        maps[k] = []
                        let (regionMap, regionCluster, _) = Segmenter.connectedComponents(calmed, width, height)
                        var cost = [Double](repeating: 0, count: regionCluster.count * levels)
                        all.lab.withUnsafeBufferPointer { combo in
                            for p in 0..<pixels {
                                let l = Double(lab[p * 3]), a = Double(lab[p * 3 + 1]), b = Double(lab[p * 3 + 2])
                                let rest = Int(code[p]) - Int(calmed[p]) * place
                                let o = Int(regionMap[p]) * levels
                                let price = coat + Double(clean[p]) * dull
                                for c in 0..<levels {
                                    let q = (rest + c * place) * 3
                                    let dL = combo[q] - l, da = combo[q + 1] - a, db = combo[q + 2] - b
                                    cost[o + c] += (dL * dL + da * da + db * db).squareRoot() * 100 + price * Double(c)
                                }
                            }
                        }
                        var coats = regionCluster
                        for r in coats.indices {
                            // A change must pay: staying is the default.
                            var least = cost[r * levels + coats[r]] * 0.999
                            for c in 0..<levels where cost[r * levels + c] < least { least = cost[r * levels + c]; coats[r] = c; changed = true }
                        }
                        for p in 0..<pixels {
                            let c = Int32(coats[Int(regionMap[p])])
                            code[p] += (c - calmed[p]) * Int32(place)
                            calmed[p] = c
                        }
                        maps[k] = calmed
                    }
                    if !changed { break }
                }
            }

            // The washes: one map of coats per layer from the blurred picture, smoothed like the areas of
            // mix mode. Every colour takes the best combination of all layers, so that the washes stay
            // away from where an accent does better without them; the accents themselves come below.
            let (best, _) = closest(all, calm.points, bins)
            for k in washes {
                let levels = levelsOf[k]
                let digit = (0..<bins).map { Int32((Int(best[$0]) / radix[k]) % levels) }
                var raw = [Int32](repeating: 0, count: pixels)
                for p in 0..<pixels { raw[p] = digit[Int(calm.binOf[p])] }
                var smoothed = Segmenter.mergeSmallRegions(Segmenter.majorityFilter(raw, width, height, k: levels, passes: passes), width, height, minRegion: minRegion)
                // Geometric: the areas of every layer as polygons; laid over each other they overlap.
                if geometric { smoothed = Geometric.areas(smoothed, width, height, simplify: simplify) }
                for p in 0..<pixels { code[p] += smoothed[p] * Int32(radix[k]) }
                maps[k] = smoothed
            }
            if washes.count > 1 { revise(washes) }

            // The accents, from the picture as it is: every pixel takes an accent that brings it closer.
            // Their areas are only cleared of specks, not smoothed: they are for the small things.
            // Inside a shape of an accent the washes are then fitted to the accent: the painter leaves that
            // shape out of a wash, or gives it fewer coats, so that a turquoise detail is not painted over
            // an orange wash.
            // One accent after the other, each over what is there so far: a further accent then never
            // changes the ones before it.
            for k in accents {
                let place = radix[k]
                // What every colour would choose with the layers up to this accent to itself.
                let (ideal, _) = closest(all, size: place * 2, cells.points, cells.counts.count)
                var raw = [Int32](repeating: 0, count: pixels)
                var gains = [Float](repeating: 0, count: pixels)
                func costOf(_ q: Int, _ p: Int) -> Double {
                    let dL = all.lab[q * 3] - Double(lab[p * 3]), da = all.lab[q * 3 + 1] - Double(lab[p * 3 + 1]), db = all.lab[q * 3 + 2] - Double(lab[p * 3 + 2])
                    return (dL * dL + da * da + db * db).squareRoot() + all.work[q] + Double(clean[p]) * all.dull[q]
                }
                let darks = layers[k].role == .dark
                for p in 0..<pixels {
                    if clutter[p] || (darks && Double(lab[p * 3]) >= darkFrom) { continue }
                    // Over the washes as they are ...
                    let without = costOf(Int(code[p]), p)
                    var withIt = costOf(Int(code[p]) + place, p)
                    // ... or with the washes this colour would choose for itself, if that is clearly closer.
                    let own = Int(ideal[Int(cells.cellOf[Int(sharp.binOf[p])])])
                    if own >= place { withIt = min(withIt, costOf(own, p) + carveGain / 100) }
                    if withIt < without { raw[p] = 1; gains[p] = Float(without - withIt) }
                }
                // No majority filter here: it would eat the thin lines accents are there for. Specks go,
                // and of the shapes that are left the ones that bring most stay: few enough for a brush.
                let specks = max(4, Int(roundHalfUp(Double(minRegion) * accentRegion)))
                var calmed = Segmenter.mergeSmallRegions(raw, width, height, minRegion: specks)
                // Accents are small: their edges are straightened with half the tolerance, and nothing is merged away for it.
                if geometric {
                    calmed = Segmenter.mergeSmallRegions(Geometric.straighten(calmed, width, height, tolerance: Geometric.edgeTolerance(width, height, simplify: simplify) / 2), width, height, minRegion: specks)
                }
                let (regionMap, regionCluster, _) = Segmenter.connectedComponents(calmed, width, height)
                var worth = [Double](repeating: 0, count: regionCluster.count)
                for p in 0..<pixels where calmed[p] != 0 && raw[p] != 0 { worth[Int(regionMap[p])] += Double(gains[p]) }
                let shapes = regionCluster.indices
                    .filter { regionCluster[$0] != 0 }
                    .sorted { worth[$0] != worth[$1] ? worth[$0] > worth[$1] : $0 < $1 }
                var kept = [Int32](repeating: 0, count: regionCluster.count)
                var bought = 0.0
                for r in shapes.prefix(accentShapes) where worth[r] > 0 { kept[r] = 1; bought += worth[r] }
                // All its shapes together must be worth the step.
                if (bought / Double(pixels)) * 100 < accentStepPrice { kept = [Int32](repeating: 0, count: regionCluster.count) }
                for p in 0..<pixels {
                    calmed[p] = kept[Int(regionMap[p])]
                    code[p] += calmed[p] * Int32(place)
                }
                maps[k] = calmed
                // Inside a shape of the accent the washes are fitted to it.
                for _ in 0..<revisions {
                    for w in washes {
                        let levels = levelsOf[w], washPlace = radix[w]
                        let coat = prices[w].coat, dull = prices[w].dull
                        var cost = [Double](repeating: 0, count: regionCluster.count * levels)
                        var wash = maps[w]
                        maps[w] = []
                        for p in 0..<pixels where calmed[p] != 0 {
                            let l = Double(lab[p * 3]), a = Double(lab[p * 3 + 1]), b = Double(lab[p * 3 + 2])
                            let rest = Int(code[p]) - Int(wash[p]) * washPlace
                            let o = Int(regionMap[p]) * levels
                            let price = coat + Double(clean[p]) * dull
                            for c in 0..<levels {
                                // "At most c coats here": a wash only ever does less under an accent, never more.
                                let coats = min(c, Int(wash[p]))
                                let q = (rest + coats * washPlace) * 3
                                let dL = all.lab[q] - l, da = all.lab[q + 1] - a, db = all.lab[q + 2] - b
                                cost[o + c] += (dL * dL + da * da + db * db).squareRoot() * 100 + price * Double(coats)
                            }
                        }
                        for p in 0..<pixels where calmed[p] != 0 {
                            let o = Int(regionMap[p]) * levels
                            var most = levels - 1
                            for c in stride(from: levels - 2, through: 0, by: -1) where cost[o + c] < cost[o + most] { most = c }
                            if most >= Int(wash[p]) { continue }
                            code[p] += (Int32(most) - wash[p]) * Int32(washPlace)
                            wash[p] = Int32(most)
                        }
                        maps[w] = wash
                    }
                }
                // A shape of the accent that does not pay over the washes as they are now goes again.
                revise([k])
            }

            for k in layers.indices {
                let calmed = maps[k]
                let (regionMap, regionCluster, regionSize) = Segmenter.connectedComponents(calmed, width, height)
                let anchors = Segmenter.labelAnchors(regionMap, width, height, regionCount: regionCluster.count)
                let shapes = shapesPerCoat(regionMap, regionCluster, width, height, layers[k].top)
                var only = [Double](repeating: 0, count: maxCoats + 1)
                var coatMap = [UInt8](repeating: 0, count: pixels)
                for p in 0..<pixels {
                    coatMap[p] = UInt8(calmed[p])
                    only[Int(calmed[p])] += 1
                }
                layers[k].coatMap = coatMap
                layers[k].regionMap = regionMap
                layers[k].regions = regionCluster.indices.map {
                    Layer.Region(id: $0, coats: regionCluster[$0], size: regionSize[$0], anchorX: anchors[$0].x, anchorY: anchors[$0].y, anchorDist: anchors[$0].d)
                }
                var coats: [Layer.Coat] = []
                var covered = 0.0
                for c in stride(from: maxCoats, through: 1, by: -1) {
                    covered += only[c]
                    coats.append(Layer.Coat(coats: c, hex: layers[k].hexes[c], share: covered / Double(pixels), only: only[c] / Double(pixels), shapes: c < shapes.count ? shapes[c] : 0))
                }
                layers[k].coats = coats.reversed()
            }

            // The combinations that are left after smoothing, the distance to the picture, and what the
            // picture would lose without each layer.
            var indexOf = [Int32](repeating: -1, count: all.size)
            var combos: [LayerPlan.Combo] = []
            var comboMap = [Int32](repeating: 0, count: pixels)
            var errors = [Float](repeating: 0, count: pixels)
            var lost = [(without: Double, area: Double, areaWith: Double, areaWithout: Double)](repeating: (0, 0, 0, 0), count: layers.count)
            var sum = 0.0, rough = 0
            for p in 0..<pixels {
                let c = Int(code[p])
                var i = Int(indexOf[c])
                if i < 0 {
                    i = combos.count
                    indexOf[c] = Int32(i)
                    combos.append(LayerPlan.Combo(coats: coatsOf(c, tables), hex: linearHex(all.lin, c * 3), pixelCount: 0))
                }
                combos[i].pixelCount += 1
                comboMap[p] = Int32(i)
                let l = Double(lab[p * 3]), a = Double(lab[p * 3 + 1]), b = Double(lab[p * 3 + 2])
                let dL = all.lab[c * 3] - l, da = all.lab[c * 3 + 1] - a, db = all.lab[c * 3 + 2] - b
                let e = (dL * dL + da * da + db * db).squareRoot() * 100
                errors[p] = Float(e)
                sum += e
                if e >= 10 { rough += 1 }
                for k in layers.indices {
                    let coat = Int(maps[k][p])
                    if coat == 0 { continue }
                    let q = (c - coat * radix[k]) * 3
                    let without = hypot(all.lab[q] - l, all.lab[q + 1] - a, all.lab[q + 2] - b) * 100
                    lost[k].without += without - e
                    lost[k].area += 1; lost[k].areaWith += e; lost[k].areaWithout += without
                }
            }
            errors.sort()
            let mean = pixels > 0 ? sum / Double(pixels) : 0
            for k in layers.indices {
                let (without, area, areaWith, areaWithout) = lost[k]
                layers[k].buys = Layer.Buys(with: mean, without: mean + (pixels > 0 ? without / Double(pixels) : 0), areaWith: area > 0 ? areaWith / area : 0, areaWithout: area > 0 ? areaWithout / area : 0)
            }

            // A proposed paint that ends up without a single shape to paint (an accent whose spots were all
            // too small or too scattered) is not proposed after all.
            if proposal {
                let kept = layers.map { $0.coats[0].share > 0 }
                for i in combos.indices { combos[i].coats = combos[i].coats.indices.filter { kept[$0] }.map { combos[i].coats[$0] } }
                layers = layers.indices.filter { kept[$0] }.map { layers[$0] }
                for index in layers.indices { layers[index].index = index }
            }

            var steps: [LayerStep] = []
            for layer in layers {
                for coat in layer.coats where coat.share > 0 {
                    let wash = layer.washes[coat.coats - 1]
                    steps.append(LayerStep(layer: layer.index, kind: layer.kind, paintID: layer.paintID, coat: coat.coats, strength: wash.strength, dilution: wash.dilution, water: wash.water, consistency: wash.consistency, guide: wash.guide, hex: coat.hex, share: coat.share, shapes: coat.shapes))
                }
            }
            let area = steps.reduce(0.0) { $0 + $1.share }
            return LayerPlan(
                width: width,
                height: height,
                maxCoats: maxCoats,
                paintIDs: unique(layers.map(\.paintID)),
                layers: layers,
                comboMap: comboMap,
                combos: combos,
                steps: steps,
                work: LayerPlan.Work(steps: steps.count, area: area),
                deltaE: LayerPlan.DeltaE(
                    mean: mean,
                    p95: pixels > 0 ? Double(errors[min(pixels - 1, Int(Double(pixels) * 0.95))]) : 0,
                    rough: pixels > 0 ? Double(rough) / Double(pixels) : 0
                )
            )
        }

        let calmColours = ColourSet(points: calm.points, counts: calm.counts)
        // Given paints: all of them may be washes, unless `count` asks for fewer wash layers.
        if let paintIDs {
            let base = unique(paintIDs).compactMap { id in paints.first { $0.id == id } }
            return build(layersFor(calmColours, base, count: min(count ?? base.count, base.count), maxCoats: maxCoats, graded: graded, accents: maxAccents, keepUnused: true, left: left(calm)))
        }
        // A proposal is planned on the picture with a fixed blur, so that paints and washes do not
        // depend on `simplify`.
        let blurred = blur == proposalBlur ? calm : binsOf(proposalBlur)
        return build(layersFor(ColourSet(points: blurred.points, counts: blurred.counts), paints, count: count ?? 4, maxCoats: maxCoats, graded: graded, accents: maxAccents, left: left(blurred)), proposal: true)
    }
}
