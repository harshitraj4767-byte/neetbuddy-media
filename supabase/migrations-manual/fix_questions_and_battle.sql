-- =====================================================================
-- Fix: questions view options shape + subject-aware battleground RPCs
-- Idempotent. Safe to re-run.
-- =====================================================================

BEGIN;

-- ---------- 1. Rebuild `questions` view so options are text[] ----------
DROP VIEW IF EXISTS public.questions CASCADE;
CREATE VIEW public.questions AS
SELECT
  q.id::text                                                     AS id,
  q.subject_id                                                   AS subject_id,
  q.chapter_id::text                                             AS chapter_id,
  q.topic_id::text                                               AS topic_id,
  q.subtopic_id::text                                            AS subtopic_id,
  q.question_html                                                AS text,
  -- Project options as a plain text[] the UI can render directly.
  -- Handles the two known shapes:
  --   (a) [{id,text,isCorrect}, ...]       -> take .text
  --   (b) ["opt1","opt2",...]              -> pass through
  COALESCE(
    (
      SELECT array_agg(
               CASE
                 WHEN jsonb_typeof(elem) = 'object' THEN COALESCE(elem->>'text', elem->>'label', elem::text)
                 WHEN jsonb_typeof(elem) = 'string' THEN elem #>> '{}'
                 ELSE elem::text
               END
               ORDER BY ord
             )
      FROM jsonb_array_elements(q.options) WITH ORDINALITY e(elem, ord)
    ),
    ARRAY[]::text[]
  )                                                              AS options,
  -- correct_answer prefers the stored correct_index; falls back to the
  -- object flag if it ever diverges.
  COALESCE(
    q.correct_index::int,
    (
      SELECT (ord - 1)::int
      FROM jsonb_array_elements(q.options) WITH ORDINALITY e(elem, ord)
      WHERE jsonb_typeof(elem) = 'object' AND (elem->>'isCorrect')::boolean IS TRUE
      LIMIT 1
    )
  )                                                              AS correct_index,
  COALESCE(
    q.correct_index::int,
    (
      SELECT (ord - 1)::int
      FROM jsonb_array_elements(q.options) WITH ORDINALITY e(elem, ord)
      WHERE jsonb_typeof(elem) = 'object' AND (elem->>'isCorrect')::boolean IS TRUE
      LIMIT 1
    )
  )                                                              AS correct_answer,
  q.explanation                                                  AS explanation,
  q.explanation_image_url                                        AS explanation_image_url,
  q.difficulty                                                   AS difficulty,
  q.qtype                                                        AS qtype,
  q.year                                                         AS year,
  q.tag                                                          AS tag,
  q.is_pyq                                                       AS is_pyq,
  q.created_at                                                   AS created_at
FROM public.qb_questions q;

GRANT SELECT ON public.questions TO anon, authenticated;
GRANT SELECT ON public.questions TO service_role;

-- ---------- 2. Convert tests.question_ids uuid[] -> text[] ----------
-- qb_questions IDs are bigint (stored as text in the view). Existing tests
-- referencing old uuids will no longer resolve; safe to convert in place.
DO $$
DECLARE _typ text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO _typ
    FROM pg_attribute
   WHERE attrelid = 'public.tests'::regclass AND attname = 'question_ids';
  IF _typ = 'uuid[]' THEN
    ALTER TABLE public.tests
      ALTER COLUMN question_ids TYPE text[] USING question_ids::text[];
  END IF;
END $$;

-- ---------- 3. bg_pick_test: subject/chapter aware, works with text ids ----
CREATE OR REPLACE FUNCTION public.bg_pick_test(_subject text, _chapter text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  -- Exact subject + chapter, >=5 questions
  SELECT t.id INTO _id
  FROM public.tests t
  WHERE _subject IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM unnest(t.question_ids) AS u(qid)
      JOIN public.questions q ON q.id = u.qid
      JOIN public.subjects  s ON s.id = q.subject_id
      JOIN public.chapters  c ON c.id = q.chapter_id
      WHERE lower(s.name) = lower(_subject)
        AND (_chapter IS NULL OR lower(c.name) = lower(_chapter))
    )
    AND COALESCE(array_length(t.question_ids, 1), 0) >= 5
  ORDER BY random()
  LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  -- Subject-only fallback
  IF _subject IS NOT NULL THEN
    SELECT t.id INTO _id
    FROM public.tests t
    WHERE EXISTS (
      SELECT 1
      FROM unnest(t.question_ids) AS u(qid)
      JOIN public.questions q ON q.id = u.qid
      JOIN public.subjects  s ON s.id = q.subject_id
      WHERE lower(s.name) = lower(_subject)
    )
    AND COALESCE(array_length(t.question_ids, 1), 0) >= 5
    ORDER BY random() LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;

  -- Any test with >=5 questions
  SELECT t.id INTO _id
    FROM public.tests t
   WHERE COALESCE(array_length(t.question_ids, 1), 0) >= 5
   ORDER BY random() LIMIT 1;
  RETURN _id;
END $function$;

GRANT EXECUTE ON FUNCTION public.bg_pick_test(text, text) TO anon, authenticated, service_role;

