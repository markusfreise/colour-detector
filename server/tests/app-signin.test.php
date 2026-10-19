<?php
// Signing in from the native app: bearer sessions, the handoff from the browser, Sign in with Apple
// in the app, and taking Apple's sign-in back when the account is deleted.

declare(strict_types=1);

require_once dirname(__DIR__) . '/auth.php';

/** A request as the app sends it: a JSON body, the session as a bearer token. */
function appRequest(string $method, array $body = [], string $token = ''): void
{
    $_SERVER['REQUEST_METHOD'] = $method;
    $_SERVER['CONTENT_TYPE'] = 'application/json';
    unset($_SERVER['HTTP_ORIGIN']);
    $_COOKIE = [];
    $GLOBALS['requestBody'] = $body;
    if ($token !== '') {
        $_SERVER['HTTP_AUTHORIZATION'] = "Bearer $token";
    } else {
        unset($_SERVER['HTTP_AUTHORIZATION']);
    }
}

/** An identity token as Google or Apple send it; only its middle part is read. */
function idToken(array $claims): string
{
    return 'header.' . base64url(json_encode($claims)) . '.signature';
}

/** Apple configured with a real key, for the app and for the web. */
function withApple(): void
{
    $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    openssl_pkey_export($key, $pem);
    $file = tempnam(sys_get_temp_dir(), 'wcl-key-');
    file_put_contents($file, $pem);
    register_shutdown_function(fn () => @unlink($file));
    freshDatabase(['apple' => ['client_id' => 'de.example.web', 'app_id' => 'de.example.app', 'team_id' => 'TEAM', 'key_id' => 'KEY', 'key_file' => $file]]);
}

function challengeOf(string $verifier): string
{
    return base64url(hash('sha256', $verifier, true));
}

test('app sign-in: a bearer token is a session, anything else is not', function () {
    $user = userByEmail('painter@example.org');
    $token = newSession((int) $user['id']);
    appRequest('GET', [], $token);
    same('painter@example.org', currentUser()['email'] ?? null);
    appRequest('GET', [], str_repeat('0', 64));
    same(null, currentUser());
    $_SERVER['HTTP_AUTHORIZATION'] = "Token $token";
    same(null, currentUser());
});

test('app sign-in: signing out ends the bearer session', function () {
    $token = newSession((int) userByEmail('painter@example.org')['id']);
    appRequest('POST', [], $token);
    @endSession();
    same(null, currentUser());
});

test('app sign-in: the handoff gives a session once, and only for the right verifier', function () {
    $user = userByEmail('painter@example.org');
    $code = token();
    run('INSERT INTO app_handoffs (hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)', [hash('sha256', $code), $user['id'], challengeOf('the-secret'), time() + 300]);

    appRequest('POST', ['code' => $code, 'verifier' => 'another-secret']);
    same(401, answerOf(fn () => exchangeHandoff())[0], 'wrong verifier');

    appRequest('POST', ['code' => $code, 'verifier' => 'the-secret']);
    [$status, $data] = answerOf(fn () => exchangeHandoff());
    same(200, $status);
    same('painter@example.org', $data['user']['email']);
    appRequest('GET', [], $data['token']);
    same((int) $user['id'], (int) currentUser()['id']);

    appRequest('POST', ['code' => $code, 'verifier' => 'the-secret']);
    same(401, answerOf(fn () => exchangeHandoff())[0], 'second time');
});

test('app sign-in: an expired handoff is refused', function () {
    $user = userByEmail('painter@example.org');
    $code = token();
    run('INSERT INTO app_handoffs (hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)', [hash('sha256', $code), $user['id'], challengeOf('s'), time() - 1]);
    appRequest('POST', ['code' => $code, 'verifier' => 's']);
    same(401, answerOf(fn () => exchangeHandoff())[0]);
});

test('app sign-in: the web flow started by the app returns to the app with a handoff', function () {
    freshDatabase(['google' => ['client_id' => 'google-client', 'client_secret' => 'google-secret']]);
    $nonce = 'nonce';
    $state = base64url(json_encode(['p' => 'google', 'n' => hash('sha256', $nonce), 't' => time(), 'a' => challengeOf('v')]));
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_GET = ['state' => $state . '.' . sign($state), 'code' => 'google-code'];
    $_COOKIE = [STATE_COOKIE => $nonce];
    $GLOBALS['httpStub'] = fn () => ['status' => 200, 'data' => ['id_token' => idToken(['aud' => 'google-client', 'iss' => 'https://accounts.google.com', 'sub' => 'g-1', 'email' => 'Painter@Example.org', 'email_verified' => true])]];
    [$status, $data] = answerOf(fn () => @finishOauth('google'));
    unset($GLOBALS['httpStub']);
    same(302, $status);
    check(preg_match('#^de\.markusfreise\.watercolourlove://signed-in\?code=([0-9a-f]{64})$#', $data['location'], $match) === 1, 'way back: ' . $data['location']);

    appRequest('POST', ['code' => $match[1], 'verifier' => 'v']);
    [$status, $data] = answerOf(fn () => exchangeHandoff());
    same(200, $status);
    same('painter@example.org', $data['user']['email']);
});

