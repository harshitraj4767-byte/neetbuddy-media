-- Question-image support for the question bank.
--
-- `qb_questions.question_image_url` stores ONLY a host-agnostic relative path
-- (e.g. `chemistry/15_103519_question_1.png`). The frontend resolves it through
-- src/lib/qbank-images.ts, so the image host (local /img/data, GitHub+jsDelivr,
-- any CDN) can change without touching data. Absolute URLs are also accepted
-- and passed through untouched.

ALTER TABLE public.qb_questions
  ADD COLUMN IF NOT EXISTS question_image_url text;

CREATE INDEX IF NOT EXISTS qb_q_has_image_idx
  ON public.qb_questions (chapter_id)
  WHERE question_image_url IS NOT NULL;

-- Recreate the compatibility view so clients can read the new column.
DROP VIEW IF EXISTS public.questions;
CREATE VIEW public.questions
WITH (security_invoker = on) AS
SELECT
  q.id::text AS id,
  q.subject_id,
  q.chapter_id::text AS chapter_id,
  q.topic_id::text AS topic_id,
  q.subtopic_id::text AS subtopic_id,
  q.question_html AS text,
  COALESCE((
    SELECT array_agg(
      CASE
        WHEN jsonb_typeof(e.elem) = 'object' THEN COALESCE(e.elem ->> 'text', e.elem ->> 'label', e.elem::text)
        WHEN jsonb_typeof(e.elem) = 'string' THEN e.elem #>> '{}'
        ELSE e.elem::text
      END ORDER BY e.ord)
    FROM jsonb_array_elements(q.options) WITH ORDINALITY e(elem, ord)
  ), ARRAY[]::text[]) AS options,
  COALESCE(q.correct_index::integer, (
    SELECT (e.ord - 1)::integer
    FROM jsonb_array_elements(q.options) WITH ORDINALITY e(elem, ord)
    WHERE jsonb_typeof(e.elem) = 'object' AND (e.elem ->> 'isCorrect')::boolean IS TRUE
    LIMIT 1
  )) AS correct_index,
  COALESCE(q.correct_index::integer, (
    SELECT (e.ord - 1)::integer
    FROM jsonb_array_elements(q.options) WITH ORDINALITY e(elem, ord)
    WHERE jsonb_typeof(e.elem) = 'object' AND (e.elem ->> 'isCorrect')::boolean IS TRUE
    LIMIT 1
  )) AS correct_answer,
  q.explanation,
  q.explanation_image_url,
  q.question_image_url,
  q.difficulty,
  q.qtype,
  q.year,
  q.tag,
  q.is_pyq,
  q.created_at
FROM public.qb_questions q;

GRANT SELECT ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
