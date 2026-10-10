import Foundation

// From the analysis to the mixes a painter prepares. A port of src/lib/mixes.js; keep the two in step.
//
// The analysis (Segmentation.swift) sorts the picture into mixes and their washes without knowing
// the paints, and is asked for more mixes than wanted. Here the paints come in: mixes that turn out
// to be the same recipe are joined, and then the two mixes that are cheapest to paint as one are
// joined again and again until the wanted number is left. Washes are used before a mix is spent:
// what a larger mix reaches with more or less water does not keep a mix of its own.

/// One mix of the picture: the colours painted with it and its recipes, best first.
struct PlannedMix: Sendable {
    let group: Int
    /// The colour the recipes are fitted to: the largest wash the mix started with.
    let anchor: Int
    var clusters: [Segmentation.Cluster]
    let recipes: [Recipe]
    var pixels: Int
}

enum Mixes {
    /// How many mixes to ask the analysis for, so there is something to choose from.
    static func toRequest(wanted: Int) -> Int {
        min(48, max(wanted + 4, wanted * 2))
    }

    /// - Parameters:
    ///   - wanted: number of mixes to end up with
    ///   - variety: 0...10, what decides which mixes are joined: at 0 the error times the area it
    ///     covers (the picture as a whole stays as accurate as possible), at 10 the error in hue alone
    ///     (a small area of a different hue keeps its mix, at the price of similar large colours sharing one)
    static func plan(clusters: [Segmentation.Cluster], paints: [MixPaint], maxPaints: Int = 3, wanted: Int = .max, variety: Int = 5) -> [PlannedMix] {
        let byID = Dictionary(paints.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let white = ColorMath.oklab(hex: "#ffffff")
        let level = Double(min(10, max(0, variety))) / 10
        // A wash that comes out too light or too dark is a smaller loss than one of the wrong hue:
        // depth can be built up in layers, hue cannot. The more variety is wanted, the less it counts.
        let lightness = 1 - 0.7 * level
        // How far a mix stays from a colour when it is painted as a wash of that mix.
        func miss(_ mix: PlannedMix, _ cluster: Segmentation.Cluster) -> Double {
            guard let base = mix.recipes.first else { return 0 }
            let target = ColorMath.oklab(hex: cluster.hex)
            let reached = Mixing.washRecipe(base, target: cluster.hex, paints: byID).map { ColorMath.oklab(hex: $0.hex) } ?? white
            return ColorMath.deltaE(Vec3(reached.x * lightness, reached.y, reached.z), Vec3(target.x * lightness, target.y, target.z))
        }

        var order: [Int] = []
        var found = [Int: [Segmentation.Cluster]]()
        var total = 0
        for c in clusters where c.pixelCount > 0 {
            total += c.pixelCount
            if found[c.group] == nil { order.append(c.group) }
            found[c.group, default: []].append(c)
        }

        // The same paints in about the same ratio are the same mix, whatever the analysis called them.
        func mixKey(_ recipe: Recipe?) -> String {
            guard let recipe else { return "" }
            return recipe.paints.map { "\($0.paintID):\(Int(($0.share * 5).rounded()))" }.sorted().joined(separator: "+")
        }
        var mixes: [PlannedMix] = []
        var byKey = [String: Int]()
        for group in order {
            let members = found[group] ?? []
            guard let anchor = members.max(by: { $0.pixelCount < $1.pixelCount }) else { continue }
            let recipes = Mixing.findRecipes(target: anchor.hex, paints: paints, maxPaints: maxPaints, limit: 5)
            let key = mixKey(recipes.first)
            let pixels = members.reduce(0) { $0 + $1.pixelCount }
            if let same = byKey[key] {
                mixes[same].clusters += members
                mixes[same].pixels += pixels
            } else {
                byKey[key] = mixes.count
                mixes.append(PlannedMix(group: group, anchor: anchor.index, clusters: members, recipes: recipes, pixels: pixels))
            }
        }

        // worst[a][b] = the worst miss when the colours of mix b are painted as washes of mix a.
        let n = mixes.count
        var worst = (0..<n).map { a in
            (0..<n).map { b in a == b ? 0 : mixes[b].clusters.reduce(0.0) { max($0, miss(mixes[a], $1)) } }
        }
        var alive = [Bool](repeating: true, count: n)
        let areaPower = 1 - level
        var left = n
        while left > wanted {
            var best: (a: Int, b: Int, cost: Double)?
            for a in 0..<n where alive[a] {
                for b in 0..<n where b != a && alive[b] {
                    let cost = worst[a][b] * pow(Double(mixes[b].pixels) / Double(total), areaPower)
                    if best == nil || cost < best!.cost { best = (a, b, cost) }
                }
            }
            guard let (a, b, _) = best else { break }
            mixes[a].clusters += mixes[b].clusters
            mixes[a].pixels += mixes[b].pixels
            alive[b] = false
            // Mix a now also holds the colours of b: as part of another mix it misses by the worse of the two.
            for x in 0..<n where alive[x] && x != a { worst[x][a] = max(worst[x][a], worst[x][b]) }
            left -= 1
        }
        var kept = (0..<n).filter { alive[$0] }.map { mixes[$0] }

        // Every colour goes to the mix that reaches it best; the colour a mix was fitted to stays.
        if kept.count > 1 {
            var moves: [(cluster: Segmentation.Cluster, from: Int, to: Int)] = []
            for (m, mix) in kept.enumerated() {
                for c in mix.clusters where c.index != mix.anchor {
                    var target = m
                    var least = miss(mix, c)
                    for (o, other) in kept.enumerated() where o != m {
                        let value = miss(other, c)
                        if value < least - 1 { least = value; target = o }
                    }
                    if target != m { moves.append((c, m, target)) }
                }
            }
            for move in moves {
                kept[move.from].clusters.removeAll { $0.index == move.cluster.index }
                kept[move.from].pixels -= move.cluster.pixelCount
                kept[move.to].clusters.append(move.cluster)
                kept[move.to].pixels += move.cluster.pixelCount
            }
        }
        return kept
    }
}
