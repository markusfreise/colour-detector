<?php
/**
 * GitHub push webhook for Watercolourlove.
 *
 * Lives in the web root (https://watercolourlove.de/webhook.php).
 * Verifies GitHub's HMAC signature, then starts deploy.sh in the background
 * (git pull + npm ci + npm run build + copy dist/ into the web root) and returns 202.
 *
 * Configuration: webhook-config.php next to this file (never committed), e.g.
 *   <?php return [
 *     'secret'     => 'long-random-string',          // same as in GitHub → Settings → Webhooks
 *     'repo_dir'   => '/home/www/p123456/colour-detector',  // git checkout, outside the web root
 *     'branch'     => 'main',
 *     'log_file'   => __DIR__ . '/../colour-detector-deploy.log', // outside the web root
 *   ];
 */

declare(strict_types=1);

function respond(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message . "\n";
    exit;
}

$configFile = __DIR__ . '/webhook-config.php';
if (!is_file($configFile)) {
    respond(500, 'Webhook not configured');
}
$config = require $configFile;
$secret = (string) ($config['secret'] ?? '');
$repoDir = rtrim((string) ($config['repo_dir'] ?? ''), '/');
$branch = (string) ($config['branch'] ?? 'main');
$logFile = (string) ($config['log_file'] ?? ($repoDir . '/deploy.log'));

if ($secret === '' || $repoDir === '' || !is_dir($repoDir . '/.git')) {
    respond(500, 'Webhook misconfigured');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, 'POST only');
}

$payload = file_get_contents('php://input') ?: '';
$signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
$expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $signature)) {
    respond(403, 'Invalid signature');
}

$event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
if ($event === 'ping') {
    respond(200, 'pong');
}
if ($event !== 'push') {
    respond(202, "Ignored event: $event");
}

$data = json_decode($payload, true);
if (!is_array($data) && isset($_POST['payload'])) {
    $data = json_decode((string) $_POST['payload'], true); // form-encoded webhook
}
$ref = is_array($data) ? (string) ($data['ref'] ?? '') : '';
if ($ref !== "refs/heads/$branch") {
    respond(202, "Ignored ref: $ref");
}

$command = sprintf(
    'nohup bash %s %s %s %s >> %s 2>&1 &',
    escapeshellarg($repoDir . '/deploy/deploy.sh'),
    escapeshellarg($repoDir),
    escapeshellarg(__DIR__),
    escapeshellarg($branch),
    escapeshellarg($logFile)
);
exec($command);

respond(202, 'Deploy started for ' . substr((string) ($data['after'] ?? ''), 0, 7));
