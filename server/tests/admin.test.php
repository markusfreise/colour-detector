<?php
// The admin page: who may use it, roles and status, a ban that holds, back to free, signing in as
// somebody else and back, deleting for good.

declare(strict_types=1);

require_once dirname(__DIR__) . '/auth.php';
require_once dirname(__DIR__) . '/admin.php';

/** A request from the admin page, signed in with this session. */
function adminRequest(string $method, string $session, array $body = [], array $query = []): void
{
    $_SERVER['REQUEST_METHOD'] = $method;
    $_SERVER['CONTENT_TYPE'] = 'application/json';
    $_SERVER['HTTP_ORIGIN'] = 'https://app.example';
    unset($_SERVER['HTTP_AUTHORIZATION']);
    $_COOKIE = [SESSION_COOKIE => $session];
    $_GET = $query;
    $GLOBALS['requestBody'] = $body;
}

/** A superadmin from the configuration, signed in; returns [session, user]. */
function asSuperadmin(): array
{
    freshDatabase(['superadmins' => ['Boss@Example.org']]);
    $boss = userByEmail('boss@example.org');
    return [newSession((int) $boss['id']), $boss];
}

function idOf(string $email): int
{
    return (int) userByEmail($email)['id'];
}

test('admin: only admins in their own session get in', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    adminRequest('GET', newSession($painter));
    same(403, answerOf(fn () => adminRoute('admin/users'))[0], 'a user');

    adminRequest('GET', $session);
    [$status, $data] = answerOf(fn () => adminRoute('admin/users'));
    same(200, $status);
    same(2, $data['total']);
    same(true, $data['me']['superadmin']);
    same('superadmin', array_column($data['users'], 'role', 'email')['boss@example.org']);
});

test('admin: a superadmin makes an admin, an admin cannot change roles or other admins', function () {
    [$session] = asSuperadmin();
    $helper = idOf('helper@example.org');
    $other = idOf('other@example.org');
    adminRequest('POST', $session, ['role' => 'admin']);
    same('admin', answerOf(fn () => adminRoute("admin/users/$helper"))[1]['user']['role']);

    $helperSession = newSession($helper);
    adminRequest('POST', $helperSession, ['role' => 'admin']);
    same(403, answerOf(fn () => adminRoute("admin/users/$other"))[0], 'role by an admin');
    adminRequest('POST', $helperSession, ['status' => 'unlocked']);
    same(200, answerOf(fn () => adminRoute("admin/users/$other"))[0], 'status by an admin');

    run("UPDATE users SET role = 'admin' WHERE id = ?", [$other]);
    adminRequest('POST', $helperSession, ['status' => 'banned']);
    same(403, answerOf(fn () => adminRoute("admin/users/$other"))[0], 'another admin');
    adminRequest('POST', $helperSession, ['status' => 'banned']);
    same(409, answerOf(fn () => adminRoute("admin/users/$helper"))[0], 'own account');
});

test('admin: nobody changes a superadmin on the admin page', function () {
    freshDatabase(['superadmins' => ['boss@example.org', 'second@example.org']]);
    $boss = userByEmail('boss@example.org');
    $second = idOf('second@example.org');
    adminRequest('POST', newSession((int) $boss['id']), ['status' => 'banned']);
    same(403, answerOf(fn () => adminRoute("admin/users/$second"))[0]);
});

test('admin: unlocked is everything, back to free takes it away again', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    adminRequest('POST', $session, ['status' => 'unlocked']);
    answerOf(fn () => adminRoute("admin/users/$painter"));
    $user = row('SELECT * FROM users WHERE id = ?', [$painter]);
    same('lifetime', planOf($user));
    same(true, describeUser($user)['pro']);

    run("UPDATE users SET lifetime = 1, sub_id = 'sub_1', sub_status = 'active', sub_until = ? WHERE id = ?", [time() + 86400, $painter]);
    $cancelled = [];
    $GLOBALS['httpStub'] = function (string $method, string $url) use (&$cancelled) {
        $cancelled[] = "$method $url";
        return ['status' => 200, 'data' => []];
    };
    adminRequest('POST', $session);
    [$status, $data] = answerOf(fn () => adminRoute("admin/users/$painter/free"));
    unset($GLOBALS['httpStub']);
    same(200, $status);
    same(['DELETE ' . STRIPE . 'subscriptions/sub_1'], $cancelled);
    same(null, $data['user']['plan']);
    same('regular', $data['user']['status']);
    same('canceled', $data['user']['subscription']['status']);
    check(row('SELECT id FROM users WHERE id = ?', [$painter]) !== null, 'the account stays');
});

