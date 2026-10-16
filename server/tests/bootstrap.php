<?php
// Loads the account API for the tests: answers are thrown as Answer, and every test gets an empty database.

declare(strict_types=1);

const ACCOUNT_TESTS = true;

require dirname(__DIR__) . '/lib.php';
require dirname(__DIR__) . '/entitlements.php';
require dirname(__DIR__) . '/billing.php';

/** A configuration as a test needs it, on a new database file. */
function freshDatabase(array $config = []): void
{
    $file = tempnam(sys_get_temp_dir(), 'wcl-test-');
    register_shutdown_function(fn () => @unlink($file));
    $GLOBALS['accountConfig'] = array_replace_recursive([
        'app_url' => 'https://app.example/',
        'database' => $file,
        'secret' => 'test-secret',
        'consent_version' => 'test',
        'stripe' => ['secret_key' => 'sk_test_x', 'webhook_secret' => 'whsec_test', 'prices' => []],
    ], $config);
    unset($GLOBALS['accountDb']);
}

/** The answer a route gives, as [status, data]. */
function answerOf(callable $route): array
{
    try {
        $route();
    } catch (Answer $answer) {
        return [$answer->status, $answer->data];
    }
    throw new Failure('the route gave no answer');
}
