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

/** Last connection problem, as [message, reason-code]. Empty before a failed attempt. */
function nb_db_last_error(?array $set = null): array
{
    static $error = [];
    if ($set !== null) {
        $error = $set;
    }
    return $error;
}

/**
 * Open the database connection, or null on failure (the reason is recorded in
 * nb_db_last_error). Callers that cannot continue should use nb_db().
 */
function nb_db_try(): ?PDO
{
    static $pdo = null;
    static $tried = false;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    if ($tried) {
        return null;
    }
    $tried = true;

    if (!nb_config_is_complete()) {
        nb_db_last_error([
            'reason' => 'not_configured',
            'message' => 'The database credentials are missing on the server. '
                . 'Add config.local.php (or a .env file with MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD) '
                . 'next to public/api/auth.',
        ]);
        error_log('[auth] database credentials missing: set config.local.php or MYSQL_* values');
        return null;
    }

    $c = nb_config();

    // Try the configured host first, then the local socket. On Hostinger the
    // remote host name (srvNNN.hstgr.io) only answers when Remote MySQL is
    // enabled for the caller's IP, while "localhost" always works on-server.
    $hosts = [$c['host']];
    if (strtolower($c['host']) !== 'localhost' && strtolower($c['host']) !== '127.0.0.1') {
        $hosts[] = 'localhost';
    }

    $lastError = null;
    foreach ($hosts as $host) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $c['port'], $c['database']);
        try {
            $pdo = new PDO($dsn, $c['user'], $c['password'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 10,
            ]);
            return $pdo;
        } catch (Throwable $e) {
            $code = $e instanceof PDOException ? (string) $e->getCode() : '';
            $reason = match ($code) {
                '1045' => 'bad_credentials',
                '1044' => 'no_access_to_database',
                '1049' => 'unknown_database',
                '2002' => 'host_unreachable',
                default => 'connection_failed',
            };
            $lastError = ['reason' => $reason, 'message' => $e->getMessage(), 'code' => $code, 'host' => $host];
            error_log('[auth] database connection failed on ' . $host . ' (' . $reason . '): ' . $e->getMessage());
            // Credentials/database problems will not be fixed by another host.
            if (in_array($reason, ['bad_credentials', 'no_access_to_database', 'unknown_database'], true)) {
                break;
            }
        }
    }

    $pdo = null;
    nb_db_last_error($lastError ?? ['reason' => 'connection_failed', 'message' => 'Could not connect to MySQL.']);
    return null;
}

function nb_db(): PDO
{
    $pdo = nb_db_try();
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $error = nb_db_last_error();
    $reason = (string) ($error['reason'] ?? 'connection_failed');
    $public = $reason === 'not_configured'
        ? 'Sign up is temporarily unavailable: the server is not connected to the database yet.'
        : 'Sign up is temporarily unavailable: the database could not be reached.';
    nb_json([
        'error' => $public . (getenv('NB_DEBUG') === '1' ? ' (' . ($error['message'] ?? '') . ')' : ''),
        'reason' => $reason,
    ], 503);
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

    $profile = null;
    try {
        $stmt = $db->prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $profile = $stmt->fetch() ?: null;
    } catch (Throwable $e) {
        error_log('[auth] profile read failed: ' . $e->getMessage());
    }

    $account = null;
    try {
        $stmt = $db->prepare('SELECT email, full_name FROM auth_users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $account = $stmt->fetch() ?: null;
    } catch (Throwable $e) {
        error_log('[auth] account read failed: ' . $e->getMessage());
    }

    $isAdmin = false;
    try {
        $roles = $db->prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1");
        $roles->execute([$userId]);
        $isAdmin = (bool) $roles->fetchColumn();
    } catch (Throwable $e) {
        error_log('[auth] role read failed: ' . $e->getMessage());
    }

    return [
        'user' => [
            'id' => $userId,
            'email' => $profile['email'] ?? $account['email'] ?? null,
            'fullName' => $profile['full_name'] ?? $account['full_name'] ?? null,
        ],
        'profile' => $profile,
        'isAdmin' => $isAdmin,
    ];
}

// ---------------------------------------------------------------------------
// Schema helpers (added to make sign up resilient on Hostinger MySQL)
// ---------------------------------------------------------------------------

/** Column names of a table, lowercased. Empty array when the table is absent. */
function nb_table_columns(string $table): array
{
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    try {
        $stmt = nb_db()->prepare(
            'SELECT LOWER(COLUMN_NAME) AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
        );
        $stmt->execute([$table]);
        $cache[$table] = array_map(static fn($r) => (string) $r['c'], $stmt->fetchAll());
    } catch (Throwable $e) {
        $cache[$table] = [];
    }
    return $cache[$table];
}

/** Insert $values into $table, silently dropping keys the table does not have. */
function nb_insert_known(string $table, array $values): void
{
    $columns = nb_table_columns($table);
    if ($columns === []) {
        throw new RuntimeException("Table `$table` does not exist");
    }
    $cols = [];
    $params = [];
    foreach ($values as $key => $value) {
        if (in_array(strtolower($key), $columns, true)) {
            $cols[] = '`' . $key . '`';
            $params[] = $value;
        }
    }
    if ($cols === []) {
        throw new RuntimeException("No matching columns for `$table`");
    }
    $sql = 'INSERT INTO `' . $table . '` (' . implode(', ', $cols) . ') VALUES ('
        . implode(', ', array_fill(0, count($cols), '?')) . ')';
    nb_db()->prepare($sql)->execute($params);
}

/** Create the auth tables when they are missing, so a fresh database works. */
function nb_ensure_auth_tables(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        nb_db()->exec(
            'CREATE TABLE IF NOT EXISTS auth_users (
               id CHAR(36) NOT NULL PRIMARY KEY,
               email VARCHAR(255) NOT NULL UNIQUE,
               password_hash VARCHAR(255) NOT NULL,
               full_name VARCHAR(255) NULL,
               suspended TINYINT(1) NOT NULL DEFAULT 0,
               suspended_reason VARCHAR(255) NULL,
               last_sign_in_at DATETIME NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        nb_db()->exec(
            'CREATE TABLE IF NOT EXISTS auth_sessions (
               token_hash CHAR(64) NOT NULL PRIMARY KEY,
               user_id CHAR(36) NOT NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               expires_at DATETIME NOT NULL,
               INDEX auth_sessions_user_idx (user_id)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
        nb_db()->exec(
            'CREATE TABLE IF NOT EXISTS profiles (
               id CHAR(36) NOT NULL PRIMARY KEY,
               email VARCHAR(255) NULL,
               full_name VARCHAR(255) NULL,
               created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
               updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    } catch (Throwable $e) {
        // Hosting user may lack CREATE rights; existing tables are then used as-is.
        error_log('[auth] ensure tables skipped: ' . $e->getMessage());
    }
}

/** Include the underlying reason in API errors when NB_DEBUG=1 is set. */
function nb_detail(Throwable $e): string
{
    return (getenv('NB_DEBUG') === '1') ? ' (' . $e->getMessage() . ')' : '';
}
