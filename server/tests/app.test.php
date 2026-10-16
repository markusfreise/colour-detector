<?php
// The app itself (api/app/) and the mixing service (api/mix/): only for signed-in accounts that
// agreed to the terms, or for anyone on an open development instance.

declare(strict_types=1);

require_once dirname(__DIR__) . '/mix/api.php';

/** Plays a request: method, the session of $user (null: signed out) and the JSON body. */
function play(string $method, ?array $user, array $body = []): void
{
    $_SERVER['REQUEST_METHOD'] = $method;
    $GLOBALS['testBody'] = $body;
    unset($_COOKIE[SESSION_COOKIE]);
    if ($user !== null) {
        $value = token();
        run('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)', [hash('sha256', $value), $user['id'], time() + 3600]);
        $_COOKIE[SESSION_COOKIE] = $value;
    }
}

function agreed(string $email): array
{
    $user = userByEmail($email);
    run('UPDATE users SET consent_version = ? WHERE id = ?', [config('consent_version'), $user['id']]);
    return row('SELECT * FROM users WHERE id = ?', [$user['id']]);
}

function appFile(): string
{
    $dir = dirname(__DIR__, 2) . '/dist/api/app';
    $files = is_dir($dir) ? glob($dir . '/*.js') : [];
    return $files ? basename($files[0]) : '';
}

const MIX_REQUEST = ['paints' => [['id' => 'y', 'hex' => '#fae409'], ['id' => 'c', 'hex' => '#1392cf']], 'jobs' => [['hex' => '#5a9a40', 'maxPaints' => 2, 'limit' => 1]]];

test('app: signed out, neither the app nor the mixing service answers', function () {
    play('GET', null);
    same(401, answerOf(fn () => sendAppFile('App-x.js'))[0]);
    play('POST', null, MIX_REQUEST);
    same(401, answerOf(fn () => handleMix('recipes'))[0]);
});

test('app: an account that has not agreed yet is asked to agree first', function () {
    play('POST', userByEmail('new@example.org'), MIX_REQUEST);
    same(403, answerOf(fn () => handleMix('recipes'))[0]);
});

test('app: a signed-in account gets the files of the app and recipes', function () {
    $user = agreed('painter@example.org');
    if (appFile() !== '') {
        play('GET', $user);
        same([200, ['file' => appFile()]], answerOf(fn () => sendAppFile(appFile())));
    }
    play('GET', $user);
    same(404, answerOf(fn () => sendAppFile('../config.php'))[0]);
    play('POST', $user, MIX_REQUEST);
    [$status, $data] = answerOf(fn () => handleMix('recipes'));
    same(200, $status);
    same('c', $data['results'][0][0]['paints'][0]['paintId']);
});

test('app: monochrome and the colour charts come with a plan', function () {
    $free = agreed('free@example.org');
    play('POST', $free, ['jobs' => [['hex' => '#808080', 'maxPaints' => 2, 'limit' => 1, 'values' => true]]] + MIX_REQUEST);
    same(403, answerOf(fn () => handleMix('recipes'))[0]);
    play('GET', $free);
    same(403, answerOf(fn () => handleCharts())[0]);
    run('UPDATE users SET lifetime = 1 WHERE id = ?', [$free['id']]);
    play('GET', $free);
    [$status, $data] = answerOf(fn () => handleCharts());
    same(200, $status);
    check(count($data['charts']['horadam']) > 100, 'the Horadam chart');
});

test('app: an open instance lets anyone in, and a request of absurd size is refused', function () {
    $GLOBALS['accountConfig']['open'] = true;
    play('POST', null, MIX_REQUEST);
    same(200, answerOf(fn () => handleMix('recipes'))[0]);
    play('POST', null, ['paints' => array_fill(0, 500, ['id' => 'x', 'hex' => '#000000']), 'jobs' => []]);
    same(413, answerOf(fn () => handleMix('recipes'))[0]);
    play('POST', null, MIX_REQUEST);
    same(404, answerOf(fn () => handleMix('nothing'))[0]);
});
