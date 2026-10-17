<?php
/**
 * Picture credits. A credit unlocks one picture for good; the balance is the sum of the ledger, and
 * every change of it is a line there, with what it was for. Subscribers and holders of a lifetime
 * licence never spend one. Changes run in a transaction that holds the database (BEGIN IMMEDIATE),
 * so two requests cannot both spend the last credit.
 */

declare(strict_types=1);

/** Runs $work in one transaction that holds the database; rolls back when it throws. */
function exclusively(callable $work): mixed
{
    $db = db();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $result = $work($db);
        $db->exec('COMMIT');
        return $result;
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
}

function creditBalance(int $userId): int
{
    return (int) run('SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE user_id = ?', [$userId])->fetchColumn();
}

/**
 * One line in the ledger. A line with a reference is written once: false when it was there already.
 * Call inside a transaction when the balance is read first.
 */
function ledgerLine(int $userId, int $delta, string $kind, string $reason, ?string $reference = null): bool
{
    $statement = run(
        'INSERT OR IGNORE INTO credit_ledger (user_id, delta, kind, reason, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [$userId, $delta, $kind, $reason, $reference, time()],
    );
    return $statement->rowCount() === 1;
}

/** The free credit of every account, once; for the accounts there are, and for a new one. */
function grantWelcomeCredits(PDO $db, ?int $userId = null): void
{
    $welcome = (int) (plans()['credits']['welcome'] ?? 0);
    if ($welcome <= 0) {
        return;
    }
    $statement = $db->prepare(
        "INSERT OR IGNORE INTO credit_ledger (user_id, delta, kind, reason, reference, created_at)
         SELECT id, ?, 'grant', 'welcome', 'welcome:' || id, ? FROM users" . ($userId === null ? '' : ' WHERE id = ?'),
    );
    $statement->execute($userId === null ? [$welcome, time()] : [$welcome, time(), $userId]);
}

/** A picture key as the app sends it: 64 hex digits (see pictureKey in src/lib/picture.js). */
function validPictureKey(mixed $key): ?string
{
    return is_string($key) && preg_match('/^[0-9a-f]{64}$/', $key) ? $key : null;
}

function pictureUnlocked(int $userId, string $key): bool
{
    return row('SELECT 1 AS yes FROM picture_unlocks WHERE user_id = ? AND picture_key = ?', [$userId, $key]) !== null;
}

/**
 * Spends a credit on a picture. An unlocked picture costs nothing again; an account with a plan
 * spends nothing. Returns 'unlocked' (a credit was spent), 'already', 'plan' or 'empty' (none left).
 */
function unlockPicture(array $user, string $key): string
{
    if (planOf($user) !== null) {
        return 'plan';
    }
    $id = (int) $user['id'];
    return exclusively(function () use ($id, $key): string {
        if (pictureUnlocked($id, $key)) {
            return 'already';
        }
        if (creditBalance($id) < 1) {
            return 'empty';
        }
        run('INSERT INTO picture_unlocks (user_id, picture_key, created_at) VALUES (?, ?, ?)', [$id, $key, time()]);
        ledgerLine($id, -1, 'spend', 'picture', 'unlock:' . $id . ':' . $key);
        return 'unlocked';
    });
}

/** A credit pack paid at Stripe; the same checkout counts once, however often Stripe reports it. */
function recordPackPurchase(int $userId, array $product, array $session): bool
{
    return exclusively(function () use ($userId, $product, $session): bool {
        $inserted = run(
            'INSERT OR IGNORE INTO purchases (user_id, product, quantity, amount, currency, stripe_session, payment_intent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$userId, $product['key'], (int) $product['quantity'], (int) ($session['amount_total'] ?? 0), (string) ($session['currency'] ?? ''), (string) $session['id'], $session['payment_intent'] ?? null, time()],
        )->rowCount() === 1;
        if (!$inserted) {
            return false;
        }
        return ledgerLine($userId, (int) $product['quantity'], 'purchase', $product['key'], 'stripe:' . $session['id']);
    });
}

