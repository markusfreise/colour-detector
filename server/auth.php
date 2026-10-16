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
 * The sign-in mail as subject, plain text and HTML, in English or German ($lang as the app sent
 * it). A full letter with sender and reason reads less like spam to filters and people than a
 * bare link.
 * @return array{0: string, 1: string, 2: string}
 */
function signInMail(string $link, string $lang = 'en'): array
{
    $minutes = MAGIC_MINUTES;
    $host = (string) parse_url((string) config('app_url'), PHP_URL_HOST);
    $w = $lang === 'de' ? [
        'lang' => 'de',
        'subject' => 'Dein Anmeldelink für Watercolourlove',
        'hello' => 'Hallo,',
        'intro' => 'hier ist dein Link, um dich bei Watercolourlove anzumelden',
        'open' => "Öffne ihn auf dem Gerät und in dem Browser, in dem du ihn angefordert hast. Er gilt einmal und $minutes Minuten lang.",
        'why' => "Warum du diese Nachricht bekommst: Jemand hat diese E-Mail-Adresse eingegeben, um sich bei $host anzumelden. Wenn du das nicht warst, kannst du diese Nachricht ignorieren. Ohne den Link kann sich niemand mit deiner Adresse anmelden.",
        'about' => 'Watercolourlove findet die Hauptfarben eines Fotos und zeigt, wie du jede davon aus deinen eigenen Aquarellfarben mischst. Deine Bilder bleiben in deinem Browser und werden nie hochgeladen.',
        'questions' => 'Fragen? Antworte auf diese Nachricht oder schreib an',
        'address' => 'Markus Freise, Weststraße 48, 33615 Bielefeld, Deutschland',
        'addressHtml' => 'Markus Freise, Weststra&szlig;e 48, 33615 Bielefeld, Deutschland',
        'button' => 'Bei Watercolourlove anmelden',
        'fallback' => 'Wenn der Button nicht funktioniert, kopier diese Adresse in deinen Browser:',
    ] : [
        'lang' => 'en',
        'subject' => 'Your sign-in link for Watercolourlove',
        'hello' => 'Hello,',
        'intro' => 'here is your link to sign in to Watercolourlove',
        'open' => "Open it on the device and in the browser where you asked for it. It works once and for $minutes minutes.",
        'why' => "Why you get this message: someone entered this e-mail address to sign in at $host. If that was not you, you can ignore this message. Without the link nobody can sign in with your address.",
        'about' => 'Watercolourlove finds the main colours of a photo and shows how to mix each of them from your own watercolours. Your pictures stay in your browser and are never uploaded.',
        'questions' => 'Questions? Reply to this message or write to',
        'address' => 'Markus Freise, Weststrasse 48, 33615 Bielefeld, Germany',
        'addressHtml' => 'Markus Freise, Weststra&szlig;e 48, 33615 Bielefeld, Germany',
        'button' => 'Sign in to Watercolourlove',
        'fallback' => 'If the button does not work, copy this address into your browser:',
    ];
    $text = <<<TEXT
        {$w['hello']}

        {$w['intro']}:

        $link

        {$w['open']}

        {$w['why']}

        {$w['about']}

        {$w['questions']} support@markus-freise.de.

        --
        Watercolourlove
        {$w['address']}
        https://$host/
        TEXT;
    $h = array_map(fn (string $s) => htmlspecialchars($s, ENT_QUOTES), $w);
    $url = htmlspecialchars($link, ENT_QUOTES);
    $home = htmlspecialchars("https://$host/", ENT_QUOTES);
    $hostHtml = htmlspecialchars($host, ENT_QUOTES);
    $html = <<<HTML
        <!doctype html>
        <html lang="{$h['lang']}">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{$h['button']}</title></head>
        <body style="margin:0;padding:0;background:#f7f4ee;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;">
        <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4ddd2;border-radius:12px;">
        <tr><td style="padding:32px 32px 8px;font:600 22px/1.3 Georgia,'Times New Roman',serif;color:#2a2622;">Watercolourlove</td></tr>
        <tr><td style="padding:8px 32px 0;font:16px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2a2622;">
        <p style="margin:0 0 16px;">{$h['hello']}</p>
        <p style="margin:0 0 24px;">{$h['intro']}. {$h['open']}</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
        <a href="$url" style="display:inline-block;padding:12px 24px;background:#242424;color:#ffffff;border-radius:8px;font:600 16px/1.2 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;">{$h['button']}</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px;font:14px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6d655c;">
        <p style="margin:0 0 16px;">{$h['fallback']}<br><a href="$url" style="color:#242424;word-break:break-all;">$url</a></p>
        <p style="margin:0 0 16px;">{$h['why']}</p>
        <p style="margin:0;">{$h['about']}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;border-top:1px solid #e4ddd2;font:13px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6d655c;">
        {$h['questions']} <a href="mailto:support@markus-freise.de" style="color:#242424;">support@markus-freise.de</a>.<br>
        {$w['addressHtml']} &middot; <a href="$home" style="color:#242424;">$hostHtml</a>
        </td></tr>
        </table>
        </td></tr>
        </table>
        </body>
        </html>
        HTML;
    return [$w['subject'], $text, $html];
}

