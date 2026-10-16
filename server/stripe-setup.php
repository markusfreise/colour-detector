<?php
/**
 * Sets up Stripe for Watercolourlove and writes the result into config.php. Run on the server, in
 * the folder of the API:
 *
 *   php stripe-setup.php
 *
 * It asks for the secret key (sk_live_..., or a restricted key rk_live_... with the permissions
 * listed in README.md) without showing it, then creates what is
 * missing and reuses what is there: the product, the three prices (gross), the German VAT rate
 * inside them, the webhook and the customer portal. Markus Freise is the seller; Stripe only
 * takes the payments. Running it again is safe. The webhook is made anew each time,
 * because Stripe shows its signing secret only when it is created.
 *
 * Options: --config=<file> (default: config.php next to this file).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const PLANS = [
    'monthly' => ['amount' => 499, 'interval' => 'month', 'label' => '4.99 EUR per month'],
    'yearly' => ['amount' => 2999, 'interval' => 'year', 'label' => '29.99 EUR per year'],
    'lifetime' => ['amount' => 7900, 'interval' => null, 'label' => '79 EUR once'],
];
const EVENTS = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'charge.refunded',
];
// Stripe's tax code for software used online by private persons.
const TAX_CODE = 'txcd_10103001';

$options = getopt('', ['config::']);
$configFile = $options['config'] ?? __DIR__ . '/config.php';
if (!is_file($configFile)) {
    fwrite(STDERR, "No configuration at $configFile.\n");
    exit(1);
}
$config = require $configFile;
$appUrl = (string) ($config['app_url'] ?? '');
if (!str_starts_with($appUrl, 'https://')) {
    fwrite(STDERR, "app_url in the configuration must be an https address, Stripe calls the webhook there.\n");
    exit(1);
}

$key = getenv('STRIPE_SECRET_KEY') ?: '';
if ($key === '') {
    fwrite(STDOUT, 'Stripe secret or restricted key (sk_/rk_live_... or sk_/rk_test_..., not shown): ');
    shell_exec('stty -echo 2>/dev/null');
    $key = trim((string) fgets(STDIN));
    shell_exec('stty echo 2>/dev/null');
    fwrite(STDOUT, "\n");
}
if (!preg_match('/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/', $key, $mode)) {
    fwrite(STDERR, "That is not a secret or restricted key (sk_live_..., rk_live_..., or the same with _test_).\n");
    exit(1);
}
$live = $mode[2] === 'live';

/** One request to Stripe; stops the script on an error, unless $optional (then it returns null). */
function stripe(string $method, string $path, array $fields = [], bool $optional = false): ?array
{
    global $key;
    $url = 'https://api.stripe.com/v1/' . $path;
    if ($method === 'GET' && $fields) {
        $url .= '?' . http_build_query($fields);
    }
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key],
    ]);
    if ($method !== 'GET' && $fields) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, http_build_query($fields));
    }
    $data = json_decode((string) curl_exec($curl), true) ?: [];
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if ($status >= 400) {
        if ($optional) {
            return null;
        }
        fwrite(STDERR, "Stripe $method $path: " . ($data['error']['message'] ?? "HTTP $status") . "\n");
        if ($status === 403) {
            fwrite(STDERR, "The key lacks a permission for this; see the list in README.md (Stripe).\n");
        }
        exit(1);
    }
    return $data;
}

function say(string $text): void
{
    fwrite(STDOUT, $text . "\n");
}

$notes = [];
say(($live ? 'LIVE' : 'TEST') . ' mode.');

// --- The account ----------------------------------------------------------------------------------
// A restricted key may not read the account; that is only for the overview.
$account = stripe('GET', 'account', [], true);
if ($account === null) {
    say('Account: not readable with this key (fine for a restricted key).');
    $account = ['charges_enabled' => true];
} else {
    say('Account: ' . ($account['settings']['dashboard']['display_name'] ?? $account['business_profile']['name'] ?? $account['id'])
    . ', payments ' . (($account['charges_enabled'] ?? false) ? 'enabled' : 'NOT enabled')
    . ', payouts ' . (($account['payouts_enabled'] ?? false) ? 'enabled' : 'NOT enabled') . '.');
}
if ($live && !($account['charges_enabled'] ?? false)) {
    $notes[] = 'Payments are not enabled yet: finish the account details in the Stripe dashboard.';
}

// --- German VAT ---------------------------------------------------------------------------------
// Markus Freise sells (Managed Payments is switched off per checkout). Below 10,000 EUR a year of
// sales to consumers in other EU countries the German VAT applies to every buyer, inside the price.
$rate = null;
foreach (stripe('GET', 'tax_rates', ['active' => 'true', 'limit' => 100])['data'] ?? [] as $candidate) {
    if (($candidate['metadata']['app'] ?? '') === 'watercolourlove' && (float) $candidate['percentage'] === 19.0 && $candidate['inclusive']) {
        $rate = $candidate;
    }
}
$rate ??= stripe('POST', 'tax_rates', [
    'display_name' => 'USt.',
    'description' => 'German VAT 19%',
    'percentage' => '19',
    'inclusive' => 'true',
    'country' => 'DE',
    'jurisdiction' => 'DE',
    'tax_type' => 'vat',
    'metadata' => ['app' => 'watercolourlove'],
]);
say('VAT rate: ' . $rate['id'] . ' (19% included)');
$notes[] = 'Settings > Business > Tax details (or the invoice template): enter the VAT ID DE281377646, so that it is printed on every invoice.';

