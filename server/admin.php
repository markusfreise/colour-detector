<?php
/**
 * The admin page (admin/ next to the app): accounts listed and changed by hand.
 *
 * Only for admins (role 'admin', or named under 'superadmins' in config.php), in a session of their
 * own: signed in as somebody else, an admin is that account and nothing more. Roles, and anything
 * done to another admin, are for superadmins; superadmins themselves are changed only in config.php.
 */

declare(strict_types=1);

const ADMIN_PAGE = 50;
const RUNNING = ['active', 'trialing', 'past_due', 'unpaid'];

function requireAdmin(): array
{
    $admin = requireUser();
    if (!isAdmin($admin) || $admin['acting_admin'] !== null) {
        fail(403, 'Admins only.');
    }
    return $admin;
}

/** The account an admin may change: not their own, not a superadmin, another admin only for a superadmin. */
function adminTarget(array $admin, int $id): array
{
    $user = row('SELECT * FROM users WHERE id = ?', [$id]) ?? fail(404, 'No such account.');
    if ((int) $user['id'] === (int) $admin['id']) {
        fail(409, 'Not on your own account.');
    }
    if (isSuperadmin($user)) {
        fail(403, 'Superadmins are set in config.php.');
    }
    if (isAdmin($user) && !isSuperadmin($admin)) {
        fail(403, 'Only a superadmin can change another admin.');
    }
    return $user;
}

/** An account as the admin page lists it. */
function adminRow(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'email' => $user['email'],
        'created' => (int) $user['created_at'],
        'role' => isSuperadmin($user) ? 'superadmin' : $user['role'],
        'status' => $user['status'],
        'plan' => planOf($user),
        'lifetime' => (int) $user['lifetime'] === 1,
        'subscription' => $user['sub_id'] ? ['status' => $user['sub_status'], 'until' => $user['sub_until'] ? (int) $user['sub_until'] : null] : null,
        'credits' => creditBalance((int) $user['id']),
        'signInWith' => array_column(run('SELECT provider FROM identities WHERE user_id = ?', [$user['id']])->fetchAll(), 'provider'),
    ];
}

function adminRoute(string $route): never
{
    if ($route === 'admin/return') {
        returnToAdmin();
    }
    $admin = requireAdmin();
    if ($route === 'admin/users') {
        method('GET');
        listUsers($admin);
    }
    if (!preg_match('#^admin/users/(\d+)(?:/(export|free|impersonate|delete))?$#', $route, $match)) {
        fail(404, 'Not found.');
    }
    $id = (int) $match[1];
    switch ($match[2] ?? '') {
        case 'export':
            // Anybody's data, superadmins' too: reading changes nothing.
            method('GET');
            send(accountData(row('SELECT * FROM users WHERE id = ?', [$id]) ?? fail(404, 'No such account.')));
        case 'free':
            method('POST');
            body();
            makeFree(adminTarget($admin, $id));
        case 'impersonate':
            method('POST');
            body();
            $user = adminTarget($admin, $id);
            startSession((int) $user['id'], (int) $admin['id']);
            send(['ok' => true]);
        case 'delete':
            method('POST');
            body();
            deleteForGood(adminTarget($admin, $id));
        default:
            method('POST');
            changeUser($admin, adminTarget($admin, $id), body());
    }
}

function listUsers(array $admin): never
{
    $query = trim((string) ($_GET['q'] ?? ''));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $like = '%' . strtr(strtolower($query), ['\\' => '\\\\', '%' => '\%', '_' => '\_']) . '%';
    $users = run("SELECT * FROM users WHERE email LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", [$like, ADMIN_PAGE + 1, $offset])->fetchAll();
    send([
        'users' => array_map('adminRow', array_slice($users, 0, ADMIN_PAGE)),
        'more' => count($users) > ADMIN_PAGE,
        'total' => (int) run("SELECT COUNT(*) FROM users WHERE email LIKE ? ESCAPE '\\'", [$like])->fetchColumn(),
        'me' => ['id' => (int) $admin['id'], 'email' => $admin['email'], 'superadmin' => isSuperadmin($admin)],
    ]);
}

/** Role, status and address; everything is checked before anything is changed. */
function changeUser(array $admin, array $user, array $changes): never
{
    $role = $changes['role'] ?? null;
    $status = $changes['status'] ?? null;
    $email = isset($changes['email']) ? strtolower(trim((string) $changes['email'])) : null;
    if ($role !== null && (!in_array($role, ['user', 'admin'], true) || !isSuperadmin($admin))) {
        fail(isSuperadmin($admin) ? 422 : 403, isSuperadmin($admin) ? 'Unknown role.' : 'Only a superadmin can change roles.');
    }
    if ($status !== null && !in_array($status, ['regular', 'unlocked', 'banned'], true)) {
        fail(422, 'Unknown status.');
    }
    if ($email !== null && $email !== $user['email']) {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            fail(422, 'That does not look like an e-mail address.');
        }
        if (row('SELECT id FROM users WHERE email = ?', [$email])) {
            fail(409, 'Another account has this address.');
        }
    }

    if ($status === 'banned' && $user['status'] !== 'banned') {
        // Out at once, and no more payments for an account that can never be used again.
        cancelBilling($user);
        run('DELETE FROM sessions WHERE user_id = ?', [$user['id']]);
    }
    if ($status !== null && $status !== 'banned') {
        run('DELETE FROM banned_emails WHERE hash = ?', [bannedKey($email ?? $user['email'])]);
    }
    run('UPDATE users SET role = ?, status = ?, email = ? WHERE id = ?', [$role ?? $user['role'], $status ?? $user['status'], $email ?? $user['email'], $user['id']]);
    send(['user' => adminRow(row('SELECT * FROM users WHERE id = ?', [$user['id']]))]);
}

/** Back to the free version: the subscription ends at Stripe at once, licence and unlock are taken away. The account stays. */
function makeFree(array $user): never
{
    cancelBilling($user);
    $running = implode(', ', array_fill(0, count(RUNNING), '?'));
    run("UPDATE users SET sub_status = 'canceled', sub_until = ? WHERE id = ? AND sub_status IN ($running)", [time(), $user['id'], ...RUNNING]);
    run("UPDATE users SET lifetime = 0, status = CASE status WHEN 'unlocked' THEN 'regular' ELSE status END WHERE id = ?", [$user['id']]);
    send(['user' => adminRow(row('SELECT * FROM users WHERE id = ?', [$user['id']]))]);
}

/** As when the user deletes the account; a banned address stays banned. */
function deleteForGood(array $user): never
{
    cancelBilling($user);
    revokeAppleSignIns($user);
    if ($user['status'] === 'banned') {
        run('INSERT OR IGNORE INTO banned_emails (hash, created_at) VALUES (?, ?)', [bannedKey($user['email']), time()]);
    }
    run('DELETE FROM users WHERE id = ?', [$user['id']]);
    send(['ok' => true]);
}

/** Ends signing in as somebody else: the admin is signed in as themselves again. */
function returnToAdmin(): never
{
    method('POST');
    body();
    $user = requireUser();
    $admin = $user['acting_admin'] === null ? null : row('SELECT * FROM users WHERE id = ?', [$user['acting_admin']]);
    if (!$admin) {
        fail(409, 'Not signed in as somebody else.');
    }
    endSession();
    if (!isAdmin($admin)) {
        fail(403, 'Admins only.');
    }
    startSession((int) $admin['id']);
    send(['ok' => true]);
}
