<?php
// Credit toward Pro: what was paid for packs lately comes off the first plan, once.

declare(strict_types=1);

function buyPack(int $userId, string $session, int $amount, int $daysAgo = 0): void
{
    answerOf(fn () => handleStripeEvent(event('evt_' . $session, 'checkout.session.completed', packSession($userId, $session, 'pictures-5', $amount))));
    run('UPDATE purchases SET created_at = ? WHERE stripe_session = ?', [time() - $daysAgo * 86400, $session]);
}

function userRow(int $id): array
{
    return row('SELECT * FROM users WHERE id = ?', [$id]);
}

test('deduction: the packs of the last days, less refunds', function () {
    $id = (int) freshUser()['id'];
    same(0, packDeduction(userRow($id)));
    buyPack($id, 'cs_a', 899, 3);
    buyPack($id, 'cs_b', 249, 10);
    buyPack($id, 'cs_old', 1499, plans()['credits']['deduction_days'] + 1);
    same(1148, packDeduction(userRow($id)));
    answerOf(fn () => handleStripeEvent(event('evt_r', 'charge.refunded', ['id' => 'ch_b', 'payment_intent' => 'pi_cs_b', 'amount_refunded' => 249, 'refunded' => true])));
    same(899, packDeduction(userRow($id)));
});

test('deduction: never more than leaves Stripe its least charge', function () {
    same(899, deductionOn(899, 2999));
    same(449, deductionOn(899, 499));
    same(0, deductionOn(899, 40));
    same(0, deductionOn(0, 2999));
});

test('deduction: only for the first plan, and used up once it was taken', function () {
    $id = (int) freshUser()['id'];
    buyPack($id, 'cs_a', 899);
    same(899, packDeduction(userRow($id)));
    // A checkout for a plan with the deduction in it is paid: used up.
    $session = ['id' => 'cs_plan', 'mode' => 'payment', 'payment_status' => 'paid', 'client_reference_id' => (string) $id, 'metadata' => ['plan' => 'lifetime', 'deduction' => '899'], 'amount_total' => 7001];
    answerOf(fn () => handleStripeEvent(event('evt_plan', 'checkout.session.completed', $session)));
    check(userRow($id)['deduction_used_at'] !== null, 'used');
    same(0, packDeduction(userRow($id)));
    // Without it, an account that had a plan before gets none either.
    $other = (int) freshUser('other@example.org')['id'];
    buyPack($other, 'cs_o', 899);
    run("UPDATE users SET sub_id = 'sub_1', sub_status = 'canceled' WHERE id = ?", [$other]);
    same(0, packDeduction(userRow($other)));
});

test('deduction: the app is told it', function () {
    $id = (int) freshUser()['id'];
    buyPack($id, 'cs_a', 899);
    same(899, describeUser(userRow($id))['deduction']);
});
