<?php
/**
 * Account API for Watercolourlove, served under <app>/api/.
 *
 * Pictures never come here: the app keeps them in the browser. An account is an e-mail address,
 * the consent given and what was paid for.
 *
 * Local test: php -S 127.0.0.1:8787 server/index.php (the Vite dev server passes /api on).
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/billing.php';

set_exception_handler(function (Throwable $error): void {
    error_log('Account API: ' . $error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    fail(500, 'Something went wrong on the server.');
});

// The route is what follows "/api/" in the address.
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$at = strrpos($path, '/api/');
$route = trim($at === false ? $path : substr($path, $at + 5), '/');

if (preg_match('#^auth/(google|meta|apple)/(start|callback)$#', $route, $match)) {
    $match[2] === 'start' ? startOauth($match[1]) : finishOauth($match[1]);
}

switch ($route) {
    case 'me':
        method('GET');
        $user = currentUser();
        send([
            'user' => $user ? describeUser($user) : null,
            'providers' => enabledProviders(),
            'plans' => enabledPlans(),
            'consentVersion' => config('consent_version'),
            'invitation' => is_array(config('invitation')),
        ]);

    case 'auth/magic':
        sendMagicLink();

    case 'auth/magic/verify':
        verifyMagicLink();

    case 'logout':
        method('POST');
        body();
        endSession();
        send(['ok' => true]);

    case 'consent':
        // Both statements are needed: the privacy text, and that pictures stay in the browser.
        method('POST');
        $user = requireUser();
        $given = body();
        if (($given['privacy'] ?? false) !== true || ($given['local'] ?? false) !== true) {
            fail(422, 'Both boxes need to be ticked.');
        }
        run('UPDATE users SET consent_version = ?, consent_at = ? WHERE id = ?', [config('consent_version'), time(), $user['id']]);
        send(['user' => describeUser(row('SELECT * FROM users WHERE id = ?', [$user['id']]))]);

    case 'export':
        // Everything stored about the account, for the user.
        method('GET');
        $user = requireUser();
        send([
            'email' => $user['email'],
            'created' => date('c', (int) $user['created_at']),
            'consent' => $user['consent_at'] ? ['version' => $user['consent_version'], 'given' => date('c', (int) $user['consent_at'])] : null,
            'signInWith' => array_column(run('SELECT provider FROM identities WHERE user_id = ?', [$user['id']])->fetchAll(), 'provider'),
            'licenceWithoutEnd' => (int) $user['lifetime'] === 1,
            'subscription' => $user['sub_id'] ? ['status' => $user['sub_status'], 'paidUntil' => $user['sub_until'] ? date('c', (int) $user['sub_until']) : null] : null,
            'stripeCustomer' => $user['stripe_customer'],
            'vouchers' => array_map(
                fn (array $v) => ['made' => date('c', (int) $v['created_at']), 'used' => $v['redeemed_at'] ? date('c', (int) $v['redeemed_at']) : null],
                run('SELECT created_at, redeemed_at FROM vouchers WHERE email = ?', [$user['email']])->fetchAll(),
            ),
        ]);

    case 'delete':
        // The account and everything that hangs on it. Invoices stay with Stripe as the law asks.
        method('POST');
        body();
        $user = requireUser();
        cancelBilling($user);
        run('DELETE FROM users WHERE id = ?', [$user['id']]);
        endSession();
        send(['ok' => true]);

    case 'billing/checkout':
        startCheckout();

    case 'billing/portal':
        openPortal();

    case 'billing/voucher':
        redeemVoucher();

    case 'stripe/webhook':
        stripeWebhook();
}

fail(404, 'Not found.');
