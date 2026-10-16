import Foundation

// Calm colour areas: the steps of `Segmenter.segment` that keep noise out of the areas, decide
// which small things stay, join what is too alike to be painted apart and round the outlines.
// A port of src/lib/smooth.js; keep the two in step.
//
// 1. The picture is cut into small compact patches that follow its edges (`compactPatches`);
//    where it is noise from pixel to pixel, into plain squares instead (`settlePatches`).
// 2. Every patch gets one robust colour, evened out with the patches around it that are nearly the
//    same colour (`patchColours`). Pixels then take the colour of their patch, so noise, grain and
//    JPEG blocks are gone before the colours are clustered, while an edge stays where it is.
// 3. After clustering, the details are found (`findDetails`): the small or thin areas that stand
//    out from what is around them (an eye, a letter, a wire). They are decided once, as a whole.
// 3b. Texture is told from details (`dropTexture`): one of many small pieces in a rough zone is none.
// 4. Areas join (`mergeAreas`): what is too small for a brush always, larger areas while it costs
//    the picture little. A detail stays as it was found until a step of Simplify drops it whole.
// 5. The outlines are rounded (`roundOutlines`): a pixel takes the label most pixels around it have.
// 6. For the screen, the finished map is enlarged with its outlines as smooth lines (`upscaleAreas`),
//    so that a slanted outline is not drawn as a staircase. This changes no area, only its drawing.
//
// Values the web keeps in a Float32Array are kept as Float here, and every sum is taken in Double
// in the same order as there, so that both find the same areas.

enum Smooth {
    // How much the distance to the centre of a patch counts against a difference in colour (OKLab):
    // higher gives rounder patches, lower lets them follow faint edges (and noise).
    static let compactness = 0.08
    static let patchRounds = 4
    // A pixel is left out of the colour of its patch when it is further from the mean of the patch
    // than this many times the average pixel of the patch (plus a little, for a patch that is flat).
    static let stray = 1.5
    static let strayExtra = 0.005
    // A pixel this far (OKLab) from the colour of its patch is not noise but something small of its
    // own (a highlight in an eye, a wire against the sky): it keeps its colour.
    static let ownColour = 0.09
    // A pixel that differs (by ownColour) from all four pixels beside it stands alone; where more
    // than `restless` of the pixels do, the picture is noise from pixel to pixel.
    static let alone: UInt8 = 4
    static let restlessShare = 0.5
    // How far the colour of a patch reaches into the patches around it, in patch sides.
    static let patchReach = 0.6
    // Further than this many times that reach from its centre a patch counts for nothing.
    static let patchReachEnd = 5.0
    // The window of `roundOutlines` is a disc in which a pixel at the rim counts this much less than
    // the one in the middle (the rim lies roundFalloff standard deviations out).
    static let roundFalloff = 1.5
    // Part of the window around a pixel that a label must hold before the pixel can take it.
    static let minShare = 0.2
    // Votes are whole numbers: the pixel in the middle of a window counts this much, the others less.
    static let voteWhole = 4096.0
    // A detail differs at least this much (OKLab) from the colour around it ...
    static let detailContrast = 0.12
    // ... taken this many pixels away from it ...
    static let detailRing = 3
    // ... where at most this part of the pixels is as close as detailAlike to its colour.
    static let detailAlike = 0.06
    static let detailAlikeShare = 0.25
    // A large area can still be a detail at any step when it is thin: at most this many pixels
    // per pixel of outline (a wire, a line of writing).
    static let detailThin = 1.5
    // Details of one colour this close together (pixels) are one group ...
    static let detailGroup = 8
    // ... when each is worth at least this part of what a detail on its own must be worth.
    static let detailWeakest = 0.5
    // ... and counts as large as the largest of them, but no more than this many times its own size.
    static let detailSpan = 8
    // A would-be detail is texture when it stands out by less than this x the roughness of the
    // ground around it x the crowd of would-be details it lies in (see `dropTexture`) ...
    static let texture = 1.8
    // ... where pieces of other colours count up to this many.
    static let textureCrowd = 3.0
    // A zone is texture as a whole when its roughness x its number of would-be details reaches this.
    static let textureZone = 0.2
    // In a zone of texture an area that would be large enough elsewhere joins only a neighbour less
    // than this (OKLab, see `apart`) from its colour: a window in a busy house front stays.
    static let textureAlike = 0.14
    // Below this lightness (OKLab) colours count as dark: see `apart`. Two colours are never taken
    // to be less than darkLeast of their distance apart.
    static let dark = 0.35
    static let darkLeast = 0.7

    /// Math.round of JavaScript: halves go up, also below zero.
    @inline(__always) static func jsRound(_ x: Double) -> Double {
        let down = x.rounded(.down)
        return x - down >= 0.5 ? down + 1 : down
    }

    /// The patches of a picture: patch per pixel, patch = row * cols + col.
    struct Patches {
        var patchOf: [Int32]
        let cols: Int
        let rows: Int
    }

    // MARK: Patches