/**
 * A refund of a pack takes back its credits in proportion to the money returned, down to a
 * balance of 0 at most: pictures already unlocked stay unlocked. Returns the credits taken back,
 * or null when the charge is not a pack.
 */
function refundPackPurchase(array $charge): ?int
{
    $purchase = ($charge['payment_intent'] ?? null) ? row('SELECT * FROM purchases WHERE payment_intent = ?', [$charge['payment_intent']]) : null;
    if (!$purchase) {
        return null;
    }
    return exclusively(function () use ($purchase, $charge): int {
        // Read again inside the transaction: the same refund may be reported twice at once.
        $purchase = row('SELECT * FROM purchases WHERE id = ?', [$purchase['id']]);
        $refunded = min((int) ($charge['amount_refunded'] ?? 0), (int) $purchase['amount']);
        if ($refunded <= (int) $purchase['refunded_amount']) {
            return 0;
        }
        $owed = $purchase['amount'] > 0 ? (int) round($purchase['quantity'] * $refunded / $purchase['amount']) : (int) $purchase['quantity'];
        $back = max(0, $owed - (int) $purchase['credits_back']);
        $userId = (int) $purchase['user_id'];
        $taken = min($back, max(0, creditBalance($userId)));
        run('UPDATE purchases SET refunded_amount = ?, credits_back = ? WHERE id = ?', [$refunded, (int) $purchase['credits_back'] + $back, $purchase['id']]);
        if ($taken > 0) {
            ledgerLine($userId, -$taken, 'refund', $purchase['product'], 'refund:' . $purchase['stripe_session'] . ':' . $refunded);
        }
        return $taken;
    });
}

/** Credits given or taken by hand (support, a deal with a painter); never below 0. Returns the change made. */
function adjustCredits(int $userId, int $delta, string $reason): int
{
    if (trim($reason) === '') {
        throw new InvalidArgumentException('A reason is needed.');
    }
    return exclusively(function () use ($userId, $delta, $reason): int {
        $change = $delta < 0 ? -min(-$delta, max(0, creditBalance($userId))) : $delta;
        if ($change !== 0) {
            ledgerLine($userId, $change, 'admin', trim($reason));
        }
        return $change;
    });
}

/** What the app is told about the credits of an account. */
function describeCredits(array $user): array
{
    return [
        'credits' => creditBalance((int) $user['id']),
        'pictureSalt' => $user['picture_salt'],
        // Money paid for packs that comes off the first plan (TASK-51), in cents.
        'deduction' => packDeduction($user),
        'unlocks' => array_map(
            fn (array $u) => ['key' => $u['picture_key'], 'at' => (int) $u['created_at']],
            run('SELECT picture_key, created_at FROM picture_unlocks WHERE user_id = ? ORDER BY created_at', [$user['id']])->fetchAll(),
        ),
    ];
}

/**
 * What comes off the first plan of an account: the money paid for packs in the last
 * credits.deduction_days days, less refunds; nothing once a plan was had or the deduction used.
 * In cents.
 */
function packDeduction(array $user): int
{
    if ($user['deduction_used_at'] || $user['sub_id'] || (int) $user['lifetime'] === 1) {
        return 0;
    }
    $days = (int) (plans()['credits']['deduction_days'] ?? 0);
    if ($days <= 0) {
        return 0;
    }
    return max(0, (int) run(
        'SELECT COALESCE(SUM(amount - refunded_amount), 0) FROM purchases WHERE user_id = ? AND created_at >= ?',
        [$user['id'], time() - $days * 86400],
    )->fetchColumn());
}

/** The deduction on a price: never so much that less than Stripe's least charge (0.50) is left. */
function deductionOn(int $deduction, int $price): int
{
    return max(0, min($deduction, $price - 50));
}
