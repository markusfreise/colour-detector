<?php
/**
 * Subtractive watercolour mixing. Port of src/lib/mixing.js, where the model is described.
 *
 * Model: paints mix like filters over white paper (Beer-Lambert), water thins the mix like
 * opacity. Each paint's swatch colour gives a per-channel absorbance A = -ln(reflectance). A mix
 * with amounts a_i is first taken at full strength, its largest amount (its fullness f) raised to
 * 1: that mix reflects exp(-d(S)/S * sum a_i*A_i) with S = sum a_i; d(S) is the depth a wash
 * reaches with that much paint, 1 at amount 1, levelling off at the depth limit of its paints. The
 * wash is that colour laid over the paper at opacity f, in sRGB (decided 2026-10-18).
 */

declare(strict_types=1);

namespace Mix;

require_once __DIR__ . '/color.php';

const MIN_REFLECTANCE = 0.0005;
// The most of one paint in a mix or on the paper: the paint as its swatch shows it.
const MAX_AMOUNT = 1.0;
// Where the water levels of a wash begin, as fullness: paper, W, L, M, R, C, and the swatch itself.
const WASH_LIMITS = [0.02, 0.1, 0.25, 0.5, 0.8, 1];
// Depth of the masstone relative to the reference swatch, for a bright paint and a neutral one.
const MAX_DEPTH = 1.6;
const MAX_DEPTH_NEUTRAL = 4.0;
// OKLab chroma from which a paint counts as fully bright.
const BRIGHT_CHROMA = 0.15;

/** How deep the paint with this absorbance can go: MAX_DEPTH for a bright paint, more the greyer it is. */
function depthLimit(array $A): float
{
    static $limits = [];
    $key = pack('ddd', $A[0], $A[1], $A[2]);
    if (!isset($limits[$key])) {
        [, $a, $b] = linearToOklab([exp(-$A[0]), exp(-$A[1]), exp(-$A[2])]);
        $grey = max(0.0, 1 - hypot($a, $b) / BRIGHT_CHROMA);
        $limits[$key] = MAX_DEPTH + (MAX_DEPTH_NEUTRAL - MAX_DEPTH) * $grey;
    }
    return $limits[$key];
}

/** Depth reached with the given total amount of paint: 0 at 0, 1 at 1, `limit` for a thick layer. */
function depth(float $amount, float $limit = MAX_DEPTH): float
{
    return $limit * (1 - (1 - 1 / $limit) ** $amount);
}

/** Total amount needed for a depth; depths that cannot be reached give `most`, the largest amount. */
function amountForDepth(float $d, float $limit, float $most = MAX_AMOUNT): float
{
    return $d >= depth($most, $limit) ? $most : log(1 - $d / $limit) / log(1 - 1 / $limit);
}

/** @return array{float, float, float} */
function absorbanceFromHex(string $hex): array
{
    static $known = [];
    if (!isset($known[$hex])) {
        $lin = rgbToLinear(hexToRgb($hex));
        $known[$hex] = [
            -log(min(1.0, max(MIN_REFLECTANCE, $lin[0]))),
            -log(min(1.0, max(MIN_REFLECTANCE, $lin[1]))),
            -log(min(1.0, max(MIN_REFLECTANCE, $lin[2]))),
        ];
    }
    return $known[$hex];
}

/**
 * Reflectance (linear RGB) of a mix of paints with the given absorbances and amounts.
 * @param array<array{float, float, float}> $absorbances
 * @param array<float> $amounts
 * @return array{float, float, float}
 */
