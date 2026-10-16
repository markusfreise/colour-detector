<?php
// Picture credits: the free credit, unlocking, packs bought through the webhook, refunds, by hand.

declare(strict_types=1);

function keyOf(string $text): string
{
    return hash('sha256', $text);
}

function event(string $id, string $type, array $object): array
{
    return ['id' => $id, 'type' => $type, 'data' => ['object' => $object]];
}

function packSession(int $userId, string $session = 'cs_1', string $product = 'pictures-5', int $amount = 899): array
{
    return ['id' => $session, 'mode' => 'payment', 'payment_status' => 'paid', 'client_reference_id' => (string) $userId, 'metadata' => ['plan' => $product], 'amount_total' => $amount, 'currency' => 'eur', 'payment_intent' => 'pi_' . $session];
}

function freshUser(string $email = 'painter@example.org'): array
{
    return userByEmail($email);
}

test('credits: a new account gets the free credit once', function () {
    $user = freshUser();
    same(1, creditBalance((int) $user['id']));
    userByEmail('painter@example.org');
    grantWelcomeCredits(db(), (int) $user['id']);
    same(1, creditBalance((int) $user['id']));
    check(preg_match('/^[0-9a-f]{32}$/', (string) $user['picture_salt']) === 1, 'salt');
});

test('credits: accounts from before credits get the free credit, and only once', function () {
    $file = $GLOBALS['accountConfig']['database'];
    $old = new PDO('sqlite:' . $file);
    $old->exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, consent_version TEXT, consent_at INTEGER, stripe_customer TEXT, lifetime INTEGER NOT NULL DEFAULT 0, sub_id TEXT, sub_status TEXT, sub_until INTEGER)');
    $old->exec("INSERT INTO users (email, created_at) VALUES ('a@example.org', 1), ('b@example.org', 2)");
    $old = null;
    same(0, (int) (new PDO('sqlite:' . $file))->query('PRAGMA user_version')->fetchColumn());
    db();
    unset($GLOBALS['accountDb']);
    db();
    grantWelcomeCredits(db());
    foreach (run('SELECT * FROM users')->fetchAll() as $user) {
        same(1, creditBalance((int) $user['id']), $user['email']);
        check($user['picture_salt'] !== null, 'salt of ' . $user['email']);
    }
    same(max(array_keys(MIGRATIONS)), (int) db()->query('PRAGMA user_version')->fetchColumn());
    $salts = array_column(run('SELECT picture_salt FROM users')->fetchAll(), 'picture_salt');
    same(2, count(array_unique($salts)), 'salts differ');
});

test('credits: unlocking spends one credit, a second unlock of the same picture none', function () {
    $user = freshUser();
    same('unlocked', unlockPicture($user, keyOf('photo')));
    same(0, creditBalance((int) $user['id']));
    same('already', unlockPicture($user, keyOf('photo')));
    same(0, creditBalance((int) $user['id']));
    same('empty', unlockPicture($user, keyOf('other photo')));
    check(pictureUnlocked((int) $user['id'], keyOf('photo')));
    check(!pictureUnlocked((int) $user['id'], keyOf('other photo')));
    same(1, (int) run("SELECT COUNT(*) FROM credit_ledger WHERE kind = 'spend'")->fetchColumn());
});

test('credits: a plan spends none', function () {
    $user = freshUser();
    run('UPDATE users SET lifetime = 1 WHERE id = ?', [$user['id']]);
    $user = row('SELECT * FROM users WHERE id = ?', [$user['id']]);
    same('plan', unlockPicture($user, keyOf('photo')));
    same(1, creditBalance((int) $user['id']));
    run("UPDATE users SET lifetime = 0, sub_status = 'active' WHERE id = ?", [$user['id']]);
    same('plan', unlockPicture(row('SELECT * FROM users WHERE id = ?', [$user['id']]), keyOf('photo')));
});

test('credits: only a key of 64 hex digits is taken as a picture key', function () {
    same(keyOf('x'), validPictureKey(keyOf('x')));
    same(null, validPictureKey(strtoupper(keyOf('x'))));
    same(null, validPictureKey('not a key'));
    same(null, validPictureKey(['array']));
});

test('credits: the last credit goes to one of several requests at the same moment', function () {
    $user = freshUser();
    $file = $GLOBALS['accountConfig']['database'];
    $start = microtime(true) + 0.6;
    $processes = [];
    for ($i = 0; $i < 6; $i++) {
        $command = [PHP_BINARY, __DIR__ . '/race-unlock.php', $file, (string) $user['id'], keyOf("photo $i"), (string) $start];
        $processes[] = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $outputs[] = $pipes;
    }
    $results = [];
    foreach ($processes as $i => $process) {
        $results[] = trim((string) stream_get_contents($outputs[$i][1])) . trim((string) stream_get_contents($outputs[$i][2]));
        proc_close($process);
    }
    sort($results);
    same(['empty', 'empty', 'empty', 'empty', 'empty', 'unlocked'], $results);
    same(0, creditBalance((int) $user['id']));
    same(1, (int) run('SELECT COUNT(*) FROM picture_unlocks')->fetchColumn());
});

