-- Flashcards: tables, Data-API grants and RLS.
-- The app read flashcards through the service-role client, so the tables were
-- never reachable from the browser. Public cards are readable by anyone; reviews
-- are private per user.

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete cascade,
  front text not null,
  back text not null,
  difficulty text not null default 'medium',
  source text not null default 'AI · NCERT',
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists flashcards_chapter_idx on public.flashcards(chapter_id);
create index if not exists flashcards_subject_idx on public.flashcards(subject_id);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid not null references public.flashcards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 3),
  created_at timestamptz not null default now()
);

create index if not exists flashcard_reviews_user_idx on public.flashcard_reviews(user_id);

grant select on public.flashcards to anon;
grant select on public.flashcards to authenticated;
grant all on public.flashcards to service_role;

grant select, insert, update, delete on public.flashcard_reviews to authenticated;
grant all on public.flashcard_reviews to service_role;

alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;

drop policy if exists "Flashcards are publicly readable" on public.flashcards;
create policy "Flashcards are publicly readable"
  on public.flashcards for select
  using (true);

drop policy if exists "Users read own flashcard reviews" on public.flashcard_reviews;
create policy "Users read own flashcard reviews"
  on public.flashcard_reviews for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own flashcard reviews" on public.flashcard_reviews;
create policy "Users insert own flashcard reviews"
  on public.flashcard_reviews for insert to authenticated
  with check (auth.uid() = user_id);
