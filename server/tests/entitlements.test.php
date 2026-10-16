<?php
// The same cases as src/__tests__/entitlements.test.js: both sides decide alike.

declare(strict_types=1);

$cases = json_decode((string) file_get_contents(__DIR__ . '/entitlement-cases.json'), true)['cases'];
foreach ($cases as $case) {
    test('entitlements: ' . $case['name'], function () use ($case) {
        $unlocked = $case['picture'] !== null && in_array($case['picture'], $case['state']['unlocked'] ?? [], true);
        same($case['expected'], entitled($case['state']['plan'] ?? null, $case['feature'], $unlocked));
    });
}

test('entitlements: an unknown feature is an error, not a free one', function () {
    try {
        entitled(null, 'no-such-feature', false);
    } catch (InvalidArgumentException) {
        return;
    }
    throw new Failure('no error');
});

test('entitlements: every feature is in one group only', function () {
    $all = array_merge(...array_values(plans()['features']));
    same(count($all), count(array_unique($all)));
});

test('entitlements: products are ordered and have what their type needs', function () {
    $sorts = array_column(activeProducts(), 'sort');
    $ordered = $sorts;
    sort($ordered);
    same($ordered, $sorts);
    foreach (activeProducts() as $product) {
        check(in_array($product['type'], ['subscription', 'lifetime', 'credit_pack'], true), $product['key']);
        if ($product['type'] === 'subscription') {
            check(in_array($product['interval'] ?? '', ['month', 'year'], true), $product['key'] . ' interval');
        }
        if ($product['type'] === 'credit_pack') {
            check(is_int($product['quantity'] ?? null) && $product['quantity'] > 0, $product['key'] . ' quantity');
        }
    }
});

test('entitlements: price IDs from the environment win over config.php', function () {
    freshDatabase(['stripe' => ['prices' => ['pictures-5' => 'price_config']]]);
    same('price_config', priceIdOf('pictures-5'));
    putenv('STRIPE_PRICE_PICTURES_5=price_env');
    same('price_env', priceIdOf('pictures-5'));
    putenv('STRIPE_PRICE_PICTURES_5');
});

test('entitlements: plans of before plans.json are still found', function () {
    freshDatabase(['stripe' => ['plans' => ['monthly' => ['price' => 'price_old', 'label' => '']]]]);
    same('price_old', priceIdOf('monthly'));
});
