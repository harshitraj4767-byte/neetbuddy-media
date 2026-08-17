-- Group Study: groups, invite links, live study sessions, tasks, XP/rating.

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'stopwatch',
  label text,
  started_at timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds integer not null default 0
);
create index if not exists study_sessions_group_idx on public.study_sessions(group_id, started_at desc);
create index if not exists study_sessions_user_idx on public.study_sessions(user_id, started_at desc);
create unique index if not exists study_sessions_one_live
  on public.study_sessions(group_id, user_id) where ended_at is null;

create table if not exists public.study_group_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);
create index if not exists study_group_tasks_group_idx on public.study_group_tasks(group_id, due_date desc);

create table if not exists public.study_task_completions (
  task_id uuid not null references public.study_group_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

grant select, insert, update, delete on public.study_groups to authenticated;
grant select, insert, update, delete on public.study_group_members to authenticated;
grant select, insert, update, delete on public.study_sessions to authenticated;
grant select, insert, update, delete on public.study_group_tasks to authenticated;
grant select, insert, update, delete on public.study_task_completions to authenticated;
grant all on public.study_groups to service_role;
grant all on public.study_group_members to service_role;
grant all on public.study_sessions to service_role;
grant all on public.study_group_tasks to service_role;
grant all on public.study_task_completions to service_role;

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_group_tasks enable row level security;
alter table public.study_task_completions enable row level security;

create or replace function public.is_study_group_member(_group_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.study_group_members m
    where m.group_id = _group_id and m.user_id = _user_id
  )
$$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='study_groups' and policyname='members read groups') then
    create policy "members read groups" on public.study_groups for select to authenticated
      using (public.is_study_group_member(id, auth.uid()) or owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='study_group_members' and policyname='members read roster') then
    create policy "members read roster" on public.study_group_members for select to authenticated
      using (public.is_study_group_member(group_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename='study_sessions' and policyname='members read sessions') then
    create policy "members read sessions" on public.study_sessions for select to authenticated
      using (public.is_study_group_member(group_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename='study_group_tasks' and policyname='members read tasks') then
    create policy "members read tasks" on public.study_group_tasks for select to authenticated
      using (public.is_study_group_member(group_id, auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename='study_task_completions' and policyname='own completions') then
    create policy "own completions" on public.study_task_completions for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;