test('credits: a pack adds its credits once, however often Stripe reports it', function () {
    $user = freshUser();
    $id = (int) $user['id'];
    same(200, answerOf(fn () => handleStripeEvent(event('evt_1', 'checkout.session.completed', packSession($id))))[0]);
    same(6, creditBalance($id));
    [, $again] = answerOf(fn () => handleStripeEvent(event('evt_1', 'checkout.session.completed', packSession($id))));
    same(true, $again['duplicate'] ?? false);
    answerOf(fn () => handleStripeEvent(event('evt_2', 'checkout.session.completed', packSession($id))));
    same(6, creditBalance($id));
    same(1, (int) run('SELECT COUNT(*) FROM purchases')->fetchColumn());
    same(0, (int) row('SELECT lifetime FROM users WHERE id = ?', [$id])['lifetime'], 'no licence from a pack');
});

test('credits: the lifetime licence is still bought with a payment, and gives no credits', function () {
    $user = freshUser();
    $id = (int) $user['id'];
    answerOf(fn () => handleStripeEvent(event('evt_1', 'checkout.session.completed', packSession($id, 'cs_l', 'lifetime', 7900))));
    same(1, (int) row('SELECT lifetime FROM users WHERE id = ?', [$id])['lifetime']);
    same(1, creditBalance($id));
    // A payment of before plans.json, without a plan in its metadata, was the licence too.
    $other = (int) freshUser('other@example.org')['id'];
    $session = packSession($other, 'cs_o');
    unset($session['metadata']);
    answerOf(fn () => handleStripeEvent(event('evt_2', 'checkout.session.completed', $session)));
    same(1, (int) row('SELECT lifetime FROM users WHERE id = ?', [$other])['lifetime']);
});

test('credits: a refund takes back the credits of the money returned, not below 0, pictures stay', function () {
    $user = freshUser();
    $id = (int) $user['id'];
    answerOf(fn () => handleStripeEvent(event('evt_1', 'checkout.session.completed', packSession($id))));
    // Two fifths returned: two of the five pictures.
    answerOf(fn () => handleStripeEvent(event('evt_2', 'charge.refunded', ['id' => 'ch_1', 'payment_intent' => 'pi_cs_1', 'amount_refunded' => 360, 'refunded' => false])));
    same(4, creditBalance($id));
    // The same refund again: nothing more.
    answerOf(fn () => handleStripeEvent(event('evt_3', 'charge.refunded', ['id' => 'ch_1', 'payment_intent' => 'pi_cs_1', 'amount_refunded' => 360, 'refunded' => false])));
    same(4, creditBalance($id));
    foreach (['a', 'b', 'c'] as $photo) {
        unlockPicture($user, keyOf($photo));
    }
    same(1, creditBalance($id));
    // All returned: three more are owed, one is left to take.
    answerOf(fn () => handleStripeEvent(event('evt_4', 'charge.refunded', ['id' => 'ch_1', 'payment_intent' => 'pi_cs_1', 'amount_refunded' => 899, 'refunded' => true])));
    same(0, creditBalance($id));
    same(3, (int) run('SELECT COUNT(*) FROM picture_unlocks')->fetchColumn());
    same(['refund:cs_1:360', 'refund:cs_1:899'], array_column(run("SELECT reference FROM credit_ledger WHERE kind = 'refund' ORDER BY id")->fetchAll(), 'reference'));
    same([-2, -1], array_map('intval', array_column(run("SELECT delta FROM credit_ledger WHERE kind = 'refund' ORDER BY id")->fetchAll(), 'delta')));
});

test('credits: a refund of the licence still takes the licence back', function () {
    $user = freshUser();
    run("UPDATE users SET lifetime = 1, stripe_customer = 'cus_1' WHERE id = ?", [$user['id']]);
    answerOf(fn () => handleStripeEvent(event('evt_1', 'charge.refunded', ['id' => 'ch_9', 'payment_intent' => 'pi_other', 'customer' => 'cus_1', 'amount_refunded' => 7900, 'refunded' => true])));
    same(0, (int) row('SELECT lifetime FROM users WHERE id = ?', [$user['id']])['lifetime']);
});

test('credits: by hand, with a reason, never below 0', function () {
    $id = (int) freshUser()['id'];
    same(3, adjustCredits($id, 3, 'Workshop'));
    same(4, creditBalance($id));
    same(-4, adjustCredits($id, -10, 'Given by mistake'));
    same(0, creditBalance($id));
    same(0, adjustCredits($id, -1, 'Nothing left'));
    try {
        adjustCredits($id, 1, ' ');
        throw new Failure('no error without a reason');
    } catch (InvalidArgumentException) {
    }
    same(2, (int) run("SELECT COUNT(*) FROM credit_ledger WHERE kind = 'admin'")->fetchColumn());
});

test('credits: the app is told the balance, the salt and the unlocked keys', function () {
    $user = freshUser();
    unlockPicture($user, keyOf('photo'));
    $told = describeUser(row('SELECT * FROM users WHERE id = ?', [$user['id']]));
    same(0, $told['credits']);
    same($user['picture_salt'], $told['pictureSalt']);
    same([keyOf('photo')], array_column($told['unlocks'], 'key'));
});
