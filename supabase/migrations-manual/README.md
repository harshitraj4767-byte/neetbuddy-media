# Manual Supabase migrations (external project)

This project connects to an external Supabase (not Lovable Cloud). The Lovable
migration tool can't apply these automatically — copy the SQL below into your
Supabase Dashboard → SQL Editor and run it once.

## 1. Battlegrounds subject fix

Fixes the bug where clicking "Zoology" would sometimes serve Physics
questions. Adds a `subject` column to `battle_matches` / `battle_queue` and
updates the matchmaking RPCs to accept `_subject` and pick a
subject-filtered test.

If your existing `bg_join_queue` / `bg_match_with_bot` signatures differ, keep
your business logic and just add the `_subject` argument and the subject
filter on the `SELECT ... FROM tests` (and on the queue lookup).

```sql
alter table if exists public.battle_matches add column if not exists subject text;
alter table if exists public.battle_queue   add column if not exists subject text;

-- Update the two RPCs below to accept _subject and filter tests.subject = _subject.
-- Example bodies are in supabase/migrations-manual/battle_subject.sql.
```

See `supabase/migrations-manual/battle_subject.sql` for the full function
bodies you can copy verbatim.