/** Sends a message as text and HTML, with the headers mail filters look for. */
function sendMail(string $to, string $subject, string $text, string $html): void
{
    $mail = config('mail') ?? [];
    $from = (string) ($mail['from'] ?? '');
    preg_match('/<([^>]+)>/', $from, $match);
    $address = $match[1] ?? $from;
    $domain = substr((string) strrchr($address, '@'), 1) ?: 'localhost';
    $boundary = 'b' . bin2hex(random_bytes(12));
    $headers = implode("\r\n", [
        "From: $from",
        "Reply-To: $address",
        'Date: ' . date(DATE_RFC2822),
        'Message-ID: <' . bin2hex(random_bytes(16)) . "@$domain>",
        'MIME-Version: 1.0',
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
        'Auto-Submitted: auto-generated',
    ]);
    $part = fn (string $type, string $body) => "--$boundary\r\nContent-Type: $type; charset=utf-8\r\n"
        . "Content-Transfer-Encoding: quoted-printable\r\n\r\n" . quoted_printable_encode(str_replace("\n", "\r\n", $body)) . "\r\n";
    $body = $part('text/plain', $text) . $part('text/html', $html) . "--$boundary--\r\n";
    $transport = $mail['transport'] ?? 'mail';
    if ($transport === 'mail') {
        // The envelope sender is the From address, so that the receiving server checks SPF against it.
        mail($to, mb_encode_mimeheader($subject, 'UTF-8'), $body, $headers, '-f' . $address);
    } else {
        file_put_contents($transport, "To: $to\nSubject: $subject\n$headers\n\n$body\n", FILE_APPEND | LOCK_EX);
    }
}

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

/** The invitation code as listed in config.php, if the code given is one and not used yet. */
function invitationCode(string $code): ?string
{
    $code = strtoupper(trim($code));
    foreach (config('invitation')['codes'] ?? [] as $valid) {
        $valid = strtoupper((string) $valid);
        if ($code !== '' && hash_equals($valid, $code)) {
            return row('SELECT code FROM invitations WHERE code = ? AND used_at IS NOT NULL', [$valid]) ? null : $valid;
        }
    }
    return null;
}

/** Signs an account in at once (local test, personal key), as paid or free, with the current consent. */
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
    // A personal key ('keys' in config.php) signs its address in at once, as paid, without a link.
    // After the rate limit, so that guessed keys and codes count as attempts.
    $key = (string) (config('keys')[$email] ?? '');
    if ($key !== '' && hash_equals(strtolower($key), strtolower(trim((string) (body()['code'] ?? ''))))) {
        testSignIn($email, 'paid');
    }
    // Anybody may sign up, as a free account. An invitation code is optional and becomes a
    // lifetime licence when the link is opened; a wrong or used one is said, not ignored.
    $code = trim((string) (body()['code'] ?? ''));
    $invited = $code === '' ? null : invitationCode($code);
    if ($code !== '' && $invited === null) {
        fail(422, 'This invitation code is not valid or was already used. Leave the field empty to sign up for free.');
    }
    if ($invited !== null) {
        run('INSERT OR REPLACE INTO invitations (code, email, asked_at) VALUES (?, ?, ?)', [$invited, $email, time()]);
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
    // The language the app is shown in; English for anything else.
    $lang = (body()['lang'] ?? '') === 'de' ? 'de' : 'en';
    sendMail($email, ...signInMail($link, $lang));
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
    $user = userByEmail($link['email']);
    // An invitation code asked for with this address: the first to use it gets a lifetime licence.
    foreach (run('SELECT code FROM invitations WHERE email = ? AND used_at IS NULL', [$link['email']])->fetchAll() as $pending) {
        if (!row('SELECT code FROM invitations WHERE code = ? AND used_at IS NOT NULL', [$pending['code']])) {
            run('UPDATE invitations SET used_at = ? WHERE code = ? AND email = ?', [time(), $pending['code'], $link['email']]);
            run('UPDATE users SET lifetime = 1 WHERE id = ?', [$user['id']]);
            break;
        }
    }
    startSession((int) $user['id']);
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
