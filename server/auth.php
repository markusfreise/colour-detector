<?php
/**
 * Signing in: a link by e-mail, or Google, Meta (Facebook) and Apple.
 * All of them end in the same place: an e-mail address that is known to belong to the visitor.
 */

declare(strict_types=1);

const OAUTH = [
    'google' => [
        'authorize' => 'https://accounts.google.com/o/oauth2/v2/auth',
        'token' => 'https://oauth2.googleapis.com/token',
        'scope' => 'openid email',
        'issuer' => ['https://accounts.google.com', 'accounts.google.com'],
    ],
    'meta' => [
        'authorize' => 'https://www.facebook.com/v21.0/dialog/oauth',
        'token' => 'https://graph.facebook.com/v21.0/oauth/access_token',
        'scope' => 'email',
    ],
    'apple' => [
        'authorize' => 'https://appleid.apple.com/auth/authorize',
        'token' => 'https://appleid.apple.com/auth/token',
        'scope' => 'email',
        'issuer' => ['https://appleid.apple.com'],
    ],
];

// --- Link by e-mail ---------------------------------------------------------------------------

/**
 * Test accounts for a local run, or null. Only when config.php has 'local_test', the app runs on
 * localhost or *.test and the request comes from this machine: never on a server.
 */
function localTest(): ?array
{
    $test = config('local_test');
    $host = (string) parse_url((string) config('app_url'), PHP_URL_HOST);
    $local = preg_match('/^(localhost|127\.0\.0\.1)$|\.(localhost|test)$/', $host) === 1
        && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    return is_array($test) && $local ? $test : null;
}

/** Signs a test account in at once, as paid or free, with the current consent. */
function testSignIn(string $email, string $kind): never
{
    $user = userByEmail($email);
    run(
        'UPDATE users SET consent_version = ?, consent_at = ?, lifetime = ?, sub_id = NULL, sub_status = NULL, sub_until = NULL WHERE id = ?',
        [config('consent_version'), time(), $kind === 'paid' ? 1 : 0, $user['id']],
    );
    startSession((int) $user['id']);
    send(['signedIn' => true]);
}

function tooMany(string $who, int $limit): bool
{
    $key = hash_hmac('sha256', $who, (string) config('secret'));
    run('DELETE FROM attempts WHERE at < ?', [time() - 3600]);
    $count = (int) run('SELECT COUNT(*) FROM attempts WHERE who = ?', [$key])->fetchColumn();
    if ($count >= $limit) {
        return true;
    }
    run('INSERT INTO attempts (who, at) VALUES (?, ?)', [$key, time()]);
    return false;
}

