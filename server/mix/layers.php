<?php
/**
 * Layer mode (glazing): the plan of the layers for the colours of a picture. Port of
 * src/lib/layerPlan.js, where the model is described, and of the helpers it takes from
 * src/lib/layers.js. The picture never comes here: the browser sends its colours (OKLab and pixel
 * counts) and, for the accents, the pairs of colours it counted; layers.js lays the plan over the
 * pixels.
 *
 * The results match the JavaScript reference (server/tests/layers.test.php). The search is the
 * expensive part, so the hot loops are written out by hand: flat float arrays, OKLab inline, and
 * the work that is the same for every candidate done once (see `restOf` and `levelSums`).
 */

declare(strict_types=1);

namespace Mix\Layers {

use function Mix\absorbanceFromHex;
use function Mix\depthLimit;
use function Mix\paintFilter;
use function Mix\describeDilution;
use function Mix\hexToRgb;
use function Mix\rgbToLinear;
use function Mix\linearToSrgb;
use function Mix\rgbToHex;
use function Mix\jsRound;

require_once __DIR__ . '/mixing.php';

// From layers.js.
const MAX_COATS = 3;
const ACCENTS = 2;
const GRADED = false;
const CLEAN_FROM = 0.12;
const CLEAN_FULL = 0.2;
const CARVE_GAIN = 3;
const DARK_FROM = 0.5;

// From layerPlan.js.
const MAX_LAYERS = 7;
const REFERENCE_WATER = 1;
const MAX_COMBINATIONS = 40000;
const STRENGTHS = [0.06, 0.1, 0.16, 0.25, 0.4, 0.6, 0.8, 1.0];
const ACCENT_STRENGTHS = [0.25, 0.4, 0.6, 0.8, 1.0];
const MIN_STRENGTH = 0.05;
const MAX_STRENGTH = \Mix\MAX_AMOUNT;
const RATIOS = [1.0, 1.7, 3.0];
const MAX_RATIO = 4.0;
const FIT_COLOURS = 220;
const SHORTLIST = 5;
const SWAP_ROUNDS = 3;
const COAT_PRICE = 0.3;
const STEP_PRICE = 0.25;
const DULL_PRICE = 4.0;
const NEUTRAL_CHROMA = 0.12;
const ACCENT_COAT_PRICE = 3.0;
const ACCENT_SPOTS = 1500;
const ACCENT_SHARE = 0.2;
const DETAIL_POWER = 0.65;
const ACCENT_PRICE = 0.5;
const COLOUR_CHROMA = 0.1;
const COLOUR_LIGHTNESS = 0.5;
const DARK_COAT = 0.45;
const DARK_FULL = 0.3;

const THIRD = 1 / 3;
const NO_LAYER = [1.0, 1.0, 1.0];

/** Math.hypot as the browser computes it (scaled, with Kahan summation), so results match. */
function hypot(float ...$values): float
{
    $max = 0.0;
    foreach ($values as $i => $v) {
        $v = abs($v);
        if (is_infinite($v)) {
            return INF;
        }
        $values[$i] = $v;
        if ($v > $max) {
            $max = $v;
        }
    }
    if ($max == 0.0) {
        return 0.0;
    }
    $sum = 0.0;
    $compensation = 0.0;
    foreach ($values as $v) {
        $n = $v / $max;
        $summand = $n * $n - $compensation;
        $preliminary = $sum + $summand;
        $compensation = ($preliminary - $sum) - $summand;
        $sum = $preliminary;
    }
    return sqrt($sum) * $max;
}

/** How much a neutral coat dulls a colour of the picture: 0 on greys, 1 on a saturated colour. */
function dulling(float $a, float $b): float
{
    $c = sqrt($a * $a + $b * $b);
    return $c <= CLEAN_FROM ? 0.0 : min(2.0, ($c - CLEAN_FROM) / (CLEAN_FULL - CLEAN_FROM));
}

/** OKLab of a linear RGB colour. */
function lab(float $r, float $g, float $b): array
{
    $x = 0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $b;
    $y = 0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $b;
    $z = 0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $b;
    $l = \Mix\cbrt($x);
    $m = \Mix\cbrt($y);
    $s = \Mix\cbrt($z);
    return [
        0.2104542553 * $l + 0.793617785 * $m - 0.0040720468 * $s,
        1.9779984951 * $l - 2.428592205 * $m + 0.4505937099 * $s,
        0.0259040371 * $l + 0.7827717662 * $m - 0.808675766 * $s,
    ];
}

function linearHex(array $lin, int $o = 0): string
{
    return rgbToHex([linearToSrgb($lin[$o]), linearToSrgb($lin[$o + 1]), linearToSrgb($lin[$o + 2])]);
}

/** Depth of a paint on the paper: however many coats, never deeper than its swatch. */
function depth(float $amount, float $limit): float
{
    return \Mix\depth(min(\Mix\MAX_AMOUNT, $amount), $limit);
}

/** Amount of paint in `coats` coats: the first of the given strength, every further one `ratio` times stronger. */
function coatAmount(float $coats, float $strength, float $ratio = 1.0): float
{
    return abs($ratio - 1) < 1e-6 ? $coats * $strength : ($strength * ($ratio ** $coats - 1)) / ($ratio - 1);
}

/** How to prepare a wash of the given strength (see washGuide in layerPlan.js). `water` null = none. */
function washGuide(float $strength): array
{
    if (!($strength > 0)) {
        // The browser's JSON has no Infinity: it sends null.
        return ['water' => null, 'consistency' => 'water', 'guide' => 'clear water'];
    }
    $exact = REFERENCE_WATER / $strength;
    $step = $exact < 3 ? 0.5 : ($exact < 10 ? 1 : ($exact < 30 ? 5 : ($exact < 100 ? 10 : 50)));
    $water = jsRound($exact / $step) * $step;
    $consistency = $water >= 20 ? 'tea' : ($water >= 8 ? 'coffee' : ($water >= 3 ? 'milk' : ($water > 1 ? 'cream' : 'butter')));
    $parts = $water < 1 ? 'hardly any water' : number($water) . ' ' . ($water == 1 ? 'part' : 'parts') . ' water';
    return ['water' => $water, 'consistency' => $consistency, 'guide' => '1 part paint to ' . $parts . ', like ' . $consistency];
}

/** A number as the browser writes it in a text (2.5, 20). */
function number(float $value): string
{
    return $value == floor($value) && abs($value) < 1e15 ? (string) (int) $value : (string) $value;
}

/** What a layer does to the light, per number of coats: (top + 1) x 3 factors on linear RGB. */
function filterTable(array $A, float $limit, float $strength, float $ratio, int $top, float $under = 0.0): array
{
    // Each coat as the paint does alone on white paper (paintFilter: water thins it like opacity),
    // over what of the same paint is already there.
    $t = [];
    $below = paintFilter($A, $under);
    for ($c = 0; $c <= $top; $c++) {
        $f = paintFilter($A, $under + coatAmount($c, $strength, $ratio));
        $t[] = $f[0] / $below[0];
        $t[] = $f[1] / $below[1];
        $t[] = $f[2] / $below[2];
    }
    return $t;
}

/**
 * Every combination of coats of the given layers on white paper: linear RGB, OKLab, work and dulling.
 * Combination index = coats of layer 0 + levels of layer 0 * (coats of layer 1 + ...).
 */
function combinations(array $tables, array $prices): array
{
    $lin = [1.0, 1.0, 1.0];
    $work = [0.0];
    $dull = [0.0];
    foreach ($tables as $k => $t) {
        $levels = intdiv(count($t), 3);
        $n = intdiv(count($lin), 3);
        $next = [];
        $more = [];
        $duller = [];
        $coat = $prices[$k]['coat'];
        $dl = $prices[$k]['dull'];
        for ($c = 0; $c < $levels; $c++) {
            $t0 = $t[$c * 3];
            $t1 = $t[$c * 3 + 1];
            $t2 = $t[$c * 3 + 2];
            $wc = ($c * $coat) / 100;
            $dc = ($c * $dl) / 100;
            for ($i = 0; $i < $n; $i++) {
                $next[] = $lin[$i * 3] * $t0;
                $next[] = $lin[$i * 3 + 1] * $t1;
                $next[] = $lin[$i * 3 + 2] * $t2;
                $more[] = $work[$i] + $wc;
                $duller[] = $dull[$i] + $dc;
            }
        }
        $lin = $next;
        $work = $more;
        $dull = $duller;
    }
    $size = intdiv(count($lin), 3);
    $lab = [];
    for ($i = 0; $i < $size; $i++) {
        [$lab[], $lab[], $lab[]] = lab($lin[$i * 3], $lin[$i * 3 + 1], $lin[$i * 3 + 2]);
    }
    return ['lin' => $lin, 'lab' => $lab, 'work' => $work, 'dull' => $dull, 'size' => $size];
}

/** The best combination for every colour: the closest one, its work counting as distance. */
function closest(array $combos, array $points, int $n): array
{
    $best = [];
    $error = [];
    $lab = $combos['lab'];
    $work = $combos['work'];
    $dull = $combos['dull'];
    $size = $combos['size'];
    for ($i = 0; $i < $n; $i++) {
        $L = $points[$i * 3];
        $a = $points[$i * 3 + 1];
        $b = $points[$i * 3 + 2];
        $clean = dulling($a, $b);
        $least = INF;
        $least2 = INF;
        $bi = 0;
        $bd = 0.0;
        for ($p = 0, $q = 0; $p < $size; $p++, $q += 3) {
            $dL = $lab[$q] - $L;
            $da = $lab[$q + 1] - $a;
            $db = $lab[$q + 2] - $b;
            $d2 = $dL * $dL + $da * $da + $db * $db;
            if ($d2 >= $least2) {
                continue;
            }
            $cost = sqrt($d2) + $work[$p] + $clean * $dull[$p];
            if ($cost < $least) {
                $least = $cost;
                $least2 = $least * $least;
                $bi = $p;
                $bd = sqrt($d2);
            }
        }
        $best[] = $bi;
        $error[] = $bd * 100;
    }
    return ['best' => $best, 'error' => $error];
}

/** Colours joined on a grid in OKLab: per occupied cell the mean colour and the summed count. */
function joinColours(array $points, array $counts, float $stepL, float $stepAB): array
{
    $total = count($counts);
    $index = [];
    $sums = [];
    $cellOf = [];
    for ($i = 0; $i < $total; $i++) {
        $key = (int) jsRound($points[$i * 3] / $stepL) * 1048576 + ((int) jsRound($points[$i * 3 + 1] / $stepAB) + 512) * 1024 + (int) jsRound($points[$i * 3 + 2] / $stepAB) + 512;
        if (!isset($index[$key])) {
            $index[$key] = intdiv(count($sums), 4);
            array_push($sums, 0.0, 0.0, 0.0, 0.0);
        }
        $j = $index[$key];
        $sums[$j * 4] += $points[$i * 3] * $counts[$i];
        $sums[$j * 4 + 1] += $points[$i * 3 + 1] * $counts[$i];
        $sums[$j * 4 + 2] += $points[$i * 3 + 2] * $counts[$i];
        $sums[$j * 4 + 3] += $counts[$i];
        $cellOf[] = $j;
    }
    $n = intdiv(count($sums), 4);
    $pts = [];
    $cnt = [];
    for ($j = 0; $j < $n; $j++) {
        $cnt[] = $c = $sums[$j * 4 + 3];
        $pts[] = $sums[$j * 4] / $c;
        $pts[] = $sums[$j * 4 + 1] / $c;
        $pts[] = $sums[$j * 4 + 2] / $c;
    }
    return ['points' => $pts, 'counts' => $cnt, 'cellOf' => $cellOf];
}

/**
 * The colours the fit works on: joined on a coarser grid until few enough are left, sorted by
 * weight; weights add up to 100. `clean` = how much a neutral coat dulls each of them.
 */
function fitSet(array $points, array $counts): array
{
    $n = count($counts);
    $pts = $points;
    $cnt = $counts;
    for ($stepL = 0.03, $stepAB = 0.015; $n > FIT_COLOURS; $stepL *= 1.3, $stepAB *= 1.3) {
        $joined = joinColours($points, $counts, $stepL, $stepAB);
        $n = count($joined['counts']);
        $pts = $joined['points'];
        $cnt = $joined['counts'];
    }
    $order = range(0, $n - 1);
    if ($n === 0) {
        $order = [];
    }
    usort($order, fn (int $x, int $y) => ($cnt[$y] <=> $cnt[$x]) ?: ($x <=> $y));
    $outPts = [];
    $weights = [];
    $sum = 0.0;
    foreach ($order as $i) {
        $outPts[] = $pts[$i * 3];
        $outPts[] = $pts[$i * 3 + 1];
        $outPts[] = $pts[$i * 3 + 2];
        $weights[] = (float) $cnt[$i];
        $sum += $cnt[$i];
    }
    for ($j = 0; $j < $n; $j++) {
        $weights[$j] *= 100 / $sum;
    }
    $clean = [];
    for ($j = 0; $j < $n; $j++) {
        $clean[] = dulling($outPts[$j * 3 + 1], $outPts[$j * 3 + 2]);
    }
    return ['points' => $outPts, 'weights' => $weights, 'n' => $n, 'clean' => $clean];
}

/** Amount of an accent's paint that its wash layer has already put on the paper. */
function underOf(array $layer, array $chosen): float
{
    if ($layer['kind'] !== 'accent') {
        return 0.0;
    }
    foreach ($chosen as $l) {
        if ($l['kind'] === 'wash' && $l['paint'] === $layer['paint']) {
            return coatAmount($l['top'], $l['strength'], $l['ratio']);
        }
    }
    return 0.0;
}

function tablesOf(array $chosen): array
{
    return array_map(fn (array $layer) => filterTable($layer['A'], $layer['limit'], $layer['strength'], $layer['ratio'], $layer['top'], underOf($layer, $chosen)), $chosen);
}

function pricesOf(array $chosen): array
{
    return array_map(fn (array $layer) => ['coat' => $layer['kind'] === 'accent' ? ACCENT_COAT_PRICE : COAT_PRICE, 'dull' => $layer['dull']], $chosen);
}

/** A paint as the search knows it; `paint` = its place in the list of paints. */
function knownPaint(array $paints, int $index): array
{
    $hex = $paints[$index]['hex'];
    $A = absorbanceFromHex($hex);
    [$r, $g, $b] = rgbToLinear(hexToRgb($hex));
    $l = lab($r, $g, $b);
    $neutral = max(0.0, 1 - hypot($l[1], $l[2]) / NEUTRAL_CHROMA);
    return ['paint' => $index, 'A' => $A, 'limit' => depthLimit($A), 'dull' => $neutral * DULL_PRICE];
}

/**
 * For every colour its `keep` best combinations of the given layers (see shortlist in
 * layerPlan.js), and what a new layer over them costs without a coat of its own: `zero` per colour
 * = the least distance plus work at level 0, the same for every candidate.
 */
function restOf(array $chosen, array $set, int $keep): array
{
    $combos = combinations(tablesOf($chosen), pricesOf($chosen));
    $points = $set['points'];
    $n = $set['n'];
    $T = min($keep, $combos['size']);
    $lab = $combos['lab'];
    $lin = $combos['lin'];
    $cw = $combos['work'];
    $cd = $combos['dull'];
    $size = $combos['size'];
    $base = [];
    $work = [];
    $zero = [];
    for ($i = 0; $i < $n; $i++) {
        $L = $points[$i * 3];
        $a = $points[$i * 3 + 1];
        $b = $points[$i * 3 + 2];
        $clean = $set['clean'][$i];
        $topD = array_fill(0, $T, INF);
        $topI = array_fill(0, $T, 0);
        $last = $T - 1;
        for ($p = 0, $q = 0; $p < $size; $p++, $q += 3) {
            $dL = $lab[$q] - $L;
            $da = $lab[$q + 1] - $a;
            $db = $lab[$q + 2] - $b;
            $d = sqrt($dL * $dL + $da * $da + $db * $db) + $cw[$p] + $clean * $cd[$p];
            if ($d < $topD[$last]) {
                $s = $last;
                while ($s > 0 && $topD[$s - 1] > $d) {
                    $topD[$s] = $topD[$s - 1];
                    $topI[$s] = $topI[$s - 1];
                    $s--;
                }
                $topD[$s] = $d;
                $topI[$s] = $p;
            }
        }
        $least = INF;
        for ($s = 0; $s < $T; $s++) {
            $q = $topI[$s] * 3;
            $r0 = $lin[$q];
            $r1 = $lin[$q + 1];
            $r2 = $lin[$q + 2];
            $base[] = $r0;
            $base[] = $r1;
            $base[] = $r2;
            $w = $cw[$topI[$s]] + $clean * $cd[$topI[$s]];
            $work[] = $w;
            // Level 0 of any layer leaves the light as it is (its factors are exactly 1).
            [$l0, $l1, $l2] = lab($r0, $r1, $r2);
            $dL = $l0 - $L;
            $da = $l1 - $a;
            $db = $l2 - $b;
            $d = sqrt($dL * $dL + $da * $da + $db * $db) + $w;
            if ($d < $least) {
                $least = $d;
            }
        }
        $zero[] = $least;
    }
    return ['base' => $base, 'work' => $work, 'T' => $T, 'zero' => $zero];
}

/**
 * The levels of the given tables, each set of factors once: `kids[k][c]` = the level c of table k
 * as an index into `tabs`. A wash of 0.4 in three coats ends where one of 0.8 in two does, and
 * every amount of paint past the swatch is the swatch: such levels are worked out once.
 */
function levelsOf(array $tables, int $top): array
{
    $index = [];
    $tabs = [];
    $kids = [];
    foreach ($tables as $k => $table) {
        $kids[$k] = [0];
        for ($c = 1; $c <= $top; $c++) {
            $t0 = $table[$c * 3];
            $t1 = $table[$c * 3 + 1];
            $t2 = $table[$c * 3 + 2];
            $key = pack('ddd', $t0, $t1, $t2);
            if (!isset($index[$key])) {
                $index[$key] = count($tabs);
                $tabs[] = [$t0, $t1, $t2];
            }
            $kids[$k][$c] = $index[$key];
        }
    }
    return ['kids' => $kids, 'tabs' => $tabs, 'near' => array_fill(0, count($tabs), []), 'filled' => array_fill(0, count($tabs), 0)];
}

/**
 * Weighted sums of distance plus work of the colours when a layer is laid over `rest`, for every
 * number of coats up to `top` at once: sums[c] = with at most c coats (errorWith in layerPlan.js
 * with the table cut after c). The layer is table `k` of `levels` (see levelsOf), which keeps what
 * it worked out (distance plus work per colour and shortlist entry) for the next table with the
 * same level. Stops early once every sum from `from` on is past its bound, bounds[c] (INF = no
 * bound); a sum past its bound is INF.
 */
function levelSums(array &$levels, int $k, array $rest, array $set, int $top, float $dull, array $bounds, int $from): array
{
    $points = $set['points'];
    $weights = $set['weights'];
    $clean = $set['clean'];
    $n = $set['n'];
    $base = $rest['base'];
    $work = $rest['work'];
    $T = $rest['T'];
    $zero = $rest['zero'];
    $kids = $levels['kids'][$k];
    $tabs = $levels['tabs'];
    $near = &$levels['near'];
    $filled = &$levels['filled'];
    $sums = array_fill(0, $top + 1, 0.0);
    for ($i = 0; $i < $n; $i++) {
        $coat = (COAT_PRICE + ($dull != 0.0 ? $clean[$i] * $dull : 0)) / 100;
        $run = $zero[$i];
        $sums[0] += $weights[$i] * $run;
        $first = $i * $T;
        for ($c = 1; $c <= $top; $c++) {
            $kid = $kids[$c];
            if ($filled[$kid] <= $i) {
                // First time this level meets colour i: the least distance plus work over the
                // shortlist. Adding the price of the coats keeps the order, so the least is all
                // that needs keeping.
                [$t0, $t1, $t2] = $tabs[$kid];
                $L = $points[$i * 3];
                $a = $points[$i * 3 + 1];
                $b = $points[$i * 3 + 2];
                $least = INF;
                for ($s = 0, $o = $first * 3; $s < $T; $s++, $o += 3) {
                    $r = $base[$o] * $t0;
                    $g = $base[$o + 1] * $t1;
                    $bb = $base[$o + 2] * $t2;
                    $l = (0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $bb) ** THIRD;
                    $mm = (0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $bb) ** THIRD;
                    $ss = (0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $bb) ** THIRD;
                    $dL = 0.2104542553 * $l + 0.793617785 * $mm - 0.0040720468 * $ss - $L;
                    $da = 1.9779984951 * $l - 2.428592205 * $mm + 0.4505937099 * $ss - $a;
                    $db = 0.0259040371 * $l + 0.7827717662 * $mm - 0.808675766 * $ss - $b;
                    $d = sqrt($dL * $dL + $da * $da + $db * $db) + $work[$first + $s];
                    if ($d < $least) {
                        $least = $d;
                    }
                }
                $near[$kid][] = $least;
                $filled[$kid] = $i + 1;
            }
            $d = $near[$kid][$i] + $coat * $c;
            if ($d < $run) {
                $run = $d;
            }
            $sums[$c] += $weights[$i] * $run;
        }
        // All sums only grow: once every one that is asked for is past its bound, none comes back.
        $past = true;
        for ($c = $from; $c <= $top; $c++) {
            if (!($sums[$c] > $bounds[$c])) {
                $past = false;
                break;
            }
        }
        if ($past) {
            return array_fill(0, $top + 1, INF);
        }
    }
    for ($c = 0; $c <= $top; $c++) {
        if ($sums[$c] > $bounds[$c]) {
            $sums[$c] = INF;
        }
    }
    return $sums;
}

/** errorWith of layerPlan.js: one table, all its coats. */
function errorWith(array $table, array $rest, array $set, float $bound = INF, float $dull = 0.0): float
{
    $top = intdiv(count($table), 3) - 1;
    $levels = levelsOf([$table], $top);
    return levelSums($levels, 0, $rest, $set, $top, $dull, array_fill(0, $top + 1, $bound), $top)[$top];
}

/** What a plan of washes costs: distance of every colour with its best combination, work and steps. */
function planCost(array $chosen, array $set): float
{
    $combos = combinations(tablesOf($chosen), pricesOf($chosen));
    $found = closest($combos, $set['points'], $set['n']);
    $steps = 0;
    foreach ($chosen as $layer) {
        $steps += $layer['top'];
    }
    $sum = $steps * STEP_PRICE;
    for ($i = 0; $i < $set['n']; $i++) {
        $best = $found['best'][$i];
        $sum += ($set['weights'][$i] / 100) * ($found['error'][$i] + ($combos['work'][$best] + $set['clean'][$i] * $combos['dull'][$best]) * 100);
    }
    return $sum;
}

/** Plan the wash layers: which paints, with how many coats of which wash (see layerPlan.js). */
function planWashes(array $set, array $paints, int $count, int $maxCoats, bool $graded): array
{
    $maxRatio = $graded && $maxCoats > 1 ? MAX_RATIO : 1.0;
    $best = null;
    $counts = $count < 3 ? [$count] : [$count, $count - 1];
    $starts = $maxRatio > 1 ? [[1.0], RATIOS] : [[1.0]];
    foreach ($counts as $c) {
        foreach ($starts as $ratios) {
            $chosen = searchWashes($set, $paints, $c, $maxCoats, $ratios, $maxRatio);
            $sum = planCost($chosen, $set);
            for ($pruned = true; $pruned && count($chosen) > 1;) {
                $pruned = false;
                for ($k = 0; $k < count($chosen); $k++) {
                    $less = [];
                    foreach ($chosen as $i => $layer) {
                        if ($i === $k) {
                            $layer['top']--;
                        }
                        if ($layer['top'] > 0) {
                            $less[] = $layer;
                        }
                    }
                    $cost = planCost($less, $set);
                    if ($cost <= $sum + 1e-9) {
                        $chosen = $less;
                        $sum = $cost;
                        $pruned = true;
                        break;
                    }
                }
            }
            if ($best === null || $sum < $best['sum'] - 1e-9) {
                $best = ['chosen' => $chosen, 'sum' => $sum];
            }
        }
    }
    return $best['chosen'];
}

/** One run of the search (searchWashes in layerPlan.js). */
function searchWashes(array $set, array $paints, int $count, int $maxCoats, array $ratios, float $maxRatio): array
{
    $grid = [];
    foreach ($ratios as $ratio) {
        foreach (STRENGTHS as $strength) {
            if ($strength * $ratio ** ($maxCoats - 1) <= MAX_STRENGTH) {
                $grid[] = ['strength' => $strength, 'ratio' => $ratio];
            }
        }
    }
    $pool = [];
    foreach ($paints as $index => $_) {
        $known = knownPaint($paints, $index);
        $known['tables'] = array_map(fn (array $w) => filterTable($known['A'], $known['limit'], $w['strength'], $w['ratio'], $maxCoats), $grid);
        $pool[] = $known;
    }
    $wanted = min($count, count($pool), MAX_LAYERS);
    $chosen = [];
    $others = function (int $skip) use (&$chosen, $set): array {
        $rest = [];
        foreach ($chosen as $i => $layer) {
            if ($i !== $skip) {
                $rest[] = $layer;
            }
        }
        return restOf($rest, $set, SHORTLIST);
    };

    // The best paint, wash and number of coats for the layer at `skip` (or for a new one).
    $bestWash = function (int $skip, array $rest, float $bound) use (&$chosen, $pool, $grid, $set, $maxCoats): ?array {
        $best = null;
        foreach ($pool as $candidate) {
            foreach ($chosen as $i => $layer) {
                if ($i !== $skip && $layer['paint'] === $candidate['paint']) {
                    continue 2;
                }
            }
            // What one candidate worked out for a level holds for every wash of it that has that level.
            $levels = levelsOf($candidate['tables'], $maxCoats);
            foreach ($grid as $g => $w) {
                $from = $w['ratio'] == 1 ? 1 : 2;
                // Every number of coats in one pass; each must beat the bound as it stands when
                // its turn comes, which is never more than the bound now.
                $bounds = [INF];
                for ($top = 1; $top <= $maxCoats; $top++) {
                    $bounds[$top] = $bound - STEP_PRICE * $top;
                }
                $sums = levelSums($levels, $g, $rest, $set, $maxCoats, $candidate['dull'], $bounds, $from);
                for ($top = $from; $top <= $maxCoats; $top++) {
                    $steps = STEP_PRICE * $top;
                    $sum = $sums[$top] > $bound - $steps ? INF : $sums[$top];
                    $cost = $sum + $steps;
                    if ($cost < $bound) {
                        $bound = $cost;
                        $best = ['paint' => $candidate['paint'], 'A' => $candidate['A'], 'limit' => $candidate['limit'], 'dull' => $candidate['dull'], 'strength' => $w['strength'], 'ratio' => $w['ratio'], 'top' => $top, 'kind' => 'wash'];
                    }
                }
            }
        }
        return $best;
    };

    $add = function () use (&$chosen, $wanted, $maxCoats, $others, $bestWash, $set): bool {
        $added = false;
        while (count($chosen) < $wanted) {
            $size = $maxCoats + 1;
            foreach ($chosen as $layer) {
                $size *= $layer['top'] + 1;
            }
            if ($size > MAX_COMBINATIONS / 4) {
                break;
            }
            $rest = $others(-1);
            $next = $bestWash(-1, $rest, errorWith(NO_LAYER, $rest, $set) - 1e-6);
            if ($next === null) {
                break;
            }
            $chosen[] = $next;
            $added = true;
        }
        return $added;
    };
    $exchange = function () use (&$chosen, $others, $bestWash, $set): bool {
        $improved = false;
        for ($round = 0; $round < SWAP_ROUNDS; $round++) {
            $better = false;
            for ($k = 0; $k < count($chosen); $k++) {
                $rest = $others($k);
                $now = errorWith(tablesOf($chosen)[$k], $rest, $set, INF, $chosen[$k]['dull']) + STEP_PRICE * $chosen[$k]['top'];
                $next = $bestWash($k, $rest, $now - 0.005);
                if ($next !== null) {
                    $chosen[$k] = $next;
                    $better = $improved = true;
                }
            }
            if (!$better) {
                break;
            }
        }
        return $improved;
    };

    $clamp = function (float $s, float $r, int $top) use ($maxRatio): array {
        $ratio = $top > 1 ? min($maxRatio, max(1.0, $r)) : 1.0;
        return [min(MAX_STRENGTH / $ratio ** ($top - 1), max(MIN_STRENGTH, $s)), $ratio];
    };
    // Pattern search on the water level of the first coat and on how much stronger the next coats are.
    $tuneWash = function (callable $errorAt, array $start, int $top) use ($clamp, $maxRatio): array {
        $at = $clamp($start[0], $start[1], $top);
        $best = $errorAt($at);
        for ($step = 0.3; $step > 0.01; $step /= 2) {
            for ($moved = true; $moved;) {
                $moved = false;
                foreach ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as [$ds, $dr]) {
                    if ($dr && ($maxRatio == 1 || $top === 1)) {
                        continue;
                    }
                    $trial = $clamp($at[0] * exp($ds * $step), $at[1] * exp($dr * $step), $top);
                    $e = $errorAt($trial);
                    if ($e < $best - 1e-9) {
                        $best = $e;
                        $at = $trial;
                        $moved = true;
                        break;
                    }
                }
            }
        }
        return ['at' => $at, 'error' => $best];
    };
    // Every layer in turn, with the others fixed: its wash, its number of coats, and whether it still pays.
    $tune = function () use (&$chosen, $others, $tuneWash, $set, $maxCoats): void {
        for ($round = 0; $round < 2; $round++) {
            for ($k = 0; $k < count($chosen); $k++) {
                $layer = $chosen[$k];
                $rest = $others($k);
                $errorAt = fn (int $top) => fn (array $sr) => errorWith(filterTable($layer['A'], $layer['limit'], $sr[0], $sr[1], $top), $rest, $set, INF, $layer['dull']) + STEP_PRICE * $top;
                $top = $layer['top'];
                $best = $tuneWash($errorAt($top), [$layer['strength'], $layer['ratio']], $top);
                for ($other = 1; $other <= $maxCoats; $other++) {
                    if ($other === $layer['top']) {
                        continue;
                    }
                    $trial = $tuneWash($errorAt($other), [($layer['strength'] * $layer['top']) / $other, $layer['ratio']], $other);
                    if ($trial['error'] < $best['error'] - 1e-6) {
                        $best = $trial;
                        $top = $other;
                    }
                }
                if (errorWith(NO_LAYER, $rest, $set) - $best['error'] < 1e-6) {
                    $top = 0;
                }
                $layer['strength'] = $best['at'][0];
                $layer['ratio'] = $best['at'][1];
                $layer['top'] = $top;
                $chosen[$k] = $layer;
            }
            $chosen = array_values(array_filter($chosen, fn (array $layer) => $layer['top'] > 0));
        }
    };

