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

$stmt = nb_db()->prepare('SELECT id, password_hash, suspended, suspended_reason FROM auth_users WHERE LOWER(email) = ? LIMIT 1');
$stmt->execute([$email]);
$row = $stmt->fetch();

if (!$row || !nb_verify_password($password, $row['password_hash'] ?? null)) {
    nb_fail('Invalid email or password', 401);
}

if (!empty($row['suspended'])) {
    nb_fail((string) ($row['suspended_reason'] ?: 'This account is suspended'), 403);
}

$userId = (string) $row['id'];
nb_db()->prepare('UPDATE auth_users SET last_sign_in_at = NOW() WHERE id = ?')->execute([$userId]);
nb_start_session($userId);
nb_json(nb_session_payload($userId));
