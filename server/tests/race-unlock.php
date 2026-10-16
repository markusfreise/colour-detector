<?php
// One of several processes started at once by credits.test.php: tries to unlock a picture and
// prints what happened. Usage: php race-unlock.php <database> <user id> <picture key>

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$GLOBALS['accountConfig'] = ['database' => $argv[1], 'secret' => 'test-secret', 'consent_version' => 'test', 'stripe' => []];
$user = row('SELECT * FROM users WHERE id = ?', [(int) $argv[2]]);
// All processes wait for the same moment, so their transactions really meet.
time_sleep_until((float) $argv[4]);
echo unlockPicture($user, $argv[3]);