    $add();
    $exchange();
    $tune();
    if ($exchange()) {
        $tune();
    }
    return $chosen;
}

/** What the washes leave over, as the accents see it (residual in layerPlan.js). */
function residual(array $left): array
{
    ['base' => $base, 'points' => $points, 'counts' => $counts] = $left;
    $all = count($counts);
    $total = 0.0;
    $totalDetail = 0.0;
    for ($i = 0; $i < $all; $i++) {
        $total += $counts[$i];
        $totalDetail += $counts[$i] ** DETAIL_POWER;
    }
    $kept = [];
    for ($i = 0; $i < $all; $i++) {
        $l = lab($base[$i * 3], $base[$i * 3 + 1], $base[$i * 3 + 2]);
        $miss = hypot($l[0] - $points[$i * 3], $l[1] - $points[$i * 3 + 1], $l[2] - $points[$i * 3 + 2]);
        if ($miss * 100 <= ACCENT_COAT_PRICE) {
            continue;
        }
        $chroma = hypot($points[$i * 3 + 1], $points[$i * 3 + 2]);
        $kept[] = [$i, $counts[$i] ** DETAIL_POWER * $miss * $miss * (1 + $chroma / COLOUR_CHROMA)];
    }
    usort($kept, fn (array $x, array $y) => ($y[1] <=> $x[1]) ?: ($x[0] <=> $y[0]));
    $n = min(count($kept), ACCENT_SPOTS);
    $out = ['n' => $n, 'base' => [], 'points' => [], 'weights' => [], 'detail' => []];
    for ($j = 0; $j < $n; $j++) {
        $i = $kept[$j][0];
        for ($c = 0; $c < 3; $c++) {
            $out['base'][] = $base[$i * 3 + $c];
            $out['points'][] = $points[$i * 3 + $c];
        }
        $out['weights'][] = ($counts[$i] / $total) * 100;
        $out['detail'][] = ($counts[$i] ** DETAIL_POWER / $totalDetail) * 100;
    }
    return $out;
}

