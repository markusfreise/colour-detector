<?php
/**
 * Accounts for Watercolourlove: shared helpers (configuration, database, sessions, HTTP).
 * No framework and no packages: PDO with SQLite, curl and openssl.
 */

declare(strict_types=1);

require_once __DIR__ . '/entitlements.php';
require_once __DIR__ . '/migrations.php';
require_once __DIR__ . '/ledger.php';

const SESSION_COOKIE = 'cd_session';
const STATE_COOKIE = 'cd_state';
const SESSION_DAYS = 60;
const MAGIC_MINUTES = 15;
// Voucher codes one account may try per hour.
const VOUCHER_TRIES = 10;
// Magic links per hour: for one address, and from one network address.
const MAGIC_PER_EMAIL = 5;
const MAGIC_PER_IP = 20;

function config(?string $key = null): mixed
{
    // The tests put a configuration of their own here.
    if (!isset($GLOBALS['accountConfig'])) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            fail(500, 'The account service is not configured.');
        }
        $GLOBALS['accountConfig'] = require $file;
    }
    $config = $GLOBALS['accountConfig'];
    return $key === null ? $config : ($config[$key] ?? null);
}

function db(): PDO
{
    if (isset($GLOBALS['accountDb'])) {
        return $GLOBALS['accountDb'];
    }
    $db = $GLOBALS['accountDb'] = new PDO('sqlite:' . config('database'), null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // A request that finds the database held by another one waits for it (seconds).
        PDO::ATTR_TIMEOUT => 10,
    ]);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA foreign_keys = ON');
    // No profile: an account is an address, what it agreed to and what it paid for.
    $db->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        consent_version TEXT,
        consent_at INTEGER,
        stripe_customer TEXT,
        lifetime INTEGER NOT NULL DEFAULT 0,
        sub_id TEXT,
        sub_status TEXT,
        sub_until INTEGER
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS identities (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (provider, subject)
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS magic_links (
        hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    )');
    // For the rate limit only: a keyed hash of who asked, never the address itself.
    $db->exec('CREATE TABLE IF NOT EXISTS attempts (who TEXT NOT NULL, at INTEGER NOT NULL)');
    // A voucher is a lifetime licence for one address. Only the hash of its code is kept.
    $db->exec('CREATE TABLE IF NOT EXISTS vouchers (
        hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        redeemed_at INTEGER
    )');
    // An invitation code is a lifetime licence for the first account that signs in with it:
    // 'pending' between asking for the link and opening it, 'used' after that.
    $db->exec('CREATE TABLE IF NOT EXISTS invitations (
        code TEXT NOT NULL,
        email TEXT NOT NULL,
        asked_at INTEGER NOT NULL,
        used_at INTEGER,
        PRIMARY KEY (code, email)
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
    // Everything added since: migrations.php.
    migrate($db);
    return $db;
}

function run(string $sql, array $values = []): PDOStatement
{
    $statement = db()->prepare($sql);
    $statement->execute($values);
    return $statement;
}

function row(string $sql, array $values = []): ?array
{
    $found = run($sql, $values)->fetch();
    return $found === false ? null : $found;
}

/** What send() and fail() throw under test, instead of answering and ending the script. */
final class Answer extends Exception
{
    public function __construct(public readonly array $data, public readonly int $status)
    {
        parent::__construct((string) ($data['error'] ?? 'answer'), $status);
    }
}

function send(array $data, int $status = 200): never
{
    if (defined('ACCOUNT_TESTS')) {
        throw new Answer($data, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): never
{
    send(['error' => $message], $status);
}

function redirect(string $url): never
{
    header('Location: ' . $url, true, 302);
    header('Cache-Control: no-store');
    exit;
}

/** Back to the app with a result in the fragment, which is not sent to any server. */
function backToApp(string $fragment): never
{
    redirect(config('app_url') . '#' . $fragment);
}

function apiUrl(string $path = ''): string
{
    return config('app_url') . 'api/' . $path;
}

function secure(): bool
{
    return str_starts_with((string) config('app_url'), 'https://');
}

function cookiePath(): string
{
    return parse_url((string) config('app_url'), PHP_URL_PATH) ?: '/';
}

/** The JSON body of a request that changes something. Only the app itself may send one. */
function body(): array
{
    // The tests hand in the body of the request they play.
    if (defined('ACCOUNT_TESTS') && array_key_exists('testBody', $GLOBALS)) {
        return $GLOBALS['testBody'];
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $app = parse_url((string) config('app_url'));
    $expected = ($app['scheme'] ?? '') . '://' . ($app['host'] ?? '') . (isset($app['port']) ? ':' . $app['port'] : '');
    if ($origin !== '' && $origin !== $expected) {
        fail(403, 'Request from another site.');
    }
    // A form on another site cannot send this content type without asking first.
    if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
        fail(415, 'JSON expected.');
    }
    $raw = (string) file_get_contents('php://input');
    // The mixing service gets the colours of a picture compressed (lib/mixClient.js).
    if (strtolower($_SERVER['HTTP_CONTENT_ENCODING'] ?? '') === 'gzip') {
        $raw = @gzdecode($raw, 32 * 1024 * 1024);
        if ($raw === false) {
            fail(400, 'The request could not be read.');
        }
    }
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function method(string $expected): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $expected) {
        fail(405, $expected . ' only.');
    }
}

/** A voucher code as typed: letters and digits only, upper case. */
function voucherKey(string $code): string
{
    return hash('sha256', strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? ''));
}

function token(): string
{
    return bin2hex(random_bytes(32));
}

function base64url(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function base64urlDecode(string $text): string
{
    return (string) base64_decode(strtr($text, '-_', '+/'));
}

function sign(string $text): string
{
    return base64url(hash_hmac('sha256', $text, (string) config('secret'), true));
}

/** A request to another service. Returns the decoded JSON answer and the status. */
function http(string $method, string $url, array $fields = [], array $headers = []): array
{
    $curl = curl_init();
    if ($method === 'GET' && $fields) {
        $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($fields);
    }
    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($method !== 'GET' && $fields) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($fields));
    }
    $answer = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $data = is_string($answer) ? json_decode($answer, true) : null;
    return ['status' => $status, 'data' => is_array($data) ? $data : []];
}

