<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

nb_cors();

$token = nb_session_token();
if ($token !== null) {
    nb_db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
}

$c = nb_config();
$secure = nb_is_https();
setcookie($c['cookie'], '', [
    'expires' => time() - 3600,
    'path' => '/',
    'httponly' => true,
    'secure' => $secure,
    'samesite' => $secure ? 'None' : 'Lax',
]);

nb_json(['ok' => true]);
