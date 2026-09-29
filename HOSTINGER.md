# Hostinger Node.js Web App Deployment (Nitro Framework)

This TanStack Start application runs as a standalone Nitro Node.js server.

## Official Hostinger hPanel Settings

Set these exact fields in Hostinger hPanel under Web Apps / Deploy Settings:

| hPanel Field | Exact Value | Explanation |
| :--- | :--- | :--- |
| Application type | nitro | Select the Nitro preset |
| Node.js version | 22 (or 20) | Node LTS runtime |
| Root directory | / (or empty) | Repository root |
| Build script | build | Runs npm run build |
| Output directory | .output | Nitro output directory |
| Entry file | .output/server/index.mjs (or server/index.mjs) | Points to Nitro compiled server bundle |

Important Note on Entry File in Hostinger:
Hostinger offers two ways to configure the Entry File depending on your hPanel panel version:
- Recommended: Set Entry file to `.output/server/index.mjs` (matching package.json "main").
- Fallback: If set to `server/index.mjs`, our repository includes a root `server/index.mjs` that proxies directly into `.output/server/index.mjs`.

Both configurations are fully supported and will start the Nitro server cleanly without 404 or unreached errors.

## Local Build & Startup Verification (Passed)

- Build command: npm run build
- Generated server entry: .output/server/index.mjs
- Generated public assets: .output/public/
- Verification suite: npm run verify:deployment
- Tested routes returning HTTP 200:
  - /
  - /login
  - /dashboard
  - /study-planner

## Required Environment Variables

Set these in Hostinger hPanel under Environment Variables before deploying:

- PORT (Hostinger injects this automatically)
- NODE_ENV (production)
- SB_URL
- SB_PUBLISHABLE_KEY
- SB_SERVICE_ROLE_KEY
- SB_DB_URL
- MYSQL_HOST
- MYSQL_PORT
- MYSQL_USER
- MYSQL_PASSWORD
- MYSQL_DATABASE

## Build disk usage (why deploys used to die with no log)

Nitro copies the whole `public/` tree into `.output/public`, so the build needs
roughly twice the size of `public/` in free disk. With a 1.2 GB asset tree the
Hostinger build container hit its disk/memory ceiling and was killed by the
platform — the process disappears without emitting a build log.

Two permanent mitigations are in place:

1. The mirrored PYQ image trees (`public/ncert/pyq/{physics,chemistry,biology}`)
   were byte-identical duplicates of `public/ncert/pyq/images/...` and were
   removed, along with the unused `*.zip.00*` archives (~272 MB). The app
   already requests the `images/` paths and falls back correctly.
2. `scripts/build-node.mjs` replaces every file copied into `.output/public`
   with a hard link to the original in `public/` after the Nitro copy, so the
   output no longer doubles disk usage. Disable with `DEDUPE_PUBLIC=false`.
   The build now also prints the final `.output/public` file count and size.

<!-- Deployment trigger: 2026-09-16 06:52:00 UTC -->