/**
 * What does not depend on the accent tried, per role: for every spot its colour, what the washes
 * give there and how far that is off, and its weight. Spots the role passes over whatever the
 * accent are left out. Kept in $spots['pre'] until an accent is applied.
 */
function spotsFor(array &$spots, string $role): array
{
    if (isset($spots['pre'][$role])) {
        return $spots['pre'][$role];
    }
    $lightness = $role === 'colour' ? COLOUR_LIGHTNESS : 1.0;
    $pre = [];
    for ($i = 0; $i < $spots['n']; $i++) {
        $o = $i * 3;
        $L = $spots['points'][$o];
        $a = $spots['points'][$o + 1];
        $b = $spots['points'][$o + 2];
        $chroma = sqrt($a * $a + $b * $b);
        $s = lab($spots['base'][$o], $spots['base'][$o + 1], $spots['base'][$o + 2]);
        $weight = $spots['detail'][$i];
        if ($role === 'colour') {
            if ($chroma < COLOUR_CHROMA / 2 || $L < DARK_FROM) {
                continue;
            }
            $missing = $chroma > 0 ? min(1.0, max(0.0, 1 - ($s[1] * $a + $s[2] * $b) / ($chroma * $chroma))) : 0.0;
            $weight *= ($chroma / COLOUR_CHROMA) * $missing;
        } elseif ($role === 'dark') {
            if ($L >= $s[0] || $L >= DARK_FROM) {
                continue;
            }
            $weight *= min(1.0, (DARK_FROM - $L) / (DARK_FROM - DARK_FULL));
        } else {
            $weight *= 1 + $chroma / COLOUR_CHROMA;
        }
        $pre[] = [
            $i, $L, $a, $b, dulling($a, $b), $weight,
            hypot($s[1] - $a, $s[2] - $b),
            hypot(($s[0] - $L) * $lightness, $s[1] - $a, $s[2] - $b),
        ];
    }
    return $spots['pre'][$role] = $pre;
}

