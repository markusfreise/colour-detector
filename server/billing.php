<?php
/**
 * Paying with Stripe: a subscription by month or year, or one payment for a licence without end.
 * Card data never touches this server; Stripe's own pages take it.
 */

declare(strict_types=1);

const STRIPE = 'https://api.stripe.com/v1/';

function stripe(string $method, string $path, array $fields = []): array
{
    $answer = http($method, STRIPE . $path, $fields, ['Authorization: Bearer ' . (config('stripe')['secret_key'] ?? '')]);
    if ($answer['status'] >= 400) {
        error_log('Stripe ' . $path . ': ' . json_encode($answer['data']['error'] ?? $answer['status']));
        fail(502, 'The payment service did not accept the request. Please try again later.');
    }
    return $answer['data'];
}

function startCheckout(): never
{
    method('POST');
    $user = requireUser();
    $name = (string) (body()['plan'] ?? '');
    $plan = (config('stripe')['plans'] ?? [])[$name] ?? null;
    if (!$plan || ($plan['price'] ?? '') === '') {
        fail(422, 'This plan is not offered.');
    }
    if ((int) $user['lifetime'] === 1) {
        fail(409, 'This account already has a licence without end.');
    }
    $once = $name === 'lifetime';
    if (!$once && isPro($user)) {
        fail(409, 'This account already has a subscription. Change it under "Manage subscription".');
    }
    $fields = [
        'mode' => $once ? 'payment' : 'subscription',
        'line_items' => [['price' => $plan['price'], 'quantity' => 1]],
        'client_reference_id' => $user['id'],
        'metadata' => ['plan' => $name],
        'success_url' => config('app_url') . '#billing=ok',
        'cancel_url' => config('app_url') . '#billing=cancelled',
        'allow_promotion_codes' => 'true',
    ];
    if ($user['stripe_customer']) {
        $fields['customer'] = $user['stripe_customer'];
    } else {
        $fields['customer_email'] = $user['email'];
        if ($once) {
            $fields['customer_creation'] = 'always';
        }
    }
    send(['url' => stripe('POST', 'checkout/sessions', $fields)['url']]);
}

function openPortal(): never
{
    method('POST');
    body();
    $user = requireUser();
    if (!$user['stripe_customer']) {
        fail(409, 'There is nothing to manage yet.');
    }
    send(['url' => stripe('POST', 'billing_portal/sessions', ['customer' => $user['stripe_customer'], 'return_url' => config('app_url')])['url']]);
}

/** What Stripe knows about a subscription, written to its account. */
function storeSubscription(array $subscription): void
{
    // The end of the paid period moved from the subscription to its items in newer API versions.
    $until = $subscription['current_period_end'] ?? $subscription['items']['data'][0]['current_period_end'] ?? null;
    run('UPDATE users SET sub_id = ?, sub_status = ?, sub_until = ? WHERE stripe_customer = ?', [
        $subscription['id'],
        $subscription['status'],
        $until,
        $subscription['customer'],
    ]);
}

function stripeWebhook(): never
{
    method('POST');
    $payload = file_get_contents('php://input') ?: '';
    $parts = [];
    foreach (explode(',', $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '') as $part) {
        [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
        $parts[$key][] = $value;
    }
    $time = (int) ($parts['t'][0] ?? 0);
    $expected = hash_hmac('sha256', $time . '.' . $payload, (string) (config('stripe')['webhook_secret'] ?? ''));
    $signed = false;
    foreach ($parts['v1'] ?? [] as $candidate) {
        $signed = $signed || hash_equals($expected, $candidate);
    }
    if (!$signed || abs(time() - $time) > 300 || (config('stripe')['webhook_secret'] ?? '') === '') {
        fail(400, 'Invalid signature.');
    }

    $event = json_decode($payload, true) ?: [];
    // Stripe may send an event more than once.
    try {
        run('INSERT INTO stripe_events (id, at) VALUES (?, ?)', [(string) ($event['id'] ?? ''), time()]);
    } catch (PDOException) {
        send(['received' => true, 'duplicate' => true]);
    }
    run('DELETE FROM stripe_events WHERE at < ?', [time() - 30 * 86400]);

    $object = $event['data']['object'] ?? [];
    switch ($event['type'] ?? '') {
        case 'checkout.session.completed':
            $userId = (int) ($object['client_reference_id'] ?? 0);
            if ($object['customer'] ?? null) {
                run('UPDATE users SET stripe_customer = ? WHERE id = ?', [$object['customer'], $userId]);
            }
            if (($object['mode'] ?? '') === 'payment' && ($object['payment_status'] ?? '') === 'paid') {
                run('UPDATE users SET lifetime = 1 WHERE id = ?', [$userId]);
            } elseif (($object['mode'] ?? '') === 'subscription' && ($object['subscription'] ?? null)) {
                storeSubscription(stripe('GET', 'subscriptions/' . $object['subscription']));
            }
            break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
            storeSubscription($object);
            break;
        case 'charge.refunded':
            // A licence paid once and fully refunded is taken back; subscriptions report their own end.
            if (($object['refunded'] ?? false) && ($object['customer'] ?? null)) {
                $user = row('SELECT * FROM users WHERE stripe_customer = ?', [$object['customer']]);
                if ($user && !$user['sub_id']) {
                    run('UPDATE users SET lifetime = 0 WHERE id = ?', [$user['id']]);
                }
            }
            break;
    }
    send(['received' => true]);
}

/** Ends what is running at Stripe before an account goes. */
function cancelBilling(array $user): void
{
    if ($user['sub_id'] && in_array($user['sub_status'], ['active', 'trialing', 'past_due', 'unpaid'], true)) {
        stripe('DELETE', 'subscriptions/' . $user['sub_id']);
    }
}
