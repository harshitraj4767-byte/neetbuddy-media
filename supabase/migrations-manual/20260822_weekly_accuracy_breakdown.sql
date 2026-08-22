-- Weekly progress report: subject-wise and difficulty-wise accuracy.
-- Computed in SQL because attempts.answers can hold thousands of question ids
-- per week, which blew past the PostgREST `in(...)` URL limit on the client.

create or replace function public.weekly_accuracy_breakdown(_start timestamptz, _end timestamptz)
returns table (kind text, label text, correct integer, total integer)
language sql
stable
security definer
set search_path = public
as $$
  with ans as (
    select e.key as qid, (e.value #>> '{}')::int as picked
    from public.attempts a
    cross join lateral jsonb_each(a.answers) e
    where a.user_id = auth.uid()
      and a.status = 'completed'
      and a.answers is not null
      and a.submitted_at >= _start
      and a.submitted_at < _end
  ),
  j as (
    select
      q.difficulty as difficulty,
      s.name as subject,
      (ans.picked = q.correct_index) as ok
    from ans
    join public.questions q on q.id = ans.qid
    left join public.subjects s on s.id = q.subject_id
  )
  select 'subject'::text, coalesce(j.subject, 'Other')::text,
         count(*) filter (where j.ok)::int, count(*)::int
  from j group by 2
  union all
  select 'difficulty'::text, coalesce(j.difficulty, 'Unknown')::text,
         count(*) filter (where j.ok)::int, count(*)::int
  from j group by 2;
$$;

revoke all on function public.weekly_accuracy_breakdown(timestamptz, timestamptz) from public;
grant execute on function public.weekly_accuracy_breakdown(timestamptz, timestamptz) to authenticated;
grant execute on function public.weekly_accuracy_breakdown(timestamptz, timestamptz) to service_role;
