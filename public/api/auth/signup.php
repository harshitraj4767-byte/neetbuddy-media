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
$fullName = trim((string) ($body['fullName'] ?? $body['full_name'] ?? ''));

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    nb_fail('A valid email is required', 422);
}
if (strlen($password) < 6) {
    nb_fail('Password must be at least 6 characters', 422);
}

$db = nb_db();
nb_ensure_auth_tables();

try {
    $exists = $db->prepare('SELECT 1 FROM auth_users WHERE LOWER(email) = ? LIMIT 1');
    $exists->execute([$email]);
    if ($exists->fetchColumn()) {
        nb_fail('An account with this email already exists', 409);
    }
} catch (PDOException $e) {
    error_log('[auth] signup lookup failed: ' . $e->getMessage());
    nb_fail('Could not create the account' . nb_detail($e), 500);
}

$userId = nb_uuid();

// The account row is what matters. Insert it first, on its own, so a mismatch
// in the (much larger) profiles table can never block sign up.
try {
    nb_insert_known('auth_users', [
        'id' => $userId,
        'email' => $email,
        'password_hash' => nb_hash_password($password),
        'full_name' => $fullName !== '' ? $fullName : null,
        'created_at' => date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    error_log('[auth] signup failed: ' . $e->getMessage());
    // 23000 = duplicate key: another request created the same email first.
    if ($e instanceof PDOException && ($e->getCode() === '23000')) {
        nb_fail('An account with this email already exists', 409);
    }
    nb_fail('Could not create the account' . nb_detail($e), 500);
}

// Best-effort profile row. Only columns that actually exist are written, and a
// failure here is logged instead of rolling the new account back.
try {
    // New accounts start a 3-day free trial (matches the dashboard banner).
    // Without this the app sees trial_expires_at = NULL and shows
    // "your free trial has ended" to brand-new users.
    $trialExpires = (new DateTimeImmutable('now'))->modify('+3 days')->format('Y-m-d H:i:s');
    nb_insert_known('profiles', [
        'id' => $userId,
        'user_id' => $userId,
        'email' => $email,
        'full_name' => $fullName !== '' ? $fullName : null,
        'trial_expires_at' => $trialExpires,
        'created_at' => date('Y-m-d H:i:s'),
        'updated_at' => date('Y-m-d H:i:s'),
    ]);
} catch (Throwable $e) {
    error_log('[auth] profile row not created: ' . $e->getMessage());
}

try {
    nb_start_session($userId);
} catch (Throwable $e) {
    error_log('[auth] session start failed: ' . $e->getMessage());
    nb_fail('Account created, but sign in failed. Please log in.' . nb_detail($e), 500);
}

nb_json(nb_session_payload($userId), 201);
