<?php
/**
 * Vouchers for a lifetime licence, each made out to one e-mail address. Command line only:
 *
 *   php voucher.php create someone@example.org    prints a new code for that address
 *   php voucher.php list                          all vouchers and whether they were used
 *   php voucher.php revoke someone@example.org    removes the unused vouchers of that address
 *
 * The code is shown once; only its hash is stored. The holder signs in with that address and
 * enters the code under "Unlock everything".
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib.php';

// Without letters and digits that are easy to mix up.
const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

[$command, $email] = [$argv[1] ?? '', strtolower(trim($argv[2] ?? ''))];
switch ($command) {
    case 'create':
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            fwrite(STDERR, "Usage: php voucher.php create <e-mail address>\n");
            exit(1);
        }
        $groups = [];
        for ($g = 0; $g < 3; $g++) {
            $group = '';
            for ($i = 0; $i < 4; $i++) {
                $group .= VOUCHER_ALPHABET[random_int(0, strlen(VOUCHER_ALPHABET) - 1)];
            }
            $groups[] = $group;
        }
        $code = 'WCL-' . implode('-', $groups);
        run('INSERT INTO vouchers (hash, email, created_at) VALUES (?, ?, ?)', [voucherKey($code), $email, time()]);
        echo "$code  (lifetime licence for $email)\n";
        break;

    case 'list':
        foreach (run('SELECT * FROM vouchers ORDER BY created_at')->fetchAll() as $voucher) {
            printf("%-40s made %s  %s\n", $voucher['email'], date('Y-m-d', (int) $voucher['created_at']), $voucher['redeemed_at'] ? 'used ' . date('Y-m-d', (int) $voucher['redeemed_at']) : 'not used');
        }
        break;

    case 'revoke':
        $gone = run('DELETE FROM vouchers WHERE email = ? AND redeemed_at IS NULL', [$email])->rowCount();
        echo "$gone unused voucher(s) removed for $email\n";
        break;

    default:
        fwrite(STDERR, "Usage: php voucher.php create|list|revoke [e-mail address]\n");
        exit(1);
}