/** What an accent is good for on what the washes leave over (accentGain in layerPlan.js). */
function accentGain(array $candidate, array $table, array &$spots, string $role, bool $apply = false): array
{
    $lightness = $role === 'colour' ? COLOUR_LIGHTNESS : 1.0;
    $coat = ACCENT_COAT_PRICE / 100;
    $carve = CARVE_GAIN / 100;
    $dull = $candidate['dull'];
    [$t0, $t1, $t2] = [$table[3], $table[4], $table[5]];
    [$aloneL, $aloneA, $aloneB] = lab($t0, $t1, $t2);
    $gain = 0.0;
    $share = 0.0;
    $base = $spots['base'];
    foreach (spotsFor($spots, $role) as [$i, $L, $a, $b, $clean, $weight, $offHue, $without]) {
        $o = $i * 3;
        $price = $coat + ($dull != 0.0 ? ($clean * $dull) / 100 : 0);
        $r = $base[$o] * $t0;
        $g = $base[$o + 1] * $t1;
        $bb = $base[$o + 2] * $t2;
        $l = (0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $bb) ** THIRD;
        $m = (0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $bb) ** THIRD;
        $q = (0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $bb) ** THIRD;
        $dL = (0.2104542553 * $l + 0.793617785 * $m - 0.0040720468 * $q - $L) * $lightness;
        $da = 1.9779984951 * $l - 2.428592205 * $m + 0.4505937099 * $q - $a;
        $db = 0.0259040371 * $l + 0.7827717662 * $m - 0.808675766 * $q - $b;
        $withIt = sqrt($dL * $dL + $da * $da + $db * $db) + $price;
        $ea = $aloneA - $a;
        $eb = $aloneB - $b;
        $eL = ($aloneL - $L) * $lightness;
        $alone = sqrt($eL * $eL + $ea * $ea + $eb * $eb) + $price + $carve;
        $reserved = $role !== 'dark' && $alone < $withIt;
        if ($reserved) {
            $withIt = $alone;
        }
        if ($withIt >= $without) {
            continue;
        }
        if ($role === 'colour') {
            $onHue = $reserved ? sqrt($ea * $ea + $eb * $eb) : sqrt($da * $da + $db * $db);
            if ($onHue >= $offHue) {
                continue;
            }
        }
        $gain += $weight * ($without * $without - $withIt * $withIt) * 100;
        $share += $spots['weights'][$i];
        if ($apply) {
            if ($reserved) {
                $spots['base'][$o] = $t0;
                $spots['base'][$o + 1] = $t1;
                $spots['base'][$o + 2] = $t2;
            } else {
                $spots['base'][$o] = $r;
                $spots['base'][$o + 1] = $g;
                $spots['base'][$o + 2] = $bb;
            }
        }
    }
    if ($apply) {
        unset($spots['pre']);
    }
    return ['gain' => $gain, 'share' => $share];
}

