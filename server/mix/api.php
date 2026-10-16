<?php
/**
 * The mixing service under <app>/api/mix/ and the colour charts under <app>/api/charts.
 *
 * The browser analyses the picture and sends what the picture's colours are (hex, OKLab) and how
 * much of the picture each covers, with the paints (id, hex). The picture itself never comes here.
 * Back go recipes, mixes and the plan of the layers. src/lib/mixService.js is the reference.
 */

declare(strict_types=1);

// The most a request may ask for: a picture has at most 48 mixes of 24 washes, a paint box a few
// hundred paints, and layer mode sends the colours of the picture (some thousands).
const MIX_LIMITS = ['paints' => 400, 'clusters' => 1200, 'targets' => 1200, 'jobs' => 200, 'colours' => 30000, 'pairs' => 200000];
// Answers are kept this long, so that the same question (back to a setting, the same picture
// opened again) is answered at once.
const MIX_CACHE_DAYS = 7;

/**
 * Who may use the service: an account that is signed in and has agreed to the terms. On a
 * development instance without accounts (`open` in config.php) anyone, as the app opens there
 * without signing in.
 */
function mixUser(): ?array
{
    if (config('open') === true) {
        return null;
    }
    $user = requireUser();
    if ($user['consent_version'] !== config('consent_version')) {
        fail(403, 'Please agree to the terms first.');
    }
    return $user;
}

/** Whether the account may use a studio feature; everyone may on an open instance. */
function mixMayUse(?array $user, string $feature): bool
{
    return $user === null ? config('open') === true : entitled(planOf($user), $feature, false);
}

function handleMix(string $name): never
{
    method('POST');
    $routes = ['propose' => 'Mix\propose', 'plan' => 'Mix\plan', 'recipes' => 'Mix\recipes', 'layers' => 'Mix\planLayersFor'];
    if (!isset($routes[$name])) {
        fail(404, 'Not found.');
    }
    $user = mixUser();
    $request = body();
    checkMixRequest($request);
    // Monochrome (value mode) comes with a plan.
    $values = !empty($request['values']) || in_array(true, array_map(fn ($job) => !empty($job['values']), (array) ($request['jobs'] ?? [])), true);
    if ($values && !mixMayUse($user, 'monochrome')) {
        fail(403, 'Monochrome comes with Pro.');
    }

    ini_set('serialize_precision', '-1');
    $key = hash('sha256', $name . ' ' . json_encode($request));
    $cached = readMixCache($key);
    if ($cached !== null) {
        sendJsonText($cached);
    }
    require_once __DIR__ . '/service.php';
    require_once __DIR__ . '/layers.php';
    set_time_limit(120);
    $answer = json_encode($routes[$name]($request), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    writeMixCache($key, $answer);
    sendJsonText($answer);
}

/** A request of the size the app sends, with paints as id and colour. */
function checkMixRequest(array $request): void
{
    $count = fn (string $field) => is_array($request[$field] ?? null) ? count($request[$field]) : 0;
    foreach (['paints', 'clusters', 'targets', 'jobs'] as $field) {
        if ($count($field) > MIX_LIMITS[$field]) {
            fail(413, 'The request is too large.');
        }
    }
    if (count((array) ($request['colours']['counts'] ?? [])) > MIX_LIMITS['colours'] || count((array) ($request['left']['pairs'] ?? [])) > MIX_LIMITS['pairs'] * 3) {
        fail(413, 'The request is too large.');
    }
    foreach ((array) ($request['paints'] ?? []) as $paint) {
        if (!is_array($paint) || !is_string($paint['id'] ?? null) || !preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($paint['hex'] ?? ''))) {
            fail(422, 'A paint needs an id and a colour.');
        }
    }
}

function mixCacheDir(): string
{
    return (string) (config('mix_cache') ?: sys_get_temp_dir() . '/watercolourlove-mix');
}

function readMixCache(string $key): ?string
{
    $file = mixCacheDir() . '/' . $key . '.json';
    return is_file($file) && filemtime($file) > time() - MIX_CACHE_DAYS * 86400 ? (file_get_contents($file) ?: null) : null;
}

function writeMixCache(string $key, string $answer): void
{
    $dir = mixCacheDir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return;
    }
    @file_put_contents($dir . '/' . $key . '.json', $answer, LOCK_EX);
    // Now and then the old answers go.
    if (random_int(1, 200) === 1) {
        foreach (glob($dir . '/*.json') ?: [] as $file) {
            if (filemtime($file) < time() - MIX_CACHE_DAYS * 86400) {
                @unlink($file);
            }
        }
    }
}

function sendJsonText(string $json): never
{
    if (defined('ACCOUNT_TESTS')) {
        throw new Answer(json_decode($json, true), 200);
    }
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (!ini_get('zlib.output_compression') && str_contains($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip')) {
        ob_start('ob_gzhandler');
    }
    echo $json;
    exit;
}

/** The colour charts of the paint series that come with the app: for Pro, to add colours from. */
function handleCharts(): never
{
    method('GET');
    if (!mixMayUse(mixUser(), 'brand_charts')) {
        fail(403, 'Colour charts come with Pro.');
    }
    sendJsonText((string) file_get_contents(__DIR__ . '/charts.json'));
}
