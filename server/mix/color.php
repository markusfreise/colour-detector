<?php
/**
 * Colour-space helpers: sRGB <-> linear RGB <-> OKLab, plus perceptual distance.
 * Port of src/lib/color.js (the parts the mixing service needs).
 */

declare(strict_types=1);

namespace Mix;

/** Cube root of any number; pow() alone is a little off and does not take negative numbers. */
function cbrt(float $x): float
{
    if ($x == 0.0) {
        return 0.0;
    }
    $y = $x < 0 ? -((-$x) ** (1 / 3)) : $x ** (1 / 3);
    // One Newton step brings it to the last bit, as Math.cbrt in the browser.
    return $y - ($y * $y * $y - $x) / (3 * $y * $y);
}

/** @return array{int, int, int} */
function hexToRgb(string $hex): array
{
    $h = ltrim($hex, '#');
    if (strlen($h) === 3) {
        $h = $h[0] . $h[0] . $h[1] . $h[1] . $h[2] . $h[2];
    }
    $n = (int) hexdec($h);
    return [($n >> 16) & 255, ($n >> 8) & 255, $n & 255];
}

/** Rounds like Math.round in the browser: halves go up, also below zero. */
function jsRound(float $v): float
{
    return floor($v + 0.5);
}

function rgbToHex(array $rgb): string
{
    $out = '#';
    foreach ($rgb as $v) {
        $out .= str_pad(dechex((int) max(0, min(255, jsRound((float) $v)))), 2, '0', STR_PAD_LEFT);
    }
    return $out;
}

function srgbToLinear(float $v): float
{
    $c = $v / 255;
    return $c <= 0.04045 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(float $v): float
{
    $c = $v <= 0.0031308 ? $v * 12.92 : 1.055 * $v ** (1 / 2.4) - 0.055;
    return max(0.0, min(255.0, $c * 255));
}

/** @return array{float, float, float} */
function rgbToLinear(array $rgb): array
{
    return [srgbToLinear((float) $rgb[0]), srgbToLinear((float) $rgb[1]), srgbToLinear((float) $rgb[2])];
}

/** @return array{float, float, float} */
function linearToRgb(array $lin): array
{
    return [linearToSrgb($lin[0]), linearToSrgb($lin[1]), linearToSrgb($lin[2])];
}

/** @return array{float, float, float} */
function linearToOklab(array $lin): array
{
    [$r, $g, $b] = $lin;
    $l = cbrt(0.4122214708 * $r + 0.5363325363 * $g + 0.0514459929 * $b);
    $m = cbrt(0.2119034982 * $r + 0.6806995451 * $g + 0.1073969566 * $b);
    $s = cbrt(0.0883024619 * $r + 0.2817188376 * $g + 0.6299787005 * $b);
    return [
        0.2104542553 * $l + 0.793617785 * $m - 0.0040720468 * $s,
        1.9779984951 * $l - 2.428592205 * $m + 0.4505937099 * $s,
        0.0259040371 * $l + 0.7827717662 * $m - 0.808675766 * $s,
    ];
}

/** @return array{float, float, float} */
function oklabToLinear(array $lab): array
{
    [$L, $a, $b] = $lab;
    $l = ($L + 0.3963377774 * $a + 0.2158037573 * $b) ** 3;
    $m = ($L - 0.1055613458 * $a - 0.0638541728 * $b) ** 3;
    $s = ($L - 0.0894841775 * $a - 1.291485548 * $b) ** 3;
    return [
        4.0767416621 * $l - 3.3077115913 * $m + 0.2309699292 * $s,
        -1.2684380046 * $l + 2.6097574011 * $m - 0.3413193965 * $s,
        -0.0041960863 * $l - 0.7034186147 * $m + 1.707614701 * $s,
    ];
}

/** @return array{float, float, float} */
function hexToOklab(string $hex): array
{
    return linearToOklab(rgbToLinear(hexToRgb($hex)));
}

function oklabToHex(array $lab): string
{
    return rgbToHex(linearToRgb(oklabToLinear($lab)));
}

/** Euclidean distance in OKLab, scaled x100 so 1 unit is about a just-noticeable difference. */
function deltaE(array $a, array $b): float
{
    $dL = $a[0] - $b[0];
    $da = $a[1] - $b[1];
    $db = $a[2] - $b[2];
    return sqrt($dL * $dL + $da * $da + $db * $db) * 100;
}