/** Whether one coat of this wash on white paper is dark enough for the accent for the darks. */
function darkCoat(array $candidate, float $strength): bool
{
    [$r, $g, $b] = paintFilter($candidate['A'], $strength);
    return lab($r, $g, $b)[0] < DARK_COAT;
}

/** The accents: one strong wash at a time, as long as one pays (chooseAccents in layerPlan.js). */
function chooseAccents(array $washes, array $spots, array $paints, int $count): array
{
    $chosen = [];
    $pool = [];
    foreach ($paints as $index => $_) {
        $known = knownPaint($paints, $index);
        $known['under'] = 0.0;
        foreach ($washes as $layer) {
            if ($layer['paint'] === $index) {
                $known['under'] = coatAmount($layer['top'], $layer['strength'], $layer['ratio']);
                break;
            }
        }
        $pool[] = $known;
    }
    $tableOf = fn (array $candidate, float $strength) => filterTable($candidate['A'], $candidate['limit'], $strength, 1.0, 1, $candidate['under']);
    $size = 1;
    foreach ($washes as $layer) {
        $size *= $layer['top'] + 1;
    }
    foreach (['colour', 'dark', 'any'] as $role) {
        if (count($chosen) >= $count || !$spots['n'] || $size * 2 > MAX_COMBINATIONS) {
            break;
        }
        $gainOf = function (array $candidate, float $strength) use ($role, $tableOf, &$spots): float {
            if ($role === 'dark' && !darkCoat($candidate, $strength)) {
                return 0.0;
            }
            $result = accentGain($candidate, $tableOf($candidate, $strength), $spots, $role);
            return $result['share'] > ACCENT_SHARE * 100 ? 0.0 : $result['gain'];
        };
        $best = null;
        $most = ACCENT_PRICE;
        foreach ($pool as $candidate) {
            foreach ($chosen as $layer) {
                if ($layer['paint'] === $candidate['paint']) {
                    continue 2;
                }
            }
            foreach (ACCENT_STRENGTHS as $strength) {
                $gain = $gainOf($candidate, $strength);
                if ($gain > $most) {
                    $most = $gain;
                    $best = [$candidate, $strength];
                }
            }
        }
        if ($best === null) {
            continue;
        }
        [$candidate, $strength] = $best;
        for ($step = 0.25; $step > 0.02; $step /= 2) {
            foreach ([1, -1] as $dir) {
                $trial = min(MAX_STRENGTH, max(MIN_STRENGTH, $strength * exp($dir * $step)));
                $gain = $gainOf($candidate, $trial);
                if ($gain > $most) {
                    $most = $gain;
                    $strength = $trial;
                }
            }
        }
        accentGain($candidate, $tableOf($candidate, $strength), $spots, $role, true);
        $chosen[] = ['paint' => $candidate['paint'], 'A' => $candidate['A'], 'limit' => $candidate['limit'], 'dull' => $candidate['dull'], 'strength' => $strength, 'ratio' => 1.0, 'top' => 1, 'kind' => 'accent', 'role' => $role];
        $size *= 2;
    }
    return $chosen;
}

