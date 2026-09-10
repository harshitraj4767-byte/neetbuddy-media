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
$fullName = trim((string) ($body['fullName'] ?? ''));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    nb_fail('A valid email is required', 422);
}
if (strlen($password) < 6) {
    nb_fail('Password must be at least 6 characters', 422);
}

$db = nb_db();

$exists = $db->prepare('SELECT 1 FROM auth_users WHERE LOWER(email) = ? LIMIT 1');
$exists->execute([$email]);
if ($exists->fetchColumn()) {
    nb_fail('An account with this email already exists', 409);
}

$userId = nb_uuid();

try {
    $db->beginTransaction();
    $db->prepare(
        'INSERT INTO auth_users (id, email, password_hash, full_name, created_at) VALUES (?, ?, ?, ?, NOW())'
    )->execute([$userId, $email, nb_hash_password($password), $fullName !== '' ? $fullName : null]);
    $db->prepare(
        'INSERT INTO profiles (id, email, full_name, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())'
    )->execute([$userId, $email, $fullName !== '' ? $fullName : null]);
    $db->commit();
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log('[auth] signup failed: ' . $e->getMessage());
    nb_fail('Could not create the account', 500);
}

nb_start_session($userId);
nb_json(nb_session_payload($userId), 201);
