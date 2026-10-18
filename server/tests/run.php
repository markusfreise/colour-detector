<?php
/**
 * Tests of the account API, without packages: php server/tests/run.php (npm run test:server).
 * Every *.test.php here registers cases with test(); each runs against a fresh SQLite file.
 */

declare(strict_types=1);

// Only from the command line: on a web server it would run the suite for anybody who calls it.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const TEST_DIR = __DIR__;

$tests = [];
$failures = 0;

function test(string $name, callable $body): void
{
    $GLOBALS['tests'][] = [$name, $body];
}

final class Failure extends Exception
{
}

function check(bool $condition, string $message = 'expected true'): void
{
    if (!$condition) {
        throw new Failure($message);
    }
}

function same(mixed $expected, mixed $actual, string $what = ''): void
{
    if ($expected !== $actual) {
        throw new Failure(($what !== '' ? $what . ': ' : '') . 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

require TEST_DIR . '/bootstrap.php';
foreach (glob(TEST_DIR . '/*.test.php') as $file) {
    require $file;
}

foreach ($tests as [$name, $body]) {
    freshDatabase();
    try {
        $body();
        echo "OK      $name\n";
    } catch (Throwable $error) {
        $failures++;
        echo "FAILED  $name\n        " . $error->getMessage() . ($error instanceof Failure ? '' : ' (' . basename($error->getFile()) . ':' . $error->getLine() . ')') . "\n";
    }
}

echo "\n" . count($tests) . ' tests, ' . $failures . " failed\n";
exit($failures === 0 ? 0 : 1);