/** What the washes leave over when every colour gets the combination that suits it best. */
function leftOfColours(array $points, array $counts): callable
{
    return function (array $washes) use ($points, $counts): array {
        $combos = combinations(tablesOf($washes), pricesOf($washes));
        $best = closest($combos, $points, count($counts))['best'];
        $base = [];
        foreach ($best as $b) {
            $base[] = $combos['lin'][$b * 3];
            $base[] = $combos['lin'][$b * 3 + 1];
            $base[] = $combos['lin'][$b * 3 + 2];
        }
        return ['base' => $base, 'points' => $points, 'counts' => $counts];
    };
}

/** What the washes leave over of the picture, from the pairs the browser counted (leftOfPairs in layerPlan.js). */
function leftOfPairs(array $points, array $counts, array $cells, array $pairs): callable
{
    $nc = intdiv(count($cells), 3);
    return function (array $washes) use ($points, $counts, $cells, $pairs, $nc): array {
        $combos = combinations(tablesOf($washes), pricesOf($washes));
        $best = closest($combos, $points, count($counts))['best'];
        $seen = [];
        for ($i = 0, $m = count($pairs); $i < $m; $i += 3) {
            $key = $best[(int) $pairs[$i]] * $nc + (int) $pairs[$i + 1];
            $seen[$key] = ($seen[$key] ?? 0.0) + $pairs[$i + 2];
        }
        $base = [];
        $pts = [];
        $cnt = [];
        foreach ($seen as $key => $n) {
            $cell = $key % $nc;
            $combo = intdiv($key - $cell, $nc);
            $base[] = $combos['lin'][$combo * 3];
            $base[] = $combos['lin'][$combo * 3 + 1];
            $base[] = $combos['lin'][$combo * 3 + 2];
            $pts[] = $cells[$cell * 3];
            $pts[] = $cells[$cell * 3 + 1];
            $pts[] = $cells[$cell * 3 + 2];
            $cnt[] = (float) $n;
        }
        return ['base' => $base, 'points' => $pts, 'counts' => $cnt];
    };
}

