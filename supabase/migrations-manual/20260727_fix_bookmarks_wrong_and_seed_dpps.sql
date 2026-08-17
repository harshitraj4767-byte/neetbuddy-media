-- Fix mistakes + bookmarks writes: question_id must accept the text ids exposed
-- by the public.questions view (which wraps qb_questions.id::text). The
-- original uuid column silently rejected every insert.
--
-- Safe because both tables are currently empty in production.

ALTER TABLE public.bookmarks
  DROP CONSTRAINT IF EXISTS bookmarks_user_id_question_id_key;
ALTER TABLE public.bookmarks
  ALTER COLUMN question_id TYPE text USING question_id::text;
ALTER TABLE public.bookmarks
  ADD CONSTRAINT bookmarks_user_id_question_id_key UNIQUE (user_id, question_id);

ALTER TABLE public.wrong_questions
  DROP CONSTRAINT IF EXISTS wrong_questions_user_id_question_id_key;
ALTER TABLE public.wrong_questions
  ALTER COLUMN question_id TYPE text USING question_id::text;
ALTER TABLE public.wrong_questions
  ADD CONSTRAINT wrong_questions_user_id_question_id_key UNIQUE (user_id, question_id);

-- Grants (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wrong_questions TO authenticated;
GRANT ALL ON public.wrong_questions TO service_role;
