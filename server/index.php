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
require __DIR__ . '/admin.php';

set_exception_handler(function (Throwable $error): void {
    error_log('Account API: ' . $error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    fail(500, 'Something went wrong on the server.');
});

// The route is what follows "/api/" in the address.
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
$at = strrpos($path, '/api/');
$route = trim($at === false ? $path : substr($path, $at + 5), '/');

if (str_starts_with($route, 'admin/')) {
    adminRoute($route);
}

if (preg_match('#^auth/(google|meta|apple)/(start|callback)$#', $route, $match)) {
    $match[2] === 'start' ? startOauth($match[1]) : finishOauth($match[1]);
}

switch ($route) {
    case 'me':
        method('GET');
        $user = currentUser();
        send([
            'user' => $user ? describeUser($user) : null,
            // An admin signed in as this account (admin.php): the app offers the way back.
            'impersonatedBy' => $user && $user['acting_admin'] !== null ? row('SELECT email FROM users WHERE id = ?', [$user['acting_admin']])['email'] ?? null : null,
            'providers' => enabledProviders(),
            'appProviders' => appProviders(),
            'products' => enabledProducts(),
            'consentVersion' => config('consent_version'),
            // Whether invitation codes exist: the sign-in shows the optional field.
            'invitation' => !empty(config('invitation')['codes']),
        ]);

    case 'auth/app/exchange':
        exchangeHandoff();

    case 'auth/apple/native':
        signInAppleNative();

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
        send(accountData(requireUser()));

    case 'delete':
        // The account and everything that hangs on it. Invoices stay with Stripe as the law asks.
        method('POST');
        body();
        $user = requireUser();
        cancelBilling($user);
        revokeAppleSignIns($user);
        run('DELETE FROM users WHERE id = ?', [$user['id']]);
        endSession();
        send(['ok' => true]);

    case 'billing/checkout':
        startCheckout();

    case 'billing/portal':
        openPortal();

    case 'billing/voucher':
        redeemVoucher();

    case 'credits/unlock':
        spendCredit();

    case 'stripe/webhook':
        stripeWebhook();
}

fail(404, 'Not found.');