/** Painting order: washes of clean colour lightest first, then neutral washes, then accents. */
function paintingOrder(array $chosen): array
{
    $tables = tablesOf($chosen);
    $ordered = [];
    foreach ($chosen as $i => $layer) {
        $o = $layer['top'] * 3;
        $L = lab($tables[$i][$o], $tables[$i][$o + 1], $tables[$i][$o + 2])[0];
        $late = $layer['kind'] === 'accent' ? 2 : ($layer['dull'] > DULL_PRICE / 2 ? 1 : 0);
        $ordered[] = ['layer' => $layer, 'table' => $tables[$i], 'under' => underOf($layer, $chosen), 'late' => $late, 'L' => $L, 'i' => $i];
    }
    usort($ordered, fn (array $x, array $y) => ($x['late'] <=> $y['late']) ?: (($y['L'] <=> $x['L']) ?: ($x['i'] <=> $y['i'])));
    return $ordered;
}

/** The layers as they are handed out (describeLayers in layerPlan.js). */
function describeLayers(array $chosen, array $unused, int $maxCoats, array $paints): array
{
    $ordered = paintingOrder($chosen);
    foreach ($unused as $index) {
        $ordered[] = ['layer' => ['paint' => $index, 'strength' => 0.0, 'ratio' => 1.0, 'top' => 0, 'kind' => 'wash', 'limit' => 1.0, 'dull' => 0.0], 'table' => NO_LAYER, 'under' => 0.0];
    }
    $layers = [];
    foreach ($ordered as $index => ['layer' => $layer, 'table' => $table, 'under' => $under]) {
        $filters = [];
        for ($c = 0; $c <= $maxCoats; $c++) {
            $o = min($c, $layer['top']) * 3;
            array_push($filters, $table[$o], $table[$o + 1], $table[$o + 2]);
        }
        $washAt = function (int $c) use ($layer): array {
            $strength = $layer['strength'] * $layer['ratio'] ** min($c, max(0, $layer['top'] - 1));
            return ['strength' => $strength, 'dilution' => describeDilution($strength)] + washGuide($strength);
        };
        $out = ['index' => $index, 'kind' => $layer['kind']];
        if (isset($layer['role'])) {
            $out['role'] = $layer['role'];
        }
        $out['paintId'] = $paints[$layer['paint']]['id'];
        $out['top'] = $layer['top'];
        $out += $washAt(0);
        $out['ratio'] = $layer['ratio'];
        $out['washes'] = array_map($washAt, range(0, $maxCoats - 1));
        $depths = [];
        for ($c = 0; $c <= $maxCoats; $c++) {
            $depths[] = depth($under + coatAmount(min($c, $layer['top']), $layer['strength'], $layer['ratio']), $layer['limit']) - depth($under, $layer['limit']);
        }
        $out['depths'] = $depths;
        if ($under) {
            $alone = linearHex(filterTable($layer['A'], $layer['limit'], $layer['strength'], 1.0, 1), 3);
            $out['hexes'] = array_merge(['#ffffff'], array_fill(0, $maxCoats, $alone));
        } else {
            $out['hexes'] = array_map(fn (int $c) => linearHex($filters, $c * 3), range(0, $maxCoats));
        }
        $out['filters'] = $filters;
        $layers[] = $out;
    }
    return ['layers' => $layers, 'tables' => array_column($ordered, 'table'), 'prices' => pricesOf(array_column($ordered, 'layer'))];
}

