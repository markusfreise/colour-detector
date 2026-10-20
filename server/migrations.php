<?php
/**
 * Changes to the database after its first tables (lib.php), numbered and run once each, in order.
 * The number reached is kept in SQLite's user_version. Every migration runs in a transaction that
 * holds the database, so two requests at the same moment cannot both run it.
 */

declare(strict_types=1);

const MIGRATIONS = [
    1 => 'migrateCredits',
    2 => 'migrateDeduction',
    3 => 'migrateAppSignIn',
    4 => 'migrateAdmin',
];

function migrate(PDO $db): void
{
    if ((int) $db->query('PRAGMA user_version')->fetchColumn() >= max(array_keys(MIGRATIONS))) {
        return;
    }
    $db->exec('BEGIN IMMEDIATE');
    try {
        // Asked again inside the transaction: another request may have been first.
        $version = (int) $db->query('PRAGMA user_version')->fetchColumn();
        foreach (MIGRATIONS as $number => $migration) {
            if ($number > $version) {
                $migration($db);
                $db->exec('PRAGMA user_version = ' . $number);
            }
        }
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
}

/**
 * Picture credits: every change of a balance in the ledger, the pictures unlocked, the packs bought.
 * A picture is known only by a key the app makes from the bytes of the photo and the salt of the
 * account (see pictureKey in src/lib/picture.js): no picture, and nothing that matches the same
 * photo in another account. Every account, old and new, gets the free credit once.
 */
function migrateCredits(PDO $db): void
{
    $db->exec('ALTER TABLE users ADD COLUMN picture_salt TEXT');
    $db->exec("UPDATE users SET picture_salt = lower(hex(randomblob(16))) WHERE picture_salt IS NULL");
    $db->exec("CREATE TABLE credit_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('grant', 'purchase', 'spend', 'admin', 'refund')),
        reason TEXT NOT NULL,
        reference TEXT,
        created_at INTEGER NOT NULL
    )");
    // What happens once (the free credit, a pack bought, a picture unlocked, a refund) has a reference.
    $db->exec('CREATE UNIQUE INDEX credit_ledger_once ON credit_ledger (kind, reference) WHERE reference IS NOT NULL');
    $db->exec('CREATE INDEX credit_ledger_user ON credit_ledger (user_id)');
    $db->exec('CREATE TABLE picture_unlocks (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        picture_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, picture_key)
    )');
    $db->exec('CREATE TABLE purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        stripe_session TEXT NOT NULL UNIQUE,
        payment_intent TEXT,
        refunded_amount INTEGER NOT NULL DEFAULT 0,
        credits_back INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )');
    $db->exec('CREATE INDEX purchases_intent ON purchases (payment_intent)');
    // The prices shown, as Stripe has them, for an hour.
    $db->exec('CREATE TABLE stripe_prices (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, currency TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
    grantWelcomeCredits($db);
}

/** When the money paid for packs was taken off a first plan; once per account. */
function migrateDeduction(PDO $db): void
{
    $db->exec('ALTER TABLE users ADD COLUMN deduction_used_at INTEGER');
}

/**
 * Signing in from the native app. A handoff carries a sign-in from the browser the app opened back
 * to the app: only its hash is kept, with the hash the app chose for it (the app proves it asked by
 * showing what it hashed). Apple's refresh token is kept to take the sign-in back at Apple when the
 * account is deleted, which Apple asks for; the client is the one Apple gave it to.
 */
function migrateAppSignIn(PDO $db): void
{
    $db->exec('CREATE TABLE app_handoffs (
        hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        challenge TEXT NOT NULL,
        expires_at INTEGER NOT NULL
    )');
    $db->exec('ALTER TABLE identities ADD COLUMN revoke_token TEXT');
    $db->exec('ALTER TABLE identities ADD COLUMN revoke_client TEXT');
}

/**
 * The admin page (admin.php): a role per account, a status set by hand, and who opened a session for
 * somebody else. Superadmins come from config.php, not from here. An address that was banned and then
 * deleted stays banned: only its hash is kept, so that it cannot sign up again.
 */
function migrateAdmin(PDO $db): void
{
    $db->exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))");
    $db->exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'regular' CHECK (status IN ('regular', 'unlocked', 'banned'))");
    $db->exec('ALTER TABLE sessions ADD COLUMN admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
    $db->exec('CREATE TABLE banned_emails (hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL)');
}