function mixAbsorbances(array $absorbances, array $amounts): array
{
    $sum = 0.0;
    $limit = 0.0;
    // No paint counts for more than its swatch (MAX_AMOUNT), whatever amount is asked for.
    $capped = [];
    $fullness = 0.0;
    foreach ($absorbances as $i => $A) {
        $capped[$i] = max(0.0, min(MAX_AMOUNT, (float) $amounts[$i]));
        $fullness = max($fullness, $capped[$i]);
    }
    if (!($fullness > 0)) {
        return [1.0, 1.0, 1.0];
    }
    // The mix at full strength; the water comes in below, as opacity.
    $used = [];
    foreach ($absorbances as $i => $A) {
        $used[$i] = $capped[$i] / $fullness;
        $sum += $used[$i];
        $limit += $used[$i] * depthLimit($A);
    }
    // Every paint contributes by its share of the depth the whole mix reaches.
    $scale = $sum > 0 ? depth($sum, $limit / $sum) / $sum : 0.0;
    $t0 = $t1 = $t2 = 0.0;
    foreach ($absorbances as $i => $A) {
        $d = $used[$i] * $scale;
        $t0 += $A[0] * $d;
        $t1 += $A[1] * $d;
        $t2 += $A[2] * $d;
    }
    return [thinned(exp(-$t0), $fullness), thinned(exp(-$t1), $fullness), thinned(exp(-$t2), $fullness)];
}

/** A reflectance (linear) laid over white paper at that opacity, blended in sRGB. */
function thinned(float $reflectance, float $opacity): float
{
    return srgbToLinear(255 - $opacity * (255 - linearToSrgb($reflectance)));
}

/**
 * One paint alone on white paper at that amount (capped at MAX_AMOUNT): its swatch at that
 * opacity, linear RGB.
 * @param array{float, float, float} $A
 * @return array{float, float, float}
 */
function paintFilter(array $A, float $amount): array
{
    $a = max(0.0, min(MAX_AMOUNT, $amount));
    return [thinned(exp(-$A[0]), $a), thinned(exp(-$A[1]), $a), thinned(exp(-$A[2]), $a)];
}

/** The water of a wash in words. `fullness` = its paint with least water, 1 = as the swatch shows it. */
function describeDilution(float $fullness): string
{
    if ($fullness <= WASH_LIMITS[0]) {
        return 'paper only';
    }
    if ($fullness < WASH_LIMITS[1]) {
        return 'very watery wash';
    }
    if ($fullness < WASH_LIMITS[2]) {
        return 'light wash';
    }
    if ($fullness < WASH_LIMITS[3]) {
        return 'medium';
    }
    if ($fullness < WASH_LIMITS[4]) {
        return 'rich';
    }
    return 'concentrated (hardly any water)';
}

// --- Recipes ------------------------------------------------------------------------------------
//
// Finding a recipe is a non-negative least-squares problem in absorbance space, followed by a
// small perceptual (OKLab) refinement. The hot paths are written out by hand (no small arrays, no
// closures): PHP is several times slower than the browser at this, and the results must stay the
// same as those of mixing.js to the last bit, as far as the maths library allows.

// Each extra paint in a recipe must buy at least this much deltaE to be preferred.
const EXTRA_PAINT_PENALTY = 1.2;
// Value mode: among the mixes that reach a value, the one that needs least change in water wins;
// every factor e of more or less water than the mix's own strength counts as this much error.
const VALUE_WATER_PENALTY = 2.0;
// Value mode: the proportions a mix of two is tried in; three paints are tried in equal parts,
// and only while the paint box is small enough to try every three of them.
const VALUE_PAIR_PARTS = [[1, 1], [2, 1], [1, 2]];
const VALUE_TRIPLES_UP_TO = 12;
// Letter for the water level of a wash, used in the labels on the picture (6L = mix 6 as a light wash).
const WASH_LETTERS = ['W', 'L', 'M', 'R', 'C'];
// A value study needs more steps of water than five: with `fine` every level is split in this many.
const WASH_FINE = 5;

/**
 * The paints as the search knows them: the paint, its absorbance and how deep it can go.
 * @return list<array{paint: array, A: array{float, float, float}, L: float}>
 */
function poolOf(array $paints): array
{
    $pool = [];
    foreach ($paints as $paint) {
        $A = absorbanceFromHex($paint['hex']);
        $pool[] = ['paint' => $paint, 'A' => $A, 'L' => depthLimit($A)];
    }
    return $pool;
}

