<?php
/**
 * The mixing service: what api/mix/ answers. Port of src/lib/mixService.js, where the requests
 * and answers are described. The picture never comes here: the browser sends colours, how much
 * of the picture each covers, and the paints (id, hex).
 */

declare(strict_types=1);

namespace Mix;

require_once __DIR__ . '/mixes.php';

/** @return array<string, array{id: string, hex: string}> */
function byIdOf(array $paints): array
{
    $byId = [];
    foreach ($paints as $p) {
        $byId[$p['id']] = $p;
    }
    return $byId;
}

/** Auto: the paints that suit the colours of a picture. */
function propose(array $request): array
{
    return ['paintIds' => proposePaints($request['targets'], $request['paints'], (int) ($request['maxPaints'] ?? 3), 2, !empty($request['values']))];
}

/**
 * The mixes of a picture: the colours the analysis found (clusters), joined into `wanted` mixes,
 * every mix with its recipes and its washes, one per water level.
 */
function plan(array $request): array
{
    $clusters = $request['clusters'];
    $paints = $request['paints'];
    $maxPaints = (int) ($request['maxPaints'] ?? 3);
    $values = !empty($request['values']);
    $byId = byIdOf($paints);
    $washOf = fn (array $recipe, string $hex) => $recipe['paints'] ? washRecipe($recipe, $hex, $byId, $values) : $recipe;
    // Value mode with paints that do not get as dark as the picture (a yellow alone): the values
    // of the picture are spread over what the paints reach, from blank paper for the lightest to
    // the darkest paint for the darkest. Paints that reach the darks leave the values alone.
    $colours = $clusters;
    if ($values && $paints) {
        $used = [];
        foreach ($clusters as $c) {
            if ($c['pixelCount']) {
                $used[] = hexToOklab($c['hex'])[0];
            }
        }
        $light = $used ? max($used) : -INF;
        $dark = $used ? min($used) : INF;
        $reach = valueReach($paints, $maxPaints);
        if ($reach > $dark && $light > $dark) {
            foreach ($clusters as $i => $c) {
                $L = hexToOklab($c['hex'])[0];
                $colours[$i]['hex'] = oklabToHex([1 - (($light - $L) * (1 - $reach)) / ($light - $dark), 0, 0]);
            }
        }
    }
    $groups = planMixes($colours, $paints, $maxPaints, (float) ($request['wanted'] ?? INF), (float) ($request['variety'] ?? 5), $values);
    $mixes = [];
    foreach ($groups as $mix) {
        $recipes = $mix['recipes'];
        $items = array_map(fn (array $c) => ['clusters' => [$c['index']], 'pixels' => $c['pixelCount'], 'lab' => hexToOklab($c['hex'])], $mix['clusters']);
        // Merge washes until every water level of the mix occurs once.
        for (;;) {
            $levels = [];
            $merged = [];
            foreach ($items as $item) {
                $item['hex'] = oklabToHex($item['lab']);
                // A value study is painted in finer steps of water.
                $item['letter'] = $recipes ? washLetter($washOf($recipes[0], $item['hex'])['fullness'], $values) : '';
                $key = 'l' . $item['letter'];
                if (isset($levels[$key])) {
                    $same = &$merged[$levels[$key]];
                    $n = $same['pixels'] + $item['pixels'];
                    foreach ($same['lab'] as $j => $v) {
                        $same['lab'][$j] = ($v * $same['pixels'] + $item['lab'][$j] * $item['pixels']) / $n;
                    }
                    $same['pixels'] = $n;
                    array_push($same['clusters'], ...$item['clusters']);
                    unset($same);
                } else {
                    $levels[$key] = count($merged);
                    $merged[] = $item;
                }
            }
            $done = count($merged) === count($items);
            $items = $merged;
            if ($done) {
                break;
            }
        }
        $mixes[] = [
            'group' => $mix['group'],
            'recipes' => $recipes,
            'items' => array_map(fn (array $item) => [
                'clusters' => $item['clusters'],
                'pixels' => $item['pixels'],
                'hex' => $item['hex'],
                'letter' => $item['letter'],
                'washes' => array_map(fn (array $r) => $washOf($r, $item['hex']), $recipes),
            ], $items),
        ];
    }
    return ['mixes' => $mixes];
}

/**
 * Recipes for single colours, several at once. A job with `wash`: the given recipes with as much
 * water as comes closest to `hex`; otherwise the best recipes for `hex` from the paints (`only`:
 * from these of them).
 */
function recipes(array $request): array
{
    $paints = $request['paints'];
    $byId = byIdOf($paints);
    $results = [];
    foreach ($request['jobs'] as $job) {
        $values = !empty($job['values']);
        if (isset($job['wash'])) {
            $results[] = array_map(fn (array $r) => $r['paints'] ? washRecipe($r, $job['hex'], $byId, $values) : $r, $job['wash']);
            continue;
        }
        $pool = $paints;
        if (isset($job['only'])) {
            $pool = [];
            foreach ($job['only'] as $id) {
                if (isset($byId[$id])) {
                    $pool[] = $byId[$id];
                }
            }
        }
        $results[] = findRecipes($job['hex'], $pool, (int) ($job['maxPaints'] ?? 3), (int) ($job['limit'] ?? 5), $values);
    }
    return ['results' => $results];
}
