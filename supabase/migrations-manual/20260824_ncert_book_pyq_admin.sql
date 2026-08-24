-- Physics PYQs + block linkage.
-- The ncert_book_* tables are public read-only; this migration adds the
-- admin-only write path used by /admin-pyq-sync to import and link questions,
-- plus the indexes that make per-chapter lookups cheap.

-- chapter_name is derived from topic_name at import time; make sure it exists.
ALTER TABLE public.ncert_book_pyq ADD COLUMN IF NOT EXISTS chapter_name text;
ALTER TABLE public.ncert_book_pyq ADD COLUMN IF NOT EXISTS image_url text;

CREATE UNIQUE INDEX IF NOT EXISTS ncert_book_pyq_unique_id_key
  ON public.ncert_book_pyq (unique_id);
CREATE INDEX IF NOT EXISTS ncert_book_pyq_subject_chapter_idx
  ON public.ncert_book_pyq (subject, chapter_name);
CREATE INDEX IF NOT EXISTS ncert_book_blocks_chapter_idx_idx
  ON public.ncert_book_blocks (chapter_id, idx);

GRANT SELECT ON public.ncert_book_pyq TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncert_book_pyq TO authenticated;
GRANT ALL ON public.ncert_book_pyq TO service_role;

GRANT SELECT ON public.ncert_book_blocks TO anon;
GRANT SELECT, UPDATE ON public.ncert_book_blocks TO authenticated;
GRANT ALL ON public.ncert_book_blocks TO service_role;

GRANT SELECT ON public.ncert_book_chapters TO anon;
GRANT SELECT, UPDATE ON public.ncert_book_chapters TO authenticated;
GRANT ALL ON public.ncert_book_chapters TO service_role;

ALTER TABLE public.ncert_book_pyq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncert_book_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncert_book_chapters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ncert_book_pyq' AND policyname='Admins manage book pyqs') THEN
    CREATE POLICY "Admins manage book pyqs" ON public.ncert_book_pyq
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ncert_book_blocks' AND policyname='Admins update book blocks') THEN
    CREATE POLICY "Admins update book blocks" ON public.ncert_book_blocks
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ncert_book_chapters' AND policyname='Admins update book chapters') THEN
    CREATE POLICY "Admins update book chapters" ON public.ncert_book_chapters
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;
