# NEETIQ Prime — Deployment Guide

## 1. Environment variables (canonical, no duplicates)

All legacy names (`EXT_SUPABASE_*`, `MY_SUPABASE_*`, `USER_SUPABASE_*`,
`EXTERNAL_SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, `VITE_SUPABASE_*`) have
been removed from the codebase. Configure exactly these:

### Server-only (Cloudflare Workers secrets)
| Name | Purpose |
|------|---------|
| `APP_SUPABASE_URL` | https://xxxx.supabase.co |
| `APP_SUPABASE_SERVICE_ROLE_KEY` | service role JWT (bypasses RLS) |
| `APP_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key (server publishable client + baked into HTML) |
| `APP_SUPABASE_DB_URL` | Postgres URI (Settings → Database → Connection string → URI) — **only used to run migrations locally**, do NOT ship to Workers |
| `APP_SUPABASE_PROJECT_ID` | Supabase project ref |
| `CRON_SECRET` | random 48-char string — must match `app.cron_secret` in Postgres |
| `LOVABLE_API_KEY` | Lovable AI Gateway key (auto-provisioned) |
| `RAZORPAY_KEY_ID` | optional, only if payments enabled |
| `RAZORPAY_KEY_SECRET` | optional |

### Client-visible (baked at build time)
None additional — `vite.config.ts` bakes `APP_SUPABASE_URL` and
`APP_SUPABASE_PUBLISHABLE_KEY` into the client bundle via `__APP_*__`
defines. You do not need `VITE_*` copies.

### Get your CRON_SECRET
Lovable → **Project Settings → Secrets → `CRON_SECRET` → Reveal**.
Copy that same value into the Postgres GUC below.

---

## 2. Deploy to Cloudflare Workers

The project already ships with `wrangler.jsonc` and
`nitro: { preset: 'cloudflare-module' }`.

```bash
# 1) Install wrangler once
bun add -D wrangler

# 2) Push secrets to Cloudflare (paste the same values you set in Lovable)
bunx wrangler secret put APP_SUPABASE_URL
bunx wrangler secret put APP_SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put APP_SUPABASE_PUBLISHABLE_KEY
bunx wrangler secret put APP_SUPABASE_PROJECT_ID
bunx wrangler secret put CRON_SECRET
bunx wrangler secret put LOVABLE_API_KEY
# optional:
bunx wrangler secret put RAZORPAY_KEY_ID
bunx wrangler secret put RAZORPAY_KEY_SECRET

# 3) Build + deploy
bun run build           # runs vite build -> dist/server + dist/client
bunx wrangler deploy
```

Custom domain: Cloudflare dashboard → Workers & Pages → your worker →
Settings → Triggers → Custom Domains → add `app.yourdomain.com`.

---

## 3. Wire cron jobs to Supabase

Once deployed, the pg_cron jobs need to know your deployed URL + the
CRON_SECRET. Run this **once** in Supabase → SQL editor:

```sql
ALTER DATABASE postgres SET app.cron_base_url = 'https://app.yourdomain.com';
ALTER DATABASE postgres SET app.cron_secret   = 'PASTE_CRON_SECRET_HERE';
SELECT pg_reload_conf();
```

Then verify jobs are alive:
```sql
SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobname;
-- Wait 5 min, then:
SELECT * FROM public.cron_job_runs ORDER BY id DESC LIMIT 20;
```
You should see `keepalive` rows appearing every 5 minutes.

Scheduled jobs (see `db-migrations/20260702110000_cron_bootstrap.sql`):
- `lovable_keepalive` — every 5 min (also proves cron works)
- `lovable_finalize_contests` — every 5 min
- `lovable_infinite_run` — every 2 min
- `lovable_daily_dpp` — **06:00 IST** (`30 0 * * *` UTC) → `POST /api/public/cron/daily-dpp`
- `lovable_daily_contest` — **17:00 IST** (`30 11 * * *` UTC) → `POST /api/public/cron/daily-contest` (contest runs 18:00–20:00 IST)
- `lovable_generate_diagram_dpp` — 03:45 IST
- `lovable_verify_reported` — every 30 min
- `lovable_dedupe_questions` — 01:30 IST

### Manual trigger (from anywhere)

```bash
# Generate 10 quality daily DPPs
curl -X POST -H "x-cron-secret: $CRON_SECRET" \
  https://project--<project-id>.lovable.app/api/public/cron/daily-dpp

# Create today's Daily Live Quiz (6 PM–8 PM IST, 30 quality questions)
curl -X POST -H "x-cron-secret: $CRON_SECRET" \
  https://project--<project-id>.lovable.app/api/public/cron/daily-contest
```


---

## 4. Play Store (Android via Capacitor)

The project ships with `capacitor.config.ts` and `@capacitor/android`.

```bash
# One-time setup
bun run build              # web build first
bunx cap add android       # only first time
bunx cap sync android

# Open Android Studio to build the release AAB
bunx cap open android
```

In Android Studio:
1. **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. Create a keystore (`~/keystores/neetiq.jks`) — **save the password safely**.
   ```bash
   keytool -genkey -v -keystore neetiq.jks -keyalg RSA -keysize 2048 -validity 10000 -alias neetiq
   ```
3. Build → gets `app-release.aab`.

Google Play Console (https://play.google.com/console):
1. Create developer account (US $25 one-time).
2. **All apps → Create app** → NEETIQ Prime → Education → Free.
3. Fill mandatory sections: App content (privacy policy URL, target audience 13+, ads declaration, data safety, content rating).
4. **Testing → Internal testing → Create release** → upload AAB → add testers (up to 100 emails).
5. Promote to Closed → Open → Production. Production first-time review usually 3–7 days.

Required assets:
- App icon 512×512 (already in `public/icons/icon-512.png`).
- Feature graphic 1024×500.
- Phone screenshots (min 2, max 8).
- Short description (80 chars), full description (4000 chars).
- Privacy policy URL (must be publicly accessible, e.g. `https://app.yourdomain.com/privacy`).

---

## 5. IndusAppStore (India-first Android store)

Developer console: https://developer.indusappstore.com/

1. **Sign up** with a business email; verify phone.
2. **Create app** → upload the same signed **APK** (IndusAppStore accepts APK; to get one from the AAB use `bundletool build-apks` or select "APK" instead of "AAB" in Android Studio's signed build wizard).
3. Provide:
   - App name, package (must match your Play Store package `com.neetiq.prime` from `capacitor.config.ts`).
   - Category (Education).
   - Short + long description in English + Hindi (highly recommended for India store).
   - App icon 512×512, feature graphic 1024×500, min 3 screenshots.
   - Content rating (self-declared; Education → all ages usually).
   - Privacy policy URL.
4. **Compliance** — India-specific: mention data storage location (Supabase region), payment method (Razorpay works well for INR), and any billing terms.
5. Submit for review — typical turnaround 24–72 hours.
6. After approval, IndusAppStore returns an app listing URL; add it to your marketing.

Tip: same AAB/APK, same package name → users can install from either store; make sure your signing keystore is the **same** across both stores or Android will refuse the update on a device that installed from the other store.

---

## 6. Common pitfalls

- **Cron 401 errors** in `cron_job_runs` → mismatch between `app.cron_secret` GUC and `CRON_SECRET` env var. Rotate the Lovable secret, redeploy, then re-run the `ALTER DATABASE` block above.
- **Blank page after deploy** → `APP_SUPABASE_URL` / `APP_SUPABASE_PUBLISHABLE_KEY` not baked into build. They must exist as env vars at `bun run build` time, not just at runtime.
- **`Missing APP_SUPABASE_SERVICE_ROLE_KEY`** in Worker logs → set the secret via `wrangler secret put`, then redeploy.
- **Play Store rejection: "unclear data safety"** → fill the Data safety form thoroughly (name what you collect, how it is used, whether shared with third parties, encryption in transit).