-- ---------- 4. Queue: subject column + subject-aware join RPC ----------
ALTER TABLE IF EXISTS public.battle_queue
  ADD COLUMN IF NOT EXISTS subject text;

DROP FUNCTION IF EXISTS public.bg_join_queue(numeric);
DROP FUNCTION IF EXISTS public.bg_join_queue(numeric, text);

CREATE OR REPLACE FUNCTION public.bg_join_queue(_stake numeric, _subject text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _stake NOT IN (0, 2, 5, 10, 25) THEN RAISE EXCEPTION 'Invalid stake'; END IF;

  IF _stake > 0 THEN
    SELECT p.wallet_balance INTO _bal FROM public.profiles p WHERE p.id = _uid FOR UPDATE;
    IF COALESCE(_bal, 0) < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  END IF;

  INSERT INTO public.battle_queue (user_id, stake, status, subject)
  VALUES (_uid, _stake, 'waiting', NULLIF(trim(_subject), ''))
  ON CONFLICT (user_id) DO UPDATE
    SET stake     = EXCLUDED.stake,
        status    = 'waiting',
        subject   = EXCLUDED.subject,
        match_id  = NULL,
        created_at = now();

  RETURN jsonb_build_object('status','waiting','mode','bot_first','subject', NULLIF(trim(_subject),''));
END $function$;

GRANT EXECUTE ON FUNCTION public.bg_join_queue(numeric, text) TO anon, authenticated, service_role;

-- ---------- 5. bg_match_with_bot: subject-aware ----------
DROP FUNCTION IF EXISTS public.bg_match_with_bot();
DROP FUNCTION IF EXISTS public.bg_match_with_bot(text);

CREATE OR REPLACE FUNCTION public.bg_match_with_bot(_subject text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _q public.battle_queue;
  _test_id uuid;
  _match_id uuid;
  _subject_eff text;
  _chapter text;
  _bal numeric;
  _dep numeric;
  _win numeric;
  _from_dep numeric := 0;
  _from_win numeric := 0;
  _bot record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _q FROM public.battle_queue
   WHERE user_id = _uid AND status = 'waiting' FOR UPDATE;
  IF _q.id IS NULL THEN RAISE EXCEPTION 'Not in queue'; END IF;

  IF _q.stake > 0 THEN
    SELECT COALESCE(wallet_balance,0), COALESCE(deposit_balance,0), COALESCE(winnings_balance,0)
      INTO _bal, _dep, _win
      FROM public.profiles WHERE id = _uid FOR UPDATE;
    IF COALESCE(_bal, 0) < _q.stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    _from_dep := LEAST(_dep, _q.stake);
    _from_win := _q.stake - _from_dep;
  END IF;

  -- Prefer explicit subject from arg, then queue row, then daily rotation.
  _subject_eff := COALESCE(NULLIF(trim(_subject), ''), NULLIF(trim(_q.subject), ''));
  IF _subject_eff IS NULL THEN
    SELECT ch.subject, ch.chapter INTO _subject_eff, _chapter
      FROM public.bg_current_chapter() ch LIMIT 1;
  END IF;

  _test_id := public.bg_pick_test(_subject_eff, _chapter);
  IF _test_id IS NULL THEN RAISE EXCEPTION 'No tests available for %', _subject_eff; END IF;

  SELECT name, avatar_url INTO _bot
    FROM public.bg_bot_profiles
   WHERE is_active = true
   ORDER BY random() LIMIT 1;

  IF _bot.name IS NULL THEN
    _bot.name := 'Aarav Sharma';
    _bot.avatar_url := public.bg_bot_icon_url(1);
  END IF;

  INSERT INTO public.battle_matches
    (stake, test_id, subject, chapter, countdown_starts_at, is_bot_match, bot_name, bot_avatar_url)
  VALUES
    (_q.stake, _test_id, _subject_eff, _chapter, now() + interval '10 seconds', true, _bot.name, _bot.avatar_url)
  RETURNING id INTO _match_id;

  INSERT INTO public.battle_match_players (match_id, user_id, score)
  VALUES (_match_id, _uid, 0);

  UPDATE public.battle_queue
     SET status = 'matched', match_id = _match_id
   WHERE id = _q.id;

  IF _q.stake > 0 THEN
    UPDATE public.profiles
       SET deposit_balance  = COALESCE(deposit_balance,0) - _from_dep,
           winnings_balance = COALESCE(winnings_balance,0) - _from_win,
           wallet_balance   = COALESCE(wallet_balance,0) - _q.stake
     WHERE id = _uid;

    INSERT INTO public.wallet_transactions (user_id, amount, type, bucket, status, reference, meta)
    VALUES (_uid, -_q.stake, 'battle_entry', 'mixed', 'completed', _match_id::text,
            jsonb_build_object('from_deposit', _from_dep, 'from_winnings', _from_win));
  END IF;

  RETURN jsonb_build_object(
    'status','matched',
    'match_id',_match_id,
    'test_id',_test_id,
    'subject',_subject_eff,
    'is_bot',true,
    'bot_name',_bot.name,
    'bot_avatar_url',_bot.avatar_url
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.bg_match_with_bot(text) TO anon, authenticated, service_role;

COMMIT;
