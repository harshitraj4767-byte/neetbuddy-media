<?php
// Safe self-check for the auth API. Open https://your-domain/api/auth/diagnose.php
// It never prints the password and never prints the raw MySQL error unless the
// server sets NB_DEBUG=1.

declare(strict_types=1);

require_once __DIR__ . '/lib.php';

nb_cors();

$c = nb_config();
$debug = getenv('NB_DEBUG') === '1';

$report = [
    'php_version' => PHP_VERSION,
    'pdo_mysql_available' => in_array('mysql', PDO::getAvailableDrivers(), true),
    'credentials_source' => $c['has_local_file']
        ? 'config.local.php'
        : ($c['env_file'] !== '' ? '.env file' : 'environment variables'),
    'env_file_found' => $c['env_file'] !== '',
    'host' => $c['host'],
    'port' => $c['port'],
    'database_set' => $c['database'] !== '',
    'user_set' => $c['user'] !== '',
    'password_set' => $c['password'] !== '',
];

$pdo = nb_db_try();
$report['database_connected'] = $pdo instanceof PDO;

if ($pdo instanceof PDO) {
    foreach (['auth_users', 'auth_sessions', 'profiles'] as $table) {
        $report['tables'][$table] = nb_table_columns($table) !== [];
    }
} else {
    $error = nb_db_last_error();
    $report['reason'] = $error['reason'] ?? 'connection_failed';
    $report['hint'] = match ($report['reason']) {
        'not_configured' => 'Create public/api/auth/config.local.php on the server (or upload a .env with MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD).',
        'bad_credentials' => 'MySQL rejected the user/password. Re-check them in hPanel → Databases.',
        'no_access_to_database' => 'This MySQL user has no rights on that database. Grant them in hPanel.',
        'unknown_database' => 'No database with that name exists on this server.',
        'host_unreachable' => 'MySQL host/port is wrong, or remote MySQL access is not allowed for this server.',
        default => 'Check the MySQL host, database name, user and password.',
    };
    if ($debug) {
        $report['detail'] = $error['message'] ?? '';
    }
}

nb_json($report, $report['database_connected'] ? 200 : 503);