test('app sign-in: a state without the cookie goes back to the app with an error, a forged one to the web', function () {
    freshDatabase(['google' => ['client_id' => 'google-client', 'client_secret' => 'google-secret']]);
    $state = base64url(json_encode(['p' => 'google', 'n' => hash('sha256', 'nonce'), 't' => time(), 'a' => challengeOf('v')]));
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_COOKIE = [];
    $_GET = ['state' => $state . '.' . sign($state), 'code' => 'c'];
    same('de.markusfreise.watercolourlove://signed-in?error=failed', answerOf(fn () => @finishOauth('google'))[1]['location']);
    $_GET = ['state' => $state . '.forged', 'code' => 'c'];
    same('https://app.example/#login=failed', answerOf(fn () => @finishOauth('google'))[1]['location']);
});

test('app sign-in: Apple in the app redeems the code for the bundle ID and keeps the refresh token', function () {
    withApple();
    $asked = [];
    $GLOBALS['httpStub'] = function (string $method, string $url, array $fields) use (&$asked) {
        $asked = $fields;
        return ['status' => 200, 'data' => ['refresh_token' => 'r-1', 'id_token' => idToken(['aud' => 'de.example.app', 'iss' => 'https://appleid.apple.com', 'sub' => 'a-1', 'email' => 'x@privaterelay.appleid.com', 'email_verified' => 'true'])]];
    };
    appRequest('POST', ['code' => 'apple-code']);
    [$status, $data] = answerOf(fn () => signInAppleNative());
    unset($GLOBALS['httpStub']);
    same(200, $status);
    same('x@privaterelay.appleid.com', $data['user']['email']);
    same('de.example.app', $asked['client_id']);
    same('apple-code', $asked['code']);
    $claims = json_decode(base64urlDecode(explode('.', $asked['client_secret'])[1]), true);
    same('de.example.app', $claims['sub'], 'secret made for the app');
    $identity = row("SELECT * FROM identities WHERE provider = 'apple'");
    same('r-1', $identity['revoke_token']);
    same('de.example.app', $identity['revoke_client']);
});

test('app sign-in: an Apple token for another client is refused', function () {
    withApple();
    $GLOBALS['httpStub'] = fn () => ['status' => 200, 'data' => ['id_token' => idToken(['aud' => 'de.example.web', 'iss' => 'https://appleid.apple.com', 'sub' => 'a-1', 'email' => 'x@example.org', 'email_verified' => true])]];
    appRequest('POST', ['code' => 'apple-code']);
    same(401, answerOf(fn () => signInAppleNative())[0]);
    unset($GLOBALS['httpStub']);
});

test('app sign-in: Apple in the app is offered only with a bundle ID and a usable key', function () {
    same([], appProviders());
    withApple();
    same(['apple'], appProviders());
    same(['magic', 'apple'], enabledProviders());
    $GLOBALS['accountConfig']['apple']['key_file'] = '/nowhere';
    same([], appProviders());
});

test('app sign-in: deleting the account takes back the Apple sign-in for the client that got it', function () {
    withApple();
    $user = userByEmail('painter@example.org');
    run('INSERT INTO identities (provider, subject, user_id, revoke_token, revoke_client) VALUES (?, ?, ?, ?, ?)', ['apple', 'a-1', $user['id'], 'r-1', 'de.example.web']);
    $calls = [];
    $GLOBALS['httpStub'] = function (string $method, string $url, array $fields) use (&$calls) {
        $calls[] = [$url, $fields];
        return ['status' => 200, 'data' => []];
    };
    revokeAppleSignIns($user);
    unset($GLOBALS['httpStub']);
    same(1, count($calls));
    same('https://appleid.apple.com/auth/revoke', $calls[0][0]);
    same('r-1', $calls[0][1]['token']);
    same('de.example.web', $calls[0][1]['client_id']);
});
