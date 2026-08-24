-- NCERT Key Points: per-paragraph revision responses + resume position.
-- Already applied to the live database.

create table if not exists public.ncert_keypoint_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_slug text not null,
  topic_key text not null,
  block_id bigint,
  source text not null check (source in ('pyq','qb')),
  question_id bigint not null,
  selected text,
  is_correct boolean not null default false,
  skipped boolean not null default false,
  time_ms integer,
  answered_at timestamptz not null default now()
);
create index if not exists nkp_answers_user_chapter_idx on public.ncert_keypoint_answers(user_id, chapter_slug);
create index if not exists nkp_answers_user_topic_idx on public.ncert_keypoint_answers(user_id, chapter_slug, topic_key);
create index if not exists nkp_answers_recent_idx on public.ncert_keypoint_answers(user_id, answered_at desc);

grant select, insert, update, delete on public.ncert_keypoint_answers to authenticated;
grant all on public.ncert_keypoint_answers to service_role;
alter table public.ncert_keypoint_answers enable row level security;
drop policy if exists nkp_answers_own on public.ncert_keypoint_answers;
create policy nkp_answers_own on public.ncert_keypoint_answers
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ncert_keypoint_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_slug text not null,
  topic_key text not null,
  step_index integer not null default 0,
  steps_total integer not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_slug, topic_key)
);
grant select, insert, update, delete on public.ncert_keypoint_progress to authenticated;
grant all on public.ncert_keypoint_progress to service_role;
alter table public.ncert_keypoint_progress enable row level security;
drop policy if exists nkp_progress_own on public.ncert_keypoint_progress;
create policy nkp_progress_own on public.ncert_keypoint_progress
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
