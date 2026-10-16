<?php
/**
 * From the analysis to the mixes a painter prepares. Port of src/lib/mixes.js.
 *
 * The analysis (in the browser) sorts the picture into mixes and their washes without knowing the
 * paints, and is asked for more mixes than wanted. Here the paints come in: mixes that turn out to
 * be the same recipe are joined, and then the two mixes that are cheapest to paint as one are
 * joined again and again until the wanted number is left. Washes are used before a mix is spent:
 * what a larger mix reaches with more or less water does not keep a mix of its own.
 */

declare(strict_types=1);

namespace Mix;

require_once __DIR__ . '/mixing.php';

/**
 * @param list<array{index: int, group: int|string, hex: string, pixelCount: int}> $clusters
 * @param list<array{id: string, hex: string}> $paints
 * @param float $wanted number of mixes to end up with (INF: as many as there are)
 * @param float $variety 0..10: what decides which mixes are joined, from the error times the area
 *   it covers (0) to the error in hue alone (10)
 * @return list<array{group: int|string, anchor: array, clusters: list<array>, recipes: list<array>, pixels: int}>
 *   recipes are fitted to the largest wash the mix started with
 */
function planMixes(array $clusters, array $paints, int $maxPaints = 3, float $wanted = INF, float $variety = 5, bool $values = false): array
{
    $byId = [];
    foreach ($paints as $p) {
        $byId[$p['id']] = $p;
    }
    $white = hexToOklab('#ffffff');
    $level = min(10, max(0, $variety)) / 10;
    // A wash that comes out too light or too dark is a smaller loss than one of the wrong hue:
    // depth can be built up in layers, hue cannot. The more variety is wanted, the less it counts.
    $lightness = 1 - 0.7 * $level;

    // Every cluster gets a number of its own here: the misses are remembered per mix and cluster.
    foreach ($clusters as $i => $c) {
        $clusters[$i]['_at'] = $i;
    }
    $misses = [];
    // How far a mix stays from a colour when it is painted as a wash of that mix.
    $miss = function (int $m, array $mix, array $cluster) use (&$misses, $byId, $white, $lightness, $values): float {
        $key = $m . ':' . $cluster['_at'];
        if (isset($misses[$key])) {
            return $misses[$key];
        }
        $base = $mix['recipes'][0] ?? null;
        if (!$base) {
            return $misses[$key] = 0.0;
        }
        $target = hexToOklab($cluster['hex']);
        if ($values) {
            // Value mode: how far the value is missed, and how much water has to change for it.
            if (!$base['paints']) {
                return $misses[$key] = abs($white[0] - $target[0]) * 100;
            }
            $wash = washRecipe($base, $cluster['hex'], $byId, true);
            return $misses[$key] = $wash['deltaE'] + VALUE_WATER_PENALTY * abs(log($wash['strength']));
        }
        $reached = $base['paints'] ? hexToOklab(washRecipe($base, $cluster['hex'], $byId)['hex']) : $white;
        return $misses[$key] = deltaE([$reached[0] * $lightness, $reached[1], $reached[2]], [$target[0] * $lightness, $target[1], $target[2]]);
    };
    $pixelsOf = function (array $members): int {
        $sum = 0;
        foreach ($members as $c) {
            $sum += $c['pixelCount'];
        }
        return $sum;
    };

    // Clusters by the mix the analysis put them in, in the order they first come.
    $found = [];
    $total = 0;
    foreach ($clusters as $c) {
        if (!$c['pixelCount']) {
            continue;
        }
        $total += $c['pixelCount'];
        $group = $values ? $c['index'] : $c['group'];
        $key = groupKey($group);
        if (!isset($found[$key])) {
            $found[$key] = ['group' => $group, 'members' => []];
        }
        $found[$key]['members'][] = $c;
    }

    // The same paints in about the same ratio are the same mix, whatever the analysis called them.
    $mixKey = function (?array $recipe): string {
        if (!$recipe) {
            return '';
        }
        $parts = array_map(fn (array $p) => $p['paintId'] . ':' . (int) jsRound($p['share'] * 5), $recipe['paints']);
        sort($parts, SORT_STRING);
        return implode('+', $parts);
    };
    $pool = poolOf($paints);
    $normal = [];
    $byKey = [];
    foreach ($found as ['group' => $group, 'members' => $members]) {
        $anchor = $members[0];
        foreach ($members as $c) {
            if ($c['pixelCount'] > $anchor['pixelCount']) {
                $anchor = $c;
            }
        }
        $recipes = findRecipesIn($anchor['hex'], $pool, $maxPaints, 5, $values, $normal);
        $key = 'k' . $mixKey($recipes[0] ?? null);
        if (isset($byKey[$key])) {
            array_push($byKey[$key]['clusters'], ...$members);
            $byKey[$key]['pixels'] += $pixelsOf($members);
        } else {
            $byKey[$key] = ['group' => $group, 'anchor' => $anchor, 'clusters' => $members, 'recipes' => $recipes, 'pixels' => $pixelsOf($members)];
        }
    }
    $mixes = array_values($byKey);

    // worst[a][b] = the worst miss when the colours of mix b are painted as washes of mix a.
    $n = count($mixes);
    $worst = [];
    for ($a = 0; $a < $n; $a++) {
        for ($b = 0; $b < $n; $b++) {
            $w = 0.0;
            if ($a !== $b) {
                foreach ($mixes[$b]['clusters'] as $c) {
                    $w = max($w, $miss($a, $mixes[$a], $c));
                }
            }
            $worst[$a][$b] = $w;
        }
    }
    $alive = array_fill(0, $n, true);
    $areaPower = 1 - $level;
    $left = $n;
    while ($left > $wanted) {
        $best = null;
        for ($a = 0; $a < $n; $a++) {
            if (!$alive[$a]) {
                continue;
            }
            for ($b = 0; $b < $n; $b++) {
                if ($a === $b || !$alive[$b]) {
                    continue;
                }
                $cost = $worst[$a][$b] * ($mixes[$b]['pixels'] / $total) ** $areaPower;
                if (!$best || $cost < $best[2]) {
                    $best = [$a, $b, $cost];
                }
            }
        }
        [$a, $b] = $best;
        array_push($mixes[$a]['clusters'], ...$mixes[$b]['clusters']);
        $mixes[$a]['pixels'] += $mixes[$b]['pixels'];
        $alive[$b] = false;
        // Mix a now also holds the colours of b: as part of another mix it misses by the worse of the two.
        for ($x = 0; $x < $n; $x++) {
            if ($alive[$x] && $x !== $a) {
                $worst[$x][$a] = max($worst[$x][$a], $worst[$x][$b]);
            }
        }
        $left--;
    }
    $kept = [];
    for ($i = 0; $i < $n; $i++) {
        if ($alive[$i]) {
            $kept[] = $i;
        }
    }

    // Every colour goes to the mix that reaches it best; the colour a mix was fitted to stays.
    if (count($kept) > 1) {
        $moves = [];
        foreach ($kept as $m) {
            foreach ($mixes[$m]['clusters'] as $c) {
                if ($c['_at'] === $mixes[$m]['anchor']['_at']) {
                    continue;
                }
                $target = $m;
                $least = $miss($m, $mixes[$m], $c);
                foreach ($kept as $o) {
                    if ($o === $m) {
                        continue;
                    }
                    $value = $miss($o, $mixes[$o], $c);
                    if ($value < $least - 1) {
                        $least = $value;
                        $target = $o;
                    }
                }
                if ($target !== $m) {
                    $moves[] = [$c, $m, $target];
                }
            }
        }
        foreach ($moves as [$c, $from, $to]) {
            foreach ($mixes[$from]['clusters'] as $i => $member) {
                if ($member['_at'] === $c['_at']) {
                    array_splice($mixes[$from]['clusters'], $i, 1);
                    break;
                }
            }
            $mixes[$from]['pixels'] -= $c['pixelCount'];
            $mixes[$to]['clusters'][] = $c;
            $mixes[$to]['pixels'] += $c['pixelCount'];
        }
    }
    $out = [];
    foreach ($kept as $m) {
        $out[] = $mixes[$m];
    }
    return $out;
}

/** A group of the analysis as an array key: a number and a text of the same digits stay apart. */
function groupKey(int|string|float $group): string
{
    return (is_string($group) ? 's' : 'n') . $group;
}
