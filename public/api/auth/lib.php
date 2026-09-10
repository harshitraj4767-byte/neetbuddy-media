<?php
// Shared helpers: JSON responses, database access, password hashing and sessions.
// The password + session format matches src/lib/auth-mysql.functions.ts exactly:
//   password_hash column: pbkdf2$100000$<salt>$<hex-hash>   (PBKDF2-SHA256, 256 bits)
//   auth_sessions.token_hash: sha256(<random token stored in the cookie>)

declare(strict_types=1);

require_once __DIR__ . '/config.php';

function nb_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function nb_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function nb_fail(string $message, int $status = 400): void
{
    nb_json(['error' => $message], $status);
}

function nb_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    if (is_array($data)) {
        return $data;
    }
    return $_POST;
}

function nb_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = nb_config();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'], $c['database']);
    try {
        $pdo = new PDO($dsn, $c['user'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        error_log('[auth] database connection failed: ' . $e->getMessage());
        nb_fail('Database connection failed', 500);
    }
    return $pdo;
}

function nb_pbkdf2(string $password, string $salt): string
{
    return hash_pbkdf2('sha256', $password, $salt, 100000, 64, false);
}

function nb_hash_password(string $password): string
{
    $salt = bin2hex(random_bytes(16));
    return 'pbkdf2$100000$' . $salt . '$' . nb_pbkdf2($password, $salt);
}

function nb_verify_password(string $password, ?string $stored): bool
{
    if (!is_string($stored)) {
        return false;
    }
    $parts = explode('$', $stored);
    if (count($parts) !== 4 || $parts[0] !== 'pbkdf2') {
        return false;
    }
    return hash_equals($parts[3], nb_pbkdf2($password, $parts[2]));
}

function nb_uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function nb_is_https(): bool
{
    if (($_SERVER['HTTPS'] ?? '') !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    $proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    return strtolower(trim(explode(',', (string) $proto)[0])) === 'https';
}

function nb_start_session(string $userId): void
{
    $c = nb_config();
    $token = bin2hex(random_bytes(32));
    $expires = (new DateTimeImmutable('now'))->modify('+' . $c['session_days'] . ' days');

    nb_db()->prepare(
        'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, NOW(), ?)'
    )->execute([hash('sha256', $token), $userId, $expires->format('Y-m-d H:i:s')]);

    $secure = nb_is_https();
    setcookie($c['cookie'], $token, [
        'expires' => time() + $c['session_days'] * 86400,
        'path' => '/',
        'httponly' => true,
        'secure' => $secure,
        'samesite' => $secure ? 'None' : 'Lax',
    ]);
}

function nb_session_token(): ?string
{
    $c = nb_config();
    $token = $_COOKIE[$c['cookie']] ?? null;
    return is_string($token) && $token !== '' ? $token : null;
}

function nb_current_user_id(): ?string
{
    $token = nb_session_token();
    if ($token === null) {
        return null;
    }
    $stmt = nb_db()->prepare(
        'SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > NOW() LIMIT 1'
    );
    $stmt->execute([hash('sha256', $token)]);
    $row = $stmt->fetch();
    return $row ? (string) $row['user_id'] : null;
}

function nb_session_payload(?string $userId): array
{
    if ($userId === null) {
        return ['user' => null, 'profile' => null, 'isAdmin' => false];
    }

    $db = nb_db();
    $stmt = $db->prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $profile = $stmt->fetch() ?: null;

    $roles = $db->prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1");
    $roles->execute([$userId]);
    $isAdmin = (bool) $roles->fetchColumn();

    return [
        'user' => [
            'id' => $userId,
            'email' => $profile['email'] ?? null,
            'fullName' => $profile['full_name'] ?? null,
        ],
        'profile' => $profile,
        'isAdmin' => $isAdmin,
    ];
}
