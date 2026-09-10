<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

nb_cors();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    nb_fail('Method not allowed', 405);
}

$body = nb_body();
$email = strtolower(trim((string) ($body['email'] ?? '')));
$password = (string) ($body['password'] ?? '');

if ($email === '' || $password === '') {
    nb_fail('Email and password are required', 422);
}

nb_ensure_auth_tables();

$columns = nb_table_columns('auth_users');
$hasSuspended = in_array('suspended', $columns, true);
$select = $hasSuspended
    ? 'SELECT id, password_hash, suspended, suspended_reason FROM auth_users WHERE LOWER(email) = ? LIMIT 1'
    : 'SELECT id, password_hash FROM auth_users WHERE LOWER(email) = ? LIMIT 1';

try {
    $stmt = nb_db()->prepare($select);
    $stmt->execute([$email]);
    $row = $stmt->fetch();
} catch (Throwable $e) {
    error_log('[auth] login lookup failed: ' . $e->getMessage());
    nb_fail('Could not sign you in' . nb_detail($e), 500);
}

if (!$row || !nb_verify_password($password, $row['password_hash'] ?? null)) {
    nb_fail('Invalid email or password', 401);
}

if (!empty($row['suspended'])) {
    nb_fail((string) ($row['suspended_reason'] ?: 'This account is suspended'), 403);
}

$userId = (string) $row['id'];
if (in_array('last_sign_in_at', $columns, true)) {
    try {
        nb_db()->prepare('UPDATE auth_users SET last_sign_in_at = NOW() WHERE id = ?')->execute([$userId]);
    } catch (Throwable $e) {
        error_log('[auth] last_sign_in_at update failed: ' . $e->getMessage());
    }
}
nb_start_session($userId);
nb_json(nb_session_payload($userId));