// --- Sessions ---------------------------------------------------------------------------------

function startSession(int $userId): void
{
    $value = token();
    run('DELETE FROM sessions WHERE expires_at < ?', [time()]);
    run('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)', [hash('sha256', $value), $userId, time() + SESSION_DAYS * 86400]);
    setcookie(SESSION_COOKIE, $value, [
        'expires' => time() + SESSION_DAYS * 86400,
        'path' => cookiePath(),
        'secure' => secure(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function endSession(): void
{
    $value = $_COOKIE[SESSION_COOKIE] ?? '';
    if ($value !== '') {
        run('DELETE FROM sessions WHERE hash = ?', [hash('sha256', $value)]);
    }
    setcookie(SESSION_COOKIE, '', ['expires' => 1, 'path' => cookiePath(), 'secure' => secure(), 'httponly' => true, 'samesite' => 'Lax']);
}

function currentUser(): ?array
{
    $value = $_COOKIE[SESSION_COOKIE] ?? '';
    if ($value === '') {
        return null;
    }
    return row(
        'SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.hash = ? AND sessions.expires_at > ?',
        [hash('sha256', $value), time()],
    );
}

function requireUser(): array
{
    return currentUser() ?? fail(401, 'Please sign in.');
}

/**
 * Who may use the app (its code, api/app/) and the mixing service (api/mix/): an account that is
 * signed in and has agreed to the terms. On a development instance without accounts (`open` in
 * config.php) anyone, as the app opens there without signing in; then there is no account (null).
 */
function appUser(): ?array
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

/**
 * A file of the app (api/app/<name>.js), for those who may use it. The build writes them to
 * dist/api/app/; the deploy puts them next to this file as bundle/, which is never served as it is.
 */
function sendAppFile(string $name): never
{
    method('GET');
    appUser();
    $dir = is_dir(__DIR__ . '/bundle') ? __DIR__ . '/bundle' : dirname(__DIR__) . '/dist/api/app';
    $file = $dir . '/' . $name;
    if (!preg_match('/^[A-Za-z0-9_.-]+\.js$/', $name) || !is_file($file)) {
        fail(404, 'Not found.');
    }
    if (defined('ACCOUNT_TESTS')) {
        throw new Answer(['file' => $name], 200);
    }
    header('Content-Type: text/javascript; charset=utf-8');
    // The names carry a hash of the content: a file never changes. Only this browser keeps it.
    header('Cache-Control: private, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}

/** The account that belongs to an address, created on first sight. */
function userByEmail(string $email): array
{
    $email = strtolower(trim($email));
    $user = row('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$user) {
        run('INSERT INTO users (email, created_at, picture_salt) VALUES (?, ?, ?)', [$email, time(), bin2hex(random_bytes(16))]);
        $user = row('SELECT * FROM users WHERE email = ?', [$email]);
        grantWelcomeCredits(db(), (int) $user['id']);
    }
    return $user;
}

// --- What an account may use --------------------------------------------------------------------

function isPro(array $user): bool
{
    if ((int) $user['lifetime'] === 1) {
        return true;
    }
    // A payment that is late keeps the plan until Stripe gives up and cancels it.
    return in_array($user['sub_status'], ['active', 'trialing', 'past_due'], true);
}

/** What the app is told about an account. There is nothing else to tell. */
function describeUser(array $user): array
{
    return [
        'email' => $user['email'],
        'pro' => isPro($user),
        'plan' => (int) $user['lifetime'] === 1 ? 'lifetime' : (isPro($user) ? 'subscription' : null),
        'until' => (int) $user['lifetime'] === 1 ? null : ($user['sub_until'] ? (int) $user['sub_until'] : null),
        'consent' => $user['consent_version'] === config('consent_version'),
        'billing' => $user['stripe_customer'] !== null,
    ] + describeCredits($user);
}

function enabledProviders(): array
{
    $providers = ['magic'];
    foreach (['google', 'meta'] as $name) {
        $settings = config($name) ?? [];
        if (($settings['client_id'] ?? '') !== '' && ($settings['client_secret'] ?? '') !== '') {
            $providers[] = $name;
        }
    }
    $apple = config('apple') ?? [];
    if (($apple['client_id'] ?? '') !== '' && ($apple['key_file'] ?? '') !== '' && is_file($apple['key_file'])) {
        $providers[] = 'apple';
    }
    return $providers;
}

/** The products that can be bought: active in plans.json and with a Stripe price. */
function enabledProducts(): array
{
    if (((config('stripe') ?? [])['secret_key'] ?? '') === '') {
        return [];
    }
    $products = [];
    foreach (activeProducts() as $product) {
        if (priceIdOf($product['key']) !== '') {
            $products[] = array_intersect_key($product, array_flip(['key', 'type', 'interval', 'quantity'])) + ['price' => priceOf(priceIdOf($product['key']))];
        }
    }
    return $products;
}
