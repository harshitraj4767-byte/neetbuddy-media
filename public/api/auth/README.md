# Auth API (PHP, for static hosting on Hostinger)

The site is built as a static bundle, so there is no Node server. Log in and
sign up are handled by these small PHP endpoints, which talk to the MySQL
database on the same hosting account.

| Endpoint      | Method | Purpose                          |
| ------------- | ------ | -------------------------------- |
| `signup.php`  | POST   | Create an account and sign in    |
| `login.php`   | POST   | Sign in                          |
| `logout.php`  | POST   | Sign out                         |
| `session.php` | GET    | Current session (cookie based)   |
| `diagnose.php`| GET    | Self-check — no secrets printed  |

## Setting the database credentials (required)

Sign up returns "the server is not connected to the database yet" until the
credentials exist **on the server**. Nothing here is stored in git. Pick one:

**Option A — config.local.php (recommended)**

Create `public_html/api/auth/config.local.php` in the Hostinger File Manager:

```php
<?php
return [
  'host' => 'localhost',
  'port' => 3306,
  'database' => 'u123456_neetbuddy',
  'user' => 'u123456_neetbuddy',
  'password' => 'your-database-password',
];
```

**Option B — .env file**

Upload a `.env` next to the auth folder, in `public_html`, or one level above
it. PHP does not read `.env` by itself, so `config.php` parses it:

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=u123456_neetbuddy
MYSQL_USER=u123456_neetbuddy
MYSQL_PASSWORD=your-database-password
```

Use `localhost` as the host when the database lives on the same Hostinger
account. Use the remote host name only when hPanel → Remote MySQL lists it and
the server IP is allowed.

## Checking it

Open `https://your-domain/api/auth/diagnose.php`. It reports whether the
credentials were found, where they came from, whether MySQL answered, and which
tables exist — without revealing the password. `database_connected: true` means
sign up will work.

To see the raw MySQL message temporarily, add `SetEnv NB_DEBUG 1` to
`public_html/.htaccess` and remove it afterwards.

## Tables

`signup.php` creates `auth_users`, `auth_sessions` and `profiles` when they are
missing and the MySQL user has CREATE rights. Otherwise create them from
`docs/` first.
