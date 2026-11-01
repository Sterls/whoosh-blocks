-- Leaderboard for Whoosh Blocks.
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
--
-- Each phone gets a random secret id. Scores can only be written through
-- submit_score(), which never lowers a score, and only names and levels are
-- readable by the public. The secret ids stay private.

create table if not exists public.scores (
  secret uuid primary key,
  name text not null check (char_length(name) between 1 and 20),
  level int not null check (level between 0 and 10000000),
  updated_at timestamptz not null default now()
);

-- No policies on purpose: the public cannot read or write this table directly.
alter table public.scores enable row level security;

create or replace view public.leaderboard as
  select name, level, updated_at
  from public.scores
  where level > 0
  order by level desc, updated_at asc
  limit 100;

grant select on public.leaderboard to anon;

create or replace function public.submit_score(p_secret uuid, p_name text, p_level int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into scores (secret, name, level)
  values (p_secret, left(trim(p_name), 20), p_level)
  on conflict (secret) do update set
    name = excluded.name,
    level = greatest(scores.level, excluded.level),
    updated_at = case when excluded.level > scores.level then now() else scores.updated_at end;
$$;

revoke all on function public.submit_score(uuid, text, int) from public;
grant execute on function public.submit_score(uuid, text, int) to anon;
