<?php
// The mixing service in PHP answers as the reference in src/lib/mixService.js: the cases come from
// server/tests/make-mix-cases.mjs. Texts and ids must be the same, numbers the same to 1e-9.
//
// One thing cannot be the same: exp, log, pow and cbrt of PHP (the C library) and of the browser
// differ in the last bit for about one number in ten. Where the model has a true tie, such as
// several mixes of three paints that all hit the colour exactly (deltaE about 1e-14), that noise
// decides their order, and which of them is still in the list at its end. And a wash with
// exactly the least water there is (fullness 0.02) is 'paper only' on one side and 'very watery'
// on the other. So recipes that tie (same deltaE to 1e-9, same number of paints) may come in
// another order, the tied ones at the end of a list may be others, and a dilution may differ
// right at its limit. The same noise moves the search for the water of a wash about on a flat
// bottom: where the deltaE agrees, its amounts may differ by 1e-5. Everything else must agree.

declare(strict_types=1);

require_once dirname(__DIR__) . '/mix/service.php';

function mixIsRecipe(mixed $value): bool
{
    return is_array($value) && isset($value['paints'], $value['dilution']) && array_key_exists('deltaE', $value);
}

function mixRecipesTie(array $a, array $b): bool
{
    return count($a['paints']) === count($b['paints']) && abs($a['deltaE'] - $b['deltaE']) <= 1e-9;
}

function mixRecipeKey(array $recipe): string
{
    $ids = array_column($recipe['paints'], 'paintId');
    sort($ids, SORT_STRING);
    return implode('+', $ids);
}

/**
 * Compares two lists of recipes, ties allowed in any order. Returns [difference or null, map]:
 * map[i] = the place in `actual` of the recipe at place i in `expected`, null for a tied one at the
 * end that `actual` does not have.
 */
function mixRecipeListDifference(array $expected, array $actual, string $path): array
{
    if (count($expected) !== count($actual)) {
        return ["$path: expected " . count($expected) . ' recipes, got ' . count($actual), []];
    }
    $n = count($expected);
    $map = [];
    for ($start = 0; $start < $n; $start = $end) {
        $end = $start + 1;
        while ($end < $n && mixRecipesTie($expected[$start], $expected[$end])) {
            $end++;
        }
        for ($i = $start; $i < $end; $i++) {
            if (!mixRecipesTie($expected[$start], $actual[$i])) {
                return ["$path.$i: expected deltaE {$expected[$i]['deltaE']} with " . count($expected[$i]['paints']) . " paints, got {$actual[$i]['deltaE']} with " . count($actual[$i]['paints']), []];
            }
        }
        $places = [];
        for ($i = $start; $i < $end; $i++) {
            $places[mixRecipeKey($actual[$i])] = $i;
        }
        for ($i = $start; $i < $end; $i++) {
            $key = mixRecipeKey($expected[$i]);
            if (!isset($places[$key])) {
                // Only a tie that runs to the end of the list may hold others: those it tied with
                // and that did not fit in any more.
                if ($end === $n) {
                    $map[$i] = null;
                    continue;
                }
                return ["$path.$i: expected the recipe $key", []];
            }
            $map[$i] = $places[$key];
            $difference = mixDifference($expected[$i], $actual[$places[$key]], "$path.$i");
            if ($difference !== null) {
                return [$difference, []];
            }
        }
    }
    return [null, $map];
}

/** Whether a fullness lies right at a limit between two water levels. */
function mixAtWashLimit(float $fullness): bool
{
    foreach (Mix\WASH_LIMITS as $limit) {
        if (abs($fullness - $limit) <= 1e-12) {
            return true;
        }
    }
    return false;
}