function sendMagicLink(): never
{
    method('POST');
    $email = strtolower(trim((string) (body()['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
        fail(422, 'That does not look like an e-mail address.');
    }
    $test = localTest();
    if (isset($test['accounts'][$email])) {
        testSignIn($email, (string) $test['accounts'][$email]);
    }
    if (tooMany('ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), MAGIC_PER_IP) || tooMany('mail:' . $email, MAGIC_PER_EMAIL)) {
        fail(429, 'Too many links were asked for. Please try again in an hour.');
    }
    $value = token();
    run('DELETE FROM magic_links WHERE expires_at < ?', [time()]);
    run('INSERT INTO magic_links (hash, email, expires_at) VALUES (?, ?, ?)', [hash('sha256', $value), $email, time() + MAGIC_MINUTES * 60]);

    // The link opens the app, which hands the code over itself: a mail scanner that only
    // fetches the link does not use it up.
    // In a local test the app only asks for an account with "?login" in the address.
    $link = config('app_url') . ($test === null ? '' : '?login') . '#magic=' . $value;
    if ($test !== null) {
        send(['sent' => true, 'link' => $link]);
    }
    $text = "Open this link to sign in to Watercolourlove:\n\n$link\n\n"
        . 'It works once and for ' . MAGIC_MINUTES . " minutes. If you did not ask for it, ignore this message.\n";
    $mail = config('mail') ?? [];
    $transport = $mail['transport'] ?? 'mail';
    if ($transport === 'mail') {
        $headers = 'From: ' . ($mail['from'] ?? '') . "\r\nContent-Type: text/plain; charset=utf-8";
        mail($email, 'Your sign-in link for Watercolourlove', $text, $headers);
    } else {
        file_put_contents($transport, "To: $email\n$text\n", FILE_APPEND | LOCK_EX);
    }
    // The same answer whether or not the address has an account.
    send(['sent' => true]);
}

function verifyMagicLink(): never
{
    method('POST');
    $value = (string) (body()['token'] ?? '');
    $hash = hash('sha256', $value);
    $link = row('SELECT * FROM magic_links WHERE hash = ? AND expires_at > ?', [$hash, time()]);
    if (!$link) {
        fail(410, 'This link has expired or was already used. Please ask for a new one.');
    }
    run('DELETE FROM magic_links WHERE hash = ?', [$hash]);
    startSession((int) userByEmail($link['email'])['id']);
    send(['ok' => true]);
}

// --- Google, Meta, Apple ----------------------------------------------------------------------

function providerSettings(string $provider): array
{
    if (!in_array($provider, enabledProviders(), true) || !isset(OAUTH[$provider])) {
        fail(404, 'This way of signing in is not available.');
    }
    return config($provider);
}

/** Apple wants a signed statement in place of a client secret. */
function appleSecret(array $settings): string
{
    $header = base64url(json_encode(['alg' => 'ES256', 'kid' => $settings['key_id']]));
    $claims = base64url(json_encode([
        'iss' => $settings['team_id'],
        'iat' => time(),
        'exp' => time() + 300,
        'aud' => 'https://appleid.apple.com',
        'sub' => $settings['client_id'],
    ]));
    $key = openssl_pkey_get_private((string) file_get_contents($settings['key_file']));
    if (!$key || !openssl_sign("$header.$claims", $der, $key, OPENSSL_ALGO_SHA256)) {
        fail(500, 'The Apple key could not be used.');
    }
    // openssl signs in DER; a token wants the two numbers side by side, 32 bytes each.
    $offset = 3 + (ord($der[1]) & 0x80 ? ord($der[1]) & 0x7f : 0);
    $numbers = [];
    for ($i = 0; $i < 2; $i++) {
        $length = ord($der[$offset]);
        $numbers[] = str_pad(ltrim(substr($der, $offset + 1, $length), "\x00"), 32, "\x00", STR_PAD_LEFT);
        $offset += 2 + $length;
    }
    return "$header.$claims." . base64url($numbers[0] . $numbers[1]);
}

function startOauth(string $provider): never
{
    method('GET');
    $settings = providerSettings($provider);
    // The state comes back with the visitor; the cookie proves it is the same browser. It must
    // also travel with Apple's answer, which is a form sent from apple.com: hence SameSite=None.
    $nonce = token();
    setcookie(STATE_COOKIE, $nonce, ['expires' => time() + 600, 'path' => cookiePath(), 'secure' => true, 'httponly' => true, 'samesite' => 'None']);
    $state = base64url(json_encode(['p' => $provider, 'n' => hash('sha256', $nonce), 't' => time()]));
    $query = [
        'client_id' => $settings['client_id'],
        'redirect_uri' => apiUrl("auth/$provider/callback"),
        'response_type' => 'code',
        'scope' => OAUTH[$provider]['scope'],
        'state' => $state . '.' . sign($state),
    ];
    if ($provider === 'apple') {
        $query['response_mode'] = 'form_post'; // Apple's rule as soon as the address is asked for
    }
    redirect(OAUTH[$provider]['authorize'] . '?' . http_build_query($query));
}

function finishOauth(string $provider): never
{
    $settings = providerSettings($provider);
    $input = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
    [$state, $signature] = array_pad(explode('.', (string) ($input['state'] ?? ''), 2), 2, '');
    $claims = json_decode(base64urlDecode($state), true) ?: [];
    $nonce = $_COOKIE[STATE_COOKIE] ?? '';
    setcookie(STATE_COOKIE, '', ['expires' => 1, 'path' => cookiePath(), 'secure' => true, 'httponly' => true, 'samesite' => 'None']);
    $valid = hash_equals(sign($state), $signature)
        && ($claims['p'] ?? '') === $provider
        && time() - (int) ($claims['t'] ?? 0) < 600
        && $nonce !== '' && hash_equals((string) ($claims['n'] ?? ''), hash('sha256', $nonce));
    if (!$valid || !isset($input['code'])) {
        backToApp('login=failed');
    }

    $answer = http('POST', OAUTH[$provider]['token'], [
        'grant_type' => 'authorization_code',
        'code' => (string) $input['code'],
        'redirect_uri' => apiUrl("auth/$provider/callback"),
        'client_id' => $settings['client_id'],
        'client_secret' => $provider === 'apple' ? appleSecret($settings) : $settings['client_secret'],
    ])['data'];

    if ($provider === 'meta') {
        $profile = http('GET', 'https://graph.facebook.com/v21.0/me', ['fields' => 'id,email', 'access_token' => (string) ($answer['access_token'] ?? '')])['data'];
        $subject = (string) ($profile['id'] ?? '');
        $email = (string) ($profile['email'] ?? '');
    } else {
        // The identity token comes straight from the provider over TLS, so its content can be
        // trusted as received; who it is for and who issued it are still checked.
        $parts = explode('.', (string) ($answer['id_token'] ?? ''));
        $identity = json_decode(base64urlDecode($parts[1] ?? ''), true) ?: [];
        $verified = filter_var($identity['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $genuine = ($identity['aud'] ?? '') === $settings['client_id'] && in_array($identity['iss'] ?? '', OAUTH[$provider]['issuer'], true);
        $subject = $genuine ? (string) ($identity['sub'] ?? '') : '';
        $email = $genuine && $verified ? (string) ($identity['email'] ?? '') : '';
    }
    if ($subject === '') {
        backToApp('login=failed');
    }

    $known = row('SELECT user_id FROM identities WHERE provider = ? AND subject = ?', [$provider, $subject]);
    if ($known) {
        $userId = (int) $known['user_id'];
    } else {
        // Without an address there is nothing to hang the account on.
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            backToApp('login=no-email');
        }
        $userId = (int) userByEmail($email)['id'];
        run('INSERT INTO identities (provider, subject, user_id) VALUES (?, ?, ?)', [$provider, $subject, $userId]);
    }
    startSession($userId);
    backToApp('login=ok');
}
