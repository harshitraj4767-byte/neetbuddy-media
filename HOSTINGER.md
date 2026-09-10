# Hostinger static deployment

This project ships as a Vite SPA with PHP endpoints under `public/api/auth`.
That combination works on a Hostinger plan that provides **PHP 8.1+ and
MySQL**. A truly static-only plan cannot execute PHP or connect to MySQL; use a
PHP-capable shared, Business, or VPS plan for sign-up and login.

## Deploy

1. Run `npm ci` and `npm run build:static`.
2. Upload the **contents** of `dist/` to `public_html/`, not the `dist`
   folder itself.
3. Create a MySQL database and user in hPanel.
4. Import `public/api/auth/schema.sql` with phpMyAdmin. Existing databases can
   skip tables that already exist.
5. Copy `public/api/auth/config.local.example.php` to
   `public/api/auth/config.local.php` on the server and fill in the hPanel
   database credentials. The `.htaccess` in that directory blocks the file
   from being downloaded.
6. Verify `https://your-domain.example/api/auth/diagnose.php` while logged out.
   It reports configuration and connectivity status without returning
   credentials. Remove or protect `diagnose.php` after setup if you do not need
   it.

The client uses `/api/auth` automatically when the static build cannot reach
the Node server. To make that choice explicit in a build environment, set
`VITE_AUTH_API_BASE=/api/auth` before running `npm run build:static`.

## What is stored

- Passwords are stored as PBKDF2-SHA256 hashes, never as plain text.
- Sessions use a random HttpOnly cookie and a SHA-256 token hash in
  `auth_sessions`.
- Database credentials belong in `config.local.php` or server environment
  variables, never in the repository.

The static build also generates the root `.htaccess` so refreshes on routes
such as `/dashboard` return the SPA shell while `/api/*` remains a PHP path.