# Deploying to Hostinger

This app is a full-stack, server-rendered app: pages are rendered by a Node
server and roughly 120 "server functions" run the database, auth, payments,
cron and admin logic. It is **not** a folder of HTML files.

Hostinger now runs Node.js apps directly on **Business Web Hosting** and on
**Cloud Startup / Professional / Enterprise** plans (in hPanel these are called
**Web Apps**). That is the supported way to host this project on Hostinger —
everything keeps working, with no per-page changes.

## Option A (recommended) — Node.js Web App on Business hosting

### 1. Create the app

1. hPanel → **Websites** → **Add Website** → **Node.js web app**.
2. Choose **Import Git repository** → connect GitHub → pick
   `harshitraj4767-byte/migration-helper` → branch `main`.
3. If the domain is already attached to another website on the plan, remove that
   website first — the Node flow needs a fresh slot for the domain.

### 2. Deploy settings

| Field | Value |
|---|---|
| Framework preset | **Other** |
| Node.js version | **22** (or 20) |
| Package manager | npm |
| Build command | `npm run build:node` |
| Entry file | `start-server.mjs` |
| Output directory | *(leave empty — this is a server app, not a static one)* |

`npm run build:node` produces `.output/server/index.mjs` plus the client assets,
and `start-server.mjs` boots it on the port Hostinger provides (`$PORT`).

### 3. Environment variables

Add these under the app's **Environment variables** (needed at build time *and*
runtime):

| Name | Value |
|---|---|
| `SB_URL` | `https://<project>.supabase.co` |
| `SB_PUBLISHABLE_KEY` | anon / publishable key |
| `SB_SERVICE_ROLE_KEY` | service role key (**server-only, keep secret**) |
| `SB_PROJECT_ID` | Supabase project ref |
| `CRON_SECRET` | random 48-char string, matches `app.cron_secret` in Postgres |
| `LOVABLE_API_KEY` | only if AI features are used |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | only if payments are enabled |
| `TELEGRAM_STUDY_BOT_TOKEN` | only if the Telegram bot is used |

### 4. Deploy

Click **Deploy**. Every later push to `main` redeploys automatically.
If the build is green but the site does not answer, open **Runtime Logs** —
the usual cause is a missing environment variable.

### 5. Scheduled jobs

The cron endpoints live at `/api/public/cron.*` and are protected by
`CRON_SECRET`. Point Supabase `pg_cron` (or any external scheduler) at
`https://yourdomain.com/api/public/cron.<name>` with the secret header.

## Option B — Static build (Premium / older shared plans only)

`npm run build:static` produces a plain `dist/` folder (with an `.htaccess`
SPA fallback) that can be uploaded into `public_html`. **Limitation:** there is
no Node process, so every server function fails — logins, payments, admin,
cron, AI and anything reading the database through the server will not work.
Use this only for a preview of the front end.

## Option C — Hostinger VPS (full control)

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/harshitraj4767-byte/migration-helper.git
cd migration-helper && bun install
export SB_URL=... SB_PUBLISHABLE_KEY=...
bun run build:node
PORT=3000 npx pm2 start start-server.mjs --name neet-buddy
pm2 save && pm2 startup
```

Then reverse-proxy port 3000 with Apache or Nginx and run `certbot` for HTTPS.

## Security note

`wrangler.jsonc` currently contains a live Supabase **service role key** in
plain text. Anyone with repo access can read and misuse it. Rotate that key in
Supabase and move it into environment variables / Cloudflare secrets.
