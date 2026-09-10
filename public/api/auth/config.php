<?php
// Database + app configuration for the PHP auth API (Hostinger shared hosting).
//
// Do NOT commit real credentials. Create `config.local.php` next to this file
// on the server (it is git-ignored) and return the values from there:
//
//   <?php
//   return [
//     'host' => 'localhost',
//     'port' => 3306,
//     'database' => 'u123456_neetbuddy',
//     'user' => 'u123456_neetbuddy',
//     'password' => 'secret',
//   ];

declare(strict_types=1);

function nb_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $local = __DIR__ . '/config.local.php';
    $values = is_file($local) ? (array) require $local : [];

    $config = [
        'host' => $values['host'] ?? (getenv('MYSQL_HOST') ?: 'localhost'),
        'port' => (int) ($values['port'] ?? (getenv('MYSQL_PORT') ?: 3306)),
        'database' => $values['database'] ?? (getenv('MYSQL_DATABASE') ?: ''),
        'user' => $values['user'] ?? (getenv('MYSQL_USER') ?: ''),
        'password' => $values['password'] ?? (getenv('MYSQL_PASSWORD') ?: ''),
        'cookie' => 'nb_session',
        'session_days' => 30,
    ];

    return $config;
}
