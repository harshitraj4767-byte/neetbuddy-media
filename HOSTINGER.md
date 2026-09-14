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
| Entry file | server/index.mjs | Relative to Output directory (.output/server/index.mjs) |

Important Note on Entry File in Hostinger:
In Hostinger's Nitro application preset, the Entry file path is evaluated relative to the Output directory:
- Set Output directory to: .output
- Set Entry file to: server/index.mjs

Do NOT set Entry file to .output/server/index.mjs (which would resolve to .output/.output/server/index.mjs) and do NOT set Output directory to .output/public.

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


<!-- Deployment trigger: 2026-09-14 08:58:04 UTC -->
