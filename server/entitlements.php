<?php
/**
 * What an account may use. The rules come from plans.json, which the app reads too
 * (src/lib/entitlements.js); both are checked against tests/entitlement-cases.json.
 */

declare(strict_types=1);

function plans(): array
{
    static $plans = null;
    if ($plans === null) {
        $plans = json_decode((string) file_get_contents(__DIR__ . '/plans.json'), true, 512, JSON_THROW_ON_ERROR);
    }
    return $plans;
}

/** 'picture', 'studio', or null for a feature that is not gated. */
function featureGroup(string $feature): ?string
{
    foreach (plans()['features'] as $group => $features) {
        if (in_array($feature, $features, true)) {
            return $group;
        }
    }
    return null;
}

/**
 * The rule itself: $plan is 'subscription', 'lifetime' or null; $pictureUnlocked says whether the
 * picture in question was unlocked with a credit. Subscribers and licence holders never need one.
 */
function entitled(?string $plan, string $feature, bool $pictureUnlocked): bool
{
    $group = featureGroup($feature);
    if ($group === null) {
        throw new InvalidArgumentException('Unknown feature: ' . $feature);
    }
    if ($plan === 'subscription' || $plan === 'lifetime') {
        return true;
    }
    return $group === 'picture' && $pictureUnlocked;
}

/** The plan of an account as the rules know it. */
function planOf(array $user): ?string
{
    if ((int) $user['lifetime'] === 1) {
        return 'lifetime';
    }
    return isPro($user) ? 'subscription' : null;
}

/** The products on offer, in their order. */
function activeProducts(): array
{
    $products = array_values(array_filter(plans()['products'], fn (array $p) => $p['active'] ?? false));
    usort($products, fn (array $a, array $b) => $a['sort'] <=> $b['sort']);
    return $products;
}

function productByKey(string $key): ?array
{
    foreach (activeProducts() as $product) {
        if ($product['key'] === $key) {
            return $product;
        }
    }
    return null;
}

/**
 * The Stripe price of a product: STRIPE_PRICE_<KEY> in the environment, else stripe.prices in
 * config.php; plans made before plans.json existed are still read from stripe.plans.
 */
function priceIdOf(string $key): string
{
    $env = getenv('STRIPE_PRICE_' . strtoupper(str_replace('-', '_', $key)));
    if (is_string($env) && $env !== '') {
        return $env;
    }
    $stripe = config('stripe') ?? [];
    return (string) ($stripe['prices'][$key] ?? $stripe['plans'][$key]['price'] ?? '');
}
