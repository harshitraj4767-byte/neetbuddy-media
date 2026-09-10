# Hostinger static deployment

This project ships as a Vite SPA with PHP endpoints under `public/api/auth`. That combination works on a Hostinger plan with **PHP 8.1+ and MySQL**. A truly static-only plan cannot execute PHP or connect to MySQL; use a PHP-capable shared, Business, or VPS plan for sign-up, login, and the authenticated quiz flow.

## Deploy

1. Use Node **20.19+** (or Node 22.12+) and run `npm ci`.
2. Run `npm run build:static`. The build automatically targets `/api/auth`; set `VITE_AUTH_API_BASE` only if your API is mounted elsewhere.
3. Upload the **contents** of `dist/` to `public_html/`, not the `dist` folder itself.
4. Create a MySQL database and user in hPanel.
5. Import `public/api/auth/schema.sql` with phpMyAdmin. Existing databases can skip tables that already exist.
6. Copy `public/api/auth/config.local.example.php` to `public/api/auth/config.local.php` on the server and fill in the hPanel database credentials. The `.htaccess` in that directory blocks the file from being downloaded.
7. Verify `https://your-domain.example/api/auth/diagnose.php` while logged out. It reports configuration and connectivity status without returning credentials. Remove or protect `diagnose.php` after setup if you do not need it.

The generated root `.htaccess` keeps deep links such as `/dashboard` and `/quiz/<id>` inside the SPA while leaving `/api/*` available to PHP.

## What is stored

- Passwords are stored as PBKDF2-SHA256 hashes, never as plain text.
- Sessions use a random HttpOnly cookie and a SHA-256 token hash in `auth_sessions`.
- Database credentials belong in `config.local.php` or server environment variables, never in the repository.