/**
 * OKLab of a mix of the given paints (pool entries) with the given amounts: mixAbsorbances and
 * linearToOklab in one, with the same operations in the same order.
 * @return array{float, float, float}
 */
function mixLab(array $candidate, array $amounts): array
{
    $sum = 0.0;
    $limit = 0.0;
    $n = count($candidate);
    $capped = [];
    $fullness = 0.0;
    for ($i = 0; $i < $n; $i++) {
        $c = max(0.0, min(MAX_AMOUNT, (float) $amounts[$i]));
        $capped[$i] = $c;
        if ($c > $fullness) {
            $fullness = $c;
        }
    }
    if (!($fullness > 0)) {
        return linearToOklab([1.0, 1.0, 1.0]);
    }
    // The mix at full strength; the water comes in below, as opacity (see mixAbsorbances).
    $used = [];
    for ($i = 0; $i < $n; $i++) {
        $u = $capped[$i] / $fullness;
        $used[$i] = $u;
        $sum += $u;
        $limit += $u * $candidate[$i]['L'];
    }
    if ($sum > 0) {
        $l = $limit / $sum;
        $scale = $l * (1 - (1 - 1 / $l) ** $sum) / $sum;
    } else {
        $scale = 0.0;
    }
    $t0 = $t1 = $t2 = 0.0;
    for ($i = 0; $i < $n; $i++) {
        $d = $used[$i] * $scale;
        $A = $candidate[$i]['A'];
        $t0 += $A[0] * $d;
        $t1 += $A[1] * $d;
        $t2 += $A[2] * $d;
    }
    $r = thinned(exp(-$t0), $fullness);
    $g = thinned(exp(-$t1), $fullness);
    $b = thinned(exp(-$t2), $fullness);
    $l = cbrt(0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $b);
    $m = cbrt(0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $b);
    $s = cbrt(0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $b);
    return [
        0.2104542553 * $l + 0.793617785 * $m - 0.0040720468 * $s,
        1.9779984951 * $l - 2.428592205 * $m + 0.4505937099 * $s,
        0.0259040371 * $l + 0.7827717662 * $m - 0.808675766 * $s,
    ];
}

/** How far a mix is from a target. With `values` only its lightness counts (see valueRecipes). */
function evaluate(array $candidate, array $amounts, array $target, bool $values = false): float
{
    $lab = mixLab($candidate, $amounts);
    if ($values) {
        return abs($lab[0] - $target[0]) * 100;
    }
    $dL = $lab[0] - $target[0];
    $da = $lab[1] - $target[1];
    $db = $lab[2] - $target[2];
    return sqrt($dL * $dL + $da * $da + $db * $db) * 100;
}

/** Predicted colour (hex) of mixing the given paints with the given amounts on white paper. */
function mixHex(array $paints, array $amounts): string
{
    $absorbances = array_map(fn (array $p) => absorbanceFromHex($p['hex']), $paints);
    return rgbToHex(linearToRgb(mixAbsorbances($absorbances, $amounts)));
}

/** Solve A x = b by Gaussian elimination with partial pivoting; null when A is singular. */
function solve(array $A, array $b): ?array
{
    $n = count($b);
    $M = [];
    foreach ($A as $i => $row) {
        $row[] = $b[$i];
        $M[] = $row;
    }
    for ($col = 0; $col < $n; $col++) {
        $pivot = $col;
        for ($r = $col + 1; $r < $n; $r++) {
            if (abs($M[$r][$col]) > abs($M[$pivot][$col])) {
                $pivot = $r;
            }
        }
        if (abs($M[$pivot][$col]) < 1e-10) {
            return null;
        }
        [$M[$col], $M[$pivot]] = [$M[$pivot], $M[$col]];
        for ($r = 0; $r < $n; $r++) {
            if ($r === $col) {
                continue;
            }
            $f = $M[$r][$col] / $M[$col][$col];
            for ($c = $col; $c <= $n; $c++) {
                $M[$r][$c] -= $f * $M[$col][$c];
            }
        }
    }
    $x = [];
    for ($i = 0; $i < $n; $i++) {
        $x[] = $M[$i][$n] / $M[$i][$i];
    }
    return $x;
}

