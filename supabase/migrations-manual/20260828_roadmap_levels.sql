-- Roadmap (100 levels) persistence — Task 1 of the NEET Buddy Roadmap spec.
-- NOT applied automatically. Run this manually in the SQL editor.
-- Static level/mission definitions live in the repo (src/data/roadmap-spec.json);
-- only per-user progress is stored here.

-- 1) Per-user roadmap state -------------------------------------------------
create table if not exists public.roadmap_progress (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  current_level      int  not null default 1,
  highest_unlocked   int  not null default 1,
  total_xp           int  not null default 0,
  planner_mode       text not null default 'Normal'
                       check (planner_mode in ('Light','Normal','Intense')),
  started_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

grant select, insert, update on public.roadmap_progress to authenticated;
grant all on public.roadmap_progress to service_role;

alter table public.roadmap_progress enable row level security;

drop policy if exists "own roadmap progress select" on public.roadmap_progress;
create policy "own roadmap progress select" on public.roadmap_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own roadmap progress insert" on public.roadmap_progress;
create policy "own roadmap progress insert" on public.roadmap_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own roadmap progress update" on public.roadmap_progress;
create policy "own roadmap progress update" on public.roadmap_progress
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2) Mission completions (launch contract "every_finish") -------------------
create table if not exists public.mission_completion (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  level_id       int  not null,
  mission_id     text not null,
  mission_type   text,
  result_payload jsonb not null default '{}'::jsonb,
  score_percent  numeric(5,2),
  completed_at   timestamptz not null default now(),
  unique (user_id, mission_id)
);

create index if not exists mission_completion_user_level_idx
  on public.mission_completion (user_id, level_id);

grant select, insert, update on public.mission_completion to authenticated;
grant all on public.mission_completion to service_role;

alter table public.mission_completion enable row level security;

drop policy if exists "own mission completion select" on public.mission_completion;
create policy "own mission completion select" on public.mission_completion
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own mission completion insert" on public.mission_completion;
create policy "own mission completion insert" on public.mission_completion
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own mission completion update" on public.mission_completion;
create policy "own mission completion update" on public.mission_completion
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) Chapter mastery states -------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'chapter_mastery_state') then
    create type public.chapter_mastery_state as enum (
      'NOT_STARTED','IN_PROGRESS','LEARNING_COMPLETE','PRACTICING',
      'TESTED','NEEDS_REPAIR','MASTERED'
    );
  end if;
end $$;

create table if not exists public.chapter_mastery (
  user_id     uuid not null references auth.users(id) on delete cascade,
  chapter_id  text not null,                -- roadmap chapter_id, e.g. 'bio-001'
  state       public.chapter_mastery_state not null default 'NOT_STARTED',
  accuracy    numeric(5,2),
  updated_at  timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

grant select, insert, update on public.chapter_mastery to authenticated;
grant all on public.chapter_mastery to service_role;

alter table public.chapter_mastery enable row level security;

drop policy if exists "own chapter mastery select" on public.chapter_mastery;
create policy "own chapter mastery select" on public.chapter_mastery
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own chapter mastery insert" on public.chapter_mastery;
create policy "own chapter mastery insert" on public.chapter_mastery
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own chapter mastery update" on public.chapter_mastery;
create policy "own chapter mastery update" on public.chapter_mastery
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
