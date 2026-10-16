<?php
// The plan of the layers on the server (server/mix/layers.php) against the reference in
// src/lib/layerPlan.js: the cases are made by make-layer-cases.mjs.

declare(strict_types=1);

require_once dirname(__DIR__) . '/mix/layers.php';

/** Where two answers differ, or null: strings and ids exactly, numbers to 1e-9 of their size. */
function layerDifference(mixed $expected, mixed $actual, string $path = 'answer'): ?string
{
    if (is_int($expected) || is_float($expected)) {
        if (!is_int($actual) && !is_float($actual)) {
            return "$path: expected a number, got " . var_export($actual, true);
        }
        $scale = max(1.0, abs((float) $expected), abs((float) $actual));
        return abs($expected - $actual) <= 1e-9 * $scale ? null : "$path: expected $expected, got $actual";
    }
    if (is_array($expected)) {
        if (!is_array($actual)) {
            return "$path: expected a list or object, got " . var_export($actual, true);
        }
        $keys = array_keys($expected);
        if ($keys != array_keys($actual) && array_diff($keys, array_keys($actual)) + array_diff(array_keys($actual), $keys)) {
            return "$path: keys " . implode(',', $keys) . ' expected, got ' . implode(',', array_keys($actual));
        }
        foreach ($expected as $key => $value) {
            $difference = layerDifference($value, $actual[$key], "$path.$key");
            if ($difference !== null) {
                return $difference;
            }
        }
        return null;
    }
    return $expected === $actual ? null : "$path: expected " . var_export($expected, true) . ', got ' . var_export($actual, true);
}

$layerCases = json_decode((string) file_get_contents(__DIR__ . '/layer-cases.json'), true)['cases'];
foreach ($layerCases as $case) {
    test('layers: ' . $case['name'], function () use ($case) {
        $answer = json_decode(json_encode(Mix\planLayersFor($case['request']), JSON_THROW_ON_ERROR), true);
        $difference = layerDifference($case['answer'], $answer);
        check($difference === null, (string) $difference);
    });
}