test('admin: a banned account is out at once and cannot sign in again, even after deletion', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    $painterSession = newSession($painter);
    adminRequest('POST', $session, ['status' => 'banned']);
    answerOf(fn () => adminRoute("admin/users/$painter"));

    adminRequest('GET', $painterSession);
    same(null, currentUser(), 'old session');
    same(403, answerOf(fn () => newSession($painter))[0], 'new session');

    adminRequest('POST', $session);
    same(200, answerOf(fn () => adminRoute("admin/users/$painter/delete"))[0]);
    same(null, row('SELECT id FROM users WHERE id = ?', [$painter]));
    same(403, answerOf(fn () => userByEmail('Painter@example.org'))[0], 'signing up again');
});

test('admin: lifting a ban lets the account back in', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    adminRequest('POST', $session, ['status' => 'banned']);
    answerOf(fn () => adminRoute("admin/users/$painter"));
    adminRequest('POST', $session, ['status' => 'regular']);
    answerOf(fn () => adminRoute("admin/users/$painter"));
    check(newSession($painter) !== '');
});

test('admin: a new address must be valid and free', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    idOf('taken@example.org');
    adminRequest('POST', $session, ['email' => 'not an address']);
    same(422, answerOf(fn () => adminRoute("admin/users/$painter"))[0]);
    adminRequest('POST', $session, ['email' => 'TAKEN@example.org']);
    same(409, answerOf(fn () => adminRoute("admin/users/$painter"))[0]);
    adminRequest('POST', $session, ['email' => ' New@Example.org ']);
    same('new@example.org', answerOf(fn () => adminRoute("admin/users/$painter"))[1]['user']['email']);
});

test('admin: signing in as somebody else is that account only, and the way back is the admin', function () {
    [$session, $boss] = asSuperadmin();
    $painter = idOf('painter@example.org');
    adminRequest('POST', $session);
    same(200, answerOf(fn () => @adminRoute("admin/users/$painter/impersonate"))[0]);
    $acting = row('SELECT * FROM sessions WHERE user_id = ? AND admin_id = ?', [$painter, $boss['id']]);
    check($acting !== null, 'a session marked with the admin');
    check($acting['expires_at'] <= time() + IMPERSONATION_MINUTES * 60, 'a short one');

    // The session value is only in the cookie that was set; make one the same way to use it.
    $value = newSession($painter, (int) $boss['id']);
    adminRequest('GET', $value);
    same('painter@example.org', currentUser()['email']);
    same(403, answerOf(fn () => adminRoute('admin/users'))[0], 'no admin rights while acting');

    adminRequest('POST', $value);
    same(200, answerOf(fn () => @adminRoute('admin/return'))[0]);
    same(null, row('SELECT hash FROM sessions WHERE hash = ?', [hash('sha256', $value)]), 'acting session ended');

    adminRequest('POST', $session);
    same(409, answerOf(fn () => @adminRoute('admin/return'))[0], 'not acting');
});

test('admin: the data download is the same as the user gets', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    adminRequest('GET', $session);
    [$status, $data] = answerOf(fn () => adminRoute("admin/users/$painter/export"));
    same(200, $status);
    same('painter@example.org', $data['email']);
    same(accountData(row('SELECT * FROM users WHERE id = ?', [$painter])), $data);
});

test('admin: changes come only from the app itself', function () {
    [$session] = asSuperadmin();
    $painter = idOf('painter@example.org');
    adminRequest('POST', $session, ['status' => 'banned']);
    $_SERVER['HTTP_ORIGIN'] = 'https://evil.example';
    same(403, answerOf(fn () => adminRoute("admin/users/$painter"))[0]);
    same('regular', row('SELECT status FROM users WHERE id = ?', [$painter])['status']);
});