/** The pool entries, every combination of `size` of them in the order mixing.js makes them. */
function combinationsOf(array $items, int $size): array
{
    $n = count($items);
    $out = [];
    if ($size === 2) {
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $out[] = [$items[$i], $items[$j]];
            }
        }
    } elseif ($size === 3) {
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                for ($k = $j + 1; $k < $n; $k++) {
                    $out[] = [$items[$i], $items[$j], $items[$k]];
                }
            }
        }
    }
    return $out;
}

/** Key of a set of paints: their ids, sorted, joined. */
function paintSetKey(array $items): string
{
    $ids = array_map(fn (array $it) => (string) $it['paint']['id'], $items);
    sort($ids, SORT_STRING);
    return implode('+', $ids);
}

/** The best of the results by score, one per set of paints, as recipes. */
function bestRecipes(array $results, int $limit): array
{
    $seen = [];
    $out = [];
    foreach ($results as $r) {
        $key = paintSetKey($r['items']);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = toRecipe($r['items'], $r['deltaE']);
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * The mixes of value mode: every paint, every two and three of them in their proportions. Each
 * with its paints, the share of every paint (`base`) and `most`, the logT at which its largest
 * amount is as much as a recipe takes.
 */
function valueMixes(array $pool, int $maxPaints): array
{
    $mix = function (array $candidate, array $parts): array {
        $whole = 0;
        foreach ($parts as $v) {
            $whole += $v;
        }
        $base = array_map(fn ($v) => $v / $whole, $parts);
        return ['candidate' => $candidate, 'base' => $base, 'most' => log(MAX_AMOUNT / max($base))];
    };
    $mixes = [];
    foreach ($pool as $c) {
        $mixes[] = $mix([$c], [1]);
    }
    if ($maxPaints >= 2) {
        foreach (combinationsOf($pool, 2) as $pair) {
            foreach (VALUE_PAIR_PARTS as $parts) {
                $mixes[] = $mix($pair, $parts);
            }
        }
    }
    if ($maxPaints >= 3 && count($pool) <= VALUE_TRIPLES_UP_TO) {
        foreach (combinationsOf($pool, 3) as $triple) {
            $mixes[] = $mix($triple, [1, 1, 1]);
        }
    }
    return $mixes;
}

/** Amounts of a value mix at a strength of e^logT times that of one paint. */
function amountsAt(array $base, float $logT): array
{
    $e = exp($logT);
    $out = [];
    foreach ($base as $v) {
        $out[] = $v * $e;
    }
    return $out;
}

/** Lightness (OKLab) of a value mix at a strength of e^logT. */
function mixLightness(array $mix, float $logT): float
{
    return mixLab($mix['candidate'], amountsAt($mix['base'], $logT))[0];
}

/**
 * Value mode: the darkest the paints reach, alone or mixed, as lightness in OKLab (1 = paper,
 * which is also the answer without paints).
 */
function valueReach(array $paints, int $maxPaints = 3): float
{
    $darkest = 1.0;
    foreach (valueMixes(poolOf($paints), $maxPaints) as $mix) {
        $darkest = min($darkest, mixLightness($mix, $mix['most']));
    }
    return $darkest;
}

/**
 * Value mode: the picture is grey, and the paints and their mixes stand for its values, whatever
 * their hue. Every mix is given as much water as brings it to the lightness of the target, and
 * the mix whose own strength is closest to that wins. `deltaE` is the difference in lightness.
 */
function valueRecipes(array $targetLab, array $pool, int $maxPaints, int $limit): array
{
    $paper = abs(1 - $targetLab[0]) * 100;
    $results = [['items' => [], 'deltaE' => $paper, 'score' => $paper]];
    $tL = $targetLab[0];
    foreach (valueMixes($pool, $maxPaints) as $mix) {
        // More paint is darker: the water with the lightness of the target, or the end that comes closest.
        $lo = log(0.02);
        $hi = $mix['most'];
        if (mixLightness($mix, $lo) <= $tL) {
            $hi = $lo;
        } elseif (mixLightness($mix, $hi) >= $tL) {
            $lo = $hi;
        } else {
            for ($i = 0; $i < 30; $i++) {
                $mid = ($lo + $hi) / 2;
                if (mixLightness($mix, $mid) > $tL) {
                    $lo = $mid;
                } else {
                    $hi = $mid;
                }
            }
        }
        $logT = ($lo + $hi) / 2;
        $amounts = amountsAt($mix['base'], $logT);
        $err = evaluate($mix['candidate'], $amounts, $targetLab, true);
        $items = [];
        foreach ($mix['candidate'] as $i => $c) {
            $items[] = ['paint' => $c['paint'], 'A' => $c['A'], 'L' => $c['L'], 'amount' => $amounts[$i]];
        }
        $results[] = [
            'items' => $items,
            'deltaE' => $err,
            'score' => $err + VALUE_WATER_PENALTY * abs($logT) + EXTRA_PAINT_PENALTY * (count($mix['candidate']) - 1),
        ];
    }
    usort($results, fn (array $x, array $y) => $x['score'] <=> $y['score']);
    return bestRecipes($results, $limit);
}

/** Pattern search on the amounts to minimise perceptual error. */
function refine(array $candidate, array $amounts, array $targetLab): array
{
    $best = $amounts;
    $bestErr = evaluate($candidate, $best, $targetLab);
    $step = 0.25;
    $n = count($best);
    for ($iter = 0; $iter < 40 && $step > 0.005; $iter++) {
        $improved = false;
        for ($i = 0; $i < $n; $i++) {
            foreach ([1, -1] as $dir) {
                $trial = $best;
                $trial[$i] = min(MAX_AMOUNT, max(0.01, $trial[$i] * (1 + $dir * $step) + $dir * $step * 0.05));
                $err = evaluate($candidate, $trial, $targetLab);
                if ($err < $bestErr) {
                    $best = $trial;
                    $bestErr = $err;
                    $improved = true;
                }
            }
        }
        if (!$improved) {
            $step /= 2;
        }
    }
    return [$best, $bestErr];
}

/**
 * Find the best watercolour recipes for a target colour.
 * @param array<array{id: string, hex: string}> $paints
 * @return list<array> recipes, best first
 */
function findRecipes(string $targetHex, array $paints, int $maxPaints = 3, int $limit = 5, bool $values = false): array
{
    return findRecipesIn($targetHex, poolOf($paints), $maxPaints, $limit, $values);
}

/**
 * findRecipes with the paints already prepared (poolOf). `$normal` caches the normal equations
 * of every set of paints for the next target with the same pool.
 */
function findRecipesIn(string $targetHex, array $pool, int $maxPaints, int $limit, bool $values, array &$normal = []): array
{
    $targetLinear = rgbToLinear(hexToRgb($targetHex));
    $targetLab = linearToOklab($targetLinear);
    if ($values) {
        return valueRecipes($targetLab, $pool, $maxPaints, $limit);
    }
    $T = [
        -log(min(1.0, max(MIN_REFLECTANCE, $targetLinear[0]))),
        -log(min(1.0, max(MIN_REFLECTANCE, $targetLinear[1]))),
        -log(min(1.0, max(MIN_REFLECTANCE, $targetLinear[2]))),
    ];
    $paperLab = linearToOklab([1, 1, 1]);

    // Plain paper is a legitimate answer for near-white targets.
    $results = [['candidate' => null, 'items' => [], 'deltaE' => deltaE($paperLab, $targetLab)]];

    if ($pool) {
        $consider = function (array $candidate, string $key) use (&$results, &$normal, $T, $targetLab): void {
            $k = count($candidate);
            if (!isset($normal[$key])) {
                $G = [];
                for ($i = 0; $i < $k; $i++) {
                    $ai = $candidate[$i]['A'];
                    for ($j = 0; $j < $k; $j++) {
                        $aj = $candidate[$j]['A'];
                        $G[$i][$j] = $ai[0] * $aj[0] + $ai[1] * $aj[1] + $ai[2] * $aj[2];
                    }
                }
                $normal[$key] = $G;
            }
            $h = [];
            for ($i = 0; $i < $k; $i++) {
                $c = $candidate[$i]['A'];
                $h[] = $c[0] * $T[0] + $c[1] * $T[1] + $c[2] * $T[2];
            }
            $a = solve($normal[$key], $h);
            if ($a === null) {
                return;
            }
            foreach ($a as $v) {
                if (!($v > 0)) {
                    return;
                }
            }
            // The least-squares solution is in depths, which add up to the depth of the whole mix:
            // find the total amount for that depth and share it out in the same proportions.
            $reach = 0.0;
            foreach ($a as $v) {
                $reach += $v;
            }
            $limit = 0.0;
            foreach ($candidate as $i => $c) {
                $limit += $a[$i] * $c['L'];
            }
            $limit /= $reach;
            $sum = amountForDepth($reach, $limit, $k * MAX_AMOUNT);
            $amounts = [];
            foreach ($a as $v) {
                $amounts[] = ($v * $sum) / $reach;
            }
            // With the proportions kept, no paint above its swatch.
            $most = max($amounts);
            if ($most > MAX_AMOUNT) {
                foreach ($amounts as $i => $v) {
                    $amounts[$i] = ($v * MAX_AMOUNT) / $most;
                }
            }
            // The fit is in absorbance, where water is not: it gives the proportions, the water is fitted here.
            [$fitted, $err] = fitWater($candidate, $amounts, $targetLab, false, 12, false);
            $results[] = ['candidate' => $candidate, 'amounts' => $fitted, 'deltaE' => $err];
        };

        $n = count($pool);
        foreach ($pool as $i => $c) {
            $consider([$c], (string) $i);
        }
        if ($maxPaints >= 2) {
            for ($i = 0; $i < $n; $i++) {
                for ($j = $i + 1; $j < $n; $j++) {
                    $consider([$pool[$i], $pool[$j]], $i . ',' . $j);
                }
            }
        }
        if ($maxPaints >= 3) {
            // Triples only among paints that already performed well, to keep it fast.
            $sorted = $results;
            usort($sorted, fn (array $x, array $y) => $x['deltaE'] <=> $y['deltaE']);
            $shortlist = [];
            foreach (array_slice($sorted, 0, 30) as $r) {
                foreach ($r['candidate'] ?? [] as $c) {
                    $shortlist[(string) $c['paint']['id']] = true;
                }
            }
            $short = [];
            foreach ($pool as $i => $c) {
                if (isset($shortlist[(string) $c['paint']['id']])) {
                    $short[] = $i;
                    if (count($short) === 14) {
                        break;
                    }
                }
            }
            $s = count($short);
            for ($x = 0; $x < $s; $x++) {
                for ($y = $x + 1; $y < $s; $y++) {
                    for ($z = $y + 1; $z < $s; $z++) {
                        $consider([$pool[$short[$x]], $pool[$short[$y]], $pool[$short[$z]]], $short[$x] . ',' . $short[$y] . ',' . $short[$z]);
                    }
                }
            }
        }
    }

    // Perceptual refinement is the expensive part: only do it for the most promising candidates.
    usort($results, fn (array $x, array $y) => $x['deltaE'] <=> $y['deltaE']);
    foreach ($results as $i => $r) {
        if ($r['candidate'] !== null && $i < 40) {
            [$r['amounts'], $r['deltaE']] = refine($r['candidate'], $r['amounts'], $targetLab);
        }
        if ($r['candidate'] !== null) {
            $items = [];
            foreach ($r['candidate'] as $j => $c) {
                $items[] = ['paint' => $c['paint'], 'A' => $c['A'], 'L' => $c['L'], 'amount' => $r['amounts'][$j]];
            }
            $r['items'] = $items;
        }
        $r['score'] = $r['deltaE'] + EXTRA_PAINT_PENALTY * max(0, count($r['items']) - 1);
        $results[$i] = $r;
    }
    usort($results, fn (array $x, array $y) => $x['score'] <=> $y['score']);
    return bestRecipes($results, $limit);
}

/**
 * Propose a small set of paints that mixes all the given target colours: from the largest area
 * down, among the recipes nearly as close as the best one, the recipe needing the fewest paints
 * not chosen yet.
 * @param array<array{hex: string, weight?: float}> $targets
 * @return list<string> paint ids
 */
function proposePaints(array $targets, array $paints, int $maxPaints = 3, float $tolerance = 2, bool $values = false): array
{
    $pool = poolOf($paints);
    $normal = [];
    $chosen = [];
    $byWeight = $targets;
    usort($byWeight, fn (array $a, array $b) => ($b['weight'] ?? 0) <=> ($a['weight'] ?? 0));
    foreach ($byWeight as $target) {
        $recipes = findRecipesIn($target['hex'], $pool, $maxPaints, 8, $values, $normal);
        if (!$recipes) {
            continue;
        }
        $best = min(array_column($recipes, 'deltaE'));
        $near = array_values(array_filter($recipes, fn (array $r) => $r['deltaE'] <= $best + $tolerance));
        $newPaints = function (array $recipe) use (&$chosen): int {
            $n = 0;
            foreach ($recipe['paints'] as $p) {
                if (!isset($chosen[(string) $p['paintId']])) {
                    $n++;
                }
            }
            return $n;
        };
        usort($near, fn (array $x, array $y) => ($newPaints($x) <=> $newPaints($y)) ?: ($x['deltaE'] <=> $y['deltaE']));
        foreach ($near[0]['paints'] as $p) {
            $chosen[(string) $p['paintId']] = $p['paintId'];
        }
    }
    return array_values($chosen);
}

/**
 * The same mix with more or less water: every amount scaled by one factor so the result comes as
 * close to the target as that mix can get. Null when the recipe has no paints (paper white).
 * @param array<string, array{id: string, hex: string}> $paintsById
 */
function washRecipe(?array $recipe, string $targetHex, array $paintsById, bool $values = false): ?array
{
    if (!$recipe || !$recipe['paints']) {
        return null;
    }
    $targetLab = linearToOklab(rgbToLinear(hexToRgb($targetHex)));
    $candidate = [];
    $base = [];
    foreach ($recipe['paints'] as $p) {
        $paint = $paintsById[$p['paintId']];
        $A = absorbanceFromHex($paint['hex']);
        $candidate[] = ['paint' => $paint, 'A' => $A, 'L' => depthLimit($A)];
        $base[] = $p['amount'];
    }
    [$amounts, $err] = fitWater($candidate, $base, $targetLab, $values);
    $items = [];
    foreach ($candidate as $i => $c) {
        $items[] = $c + ['amount' => $amounts[$i]];
    }
    return toRecipe($items, $err);
}

/**
 * The amounts scaled by the one factor that brings the mix closest to the target: a coarse scan
 * over the water level, then (with `fine`) a golden-section search around the best step.
 * @return array{array<float>, float} the amounts and their distance
 */
function fitWater(array $candidate, array $base, array $targetLab, bool $values = false, int $steps = 48, bool $fine = true): array
{
    $error = function (float $logT) use ($candidate, $base, $targetLab, $values): float {
        $e = exp($logT);
        $amounts = [];
        foreach ($base as $v) {
            $amounts[] = $v * $e;
        }
        return evaluate($candidate, $amounts, $targetLab, $values);
    };
    $top = max($base);
    $lo = log(0.02 / $top);
    $hi = log(MAX_AMOUNT / $top);
    $best = $lo;
    $bestErr = INF;
    for ($i = 0; $i <= $steps; $i++) {
        $t = $lo + (($hi - $lo) * $i) / $steps;
        $err = $error($t);
        if ($err < $bestErr) {
            $bestErr = $err;
            $best = $t;
        }
    }
    $logT = $best;
    if ($fine) {
        $a = max($lo, $best - ($hi - $lo) / $steps);
        $b = min($hi, $best + ($hi - $lo) / $steps);
        $phi = (sqrt(5) - 1) / 2;
        for ($i = 0; $i < 24; $i++) {
            $c = $b - ($b - $a) * $phi;
            $d = $a + ($b - $a) * $phi;
            if ($error($c) < $error($d)) {
                $b = $d;
            } else {
                $a = $c;
            }
        }
        $logT = ($a + $b) / 2;
    }
    $factor = exp($logT);
    $amounts = [];
    foreach ($base as $v) {
        $amounts[] = $v * $factor;
    }
    return [$amounts, $error($logT)];
}

/**
 * A recipe as the app shows it. `$items` = pool entries with an `amount`.
 * @return array{paints: list<array>, parts: list<float>, strength: float, fullness: float, dilution: string, hex: string, deltaE: float}
 */
function toRecipe(array $items, float $deltaE): array
{
    $strength = 0.0;
    // How little water: the largest amount of a paint, 1 = that paint as its swatch shows it.
    $fullness = 0.0;
    $absorbances = [];
    $amounts = [];
    foreach ($items as $it) {
        $strength += $it['amount'];
        $fullness = max($fullness, $it['amount']);
        $absorbances[] = $it['A'] ?? absorbanceFromHex($it['paint']['hex']);
        $amounts[] = $it['amount'];
    }
    $linear = mixAbsorbances($absorbances, $amounts);
    $paints = [];
    foreach ($items as $it) {
        $paints[] = ['paintId' => $it['paint']['id'], 'amount' => $it['amount'], 'share' => $strength ? $it['amount'] / $strength : 0];
    }
    usort($paints, fn (array $a, array $b) => $b['amount'] <=> $a['amount']);
    $sorted = $amounts;
    usort($sorted, fn ($a, $b) => $b <=> $a);
    return [
        'paints' => $paints,
        'parts' => toParts($sorted),
        'strength' => $strength,
        'fullness' => $fullness,
        'dilution' => describeDilution($fullness),
        'hex' => rgbToHex(linearToRgb($linear)),
        // The mix without water: the same ratio, its largest part at full strength.
        'baseHex' => $fullness > 0 ? rgbToHex(linearToRgb(mixAbsorbances($absorbances, array_map(fn ($v) => $v / $fullness, $amounts)))) : '#ffffff',
        'deltaE' => $deltaE,
    ];
}

/** Amounts as simple ratio parts, e.g. [0.9, 0.3] -> [3, 1]. */
function toParts(array $amounts): array
{
    if (!$amounts) {
        return [];
    }
    $min = min($amounts);
    // Round to halves, cap the largest ratio so it stays practical on a palette.
    return array_map(fn ($a) => min(20, jsRound(($a / $min) * 2) / 2), $amounts);
}

/**
 * Letter of the water level of a wash. `$strength` = the fullness of a recipe; with `$fine` the
 * level and its step within it, W1 to C5 (value mode).
 */
function washLetter(float $strength, bool $fine = false): string
{
    if ($strength <= WASH_LIMITS[0]) {
        return '';
    }
    $level = 0;
    while ($level < count(WASH_LETTERS) - 1 && $strength >= WASH_LIMITS[$level + 1]) {
        $level++;
    }
    $letter = WASH_LETTERS[$level];
    if (!$fine) {
        return $letter;
    }
    // Steps of water are even on a log scale.
    $lo = log(WASH_LIMITS[$level]);
    $hi = log(WASH_LIMITS[$level + 1]);
    $step = (int) min(WASH_FINE - 1, max(0, floor(((log($strength) - $lo) / ($hi - $lo)) * WASH_FINE)));
    return $letter . ($step + 1);
}
