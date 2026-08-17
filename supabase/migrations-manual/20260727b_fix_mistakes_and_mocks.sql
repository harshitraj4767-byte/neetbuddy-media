-- ============================================================
-- Fix "My Mistakes" never updating.
--
-- questions.chapter_id / chapters.id are TEXT ids like '90', but
-- wrong_questions.chapter_id was declared uuid. Every insert from the
-- quiz player therefore failed with 22P02 (invalid input syntax for
-- uuid) and was swallowed, leaving the table permanently empty.
-- ============================================================

ALTER TABLE public.wrong_questions
  ALTER COLUMN chapter_id TYPE text USING chapter_id::text;

-- Backfill from every completed attempt so existing users immediately
-- see their historical mistakes.
INSERT INTO public.wrong_questions (user_id, question_id, chapter_id, created_at)
SELECT DISTINCT ON (a.user_id, ans.qid)
       a.user_id,
       ans.qid,
       q.chapter_id,
       COALESCE(a.submitted_at, a.started_at)
FROM public.attempts a
CROSS JOIN LATERAL jsonb_each_text(a.answers) AS ans(qid, choice)
JOIN public.questions q ON q.id = ans.qid
WHERE a.status = 'completed'
  AND choice ~ '^[0-9]+$'
  AND q.correct_index IS NOT NULL
  AND choice::int <> q.correct_index
ORDER BY a.user_id, ans.qid, COALESCE(a.submitted_at, a.started_at) DESC
ON CONFLICT (user_id, question_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS wrong_questions_user_created_idx
  ON public.wrong_questions (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wrong_questions TO authenticated;
GRANT ALL ON public.wrong_questions TO service_role;
