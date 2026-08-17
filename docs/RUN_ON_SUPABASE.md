# Run this in your Supabase SQL editor

Copy-paste into **Supabase dashboard → SQL editor → New query** and run.

```sql
-- 1. Table for per-option images (each option in a question can BE an image)
CREATE TABLE IF NOT EXISTS public.question_option_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_index int NOT NULL CHECK (option_index >= 0 AND option_index <= 10),
  mime text NOT NULL,
  data bytea NOT NULL,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, option_index)
);

GRANT SELECT ON public.question_option_images TO anon, authenticated;
GRANT ALL   ON public.question_option_images TO service_role;

ALTER TABLE public.question_option_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='question_option_images'
      AND policyname='read_option_images'
  ) THEN
    CREATE POLICY read_option_images ON public.question_option_images
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qoi_qid ON public.question_option_images(question_id);

-- 2. Session table used by the Telegram bot (safe if it already exists)
CREATE TABLE IF NOT EXISTS public.telegram_bot_sessions (
  chat_id bigint PRIMARY KEY,
  telegram_user_id bigint,
  state text NOT NULL DEFAULT 'idle',
  material_type text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_bot_sessions TO service_role;
ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;
```