// --- Product and prices ---------------------------------------------------------------------------
$products = stripe('GET', 'products/search', ['query' => "metadata['app']:'watercolourlove'"])['data'] ?? [];
$product = $products[0] ?? stripe('POST', 'products', [
    'name' => 'Watercolourlove',
    'description' => 'Find the main colours of a photo and mix them from your own watercolours.',
    'tax_code' => TAX_CODE,
    'metadata' => ['app' => 'watercolourlove'],
]);
say('Product: ' . $product['id'] . ($products ? ' (found)' : ' (created)'));

$prices = [];
foreach (PLANS as $plan => $spec) {
    $lookup = "watercolourlove_$plan";
    $found = stripe('GET', 'prices', ['lookup_keys' => [$lookup], 'active' => 'true'])['data'][0] ?? null;
    // A price with another amount stays for its existing customers; the new one takes the key over.
    if ($found && (int) $found['unit_amount'] !== $spec['amount']) {
        $found = null;
    }
    $fields = [
        'product' => $product['id'],
        'currency' => 'eur',
        'unit_amount' => $spec['amount'],
        'tax_behavior' => 'inclusive',
        'lookup_key' => $lookup,
        'transfer_lookup_key' => 'true',
        'nickname' => $spec['label'],
    ];
    if ($spec['interval']) {
        $fields['recurring'] = ['interval' => $spec['interval']];
    }
    $price = $found ?? stripe('POST', 'prices', $fields);
    $prices[$plan] = $price['id'];
    say("Price $plan: {$price['id']}" . ($found ? ' (found)' : ' (created)'));
}

// --- Webhook --------------------------------------------------------------------------------------
$hookUrl = $appUrl . 'api/stripe/webhook';
foreach (stripe('GET', 'webhook_endpoints', ['limit' => 100])['data'] ?? [] as $endpoint) {
    if ($endpoint['url'] === $hookUrl) {
        stripe('DELETE', 'webhook_endpoints/' . $endpoint['id']);
        say('Webhook: old endpoint ' . $endpoint['id'] . ' removed');
    }
}
$hook = stripe('POST', 'webhook_endpoints', [
    'url' => $hookUrl,
    'enabled_events' => EVENTS,
    'description' => 'Watercolourlove accounts',
]);
say('Webhook: ' . $hook['id'] . " -> $hookUrl");

// --- Customer portal ------------------------------------------------------------------------------
$portalFields = [
    'business_profile' => [
        'privacy_policy_url' => $appUrl . 'privacy/',
        'terms_of_service_url' => $appUrl . 'terms/',
    ],
    'features' => [
        'invoice_history' => ['enabled' => 'true'],
        'payment_method_update' => ['enabled' => 'true'],
        // The address is the account; it is not changed at Stripe.
        'customer_update' => ['enabled' => 'false'],
        'subscription_cancel' => ['enabled' => 'true', 'mode' => 'at_period_end'],
        // Monthly and yearly can be swapped.
        'subscription_update' => [
            'enabled' => 'true',
            'default_allowed_updates' => ['price'],
            'proration_behavior' => 'create_prorations',
            'products' => [['product' => $product['id'], 'prices' => [$prices['monthly'], $prices['yearly']]]],
        ],
    ],
    'default_return_url' => $appUrl,
];
$portals = stripe('GET', 'billing_portal/configurations', ['is_default' => 'true', 'active' => 'true'])['data'] ?? [];
$portal = $portals
    ? stripe('POST', 'billing_portal/configurations/' . $portals[0]['id'], $portalFields)
    : stripe('POST', 'billing_portal/configurations', $portalFields);
say('Customer portal: ' . $portal['id'] . ($portals ? ' (updated)' : ' (created)'));

// --- Configuration --------------------------------------------------------------------------------
$config['stripe'] = [
    'secret_key' => $key,
    'webhook_secret' => $hook['secret'],
    'tax_rate' => $rate['id'],
    'plans' => array_map(fn (string $plan) => ['price' => $prices[$plan], 'label' => PLANS[$plan]['label']], array_combine(array_keys(PLANS), array_keys(PLANS))),
];
$text = "<?php\n// Written by stripe-setup.php on " . date('Y-m-d H:i') . ".\nreturn " . var_export($config, true) . ";\n";
if (file_put_contents($configFile, $text, LOCK_EX) === false) {
    fwrite(STDERR, "Could not write $configFile.\n");
    exit(1);
}
chmod($configFile, 0600);
say("Written to $configFile: key, webhook secret, VAT rate, prices.");

say('');
say('In the Stripe dashboard, once:');
say('- Settings > Business > Public details: terms of service URL ' . $appUrl . 'terms/, privacy policy URL ' . $appUrl . 'privacy/ and support e-mail support@markus-freise.de.');
foreach ($notes as $note) {
    say('- ' . $note);
}
