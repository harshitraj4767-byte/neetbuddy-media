-- =====================================================================
-- Question Bank schema for the new Supabase project (cupvxfoikjkufudgehsr)
-- Run this ONCE in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Reference tables ----------
create table if not exists public.qb_subjects (
  id   text primary key,          -- "physics" | "chemistry" | "biology"
  name text not null unique
);

create table if not exists public.qb_chapters (
  id             bigint primary key,           -- keep the bank's chapter_id
  subject_id     text   not null references public.qb_subjects(id) on delete cascade,
  name           text   not null,
  question_count int    not null default 0
);
create index if not exists qb_chapters_subject_idx on public.qb_chapters(subject_id);

create table if not exists public.qb_topics (
  id         bigint primary key,
  chapter_id bigint not null references public.qb_chapters(id) on delete cascade,
  name       text   not null
);
create index if not exists qb_topics_chapter_idx on public.qb_topics(chapter_id);

create table if not exists public.qb_subtopics (
  id       bigint primary key,
  topic_id bigint not null references public.qb_topics(id) on delete cascade,
  name     text   not null
);
create index if not exists qb_subtopics_topic_idx on public.qb_subtopics(topic_id);

-- ---------- Questions ----------
create table if not exists public.qb_questions (
  id                    bigint primary key,               -- bank's numeric id
  subject_id            text   not null references public.qb_subjects(id),
  chapter_id            bigint not null references public.qb_chapters(id) on delete cascade,
  topic_id              bigint references public.qb_topics(id) on delete set null,
  subtopic_id           bigint references public.qb_subtopics(id) on delete set null,
  question_html         text   not null,
  options               jsonb  not null,                  -- [{id,text,isCorrect}]
  correct_index         smallint not null,                -- 0..3
  explanation           text,
  explanation_image_url text,
  difficulty            text   not null default 'Medium',
  qtype                 text   not null default 'MCQ',
  year                  int,
  tag                   text,
  is_pyq                boolean generated always as (year is not null) stored,
  created_at            timestamptz not null default now()
);
create index if not exists qb_q_chapter_idx      on public.qb_questions(chapter_id);
create index if not exists qb_q_subject_chap_idx on public.qb_questions(subject_id, chapter_id);
create index if not exists qb_q_chap_diff_idx    on public.qb_questions(chapter_id, difficulty);
create index if not exists qb_q_tag_idx          on public.qb_questions(tag);
create index if not exists qb_q_year_idx         on public.qb_questions(year);
create index if not exists qb_q_pyq_idx          on public.qb_questions(is_pyq) where is_pyq;

-- ---------- Grants (Data API access) ----------
grant usage on schema public to anon, authenticated;

grant select on public.qb_subjects, public.qb_chapters, public.qb_topics,
                 public.qb_subtopics, public.qb_questions to anon, authenticated;
grant all    on public.qb_subjects, public.qb_chapters, public.qb_topics,
                 public.qb_subtopics, public.qb_questions to service_role;

-- ---------- RLS: public-read only ----------
alter table public.qb_subjects   enable row level security;
alter table public.qb_chapters   enable row level security;
alter table public.qb_topics     enable row level security;
alter table public.qb_subtopics  enable row level security;
alter table public.qb_questions  enable row level security;

do $$ begin
  create policy qb_subjects_read  on public.qb_subjects  for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy qb_chapters_read  on public.qb_chapters  for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy qb_topics_read    on public.qb_topics    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy qb_subtopics_read on public.qb_subtopics for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy qb_questions_read on public.qb_questions for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Compatibility views so existing app code that queries
--   subjects / chapters / questions  keeps working.
-- =====================================================================
drop view if exists public.questions cascade;
drop view if exists public.chapters  cascade;
drop view if exists public.subjects  cascade;

create view public.subjects as
  select id::text as id, name from public.qb_subjects;

create view public.chapters as
  select id::text as id,
         subject_id::text as subject_id,
         name,
         row_number() over (partition by subject_id order by name)::int as order_index
    from public.qb_chapters;

create view public.questions as
  select
    id::text                             as id,
    subject_id::text                     as subject_id,
    chapter_id::text                     as chapter_id,
    question_html                        as text,
    (
      select array_agg(coalesce(o->>'text','') order by (o->>'id')::int)
      from jsonb_array_elements(options) o
    )                                    as options,
    correct_index,
    explanation,
    lower(difficulty)                    as difficulty,
    coalesce(tag, case when is_pyq then 'PYQ' else 'BANK' end) as source,
    4                                    as marks_correct,
    -1                                   as marks_wrong,
    is_pyq,
    year                                 as pyq_year,
    'standard'::text                     as question_type,
    null::text                           as topic,
    null::text                           as sub_topic,
    created_at
  from public.qb_questions;

grant select on public.subjects, public.chapters, public.questions to anon, authenticated;
