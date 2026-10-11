import Foundation

/// Geometric areas: every area of a label map becomes a polygon with a few straight edges.
/// The polygons are laid over each other from the largest to the smallest, so they overlap the way
/// flat shapes of paint do, and what no polygon covers goes to the nearest one.
/// A port of `src/lib/geometric.js`.
enum Geometric {
    /// A polygon much smaller than its area (a thin or winding shape) would lose the area: it stays as it is.
    private static let minCover = 0.3
    /// The eight neighbours, clockwise on the screen, starting to the right.
    private static let dx = [1, 1, 0, -1, -1, -1, 0, 1]
    private static let dy = [0, 1, 1, 1, 0, -1, -1, -1]

    /// How far an edge may leave the outline it replaces, in pixels: grows with the picture and with `simplify`.
    static func edgeTolerance(_ width: Int, _ height: Int, simplify: Int = 0) -> Double {
        Double(width * height).squareRoot() * 0.008 * (1 + Double(simplify) / 4)
    }

    /// The smallest area that still gets a shape of its own in a geometric picture.
    static func minRegion(_ width: Int, _ height: Int, simplify: Int = 0) -> Int {
        Int((Double(width * height) * 0.0003 * (1 + Double(simplify) / 2)).rounded())
    }

    /// The outer outline of region `r` as pixel coordinates, walked clockwise from its first pixel.
    private static func outline(_ regionMap: [Int32], _ width: Int, _ height: Int, _ r: Int32, start: Int) -> (xs: [Int], ys: [Int]) {
        let sx = start % width, sy = start / width
        var xs = [sx], ys = [sy]
        func member(_ x: Int, _ y: Int) -> Bool { x >= 0 && y >= 0 && x < width && y < height && regionMap[y * width + x] == r }
        var x = sx, y = sy, dir = 0, first = -1
        // Every pixel is passed a few times at most.
        var guardCount = regionMap.count * 4 + 8
        while guardCount > 0 {
            guardCount -= 1
            var found = -1
            for i in 0..<8 {
                let d = (dir + 5 + i) % 8
                if member(x + dx[d], y + dy[d]) { found = d; break }
            }
            if found < 0 { break } // a single pixel
            // Back at the start and about to leave it the way it was left the first time: once around.
            if x == sx, y == sy {
                if first < 0 { first = found } else if found == first { break }
            }
            x += dx[found]; y += dy[found]; dir = found
            xs.append(x); ys.append(y)
        }
        if xs.count > 1 { xs.removeLast(); ys.removeLast() } // the start, reached again
        return (xs, ys)
    }

    /// Douglas-Peucker on the part of the outline from index a to b: marks the points to keep.
    private static func reduce(_ xs: [Int], _ ys: [Int], _ a: Int, _ b: Int, _ tolerance: Double, _ keep: inout [Bool]) {
        var stack = [a, b]
        let n = xs.count
        while !stack.isEmpty {
            let to = stack.removeLast(), from = stack.removeLast()
            let ax = Double(xs[from % n]), ay = Double(ys[from % n])
            let ex = Double(xs[to % n]) - ax, ey = Double(ys[to % n]) - ay
            let length = (ex * ex + ey * ey).squareRoot()
            var far = -1, most = tolerance
            var i = from + 1
            while i < to {
                let px = Double(xs[i % n]) - ax, py = Double(ys[i % n]) - ay
                let d = length != 0 ? abs(px * ey - py * ex) / length : (px * px + py * py).squareRoot()
                if d > most { most = d; far = i }
                i += 1
            }
            if far < 0 { continue }
            keep[far % n] = true
            stack.append(contentsOf: [from, far, far, to])
        }
    }

