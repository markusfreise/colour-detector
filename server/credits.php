<?php
/**
 * Picture credits by hand, on the server, in the folder of the API:
 *
 *   php credits.php show someone@example.org
 *   php credits.php grant someone@example.org 5 --reason="Workshop with ..."
 *   php credits.php revoke someone@example.org 2 --reason="Given twice by mistake"
 *
 * Every change is a line in the ledger with its reason. A balance never goes below 0; pictures
 * already unlocked stay unlocked.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib.php';

function usage(): never
{
    fwrite(STDERR, "Usage: php credits.php show <email>\n       php credits.php grant|revoke <email> <n> --reason=\"...\"\n");
    exit(1);
}

$args = array_values(array_filter(array_slice($argv, 1), fn (string $a) => !str_starts_with($a, '--')));
$reason = '';
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--reason=')) {
        $reason = substr($arg, 9);
    }
}
[$command, $email] = [$args[0] ?? '', strtolower(trim($args[1] ?? ''))];
if ($email === '') {
    usage();
}
$user = row('SELECT * FROM users WHERE email = ?', [$email]);
if (!$user) {
    fwrite(STDERR, "No account with the address $email.\n");
    exit(1);
}

switch ($command) {
    case 'grant':
    case 'revoke':
        $n = (int) ($args[2] ?? 0);
        if ($n <= 0 || trim($reason) === '') {
            usage();
        }
        $change = adjustCredits((int) $user['id'], $command === 'grant' ? $n : -$n, $reason);
        echo ($change === 0 ? 'Nothing changed' : sprintf('%+d', $change)) . ', balance now ' . creditBalance((int) $user['id']) . ".\n";
        break;
    case 'show':
        $plan = planOf($user);
        echo "$email: " . creditBalance((int) $user['id']) . ' credits' . ($plan ? ", plan: $plan (spends none)" : '') . "\n\nLedger:\n";
        foreach (run('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY id', [$user['id']])->fetchAll() as $line) {
            printf("  %s  %+3d  %-8s %s\n", date('Y-m-d H:i', (int) $line['created_at']), $line['delta'], $line['kind'], $line['reason']);
        }
        echo "\nUnlocked pictures:\n";
        foreach (run('SELECT * FROM picture_unlocks WHERE user_id = ? ORDER BY created_at', [$user['id']])->fetchAll() as $unlock) {
            echo '  ' . date('Y-m-d H:i', (int) $unlock['created_at']) . '  ' . substr($unlock['picture_key'], 0, 16) . "...\n";
        }
        echo "\nPacks bought:\n";
        foreach (run('SELECT * FROM purchases WHERE user_id = ? ORDER BY id', [$user['id']])->fetchAll() as $p) {
            printf("  %s  %-12s %2d pictures  %.2f %s%s\n", date('Y-m-d H:i', (int) $p['created_at']), $p['product'], $p['quantity'], $p['amount'] / 100, strtoupper($p['currency']), $p['refunded_amount'] ? sprintf(', %.2f refunded', $p['refunded_amount'] / 100) : '');
        }
        break;
    default:
        usage();
}
