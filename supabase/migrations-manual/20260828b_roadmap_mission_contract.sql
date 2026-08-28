-- Roadmap Task 3 — mission launch contract (report-back + adaptive repair).
-- NOT applied automatically. Run this manually in the SQL editor,
-- after 20260828_roadmap_levels.sql.

-- 1) mission_completion: make sure the report-back columns exist -------------
alter table public.mission_completion
  add column if not exists mission_type   text,
  add column if not exists score_percent  numeric(5,2),
  add column if not exists result_payload jsonb not null default '{}'::jsonb;

create index if not exists mission_completion_user_mission_idx
  on public.mission_completion (user_id, mission_id);

-- 2) Adaptive repair queue (accuracy < 50 -> mandatory repair mission) -------
create table if not exists public.roadmap_repair_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  level_id      int  not null,
  mission_id    text not null,
  chapter_ids   text[] not null default '{}',
  score_percent numeric(5,2),
  resolved      boolean not null default false,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (user_id, mission_id)
);

create index if not exists roadmap_repair_queue_open_idx
  on public.roadmap_repair_queue (user_id, resolved);

grant select, insert, update on public.roadmap_repair_queue to authenticated;
grant all on public.roadmap_repair_queue to service_role;

alter table public.roadmap_repair_queue enable row level security;

drop policy if exists "own repair queue select" on public.roadmap_repair_queue;
create policy "own repair queue select" on public.roadmap_repair_queue
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own repair queue insert" on public.roadmap_repair_queue;
create policy "own repair queue insert" on public.roadmap_repair_queue
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own repair queue update" on public.roadmap_repair_queue;
create policy "own repair queue update" on public.roadmap_repair_queue
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
