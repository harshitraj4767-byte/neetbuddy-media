# Plan

## 1) Feed all 80 short notes into DB (organized per NTA syllabus)

Your DB already has the NCERT chapter list for Physics / Chemistry / Biology (Class 11 + 12). I'll:

- Extract all 80 PDFs from the uploaded zip parts.
- Map each file → correct subject + exact chapter name that already exists in `chapters` (e.g. `Chapter 1- Electric Charges and Fields...` → Physics · "Electric charges & Fields").
- Upload each PDF as a Lovable Asset (CDN), then insert one `study_materials` row per file (`material_type = short_notes`, correct `subject_id` + `chapter_id`, clean title like "Electric Charges and Fields — Short Notes", ordered by chapter's `order_index`).
- Server-side via a one-off admin server fn using your service role — no need for you to click anything.

## 2) Watermark on downloads

The `pdf-watermark.ts` helper already stamps the app logo + `neetbuddy.app` footer on every page. Currently `study-view.tsx` links straight to the raw PDF (`<a href download>`), so downloads are unwatermarked. I'll:

- Wire the `PDF` button in `study-view.tsx` to `downloadWatermarkedPdf(url, title)` so every downloaded short-note is stamped.
- Keep the in-viewer overlay watermark as-is.

## 3) Trial-plan usage limits (server-enforced)

I'll add a single migration for a `trial_usage` table (`user_id, kind, day date, count`) with unique `(user_id, kind, day)` — plus a `trial_lifetime_usage` view for the "first N ever" limits. Server functions will `INSERT ... ON CONFLICT DO UPDATE` and reject over-limit trial users. Admins & paid users are never limited.

| Feature                              | Trial limit                | Enforcement point                                     |
|--------------------------------------|----------------------------|-------------------------------------------------------|
| Mock tests                           | 5 total (lifetime)         | `startMockAttempt` (`mock-gate.functions.ts`)         |
| Generate test                        | 3 per calendar day (IST)   | `generate-test.functions.ts` before creation          |
| DPPs                                 | Live DPPs only             | `dpp-gate.functions.ts` — block historical/archived   |
| NEETLab models/sims                  | 1 unique per day           | New `neetlab-gate.functions.ts` called on Topic open  |
| Bookmark test + Mistakes test        | 5 each (lifetime)          | The two "generate from bookmarks/mistakes" fns        |
| Short-notes downloads                | 3 per day                  | New `study-download.functions.ts` — token check in `study-view` before `downloadWatermarkedPdf` |

UI: friendly toast/banner on hit ("Free-trial limit reached — upgrade to keep going") + link to `/premium`. Paid tiers bypass everything.

## 4) Support widget revamp

- New bottom-sheet `SupportWidget` (`Sheet` from side="bottom", spring animation, mobile-first) replacing the current one.
- Expanded canned messages (~15+): reset password, payment failed, refund status, activate premium, batch not showing, mock test crashed, video not loading, delete account, referral not credited, mentor question, add to home screen, subscription end date, invoice/GST, feature not unlocked, report a bug, etc.
- Each canned message: one tap → inserts as user message + posts to support thread.
- "Switch to AI mode" toggle at top of the sheet — routes messages to existing AI chat backend instead of human support. Toggle persists per session.
- Keeps existing `support.functions.ts` backend; adds `supportAskAi` server fn that calls Lovable AI Gateway (google/gemini-2.5-flash).

## Technical notes

- Trial-usage table uses `date_trunc('day', now() at time zone 'Asia/Kolkata')` for per-day counters.
- Short-notes upload: I'll batch-upload PDFs to Lovable Assets from the sandbox (not Supabase Storage) so they're served from CDN and asset URLs stay stable — inserted into `study_materials.pdf_url`.
- Admin gets unlimited access on every gate (`isAdmin` short-circuit already exists in `access.server.ts`).
- No changes to paid-tier behavior.

Reply "go" and I'll start executing. If any limit numbers or the "live DPPs only" wording is off, tell me now and I'll adjust.
