# Hostinger deployment

Use Hostinger's **Web App / Node.js hosting** for the complete application. The dashboard, authenticated pages, server functions, and quiz flow require the Node runtime; a static-only upload cannot execute those server functions.

## Full app: Node.js Web App (recommended)

1. Select Node **20.19+** (or Node 22.12+) in hPanel.
2. Set the build command to `npm ci && npm run build:node`.
3. Set the startup/entry file to `start-server.mjs`.
4. Set the application root to the repository root and expose the Hostinger-provided `PORT`.
5. Add the MySQL variables used by the app: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`.
6. Import the schema/data SQL files into the MySQL database before signing in.
7. Open the site and verify `/login`, a successful redirect to `/dashboard`, and a quiz route such as `/quiz/subjects` before inviting users.

The generated Node bundle includes the server functions used by protected pages, so this mode supports the complete login → dashboard → quiz flow.

## Static-only option

`npm run build:static` generates a Vite SPA in `dist/` with the PHP auth endpoints under `public/api/auth`. It is suitable for public pages and sign-up/login on a PHP 8.1+ + MySQL plan, but it is **not** a full replacement for the Node Web App because the dashboard and quiz data calls require server functions.

For a static deployment, upload the **contents** of `dist/` to `public_html/`; the build automatically targets `/api/auth`. Set `VITE_AUTH_API_BASE` only if the PHP API is mounted elsewhere. Do not use this mode when the authenticated quiz flow is required.

## ENOTFOUND / npm network troubleshooting

The repository pins npm to the public registry and retries transient downloads in `.npmrc`. If Hostinger still reports `ENOTFOUND`, the build worker cannot resolve or reach the registry.

Run these checks in the Hostinger build shell, if SSH/build logs provide a shell:

```sh
getent hosts registry.npmjs.org
npm config get registry
npm config get proxy
npm config get https-proxy
npm ping --registry=https://registry.npmjs.org/
```

Expected values are a resolved address, `https://registry.npmjs.org/`, and no proxy unless Hostinger gave you one. If your hosting network requires a proxy, configure `HTTP_PROXY`, `HTTPS_PROXY`, and (if needed) `NO_PROXY` as Hostinger environment variables. Do not put proxy usernames, passwords, or tokens in `.npmrc`, `package.json`, or the repository.

If hPanel has a stale registry or proxy override, clear it and redeploy. A failed `getent` or `npm ping` must be fixed by Hostinger network/DNS support; changing application dependencies cannot repair that infrastructure failure.

## Security

- Passwords are stored as PBKDF2-SHA256 hashes, never plain text.
- Sessions use a random HttpOnly cookie and a SHA-256 token hash in `auth_sessions`.
- Database credentials and proxy credentials belong in Hostinger environment variables or server-only configuration, never in the repository.
