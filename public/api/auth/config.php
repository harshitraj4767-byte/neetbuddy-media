<?php
// Database + app configuration for the PHP auth API (Hostinger shared hosting).
//
// Credentials are looked up in this order — the first non-empty value wins:
//
//   1. config.local.php  next to this file (git-ignored), returning an array:
//        <?php return ['host'=>'localhost','port'=>3306,'database'=>'u1_db','user'=>'u1_db','password'=>'secret'];
//   2. a .env file (MYSQL_HOST / MYSQL_PORT / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD)
//      found next to this file, in any parent folder up to the document root,
//      or in the document root itself. PHP does NOT read .env automatically,
//      so it is parsed here — uploading .env to the server is enough.
//   3. real environment variables (getenv / $_SERVER / $_ENV), e.g. set through
//      hPanel or a SetEnv line in .htaccess.
//
// Never commit real credentials to git.

declare(strict_types=1);

/** Parse a very small subset of dotenv syntax: KEY=value, # comments, optional quotes. */
function nb_parse_env_file(string $file): array
{
    $out = [];
    $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return $out;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || $line[0] === ';') {
            continue;
        }
        if (str_starts_with($line, 'export ')) {
            $line = trim(substr($line, 7));
        }
        $eq = strpos($line, '=');
        if ($eq === false) {
            continue;
        }
        $key = strtoupper(trim(substr($line, 0, $eq)));
        $value = trim(substr($line, $eq + 1));
        $len = strlen($value);
        if ($len >= 2) {
            $first = $value[0];
            if (($first === '"' || $first === "'") && $value[$len - 1] === $first) {
                $value = substr($value, 1, -1);
            }
        }
        if ($key !== '') {
            $out[$key] = $value;
        }
    }
    return $out;
}

/** Values from the first .env file found near this script or at the document root. */
function nb_env_file_values(): array
{
    static $values = null;
    static $source = '';
    if ($values !== null) {
        return $values;
    }

    $candidates = [];
    $dir = __DIR__;
    for ($i = 0; $i < 5; $i++) {
        $candidates[] = $dir . '/.env';
        $parent = dirname($dir);
        if ($parent === $dir) {
            break;
        }
        $dir = $parent;
    }
    $root = $_SERVER['DOCUMENT_ROOT'] ?? '';
    if (is_string($root) && $root !== '') {
        $candidates[] = rtrim($root, '/') . '/.env';
        $candidates[] = dirname(rtrim($root, '/')) . '/.env';
    }

    $values = [];
    foreach (array_unique($candidates) as $file) {
        if (is_file($file) && is_readable($file)) {
            $parsed = nb_parse_env_file($file);
            if ($parsed !== []) {
                $values = $parsed;
                $source = $file;
                break;
            }
        }
    }

    $GLOBALS['nb_env_file_source'] = $source;
    return $values;
}

/** First non-empty value for $key across .env file, getenv, $_SERVER and $_ENV. */
function nb_env(string $key): string
{
    $fromFile = nb_env_file_values()[$key] ?? '';
    if ($fromFile !== '') {
        return (string) $fromFile;
    }
    $fromGetenv = getenv($key);
    if (is_string($fromGetenv) && $fromGetenv !== '') {
        return $fromGetenv;
    }
    foreach ([$_SERVER, $_ENV] as $bag) {
        if (isset($bag[$key]) && is_scalar($bag[$key]) && (string) $bag[$key] !== '') {
            return (string) $bag[$key];
        }
    }
    return '';
}

function nb_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $local = __DIR__ . '/config.local.php';
    $values = is_file($local) ? (array) require $local : [];

    $pick = static function (array $values, string $key, string $envKey, string $default = ''): string {
        $fromLocal = $values[$key] ?? '';
        if (is_scalar($fromLocal) && (string) $fromLocal !== '') {
            return (string) $fromLocal;
        }
        $fromEnv = nb_env($envKey);
        return $fromEnv !== '' ? $fromEnv : $default;
    };

    $config = [
        'host' => $pick($values, 'host', 'MYSQL_HOST', 'localhost'),
        'port' => (int) $pick($values, 'port', 'MYSQL_PORT', '3306'),
        'database' => $pick($values, 'database', 'MYSQL_DATABASE'),
        'user' => $pick($values, 'user', 'MYSQL_USER'),
        'password' => $pick($values, 'password', 'MYSQL_PASSWORD'),
        'cookie' => 'nb_session',
        'session_days' => 30,
        'has_local_file' => is_file($local),
        'env_file' => (string) ($GLOBALS['nb_env_file_source'] ?? ''),
    ];

    return $config;
}

/** True when database/user/password are all present (whatever the source). */
function nb_config_is_complete(): bool
{
    $c = nb_config();
    return $c['database'] !== '' && $c['user'] !== '' && $c['password'] !== '';
}
