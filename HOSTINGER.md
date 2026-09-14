# Hostinger deployment

Use Hostinger's **Web App** hosting with the **Nitro** framework preset. The app
is a TanStack Start / Nitro application: the dashboard, authenticated pages,
server functions and quiz flow all need the Node server bundle, so a
static-only upload cannot run them.

## Settings that work (verified by a clean local run)

| Field | Value |
| --- | --- |
| Framework / configuration | Nitro |
| Node version | 22 (or 20.19+) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output / server entry | `.output/server/index.mjs` |
| Start command | `npm start` (runs `node start-server.mjs`) |
| Port | Hostinger's injected `PORT` (the server reads it automatically) |

Required environment variables (set them before the first build, otherwise the
server logs `Missing SB_URL or SB_PUBLISHABLE_KEY` and Supabase-backed pages
fail):

- `SB_URL`, `SB_PUBLISHABLE_KEY`
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`

Notes:

- Keep Hostinger’s project/root directory set to the repository root. Do not set it to `public`; the root `package.json` owns the Nitro build.
- `npm run build` builds the Nitro node-server bundle (`scripts/build.mjs` ->
  `scripts/build-node.mjs`). Set `BUILD_TARGET=static` (or run
  `npm run build:static`) only for the static/PHP option below.
- `npm run build` writes a single self-contained `.output/` tree. It no longer
  duplicates the 1.2 GB asset tree into `dist/`; set `COPY_DIST=true` only if a
  host explicitly needs a separate `dist/` folder.
- Import the schema/data SQL files into the MySQL database before signing in.
- After deploying, check `/`, `/login`, `/dashboard` and a quiz route.

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
- Database credentials and proxy credentials belong in Hostinger environment variables, never in `.env`, `config.local.php`, or the repository.
- Before deploying a new revision, `npm run build:verify` performs a clean production build and checks the generated server plus key pages.