    /// Straightens the areas of a label map; `tolerance` is how far an edge may leave the outline, in pixels.
    static func straighten(_ labels: [Int32], _ width: Int, _ height: Int, tolerance: Double) -> [Int32] {
        let (regionMap, regionCluster, regionSize) = Segmenter.connectedComponents(labels, width, height)
        let count = regionCluster.count
        var starts = [Int](repeating: -1, count: count)
        var minX = [Int](repeating: width, count: count), maxX = [Int](repeating: -1, count: count)
        var minY = [Int](repeating: height, count: count), maxY = [Int](repeating: -1, count: count)
        for p in 0..<regionMap.count {
            let r = Int(regionMap[p])
            let x = p % width, y = p / width
            if starts[r] < 0 { starts[r] = p }
            if x < minX[r] { minX[r] = x }
            if x > maxX[r] { maxX[r] = x }
            if y < minY[r] { minY[r] = y }
            if y > maxY[r] { maxY[r] = y }
        }

        // A polygon per area, or none where the area keeps its own pixels.
        var polygons = [(px: [Int], py: [Int])?](repeating: nil, count: count)
        var order = [Double](repeating: 0, count: count)
        for r in 0..<count {
            order[r] = Double(regionSize[r])
            let (xs, ys) = outline(regionMap, width, height, Int32(r), start: starts[r])
            let n = xs.count
            if n < 3 { continue }
            // The outline is closed: it is cut at its start and at the point farthest from it.
            var far = 0, most = -1
            for i in 1..<n {
                let d = (xs[i] - xs[0]) * (xs[i] - xs[0]) + (ys[i] - ys[0]) * (ys[i] - ys[0])
                if d > most { most = d; far = i }
            }
            var keep = [Bool](repeating: false, count: n)
            keep[0] = true; keep[far] = true
            reduce(xs, ys, 0, far, tolerance, &keep)
            reduce(xs, ys, far, n, tolerance, &keep)
            var px: [Int] = [], py: [Int] = []
            for i in 0..<n where keep[i] { px.append(xs[i]); py.append(ys[i]) }
            if px.count < 3 { continue }
            var twice = 0
            var j = px.count - 1
            for i in 0..<px.count {
                twice += px[j] * py[i] - px[i] * py[j]
                j = i
            }
            let area = Double(abs(twice)) / 2
            if area < Double(regionSize[r]) * minCover { continue }
            polygons[r] = (px, py)
            // An area that encloses others has the larger polygon and is laid down before them.
            order[r] = max(area, Double(regionSize[r]))
        }

        let sequence = (0..<count).sorted { order[$0] != order[$1] ? order[$0] > order[$1] : $0 < $1 }
        var out = [Int32](repeating: -1, count: labels.count)
        var crossings: [Double] = []
        for r in sequence {
            let label = Int32(regionCluster[r])
            guard let polygon = polygons[r] else {
                for y in stride(from: minY[r], through: maxY[r], by: 1) {
                    for x in stride(from: minX[r], through: maxX[r], by: 1) where Int(regionMap[y * width + x]) == r { out[y * width + x] = label }
                }
                continue
            }
            let px = polygon.px, py = polygon.py
            let n = px.count
            let top = py.min() ?? 0, bottom = py.max() ?? -1
            for y in stride(from: top, through: bottom, by: 1) {
                crossings.removeAll(keepingCapacity: true)
                var j = n - 1
                for i in 0..<n {
                    let y0 = py[j], y1 = py[i]
                    // Half-open, so that a corner counts once.
                    if y0 != y1, y >= min(y0, y1), y < max(y0, y1) {
                        crossings.append(Double(px[j]) + Double((y - y0) * (px[i] - px[j])) / Double(y1 - y0))
                    }
                    j = i
                }
                crossings.sort()
                var i = 0
                while i + 1 < crossings.count {
                    let from = max(0, Int((crossings[i] - 0.5).rounded(.up))), to = min(width - 1, Int((crossings[i + 1] + 0.5).rounded(.down)))
                    if from <= to {
                        for x in from...to { out[y * width + x] = label }
                    }
                    i += 2
                }
            }
        }

        // What no polygon covers goes to the nearest area, spreading from all of them at once.
        var queue = [Int](repeating: 0, count: out.count)
        var head = 0, tail = 0
        for p in 0..<out.count where out[p] >= 0 { queue[tail] = p; tail += 1 }
        if tail == 0 { return labels }
        while head < tail {
            let p = queue[head]
            head += 1
            let x = p % width, y = p / width
            if x > 0, out[p - 1] < 0 { out[p - 1] = out[p]; queue[tail] = p - 1; tail += 1 }
            if x < width - 1, out[p + 1] < 0 { out[p + 1] = out[p]; queue[tail] = p + 1; tail += 1 }
            if y > 0, out[p - width] < 0 { out[p - width] = out[p]; queue[tail] = p - width; tail += 1 }
            if y < height - 1, out[p + width] < 0 { out[p + width] = out[p]; queue[tail] = p + width; tail += 1 }
        }
        return out
    }

    /// A label map with geometric areas: small areas go first, the rest is straightened, and the
    /// slivers that leaves are merged away.
    static func areas(_ labels: [Int32], _ width: Int, _ height: Int, simplify: Int = 0) -> [Int32] {
        let smallest = minRegion(width, height, simplify: simplify)
        let merged = Segmenter.mergeSmallRegions(labels, width, height, minRegion: smallest)
        let straight = straighten(merged, width, height, tolerance: edgeTolerance(width, height, simplify: simplify))
        return Segmenter.mergeSmallRegions(straight, width, height, minRegion: max(2, Int((Double(smallest) / 4).rounded())))
    }
}
