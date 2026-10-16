<?php
/**
 * Subtractive watercolour mixing. Port of src/lib/mixing.js, where the model is described.
 *
 * Model: transparent watercolour behaves roughly like a filter over white paper (Beer-Lambert).
 * Each paint's swatch colour gives a per-channel absorbance A = -ln(reflectance). A mix of paints
 * with amounts a_i reflects exp(-d(S)/S * sum a_i*A_i) with S = sum a_i; d(S) is the depth a wash
 * reaches with that much paint, 1 at amount 1, levelling off at the depth limit of its paints.
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
    $used = [];
    // No paint counts for more than its swatch (MAX_AMOUNT), whatever amount is asked for.
    foreach ($absorbances as $i => $A) {
        $used[$i] = min(MAX_AMOUNT, $amounts[$i]);
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
    return [exp(-$t0), exp(-$t1), exp(-$t2)];
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
