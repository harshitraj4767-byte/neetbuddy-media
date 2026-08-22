-- Dashboard banner plot (admin-managed sliding banners under the hero card)
create table if not exists public.dashboard_banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  link_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.dashboard_banners to anon, authenticated;
grant all on public.dashboard_banners to service_role;

alter table public.dashboard_banners enable row level security;

drop policy if exists "Anyone can read active banners" on public.dashboard_banners;
create policy "Anyone can read active banners"
  on public.dashboard_banners for select
  using (active = true);

alter table public.dashboard_banners add column if not exists image_url_dark text;

create index if not exists dashboard_banners_active_order_idx
  on public.dashboard_banners (active, sort_order);