/** Where two answers part, or null when they agree. */
function mixDifference(mixed $expected, mixed $actual, string $path = ''): ?string
{
    if (is_array($expected) && array_is_list($expected) && $expected && mixIsRecipe($expected[0]) && is_array($actual)) {
        return mixRecipeListDifference($expected, $actual, $path)[0];
    }
    if (is_array($expected) && isset($expected['recipes'], $expected['items']) && is_array($actual) && isset($actual['recipes'], $actual['items'])) {
        // A mix: its washes follow its recipes, in the order of the recipes.
        [$difference, $map] = mixRecipeListDifference($expected['recipes'], $actual['recipes'], "$path.recipes");
        if ($difference !== null) {
            return $difference;
        }
        $expected['items'] = array_map(fn (array $item) => ['washes' => array_values(array_filter(
            $item['washes'], fn ($wash, $i) => $map[$i] !== null, ARRAY_FILTER_USE_BOTH)), 'rest' => array_diff_key($item, ['washes' => 1])], $expected['items']);
        $actual['items'] = array_map(fn (array $item) => ['washes' => array_values(array_map(
            fn ($i) => $item['washes'][$i], array_filter($map, fn ($i) => $i !== null))), 'rest' => array_diff_key($item, ['washes' => 1])], $actual['items']);
        unset($expected['recipes'], $actual['recipes']);
        foreach ($expected['items'] as $i => $item) {
            if (!isset($actual['items'][$i])) {
                return "$path.items.$i: missing";
            }
            $difference = mixDifference($item['rest'], $actual['items'][$i]['rest'], "$path.items.$i");
            foreach ($item['washes'] as $w => $wash) {
                $difference ??= mixDifference($wash, $actual['items'][$i]['washes'][$w], "$path.items.$i.washes.$w");
            }
            if ($difference !== null) {
                return $difference;
            }
        }
        unset($expected['items'], $actual['items']);
    }
    if (mixIsRecipe($expected) && mixIsRecipe($actual)) {
        if ($expected['dilution'] !== $actual['dilution'] && mixAtWashLimit((float) $expected['fullness'])) {
            $actual['dilution'] = $expected['dilution'];
        }
        $close = fn ($a, $b) => abs($a - $b) <= 1e-5 * max(1.0, abs($a), abs($b));
        if (abs($expected['deltaE'] - $actual['deltaE']) <= 1e-9 && count($expected['paints']) === count($actual['paints'])) {
            foreach (['strength', 'fullness'] as $field) {
                if ($close($expected[$field], $actual[$field])) {
                    $actual[$field] = $expected[$field];
                }
            }
            foreach ($expected['paints'] as $i => $paint) {
                foreach (['amount', 'share'] as $field) {
                    if (isset($actual['paints'][$i][$field]) && $close($paint[$field], $actual['paints'][$i][$field])) {
                        $actual['paints'][$i][$field] = $paint[$field];
                    }
                }
            }
        }
    }
    if ((is_int($expected) || is_float($expected)) && (is_int($actual) || is_float($actual))) {
        $scale = max(1.0, abs((float) $expected), abs((float) $actual));
        return abs($expected - $actual) <= 1e-9 * $scale ? null : "$path: expected $expected, got $actual";
    }
    if (is_array($expected) && is_array($actual)) {
        if (array_is_list($expected) !== array_is_list($actual) && $expected && $actual) {
            return "$path: list and object";
        }
        if (count($expected) !== count($actual)) {
            return "$path: expected " . count($expected) . ' entries, got ' . count($actual);
        }
        foreach ($expected as $key => $value) {
            if (!array_key_exists($key, $actual)) {
                return "$path.$key: missing";
            }
            $difference = mixDifference($value, $actual[$key], "$path.$key");
            if ($difference !== null) {
                return $difference;
            }
        }
        return null;
    }
    return $expected === $actual ? null : "$path: expected " . var_export($expected, true) . ', got ' . var_export($actual, true);
}

$mixCases = json_decode((string) file_get_contents(__DIR__ . '/mix-cases.json'), true, 512, JSON_THROW_ON_ERROR)['cases'];
foreach ($mixCases as $n => $case) {
    test("mix: {$case['route']} case $n answers as the reference", function () use ($case) {
        $answer = ('Mix\\' . $case['route'])($case['request']);
        // Through JSON, as the app gets it.
        $answer = json_decode(json_encode($answer, JSON_THROW_ON_ERROR), true);
        $difference = mixDifference($case['answer'], $answer);
        check($difference === null, (string) $difference);
    });
}