/** The plan of the layers for the colours of a picture: what api/mix/layers answers. */
function planLayersFor(array $request): array
{
    $floats = fn (array $list) => array_map('floatval', array_values($list));
    $points = $floats($request['colours']['points'] ?? []);
    $counts = $floats($request['colours']['counts'] ?? []);
    $paints = array_values(array_map(fn (array $p) => ['id' => (string) $p['id'], 'hex' => (string) $p['hex']], $request['paints'] ?? []));
    $maxCoats = max(1, (int) ($request['maxCoats'] ?? MAX_COATS));
    $count = (int) ($request['count'] ?? 4);
    $graded = (bool) ($request['graded'] ?? GRADED);
    $accents = (float) ($request['accents'] ?? ACCENTS);
    $keepUnused = (bool) ($request['keepUnused'] ?? false);
    $left = $request['left'] ?? null;

    if (!$paints || !$counts) {
        return describeLayers([], $keepUnused ? array_keys($paints) : [], $maxCoats, $paints);
    }
    $set = fitSet($points, $counts);
    $leftOf = $left ? leftOfPairs($points, $counts, $floats($left['cells']), array_values($left['pairs'])) : leftOfColours($points, $counts);
    $washes = planWashes($set, $paints, min($count, count($paints), MAX_LAYERS), $maxCoats, $graded);
    $extra = (int) min(3, max(0, jsRound($accents)));
    $chosen = $extra ? array_merge($washes, chooseAccents($washes, residual($leftOf($washes)), $paints, $extra)) : $washes;
    $unused = [];
    if ($keepUnused) {
        $used = array_column($chosen, 'paint');
        foreach ($paints as $index => $_) {
            if (!in_array($index, $used, true)) {
                $unused[] = $index;
            }
        }
    }
    return describeLayers($chosen, $unused, $maxCoats, $paints);
}

}

namespace Mix {

/** Layer mode: the plan of the layers for the colours of a picture (see server/mix/layers.php). */
function planLayersFor(array $request): array
{
    return Layers\planLayersFor($request);
}

}