    /// Cut the picture into compact patches of about step x step pixels that follow its edges
    /// (SLIC: k-means on colour and position together, every centre only looking around itself).
    static func compactPatches(_ lab: [Float], _ width: Int, _ height: Int, step: Int) -> Patches {
        let cols = max(1, Int(jsRound(Double(width) / Double(step))))
        let rows = max(1, Int(jsRound(Double(height) / Double(step))))
        let sx = Double(width) / Double(cols), sy = Double(height) / Double(rows)
        let n = cols * rows
        let reach = Int(max(sx, sy).rounded(.up))
        let spatial = (compactness * compactness) / Double(reach * reach)
        let total = width * height
        var patchOf = [Int32](repeating: 0, count: total)
        // centre: L, a, b, x, y
        var centre = [Double](repeating: 0, count: n * 5)
        for y in 0..<height {
            let row = min(rows - 1, Int(Double(y) / sy))
            for x in 0..<width { patchOf[y * width + x] = Int32(row * cols + min(cols - 1, Int(Double(x) / sx))) }
        }
        var sums = [Double](repeating: 0, count: n * 5)
        var sizes = [Int32](repeating: 0, count: n)
        var best = [Float](repeating: .infinity, count: total)
        lab.withUnsafeBufferPointer { lab in
            patchOf.withUnsafeMutableBufferPointer { patchOf in
                centre.withUnsafeMutableBufferPointer { centre in
                    sums.withUnsafeMutableBufferPointer { sums in
                        sizes.withUnsafeMutableBufferPointer { sizes in
                            best.withUnsafeMutableBufferPointer { best in
                                for _ in 0..<patchRounds {
                                    // Centres = mean colour and position of the pixels of each patch.
                                    for i in 0..<sums.count { sums[i] = 0 }
                                    for i in 0..<n { sizes[i] = 0 }
                                    for y in 0..<height {
                                        for x in 0..<width {
                                            let p = y * width + x, c = Int(patchOf[p]) * 5
                                            sums[c] += Double(lab[p * 3]); sums[c + 1] += Double(lab[p * 3 + 1]); sums[c + 2] += Double(lab[p * 3 + 2])
                                            sums[c + 3] += Double(x); sums[c + 4] += Double(y)
                                            sizes[Int(patchOf[p])] += 1
                                        }
                                    }
                                    for c in 0..<n where sizes[c] > 0 {
                                        for j in 0..<5 { centre[c * 5 + j] = sums[c * 5 + j] / Double(sizes[c]) }
                                    }
                                    // Every pixel goes to the closest centre among those around it; one no centre reaches stays.
                                    for i in 0..<total { best[i] = .infinity }
                                    for c in 0..<n where sizes[c] > 0 {
                                        let cL = centre[c * 5], ca = centre[c * 5 + 1], cb = centre[c * 5 + 2], cx = centre[c * 5 + 3], cy = centre[c * 5 + 4]
                                        let rx = Int(jsRound(cx)), ry = Int(jsRound(cy))
                                        let x0 = max(0, rx - reach), x1 = min(width - 1, rx + reach)
                                        let y0 = max(0, ry - reach), y1 = min(height - 1, ry + reach)
                                        if x0 > x1 || y0 > y1 { continue }
                                        for y in y0...y1 {
                                            let ddy = Double(y) - cy
                                            for x in x0...x1 {
                                                let p = y * width + x
                                                let dL = Double(lab[p * 3]) - cL, da = Double(lab[p * 3 + 1]) - ca, db = Double(lab[p * 3 + 2]) - cb
                                                let ddx = Double(x) - cx
                                                let d = dL * dL + da * da + db * db + (ddx * ddx + ddy * ddy) * spatial
                                                if d < Double(best[p]) { best[p] = Float(d); patchOf[p] = Int32(c) }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return Patches(patchOf: patchOf, cols: cols, rows: rows)
    }

    /// Undo the patches where the picture is noise from pixel to pixel (grain as strong as an edge, a
    /// raster, a pattern of single pixels). There the pixels go back to the square of the grid they
    /// lie in, which then gets one colour. Such a place is one where most pixels stand alone,
    /// counted over a square of the grid and the eight around it. Writing and other fine drawing is
    /// not: a pixel of a line has pixels of its kind beside it.
    /// Changes `patches.patchOf` in place. Returns per patch 1 = a square of noise; nil when the
    /// picture has none.
    static func settlePatches(_ lab: [Float], _ width: Int, _ height: Int, _ patches: inout Patches) -> [UInt8]? {
        let cols = patches.cols, rows = patches.rows
        let sx = Double(width) / Double(cols), sy = Double(height) / Double(rows)
        let limit = ownColour * ownColour
        // unlike[p] = how many of the pixels beside p differ from it.
        var unlike = [UInt8](repeating: 0, count: width * height)
        lab.withUnsafeBufferPointer { lab in
            func differs(_ p: Int, _ q: Int) -> Bool {
                let dL = Double(lab[p * 3]) - Double(lab[q * 3]), da = Double(lab[p * 3 + 1]) - Double(lab[q * 3 + 1]), db = Double(lab[p * 3 + 2]) - Double(lab[q * 3 + 2])
                return dL * dL + da * da + db * db > limit
            }
            for y in 0..<height {
                for x in 0..<width {
                    let p = y * width + x
                    if x < width - 1, differs(p, p + 1) { unlike[p] += 1; unlike[p + 1] += 1 }
                    if y < height - 1, differs(p, p + width) { unlike[p] += 1; unlike[p + width] += 1 }
                }
            }
        }
        var lonely = [Int](repeating: 0, count: cols * rows), sizes = [Int](repeating: 0, count: cols * rows)
        for y in 0..<height {
            let row = min(rows - 1, Int(Double(y) / sy))
            for x in 0..<width {
                let home = row * cols + min(cols - 1, Int(Double(x) / sx))
                sizes[home] += 1
                if unlike[y * width + x] >= alone { lonely[home] += 1 }
            }
        }
        var restless = [UInt8](repeating: 0, count: cols * rows)
        var any = false
        for row in 0..<rows {
            for col in 0..<cols {
                var lone = 0, all = 0
                for rr in max(0, row - 1)...min(rows - 1, row + 1) {
                    for cc in max(0, col - 1)...min(cols - 1, col + 1) { lone += lonely[rr * cols + cc]; all += sizes[rr * cols + cc] }
                }
                if Double(lone) > restlessShare * Double(all) { restless[row * cols + col] = 1; any = true }
            }
        }
        if !any { return nil }
        for y in 0..<height {
            let row = min(rows - 1, Int(Double(y) / sy))
            for x in 0..<width {
                let home = row * cols + min(cols - 1, Int(Double(x) / sx))
                if restless[home] != 0 { patches.patchOf[y * width + x] = Int32(home) }
            }
        }
        return restless
    }

    /// The picture with every pixel in the colour of its patch: the robust colour of the patch
    /// (`robustColours`), evened out with the patches around it (`evenColours`) and run smoothly from
    /// patch to patch (`spreadColours`). `blend` = the difference in OKLab at which a neighbour
    /// hardly counts; `restless` = the squares of noise from `settlePatches`.
    /// Returns OKLab per pixel.
    static func patchColours(_ lab: [Float], _ width: Int, _ height: Int, _ patches: Patches, blend: Double = 0.03, rounds: Int = 4, restless: [UInt8]? = nil) -> [Float] {
        let (robust, sizes) = robustColours(lab, patches.patchOf, count: patches.cols * patches.rows)
        let even = evenColours(robust, sizes, patches.cols, patches.rows, blend: blend, rounds: rounds, restless: restless)
        return spreadColours(lab, width, height, patches, sizes: sizes, robust: robust, colours: even, blend: blend, restless: restless)
    }

    /// One colour per patch: the mean of its pixels without the ones that stray, so a patch that holds
    /// a bit of something else is not tinted by it. Returns OKLab and pixel count per patch.
    static func robustColours(_ lab: [Float], _ patchOf: [Int32], count n: Int) -> (robust: [Double], sizes: [Double]) {
        let count = patchOf.count
        var mean = [Double](repeating: 0, count: n * 3)
        var sizes = [Double](repeating: 0, count: n)
        var spread = [Double](repeating: 0, count: n)
        var away = [Float](repeating: 0, count: count)
        var robust = [Double](repeating: 0, count: n * 3)
        var kept = [Double](repeating: 0, count: n)
        lab.withUnsafeBufferPointer { lab in
            patchOf.withUnsafeBufferPointer { patchOf in
                for p in 0..<count {
                    let c = Int(patchOf[p])
                    mean[c * 3] += Double(lab[p * 3]); mean[c * 3 + 1] += Double(lab[p * 3 + 1]); mean[c * 3 + 2] += Double(lab[p * 3 + 2])
                    sizes[c] += 1
                }
                for c in 0..<n where sizes[c] > 0 { mean[c * 3] /= sizes[c]; mean[c * 3 + 1] /= sizes[c]; mean[c * 3 + 2] /= sizes[c] }
                // How far the pixels of a patch are from its mean, on average.
                for p in 0..<count {
                    let c = Int(patchOf[p])
                    let dL = Double(lab[p * 3]) - mean[c * 3], da = Double(lab[p * 3 + 1]) - mean[c * 3 + 1], db = Double(lab[p * 3 + 2]) - mean[c * 3 + 2]
                    away[p] = Float((dL * dL + da * da + db * db).squareRoot())
                    spread[c] += Double(away[p])
                }
                for p in 0..<count {
                    let c = Int(patchOf[p])
                    if Double(away[p]) > stray * (spread[c] / sizes[c]) + strayExtra { continue }
                    robust[c * 3] += Double(lab[p * 3]); robust[c * 3 + 1] += Double(lab[p * 3 + 1]); robust[c * 3 + 2] += Double(lab[p * 3 + 2])
                    kept[c] += 1
                }
            }
        }
        for c in 0..<n {
            for j in 0..<3 { robust[c * 3 + j] = kept[c] > 0 ? robust[c * 3 + j] / kept[c] : mean[c * 3 + j] }
        }
        return (robust, sizes)
    }

    /// Even out the colours of the patches, `rounds` times, with the eight patches around each: every
    /// neighbour counts by its size and the less the further its colour is away. Between two patches
    /// marked in `restless` the colour does not count. Returns OKLab per patch.
    static func evenColours(_ colours: [Double], _ sizes: [Double], _ cols: Int, _ rows: Int, blend: Double, rounds: Int, restless: [UInt8]? = nil) -> [Double] {
        let falloff = 1 / (blend * blend)
        var colour = colours
        for _ in 0..<rounds {
            var next = [Double](repeating: 0, count: colour.count)
            for row in 0..<rows {
                for col in 0..<cols {
                    let c = row * cols + col
                    if sizes[c] == 0 { continue }
                    var L = 0.0, a = 0.0, b = 0.0, total = 0.0
                    for rr in max(0, row - 1)...min(rows - 1, row + 1) {
                        for cc in max(0, col - 1)...min(cols - 1, col + 1) {
                            let q = rr * cols + cc
                            if sizes[q] == 0 { continue }
                            let dL = colour[q * 3] - colour[c * 3], da = colour[q * 3 + 1] - colour[c * 3 + 1], db = colour[q * 3 + 2] - colour[c * 3 + 2]
                            let w = restless.map({ $0[c] != 0 && $0[q] != 0 }) == true ? sizes[q] : sizes[q] * exp(-(dL * dL + da * da + db * db) * falloff)
                            L += colour[q * 3] * w; a += colour[q * 3 + 1] * w; b += colour[q * 3 + 2] * w; total += w
                        }
                    }
                    next[c * 3] = L / total; next[c * 3 + 1] = a / total; next[c * 3 + 2] = b / total
                }
            }
            colour = next
        }
        return colour
    }

    /// Give every pixel the colours of its patch and the patches around it, each by how near its
    /// centre is and by how alike the two patches are (nothing across an edge, so the edge stays
    /// sharp). A pixel far from the `robust` colour of its patch (ownColour) keeps its own colour,
    /// except in a square of noise (`restless`). `colours` = OKLab per patch, after `evenColours`.
    static func spreadColours(_ lab: [Float], _ width: Int, _ height: Int, _ patches: Patches, sizes: [Double], robust: [Double], colours: [Double], blend: Double, restless: [UInt8]? = nil) -> [Float] {
        let count = width * height
        let cols = patches.cols, rows = patches.rows
        let n = cols * rows
        var centre = [Double](repeating: 0, count: n * 2)
        patches.patchOf.withUnsafeBufferPointer { patchOf in
            for y in 0..<height {
                for x in 0..<width {
                    let c = Int(patchOf[y * width + x])
                    centre[c * 2] += Double(x); centre[c * 2 + 1] += Double(y)
                }
            }
        }
        for c in 0..<n where sizes[c] > 0 { centre[c * 2] /= sizes[c]; centre[c * 2 + 1] /= sizes[c] }
        // alike[c * 9 + i] = how much the i-th of the nine patches at and around c counts for the pixels of c.
        var alike = [Float](repeating: 0, count: n * 9)
        let sharp = 2 / (blend * blend)
        for row in 0..<rows {
            for col in 0..<cols {
                let c = row * cols + col
                if sizes[c] == 0 { continue }
                for i in 0..<9 {
                    let rr = row + i / 3 - 1, cc = col + i % 3 - 1
                    if rr < 0 || rr >= rows || cc < 0 || cc >= cols || sizes[rr * cols + cc] == 0 { continue }
                    let q = rr * cols + cc
                    let dL = colours[q * 3] - colours[c * 3], da = colours[q * 3 + 1] - colours[c * 3 + 1], db = colours[q * 3 + 2] - colours[c * 3 + 2]
                    alike[c * 9 + i] = Float(exp(-(dL * dL + da * da + db * db) * sharp))
                }
            }
        }
        let reach = patchReach * (Double(count) / Double(n)).squareRoot()
        let nearness = 1 / (2 * reach * reach)
        // How much a patch counts by distance is the product of what it counts along x and along y:
        // both are worked out once per patch, for the columns and rows within `span` of its centre.
        let span = Int((patchReachEnd * reach).rounded(.up)), across = 2 * span + 1
        var nearX = [Float](repeating: 0, count: n * across), nearY = [Float](repeating: 0, count: n * across)
        var fromX = [Int](repeating: 0, count: n), fromY = [Int](repeating: 0, count: n)
        for c in 0..<n where sizes[c] > 0 {
            fromX[c] = Int(jsRound(centre[c * 2])) - span; fromY[c] = Int(jsRound(centre[c * 2 + 1])) - span
            for i in 0..<across {
                let dx = Double(fromX[c] + i) - centre[c * 2], dy = Double(fromY[c] + i) - centre[c * 2 + 1]
                nearX[c * across + i] = Float(exp(-dx * dx * nearness)); nearY[c * across + i] = Float(exp(-dy * dy * nearness))
            }
        }
        let own2 = ownColour * ownColour
        var out = [Float](repeating: 0, count: count * 3)
        lab.withUnsafeBufferPointer { lab in
        patches.patchOf.withUnsafeBufferPointer { patchOf in
        alike.withUnsafeBufferPointer { alike in
        nearX.withUnsafeBufferPointer { nearX in
        nearY.withUnsafeBufferPointer { nearY in
        colours.withUnsafeBufferPointer { colours in
        out.withUnsafeMutableBufferPointer { out in
            for y in 0..<height {
                for x in 0..<width {
                    let p = y * width + x
                    let c = Int(patchOf[p])
                    let oL = Double(lab[p * 3]) - robust[c * 3], oa = Double(lab[p * 3 + 1]) - robust[c * 3 + 1], ob = Double(lab[p * 3 + 2]) - robust[c * 3 + 2]
                    // Not in a square of noise, though: there every pixel is far from the colour of its square.
                    if oL * oL + oa * oa + ob * ob > own2 && !(restless.map { $0[c] != 0 } ?? false) {
                        out[p * 3] = lab[p * 3]; out[p * 3 + 1] = lab[p * 3 + 1]; out[p * 3 + 2] = lab[p * 3 + 2]
                        continue
                    }
                    let row = c / cols, col = c - row * cols
                    var L = 0.0, a = 0.0, b = 0.0, total = 0.0
                    for i in 0..<9 {
                        let like = alike[c * 9 + i]
                        if like == 0 { continue }
                        let q = (row + i / 3 - 1) * cols + col + i % 3 - 1
                        let ix = x - fromX[q], iy = y - fromY[q]
                        if ix < 0 || ix >= across || iy < 0 || iy >= across { continue }
                        let w = Double(like) * Double(nearX[q * across + ix]) * Double(nearY[q * across + iy])
                        L += colours[q * 3] * w; a += colours[q * 3 + 1] * w; b += colours[q * 3 + 2] * w; total += w
                    }
                    // No patch near enough to count: the colour of its own patch.
                    if total > 0 { out[p * 3] = Float(L / total); out[p * 3 + 1] = Float(a / total); out[p * 3 + 2] = Float(b / total) }
                    else { out[p * 3] = Float(colours[c * 3]); out[p * 3 + 1] = Float(colours[c * 3 + 1]); out[p * 3 + 2] = Float(colours[c * 3 + 2]) }
                }
            }
        }}}}}}}
        return out
    }

    // MARK: Rounding

    // Widen a mask by `radius` pixels along its lines: `step` from pixel to pixel in a line of
    // `length` pixels, `stride` from line to line.
    private static func widen(_ mask: UnsafeMutableBufferPointer<UInt8>, _ out: UnsafeMutableBufferPointer<UInt8>, _ length: Int, _ lines: Int, _ step: Int, _ lineStride: Int, _ radius: Int) {
        for line in 0..<lines {
            let start = line * lineStride
            // Distance to the last marked pixel, forwards and then backwards.
            var since = radius + 1
            for i in 0..<length {
                since = mask[start + i * step] != 0 ? 0 : since + 1
                out[start + i * step] = since <= radius ? 1 : 0
            }
            since = radius + 1
            for i in stride(from: length - 1, through: 0, by: -1) {
                since = mask[start + i * step] != 0 ? 0 : since + 1
                if since <= radius { out[start + i * step] = 1 }
            }
        }
    }

    /// Round the outlines of the areas of a label map.
    /// Every pixel near an outline takes the label that most pixels around it have (a round window of
    /// `radius` pixels, near pixels counting more), `passes` times. Teeth, steps and thin tongues
    /// narrower than the window go, and an outline becomes a curve a brush can follow.
    /// Pixels marked in `fixed` (the details) keep their label, but count for the pixels around them.
    /// With `only` (a mask) nothing outside it is changed. `k` = the number of labels.
    static func roundOutlines(_ labels: [Int32], _ width: Int, _ height: Int, k: Int, radius: Int = 3, passes: Int = 2, fixed: [UInt8]? = nil, only: [UInt8]? = nil) -> [Int32] {
        if radius < 1 || passes < 1 || labels.isEmpty { return labels }
        let sigma = Double(radius) / roundFalloff
        var offX: [Int] = [], offY: [Int] = [], offW: [Double] = []
        let rim = (Double(radius) + 0.5) * (Double(radius) + 0.5)
        for dy in -radius...radius {
            for dx in -radius...radius {
                // The disc: every pixel whose middle is within radius + 1/2 of the middle of the window.
                if Double(dx * dx + dy * dy) > rim { continue }
                offX.append(dx); offY.append(dy); offW.append(exp(-Double(dx * dx + dy * dy) / (2 * sigma * sigma)))
            }
        }
        let taps = offW.count
        // Whole numbers, so that equal votes are equal whatever the order they are added in.
        let weight = offW.map { Int32(jsRound($0 * voteWhole)) }
        let all = weight.reduce(0) { $0 + Int($1) }
        let least = minShare * Double(all)
        let shift = (0..<taps).map { offY[$0] * width + offX[$0] }
        // A label beyond `k` would have no vote of its own: count as many as there are.
        let labelCount = max(k, Int(labels.max() ?? 0) + 1)
        var votes = [Int32](repeating: 0, count: labelCount)
        var seen = [Int32](repeating: 0, count: taps)
        let total = labels.count
        var edge = [UInt8](repeating: 0, count: total), across = [UInt8](repeating: 0, count: total), near = [UInt8](repeating: 0, count: total)
        var src = labels
        for pass in 0..<passes {
            var dst = src
            var changed = false
            src.withUnsafeBufferPointer { src in
            dst.withUnsafeMutableBufferPointer { dst in
            edge.withUnsafeMutableBufferPointer { edge in
            across.withUnsafeMutableBufferPointer { across in
            near.withUnsafeMutableBufferPointer { near in
            votes.withUnsafeMutableBufferPointer { votes in
            seen.withUnsafeMutableBufferPointer { seen in
            weight.withUnsafeBufferPointer { weight in
            shift.withUnsafeBufferPointer { shift in
                // Only pixels within `radius` of an outline can change: further away the window holds one
                // label. After the first pass that is: within `radius` of a pixel that changed.
                if pass == 0 {
                    for y in 0..<height {
                        for x in 0..<width {
                            let p = y * width + x
                            if x < width - 1 && src[p] != src[p + 1] { edge[p] = 1; edge[p + 1] = 1 }
                            if y < height - 1 && src[p] != src[p + width] { edge[p] = 1; edge[p + width] = 1 }
                        }
                    }
                }
                widen(edge, across, width, height, 1, width, radius)
                widen(across, near, height, width, width, 1, radius)
                for i in 0..<total { edge[i] = 0 }
                for y in 0..<height {
                    let inside = y >= radius && y < height - radius
                    for x in 0..<width {
                        let p = y * width + x
                        if near[p] == 0 { continue }
                        if let fixed, fixed[p] != 0 { continue }
                        if let only, only[p] == 0 { continue }
                        var found = 0
                        if inside && x >= radius && x < width - radius {
                            for i in 0..<taps {
                                let c = Int(src[p + shift[i]])
                                if votes[c] == 0 { seen[found] = Int32(c); found += 1 }
                                votes[c] += weight[i]
                            }
                        } else {
                            for i in 0..<taps {
                                let xx = x + offX[i], yy = y + offY[i]
                                if xx < 0 || xx >= width || yy < 0 || yy >= height { continue }
                                let c = Int(src[yy * width + xx])
                                if votes[c] == 0 { seen[found] = Int32(c); found += 1 }
                                votes[c] += weight[i]
                            }
                        }
                        // The label with the most votes; on a tie the pixel stays as it is, then the lower label
                        // wins. A label that is hardly there (minShare) cannot take the pixel.
                        let own = Int(src[p])
                        var best = own
                        for i in 0..<found {
                            let c = Int(seen[i])
                            if c == own || Double(votes[c]) < least { continue }
                            if votes[c] > votes[best] || (votes[c] == votes[best] && best != own && c < best) { best = c }
                        }
                        for i in 0..<found { votes[Int(seen[i])] = 0 }
                        if best != own { dst[p] = Int32(best); edge[p] = 1; changed = true }
                    }
                }
            }}}}}}}}}
            src = dst
            if !changed { break }
        }
        return src
    }

    // MARK: Areas and details

    /// The areas of a label map: connected pixels of one label (4 neighbours), numbered row by row.
    /// The same areas as `Segmenter.connectedComponents`.
    struct Areas {
        let areaOf: [Int32]
        let labelOf: [Int32]
        let sizeOf: [Int32]
        var count: Int { labelOf.count }
    }

    static func findAreas(_ labels: [Int32], _ width: Int, _ height: Int) -> Areas {
        let total = labels.count
        var areaOf = [Int32](repeating: -1, count: total)
        var labelOf: [Int32] = [], sizeOf: [Int32] = []
        var stack = [Int32](repeating: 0, count: total)
        labels.withUnsafeBufferPointer { labels in
        areaOf.withUnsafeMutableBufferPointer { areaOf in
        stack.withUnsafeMutableBufferPointer { stack in
            var count: Int32 = 0
            for start in 0..<total {
                if areaOf[start] != -1 { continue }
                let label = labels[start]
                var top = 0, size: Int32 = 0
                stack[top] = Int32(start); top += 1
                areaOf[start] = count
                while top > 0 {
                    top -= 1
                    let p = Int(stack[top])
                    size += 1
                    let x = p % width
                    if x > 0 && areaOf[p - 1] == -1 && labels[p - 1] == label { areaOf[p - 1] = count; stack[top] = Int32(p - 1); top += 1 }
                    if x < width - 1 && areaOf[p + 1] == -1 && labels[p + 1] == label { areaOf[p + 1] = count; stack[top] = Int32(p + 1); top += 1 }
                    if p >= width && areaOf[p - width] == -1 && labels[p - width] == label { areaOf[p - width] = count; stack[top] = Int32(p - width); top += 1 }
                    if p + width < total && areaOf[p + width] == -1 && labels[p + width] == label { areaOf[p + width] = count; stack[top] = Int32(p + width); top += 1 }
                }
                labelOf.append(label)
                sizeOf.append(size)
                count += 1
            }
        }}}
        return Areas(areaOf: areaOf, labelOf: labelOf, sizeOf: sizeOf)
    }

    /// Per pixel: the worth of the detail it belongs to, the size it counts as and the room it
    /// takes; all 0 where there is none (see `findDetails`).
    struct DetailMap {
        var worth: [Float]
        var span: [Int32]
        var room: [Int32]
        /// With `findTexture`: 1 for every pixel in a zone of texture.
        var textured: [UInt8]? = nil
    }

    /// The details of a label map: the small things worth keeping (an eye, a mouth, a letter, a lit
    /// window, a wire). One rule decides it, for a whole area at a time and before anything is joined
    /// or rounded, so a detail is kept whole or not at all. An area can be a detail when
    /// - it has `minSize` to `maxSize` pixels, or more when it is thin (detailThin). `room` says
    ///   how much: the size of the area, or 0 when it is thin;
    /// - its colour is at least detailContrast (OKLab) away from the colour around it: the mean of
    ///   the pixels detailRing away from it;
    /// - hardly any of those pixels has its colour (detailAlikeShare).
    /// What it is worth is what losing it would cost: its thickness (pixels per pixel of outline) x
    /// the square of that distance in colour. Such areas of one colour that lie close together are a
    /// group and are worth what the best of them is worth (but none more than 1 / detailWeakest
    /// times its own worth). A detail counts as large as the largest of its group, or as all the
    /// would-be details it touches taken together when that is more, up to detailSpan times its own
    /// size: `span`.
    /// Texture is no detail, however strong: with `photo` (the picture before the noise was taken
    /// out) the pieces that are grains of a rough zone are left out, see `dropTexture`. `cell` = side
    /// of the cells texture is counted in; `pieceSize` = from this size on a piece that is not thin
    /// is never texture; `kindOf` = per label, its kind; with `findTexture` the result says where the
    /// zones of texture lie (`textured`, needs `photo`).
    static func findDetails(_ labels: [Int32], _ lab: [Float], _ width: Int, _ height: Int, minSize: Double = 1, maxSize: Double = .infinity, photo: [Float]? = nil, cell: Int = 16, pieceSize: Double = .infinity, kindOf: [Int32]? = nil, findTexture: Bool = false) -> DetailMap {
        var textured: [UInt8]? = findTexture && photo != nil ? [UInt8](repeating: 0, count: labels.count) : nil
        let total = labels.count
        let areas = findAreas(labels, width, height)
        let areaOf = areas.areaOf, labelOf = areas.labelOf, sizeOf = areas.sizeOf
        let count = areas.count
        // The pixels of every area in a row: first[r] ..< first[r + 1] in `pixels`.
        var first = [Int](repeating: 0, count: count + 1)
        for r in 0..<count { first[r + 1] = first[r] + Int(sizeOf[r]) }
        var filled = Array(first[0..<count])
        var pixels = [Int32](repeating: 0, count: total)
        for p in 0..<total { let r = Int(areaOf[p]); pixels[filled[r]] = Int32(p); filled[r] += 1 }
        let ring = [-detailRing, detailRing, -detailRing * width, detailRing * width]
        // worth[r] = what losing area r would cost; -1 when it cannot be a detail.
        var worth = [Double](repeating: -1, count: count)
        var thin = [UInt8](repeating: 0, count: count)
        var colour = [Double](repeating: 0, count: count * 3), standing = [Double](repeating: 0, count: count)
        let alike2 = detailAlike * detailAlike, contrast2Least = detailContrast * detailContrast
        lab.withUnsafeBufferPointer { lab in
        areaOf.withUnsafeBufferPointer { areaOf in
        pixels.withUnsafeBufferPointer { pixels in
            for r in 0..<count {
                let size = Int(sizeOf[r])
                if Double(size) < minSize { continue }
                var L = 0.0, a = 0.0, b = 0.0
                for i in first[r]..<first[r + 1] { let p = Int(pixels[i]); L += Double(lab[p * 3]); a += Double(lab[p * 3 + 1]); b += Double(lab[p * 3 + 2]) }
                L /= Double(size); a /= Double(size); b /= Double(size)
                var outline = 0, around = 0, alike = 0
                var sL = 0.0, sa = 0.0, sb = 0.0
                for i in first[r]..<first[r + 1] {
                    let p = Int(pixels[i])
                    let x = p % width, y = p / width
                    if x > 0 && Int(areaOf[p - 1]) != r { outline += 1 }
                    if x < width - 1 && Int(areaOf[p + 1]) != r { outline += 1 }
                    if y > 0 && Int(areaOf[p - width]) != r { outline += 1 }
                    if y < height - 1 && Int(areaOf[p + width]) != r { outline += 1 }
                    for side in 0..<4 {
                        let off = side == 0 ? x < detailRing : side == 1 ? x >= width - detailRing : side == 2 ? y < detailRing : y >= height - detailRing
                        if off { continue }
                        let q = p + ring[side]
                        if Int(areaOf[q]) == r { continue }
                        let qL = Double(lab[q * 3]), qa = Double(lab[q * 3 + 1]), qb = Double(lab[q * 3 + 2])
                        let dL = qL - L, da = qa - a, db = qb - b
                        if dL * dL + da * da + db * db < alike2 { alike += 1 }
                        sL += qL; sa += qa; sb += qb
                        around += 1
                    }
                }
                if around == 0 || outline == 0 || Double(alike) > Double(around) * detailAlikeShare { continue }
                let dL = sL / Double(around) - L, da = sa / Double(around) - a, db = sb / Double(around) - b
                let contrast2 = dL * dL + da * da + db * db
                if contrast2 < contrast2Least { continue }
                thin[r] = Double(size) <= Double(outline) * detailThin ? 1 : 0
                if Double(size) > maxSize && thin[r] == 0 { continue }
                worth[r] = (Double(size) / Double(outline)) * contrast2
                colour[r * 3] = L; colour[r * 3 + 1] = a; colour[r * 3 + 2] = b
                standing[r] = contrast2.squareRoot() * Double(size) / Double(outline)
            }
        }}}
        if let photo {
            // The kind of every area: that of its label, or the label itself.
            var kind = [Int](repeating: 0, count: count)
            var kinds = 0
            for r in 0..<count {
                kind[r] = Int(kindOf.map { $0[Int(labelOf[r])] } ?? labelOf[r])
                if kind[r] >= kinds { kinds = kind[r] + 1 }
            }
            dropTexture(&worth, &standing, thin, kind, kinds, areaOf, sizeOf, first, pixels, lab, photo, width, height, cell, pieceSize, &textured)
        }
        // Groups: group[r] = the area that stands for the group of r.
        var group = Array(0..<count)
        func head(_ start: Int) -> Int {
            var r = start
            while group[r] != r { group[r] = group[group[r]]; r = group[r] }
            return r
        }
        // A grid of cells; an area is noted in the cells within half a cell of its pixels, and joins
        // the group of the area noted there before it when the two are about one colour.
        let cellsAcross = (width + detailGroup - 1) / detailGroup + 1, half = detailGroup >> 1
        var noted = [Int](repeating: -1, count: cellsAcross * ((height + detailGroup - 1) / detailGroup + 1))
        for r in 0..<count where worth[r] >= 0 {
            for i in first[r]..<first[r + 1] {
                let p = Int(pixels[i])
                let x = p % width, y = p / width
                for corner in 0..<4 {
                    let cx = max(0, x + (corner & 1 != 0 ? half : -half)), cy = max(0, y + (corner & 2 != 0 ? half : -half))
                    let at = (cy / detailGroup) * cellsAcross + cx / detailGroup
                    let other = noted[at]
                    if other < 0 { noted[at] = r; continue }
                    if other == r { continue }
                    let dL = colour[other * 3] - colour[r * 3], da = colour[other * 3 + 1] - colour[r * 3 + 1], db = colour[other * 3 + 2] - colour[r * 3 + 2]
                    if dL * dL + da * da + db * db >= contrast2Least { continue }
                    let g = head(r), h = head(other)
                    if g != h { group[max(g, h)] = min(g, h) }
                }
            }
        }
        // Would-be details that touch are one thing to the eye, whatever their colours (the pupil in an
        // eye, a quote mark with its soft rim): together[r] = the area that stands for those around r.
        var together = Array(0..<count)
        func whole(_ start: Int) -> Int {
            var r = start
            while together[r] != r { together[r] = together[together[r]]; r = together[r] }
            return r
        }
        for y in 0..<height {
            for x in 0..<width {
                let p = y * width + x, r = Int(areaOf[p])
                if worth[r] < 0 { continue }
                for side in 0..<2 {
                    if side == 0 ? x == width - 1 : y == height - 1 { continue }
                    let other = Int(areaOf[p + (side == 0 ? 1 : width)])
                    if other == r || worth[other] < 0 { continue }
                    let g = whole(r), h = whole(other)
                    if g != h { together[max(g, h)] = min(g, h) }
                }
            }
        }
        var best = [Double](repeating: 0, count: count)
        var largest = [Int](repeating: 0, count: count), touching = [Int](repeating: 0, count: count)
        for r in 0..<count where worth[r] >= 0 {
            let g = head(r)
            if worth[r] > best[g] { best[g] = worth[r] }
            if Int(sizeOf[r]) > largest[g] { largest[g] = Int(sizeOf[r]) }
            touching[whole(r)] += Int(sizeOf[r])
        }
        var out = DetailMap(worth: [Float](repeating: 0, count: total), span: [Int32](repeating: 0, count: total), room: [Int32](repeating: 0, count: total), textured: textured)
        for r in 0..<count where worth[r] >= 0 {
            let g = head(r)
            let value = Float(min(best[g], worth[r] / detailWeakest))
            let counts = Int32(min(max(largest[g], touching[whole(r)]), Int(sizeOf[r]) * detailSpan))
            let takes = thin[r] != 0 ? 0 : sizeOf[r]
            for i in first[r]..<first[r + 1] { let p = Int(pixels[i]); out.worth[p] = value; out.span[p] = counts; out.room[p] = takes }
        }
        return out
    }

    /// Texture is no detail. Takes out of `worth` (sets to -1) every would-be detail that is one of
    /// many in a zone whose ground is rough: heather, leaves, gravel, the dashes of a wall in shadow.
    /// - How rough the ground is: what the patches took out of the photo there (the mean distance of
    ///   a pixel of `photo` to its colour in `lab`), over the pixels that belong to no would-be detail.
    /// - How many pieces there are: every piece counts 1 in all, shared out over the cells its pixels
    ///   lie in.
    /// Both are taken over a zone of 3 x 3 cells of `cell` pixels a side and are per zone of full
    /// size. A piece is texture when it stands out (`standing`) by less than texture x roughness x
    /// crowd; the crowd is the pieces around it of whatever colour (at most textureCrowd) plus the
    /// pieces of its own kind. A piece of `pieceSize` pixels or more is never texture, unless it is
    /// thin. `textured` is told where the zones of texture lie.
    private static func dropTexture(_ worth: inout [Double], _ standing: inout [Double], _ thin: [UInt8], _ kind: [Int], _ kinds: Int, _ areaOf: [Int32], _ sizeOf: [Int32], _ first: [Int], _ pixels: [Int32], _ lab: [Float], _ photo: [Float], _ width: Int, _ height: Int, _ cell: Int, _ pieceSize: Double, _ textured: inout [UInt8]?) {
        let count = worth.count
        let cols = (width + cell - 1) / cell, rows = (height + cell - 1) / cell, cells = cols * rows
        var rough = [Double](repeating: 0, count: cells), ground = [Double](repeating: 0, count: cells), all = [Double](repeating: 0, count: cells)
        // pieces[z * kinds + kind] = the pieces of that kind in cell z.
        var pieces = [Float](repeating: 0, count: cells * kinds)
        for y in 0..<height {
            let row = (y / cell) * cols
            for x in 0..<width {
                let p = y * width + x, z = row + x / cell, r = Int(areaOf[p])
                all[z] += 1
                if worth[r] >= 0 {
                    let i = z * kinds + kind[r]
                    pieces[i] = Float(Double(pieces[i]) + 1 / Double(sizeOf[r]))
                    continue
                }
                let dL = Double(photo[p * 3]) - Double(lab[p * 3]), da = Double(photo[p * 3 + 1]) - Double(lab[p * 3 + 1]), db = Double(photo[p * 3 + 2]) - Double(lab[p * 3 + 2])
                rough[z] += (dL * dL + da * da + db * db).squareRoot()
                ground[z] += 1
            }
        }
        // Per cell, for the zone around it: the roughness of its ground and its pieces, of every kind
        // and of all together, per zone of full size.
        var zoneRough = [Double](repeating: 0, count: cells), zonePieces = [Float](repeating: 0, count: cells * kinds), zoneAll = [Double](repeating: 0, count: cells)
        for row in 0..<rows {
            for col in 0..<cols {
                let z = row * cols + col
                var sum = 0.0, on = 0.0, there = 0.0
                for rr in max(0, row - 1)...min(rows - 1, row + 1) {
                    for cc in max(0, col - 1)...min(cols - 1, col + 1) {
                        let q = rr * cols + cc
                        sum += rough[q]; on += ground[q]; there += all[q]
                        for k in 0..<kinds { zonePieces[z * kinds + k] += pieces[q * kinds + k] }
                    }
                }
                zoneRough[z] = on > 0 ? sum / on : 0
                let full = Double(9 * cell * cell) / there
                var crowd = 0.0
                for k in 0..<kinds {
                    zonePieces[z * kinds + k] = Float(Double(zonePieces[z * kinds + k]) * full)
                    crowd += Double(zonePieces[z * kinds + k])
                }
                zoneAll[z] = crowd
                if textured == nil || zoneRough[z] * crowd < textureZone { continue }
                let x1 = min(width, (col + 1) * cell), y1 = min(height, (row + 1) * cell)
                for y in (row * cell)..<y1 { for x in (col * cell)..<x1 { textured![y * width + x] = 1 } }
            }
        }
        for r in 0..<count {
            // A piece as large as an area that stays anyway is a thing, not a grain; unless it is thin.
            if worth[r] < 0 || (Double(sizeOf[r]) >= pieceSize && thin[r] == 0) { continue }
            var level = 0.0, crowd = 0.0, own = 0.0
            for i in first[r]..<first[r + 1] {
                let p = Int(pixels[i])
                let x = p % width, y = p / width
                let z = (y / cell) * cols + x / cell
                level += zoneRough[z]; crowd += zoneAll[z]; own += Double(zonePieces[z * kinds + kind[r]])
            }
            let size = Double(sizeOf[r])
            level /= size
            own = max(0, own / size - 1)
            crowd = min(textureCrowd, max(0, crowd / size - 1)) + own
            if standing[r] < texture * level * crowd { standing[r] = -1 }
        }
        // Decided for all at once, on what could be a detail before this.
        for r in 0..<count where worth[r] >= 0 && standing[r] < 0 { worth[r] = -1 }
    }

    // MARK: Joining

    /// How far apart two colours are for joining areas: the square of their distance in OKLab, counted
    /// less when both are dark (below `dark` in lightness). Two darks that the numbers tell apart look
    /// alike on paper, so the patches of a shadow run together; a dark eye on light skin counts in full.
    @inline(__always) static func apart(_ L1: Double, _ a1: Double, _ b1: Double, _ L2: Double, _ a2: Double, _ b2: Double) -> Double {
        let dL = L1 - L2, da = a1 - a2, db = b1 - b2
        let lighter = L1 > L2 ? L1 : L2
        let seen = lighter >= dark ? 1 : max(darkLeast, lighter / dark)
        return (dL * dL + da * da + db * db) * seen * seen
    }

    /// A stage of `mergeAreas`. What is not given counts as in the web app when it is left out.
    struct Stage {
        var minSize: Double = 1
        /// The smallest area in a zone of texture; 0 = no own size there.
        var roughSize: Double = 0
        var limit: Double = 0
        var detailLimit: Double = .infinity
        var detailSize: Double = 0
        var detailRoom: Double = .infinity
        var floor: Double = 1
    }

    /// Join areas of a label map until every area left is worth painting on its own, in `stages`,
    /// worked through one after the other on what the one before left. So the areas of a later
    /// stage are always made of whole areas of an earlier one, and raising the stages step by step
    /// (Simplify) can only lower the number of areas.
    /// In a stage one of three things holds for an area:
    /// - it is a detail (its pixels are worth `detailLimit` or more on average, it counts as
    ///   `detailSize` pixels or more and takes no more room than `detailRoom`, see `findDetails`):
    ///   it stays as it is, takes nothing in and joins nothing but another detail it is alike enough;
    /// - else, when it is smaller than `minSize` pixels: it joins the neighbour that costs least,
    ///   but never a detail. In a zone of texture (most of its pixels inside `rough`) the least size
    ///   is `roughSize`; but an area that is only too small by that joins nothing it stands out from
    ///   (textureAlike). One with nothing but details around it stays (the inside of a letter), and
    ///   takes the label of the ground the details lie on when it is nearly that colour;
    /// - an area that is large enough joins a neighbour only while that costs less than `limit`,
    ///   cheapest pair first.
    /// An area under `floor` pixels never stays, detail or not, and joins whatever costs least.
    /// The cost of joining two areas is how far apart their colours are (`apart`) x about the size
    /// of the smaller one / the length of the outline that goes. The joined area takes the label of
    /// the larger of the two. For an area with most of its pixels inside `where`, `inside` is used at
    /// every stage. On equal cost the neighbour with the lower number is picked; areas are numbered
    /// row by row.
    static func mergeAreas(_ labels: [Int32], _ lab: [Float], _ width: Int, _ height: Int, stages: [Stage], details: DetailMap? = nil, where whereMask: [UInt8]? = nil, inside: Stage? = nil, rough: [UInt8]? = nil) -> [Int32] {
        let total = labels.count
        let areas = findAreas(labels, width, height)
        let areaOf = areas.areaOf
        var labelOf = areas.labelOf
        let count = areas.count
        if count < 2 { return labels }
        // Per area: size, sum of its colours, sum of the worth of its pixels as details, pixels in `where`.
        var size = areas.sizeOf.map { Double($0) }
        var sum = [Double](repeating: 0, count: count * 3)
        var worth = [Double](repeating: 0, count: count), within = [Double](repeating: 0, count: count), coarse = [Double](repeating: 0, count: count)
        var span = [Int](repeating: 0, count: count), room = [Int](repeating: 0, count: count)
        lab.withUnsafeBufferPointer { lab in
            for p in 0..<total {
                let r = Int(areaOf[p])
                sum[r * 3] += Double(lab[p * 3]); sum[r * 3 + 1] += Double(lab[p * 3 + 1]); sum[r * 3 + 2] += Double(lab[p * 3 + 2])
                if let details {
                    worth[r] += Double(details.worth[p])
                    if Int(details.span[p]) > span[r] { span[r] = Int(details.span[p]) }
                    if Int(details.room[p]) > room[r] { room[r] = Int(details.room[p]) }
                }
                if let whereMask, whereMask[p] != 0 { within[r] += 1 }
                if let rough, rough[p] != 0 { coarse[r] += 1 }
            }
        }
        // The neighbours: one entry per pixel side between two areas (lower area first), then put in
        // order and counted: pairs of areas with the length of their common outline.
        var sides = 0
        for y in 0..<height {
            for x in 0..<width {
                let p = y * width + x
                if x < width - 1 && areaOf[p] != areaOf[p + 1] { sides += 1 }
                if y < height - 1 && areaOf[p] != areaOf[p + width] { sides += 1 }
            }
        }
        var pairA = [Int32](repeating: 0, count: sides), pairB = [Int32](repeating: 0, count: sides), lengths = [Int32](repeating: 0, count: sides)
        sides = 0
        for y in 0..<height {
            for x in 0..<width {
                let p = y * width + x, r = areaOf[p]
                if x < width - 1 && r != areaOf[p + 1] {
                    let q = areaOf[p + 1]
                    pairA[sides] = min(r, q); pairB[sides] = max(r, q); lengths[sides] = 1; sides += 1
                }
                if y < height - 1 && r != areaOf[p + width] {
                    let q = areaOf[p + width]
                    pairA[sides] = min(r, q); pairB[sides] = max(r, q); lengths[sides] = 1; sides += 1
                }
            }
        }
        var work = PairWork(areas: count, pairs: sides)
        var pairs = combinePairs(&pairA, &pairB, &lengths, sides, count, &work)

        // into[r] = the area r has joined (itself when it has joined none).
        var into = Array(0..<count)
        // Per area, for the round at hand: the cost up to which it joins, whether it is a detail,
        // whether it is too small to stay, whether it is under the floor, whether it has taken one in.
        var limitOf = [Double](repeating: 0, count: count)
        var kept = [Bool](repeating: false, count: count), small = [Bool](repeating: false, count: count)
        var tiny = [Bool](repeating: false, count: count), soft = [Bool](repeating: false, count: count)
        var open = [Bool](repeating: false, count: count), grown = [Bool](repeating: false, count: count)
        var pick = [Int](repeating: -1, count: count)
        var least = [Double](repeating: .infinity, count: count)
        let alike2 = textureAlike * textureAlike
        func root(_ start: Int) -> Int {
            var r = start
            while into[r] != r { r = into[r] }
            return r
        }
        // Area `go` becomes part of area `stay`.
        func join(_ stay: Int, _ go: Int) {
            into[go] = stay
            within[stay] += within[go]
            coarse[stay] += coarse[go]
            size[stay] += size[go]
            sum[stay * 3] += sum[go * 3]; sum[stay * 3 + 1] += sum[go * 3 + 1]; sum[stay * 3 + 2] += sum[go * 3 + 2]
        }
        for stage in stages {
            while true {
                // Two areas that came to lie side by side with one label are one area to the eye.
                var joined = false
                for i in 0..<pairs {
                    let a = root(Int(pairA[i])), b = root(Int(pairB[i]))
                    if a == b || labelOf[a] != labelOf[b] { continue }
                    let stay = size[a] >= size[b] ? a : b, go = stay == a ? b : a
                    worth[stay] += worth[go]
                    if span[go] > span[stay] { span[stay] = span[go] }
                    room[stay] += room[go]
                    join(stay, go)
                    joined = true
                }
                if !joined {
                    for r in 0..<count where into[r] == r {
                        let rule = inside != nil && within[r] * 2 > size[r] ? inside! : stage
                        // In a zone of texture the smallest area is larger, and so is the largest detail.
                        let inTexture = rule.roughSize > 0 && coarse[r] * 2 > size[r]
                        let enough = inTexture ? rule.roughSize : rule.minSize
                        limitOf[r] = rule.limit
                        tiny[r] = size[r] < rule.floor
                        kept[r] = !tiny[r] && worth[r] > 0 && worth[r] >= rule.detailLimit * size[r] && Double(span[r]) >= rule.detailSize
                            && Double(room[r]) <= (inTexture ? max(rule.roughSize, rule.detailRoom) : rule.detailRoom)
                        small[r] = tiny[r] || (!kept[r] && size[r] < enough)
                        // Too small only because it lies in texture: it joins what it does not stand out from.
                        soft[r] = small[r] && size[r] >= rule.minSize
                        open[r] = false
                        grown[r] = false
                        pick[r] = -1
                        least[r] = .infinity
                    }
                    // An area with nothing but details around it is part of them: it stays too.
                    for i in 0..<pairs {
                        let a = Int(pairA[i]), b = Int(pairB[i])
                        if !kept[b] { open[a] = true }
                        if !kept[a] { open[b] = true }
                    }
                    for i in 0..<pairs {
                        let a = Int(pairA[i]), b = Int(pairB[i])
                        let far = apart(sum[a * 3] / size[a], sum[a * 3 + 1] / size[a], sum[a * 3 + 2] / size[a], sum[b * 3] / size[b], sum[b * 3 + 1] / size[b], sum[b * 3 + 2] / size[b])
                        let cost = far * (size[a] * size[b] / (size[a] + size[b])) / Double(lengths[i])
                        let alike = far < alike2
                        // Two areas that are large enough join only when it is cheap enough for both, and a
                        // detail only with a detail. A small one joins what is no detail.
                        let free = kept[a] == kept[b] && cost < min(limitOf[a], limitOf[b])
                        let aGoes = free || (small[a] && (tiny[a] || (!kept[b] && open[a] && (alike || !soft[a]))))
                        let bGoes = free || (small[b] && (tiny[b] || (!kept[a] && open[b] && (alike || !soft[b]))))
                        if aGoes && (cost < least[a] || (cost == least[a] && b < pick[a])) { least[a] = cost; pick[a] = b }
                        if bGoes && (cost < least[b] || (cost == least[b] && a < pick[b])) { least[b] = cost; pick[b] = a }
                    }
                    for r in 0..<count {
                        let other = pick[r]
                        if other < 0 || into[r] != r || grown[r] || into[other] != other { continue }
                        let mutual = pick[other] == r
                        if !small[r] && (!mutual || grown[other]) { continue }
                        // The larger one stays (the lower one when they are equal); a small one that was not
                        // picked back goes into the one it picked.
                        let stay = !mutual || size[other] > size[r] || (size[other] == size[r] && other < r) ? other : r
                        let go = stay == r ? other : r
                        if grown[go] { continue }
                        // Two details are one detail; a detail that is taken in is none any more.
                        worth[stay] = kept[stay] && kept[go] ? worth[stay] + worth[go] : kept[stay] ? worth[stay] : 0
                        if kept[go] && span[go] > span[stay] { span[stay] = span[go] }
                        if kept[go] { room[stay] += room[go] }
                        join(stay, go)
                        grown[stay] = true
                        joined = true
                    }
                }
                if !joined { break }
                // The neighbours of the joined areas: the same pairs under their new numbers, counted again.
                var left = 0
                for i in 0..<pairs {
                    let a = root(Int(pairA[i])), b = root(Int(pairB[i]))
                    if a == b { continue }
                    pairA[left] = Int32(min(a, b)); pairB[left] = Int32(max(a, b))
                    lengths[left] = lengths[i]
                    left += 1
                }
                pairs = combinePairs(&pairA, &pairB, &lengths, left, count, &work)
            }
        }
        // What has nothing but details around it (a detail itself or not) and less than the contrast of
        // a detail to the ground they lie on is that ground seen through them (the inside of an o): it
        // takes the label of the ground. The flags are those of the last round, which joined nothing.
        if details != nil {
            // ground[d] = the area a detail lies on: its neighbour with the longest common outline that
            // is no detail and large enough to stay. through[r] = the same for a closed-in area, by way of
            // the detail it shares most outline with. shared[r] = the length of that outline.
            var ground = [Int](repeating: -1, count: count), through = [Int](repeating: -1, count: count)
            var shared = [Int32](repeating: 0, count: count)
            for i in 0..<pairs {
                let a = Int(pairA[i]), b = Int(pairB[i])
                if kept[a] && !kept[b] && !small[b] && lengths[i] > shared[a] { shared[a] = lengths[i]; ground[a] = b }
                if kept[b] && !kept[a] && !small[a] && lengths[i] > shared[b] { shared[b] = lengths[i]; ground[b] = a }
            }
            for i in 0..<count { shared[i] = 0 }
            for i in 0..<pairs {
                let a = Int(pairA[i]), b = Int(pairB[i])
                if !open[a] && kept[b] && ground[b] >= 0 && lengths[i] > shared[a] { shared[a] = lengths[i]; through[a] = ground[b] }
                if !open[b] && kept[a] && ground[a] >= 0 && lengths[i] > shared[b] { shared[b] = lengths[i]; through[b] = ground[a] }
            }
            let contrast2 = detailContrast * detailContrast
            for r in 0..<count {
                let g = through[r]
                if g < 0 || into[r] != r { continue }
                let far = apart(sum[r * 3] / size[r], sum[r * 3 + 1] / size[r], sum[r * 3 + 2] / size[r], sum[g * 3] / size[g], sum[g * 3 + 1] / size[g], sum[g * 3 + 2] / size[g])
                if far < contrast2 { labelOf[r] = labelOf[g] }
            }
        }
        var out = [Int32](repeating: 0, count: total)
        for p in 0..<total { out[p] = labelOf[root(Int(areaOf[p]))] }
        return out
    }

    // Arrays `combinePairs` works in: first (areas + 1), slot (areas), b and lengths (pairs).
    private struct PairWork {
        var first: [Int32]
        var slot: [Int32]
        var b: [Int32]
        var lengths: [Int32]
        init(areas: Int, pairs: Int) {
            first = [Int32](repeating: 0, count: areas + 1)
            slot = [Int32](repeating: 0, count: areas)
            b = [Int32](repeating: 0, count: pairs)
            lengths = [Int32](repeating: 0, count: pairs)
        }
    }

    // Put the first `n` pairs (a[i] < b[i]) in order of `a` and add up the lengths of equal pairs, in
    // place. Returns how many different pairs are left.
    private static func combinePairs(_ a: inout [Int32], _ b: inout [Int32], _ lengths: inout [Int32], _ n: Int, _ areas: Int, _ work: inout PairWork) -> Int {
        for i in 0..<work.first.count { work.first[i] = 0 }
        for i in 0..<n { work.first[Int(a[i]) + 1] += 1 }
        for r in 0..<areas { work.first[r + 1] += work.first[r] }
        // The pairs of every area in a row, in the order they came.
        for i in 0..<n {
            let at = Int(work.first[Int(a[i])])
            work.first[Int(a[i])] += 1
            work.b[at] = b[i]; work.lengths[at] = lengths[i]
        }
        // first[r] is now the end of the row of r, which is where the row of r + 1 starts.
        for i in 0..<areas { work.slot[i] = -1 }
        var left = 0, start = 0
        for r in 0..<areas {
            let from = left
            let end = Int(work.first[r])
            for i in start..<max(start, end) {
                let q = Int(work.b[i])
                if Int(work.slot[q]) >= from { lengths[Int(work.slot[q])] += work.lengths[i]; continue }
                work.slot[q] = Int32(left)
                a[left] = Int32(r); b[left] = Int32(q); lengths[left] = work.lengths[i]
                left += 1
            }
            start = end
        }
        return left
    }

    // MARK: Smooth drawing

    // A label map drawn larger pixel by pixel shows every outline that is not level or upright as a
    // staircase. `upscaleAreas` enlarges the map with the outlines as smooth lines instead.

    // An outline is drawn at most this far from where it is in the label map, in pixels of that map.
    static let outlineShift = 0.5
    // A turn of an outline with at least this many straight pixels on both sides is a real corner (of
    // a box, a roof) and stays where it is; a straight line in a pixel grid never has such a turn.
    static let cornerRun: Int32 = 3
    // The top of a bend of at most this many pixels stays as it is.
    static let bendRun = 2
    // A point of an outline is evened out with its neighbours smoothRounds x (run + 1) ^ 2 times,
    // `run` being the longest straight piece it lies on. Never more than smoothRoundsMost times.
    static let smoothRounds = 0.25
    static let smoothRoundsMost = 100
    // A pixel whose middle lies exactly on an outline goes to the area on the left of it (above it,
    // where the outline is level), whichever way the outline runs.
    static let smoothTie = 0.02

    // The top of a bend, `length` sides from point `from` on (`step` from point to point): a short one
    // stays as it is, a longer one is held in its middle.
    private static func holdBend(_ stay: inout [UInt8], _ from: Int, _ step: Int, _ length: Int) {
        if length <= bendRun { for i in 0...length { stay[from + i * step] = 1 } }
        else { stay[from + (length >> 1) * step] = 1; stay[from + ((length + 1) >> 1) * step] = 1 }
    }

    /// Where the outlines of a label map run when they are drawn as smooth lines: how far every corner
    /// point of the pixel grid moves, per corner point (x, y) at y * (width + 1) + x. Each point of a
    /// line is evened out with its two neighbours on the line, again and again, and never leaves the
    /// square of outlineShift around its place. Points where three or four areas meet, ends at the
    /// edge of the picture and real corners (cornerRun) stay.
    static func outlineShifts(_ labels: [Int32], _ width: Int, _ height: Int) -> (dx: [Double], dy: [Double]) {
        let across = width + 1
        let points = across * (height + 1)
        // Per corner point: the sides of the outline that leave it.
        let RIGHT: UInt8 = 1, DOWN: UInt8 = 2, LEFT: UInt8 = 4, UP: UInt8 = 8
        var links = [UInt8](repeating: 0, count: points)
        for y in 0..<height {
            for x in 0..<width {
                let p = y * width + x
                if x < width - 1 && labels[p] != labels[p + 1] { links[y * across + x + 1] |= DOWN; links[(y + 1) * across + x + 1] |= UP }
                if y < height - 1 && labels[p] != labels[p + width] { links[(y + 1) * across + x] |= RIGHT; links[(y + 1) * across + x + 1] |= LEFT }
            }
        }
        // The straight pieces: per point the length of the level and of the upright piece it lies on or ends.
        // A piece that turns the same way at both ends is the top of a bend: `stay` marks the points that hold it.
        var level = [Int32](repeating: 0, count: points), upright = [Int32](repeating: 0, count: points)
        var stay = [UInt8](repeating: 0, count: points)
        if height > 1 {
            for y in 1..<height {
                var start = -1
                for x in 0...width {
                    let c = y * across + x
                    if start >= 0 && links[c] != (LEFT | RIGHT) {
                        for i in start...x { level[y * across + i] = Int32(x - start) }
                        let a = links[y * across + start], b = links[c]
                        if (a == (RIGHT | UP) && b == (LEFT | UP)) || (a == (RIGHT | DOWN) && b == (LEFT | DOWN)) { holdBend(&stay, y * across + start, 1, x - start) }
                        start = -1
                    }
                    if start < 0 && (links[c] & RIGHT) != 0 { start = x }
                }
            }
        }
        if width > 1 {
            for x in 1..<width {
                var start = -1
                for y in 0...height {
                    let c = y * across + x
                    if start >= 0 && links[c] != (UP | DOWN) {
                        for i in start...y { upright[i * across + x] = Int32(y - start) }
                        let a = links[start * across + x], b = links[c]
                        if (a == (DOWN | LEFT) && b == (UP | LEFT)) || (a == (DOWN | RIGHT) && b == (UP | RIGHT)) { holdBend(&stay, start * across + x, across, y - start) }
                        start = -1
                    }
                    if start < 0 && (links[c] & DOWN) != 0 { start = y }
                }
            }
        }
        // The points that move, and how many rounds each: rounds[c] = 0 for one that stays.
        var rounds = [Int32](repeating: 0, count: points)
        var perRounds = [Int](repeating: 0, count: smoothRoundsMost + 2)
        var moving = 0
        for c in 0..<points {
            let l = links[c]
            if l == 0 || (l & (l &- 1)) == 0 { continue } // no outline, or its end at the edge of the picture
            let rest = l & (l &- 1)
            if (rest & (rest &- 1)) != 0 { continue } // three or four areas meet
            if stay[c] != 0 { continue }
            let turn = l != (LEFT | RIGHT) && l != (UP | DOWN)
            if turn && level[c] >= cornerRun && upright[c] >= cornerRun { continue }
            let run = Double(max(level[c], upright[c]))
            rounds[c] = Int32(min(Double(smoothRoundsMost), (smoothRounds * (run + 1) * (run + 1)).rounded(.up)))
            perRounds[Int(rounds[c])] += 1
            moving += 1
        }
        // The moving points in a row, the ones with the most rounds first; `first` and `second` are the
        // two neighbours of each on its line, `ox` and `oy` where the middle between those lies.
        var from = [Int](repeating: 0, count: smoothRoundsMost + 2)
        for r in stride(from: smoothRoundsMost, through: 1, by: -1) { from[r] = from[r + 1] + perRounds[r + 1] }
        var until = from // until[r] = how many points have more than r - 1 rounds, filled below
        var list = [Int](repeating: 0, count: moving), first = [Int](repeating: 0, count: moving), second = [Int](repeating: 0, count: moving)
        var ox = [Double](repeating: 0, count: moving), oy = [Double](repeating: 0, count: moving)
        for c in 0..<points where rounds[c] != 0 {
            let i = until[Int(rounds[c])]
            until[Int(rounds[c])] += 1
            list[i] = c
            var found = 0
            for side in 0..<4 {
                if links[c] & (1 << side) == 0 { continue }
                let stepX = side == 0 ? 1 : side == 2 ? -1 : 0, stepY = side == 1 ? 1 : side == 3 ? -1 : 0
                if found == 0 { first[i] = c + stepY * across + stepX } else { second[i] = c + stepY * across + stepX }
                found += 1
                ox[i] += Double(stepX) / 2; oy[i] += Double(stepY) / 2
            }
        }
        var dx = [Double](repeating: 0, count: points), dy = [Double](repeating: 0, count: points)
        var nextX = [Double](repeating: 0, count: moving), nextY = [Double](repeating: 0, count: moving)
        for round in 1...smoothRoundsMost {
            let active = until[round] // the points with `round` rounds or more
            if active == 0 { break }
            var moved = false
            for i in 0..<active {
                let c = list[i], a = first[i], b = second[i]
                // Half way to the middle between its two neighbours, as far as its square lets it.
                var x = (dx[c] + ox[i] + (dx[a] + dx[b]) / 2) / 2, y = (dy[c] + oy[i] + (dy[a] + dy[b]) / 2) / 2
                if x > outlineShift { x = outlineShift } else if x < -outlineShift { x = -outlineShift }
                if y > outlineShift { y = outlineShift } else if y < -outlineShift { y = -outlineShift }
                if x != dx[c] || y != dy[c] { moved = true }
                nextX[i] = x; nextY[i] = y
            }
            for i in 0..<active { dx[list[i]] = nextX[i]; dy[list[i]] = nextY[i] }
            if !moved { break }
        }
        return (dx, dy)
    }

    /// A label map `scale` times as large, with the outlines of its areas as smooth lines instead of
    /// enlarged pixel steps (`outlineShifts`). Every enlarged pixel has the label of the pixel it
    /// comes from or, where an outline has moved over its middle, of the pixel on the other side of
    /// that outline: never a label from further away, and none is left without. A pixel of the map
    /// always keeps at least one of its enlarged pixels, so nothing small is drawn away.
    /// Returns the label per pixel of the map of width * scale by height * scale.
    static func upscaleAreas(_ labels: [Int32], _ width: Int, _ height: Int, scale: Int) -> [Int32] {
        let big = width * scale
        var out = [Int32](repeating: 0, count: big * height * scale)
        let (dx, dy) = outlineShifts(labels, width, height)
        let across = width + 1
        let fscale = Double(scale)
        // Where along a side between two moved points the place `at` lies (0..1), the side running from `from` to `to`.
        @inline(__always) func along(_ at: Double, _ from: Double, _ to: Double) -> Double {
            to - from < 1e-9 ? 0.5 : at <= from ? 0 : at >= to ? 1 : (at - from) / (to - from)
        }
        labels.withUnsafeBufferPointer { labels in
        dx.withUnsafeBufferPointer { dx in
        dy.withUnsafeBufferPointer { dy in
        out.withUnsafeMutableBufferPointer { out in
            for y in 0..<height {
                for x in 0..<width {
                    let p = y * width + x, own = labels[p]
                    let left = x > 0 && labels[p - 1] != own, right = x < width - 1 && labels[p + 1] != own
                    let up = y > 0 && labels[p - width] != own, down = y < height - 1 && labels[p + width] != own
                    let o = y * scale * big + x * scale
                    for j in 0..<scale { for i in 0..<scale { out[o + j * big + i] = own } }
                    if !left && !right && !up && !down { continue }
                    var changed = 0
                    for j in 0..<scale {
                        let v = (Double(j) + 0.5) / fscale
                        for i in 0..<scale {
                            let u = (Double(i) + 0.5) / fscale
                            // The upright side nearest to this enlarged pixel, if it is an outline: how far the
                            // outline has moved over it at this height (`overX`, more than 0 = past its middle).
                            var overX = -1.0, overY = -1.0
                            let nearLeft = u < 0.5, nearUp = v < 0.5
                            if nearLeft ? left : right {
                                let top = y * across + x + (nearLeft ? 0 : 1), bottom = top + across
                                let t = along(Double(y) + v, Double(y) + dy[top], Double(y) + 1 + dy[bottom])
                                let shift = dx[top] + t * (dx[bottom] - dx[top])
                                overX = (nearLeft ? shift - u : -shift - (1 - u)) + (nearLeft ? smoothTie : -smoothTie)
                            }
                            if nearUp ? up : down {
                                let start = (y + (nearUp ? 0 : 1)) * across + x, end = start + 1
                                let t = along(Double(x) + u, Double(x) + dx[start], Double(x) + 1 + dx[end])
                                let shift = dy[start] + t * (dy[end] - dy[start])
                                // In the corner of a staircase the upright side decides for both, so that the two agree.
                                let firstSide = (nearLeft ? left : right) ? nearLeft : nearUp
                                overY = (nearUp ? shift - v : -shift - (1 - v)) + (firstSide ? smoothTie : -smoothTie)
                            }
                            if overX <= 0 && overY <= 0 { continue }
                            // Two outlines over it: the one that has come further takes it.
                            out[o + j * big + i] = overX >= overY ? labels[nearLeft ? p - 1 : p + 1] : labels[nearUp ? p - width : p + width]
                            changed += 1
                        }
                    }
                    // Nothing of the pixel would be left: it is drawn as it is.
                    if changed == scale * scale { for j in 0..<scale { for i in 0..<scale { out[o + j * big + i] = own } } }
                }
            }
        }}}}
        return out
    }
}
