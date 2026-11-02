-- Leaderboard for Whoosh Blocks.
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- It is safe to run again after changes.
--
-- Each phone gets a random secret id. Everything goes through the functions
-- below; the public can only read nicknames and levels, never the ids.
--   * Nicknames are checked against a word filter (same lists as js/names.js).
--   * Scores only go up, and only at a realistic pace.
--   * Three reports from different players hide a nickname. You can also hide
--     one yourself: Table Editor -> scores -> tick "hidden".
--   * Players can delete their own entry; entries idle for 12 months are deleted.

create table if not exists public.scores (
  secret uuid primary key,
  name text not null check (char_length(name) between 1 and 20),
  level int not null check (level between 0 and 10000000),
  updated_at timestamptz not null default now(),
  hidden boolean not null default false
);
alter table public.scores add column if not exists hidden boolean not null default false;

create table if not exists public.reports (
  reporter uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (reporter, name)
);

-- No policies on purpose: the public cannot read or write these tables directly.
alter table public.scores enable row level security;
alter table public.reports enable row level security;

create or replace view public.leaderboard as
  select name, level
  from public.scores
  where level > 0 and not hidden
  order by level desc, updated_at asc
  limit 100;

grant select on public.leaderboard to anon;

-- Nickname filter. Keep these lists the same as js/names.js.
create or replace function public.name_ok(p_name text)
returns boolean
language plpgsql
immutable
as $$
declare
  n text;
  part text;
begin
  if p_name is null or char_length(trim(p_name)) < 1 or char_length(trim(p_name)) > 20 then
    return false;
  end if;
  if trim(p_name) !~ '^[A-Za-z0-9 _.''!-]+$' then
    return false;
  end if;
  n := lower(p_name);
  if n ~ '(https?|www\.|\.com|\.net|\.org|@)' then
    return false;
  end if;
  n := translate(n, '0134578@$', 'oieastbas');
  -- BLOCKED_PARTS
  foreach part in array array['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'twat', 'bitch', 'bastard', 'pussy', 'penis', 'vagina', 'porn', 'hitler', 'retard', 'dildo', 'jizz', 'spunk', 'bollock', 'tosser', 'kike', 'tranny', 'rapist'] loop
    if position(part in regexp_replace(n, '[^a-z]', '', 'g')) > 0 then
      return false;
    end if;
  end loop;
  -- BLOCKED_WORDS
  if regexp_split_to_array(n, '[^a-z]+') && array['ass', 'arse', 'asshole', 'arsehole', 'dick', 'cock', 'tit', 'tits', 'sex', 'rape', 'nazi', 'nazis', 'paki', 'chink', 'spic', 'wank', 'wanker', 'nonce', 'fag', 'fags', 'homo', 'cum', 'piss', 'prick', 'dyke', 'gook', 'coon', 'kkk', 'kys'] then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.submit_score(p_secret uuid, p_name text, p_level int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old scores%rowtype;
  allowed int;
begin
  if not name_ok(p_name) then
    raise exception 'name not allowed' using errcode = '22023';
  end if;
  if p_level < 0 or p_level > 10000000 then
    raise exception 'level out of range' using errcode = '22023';
  end if;

  select * into old from scores where secret = p_secret;
  if found then
    -- At most one level every 20 seconds since the last rise, plus a little
    -- slack for levels beaten offline. Anything more is capped, not rejected,
    -- so honest players catch up on their next submission.
    allowed := old.level + 5 + floor(extract(epoch from now() - old.updated_at) / 20)::int;
    update scores set
      name = trim(p_name),
      level = greatest(old.level, least(p_level, allowed)),
      updated_at = case when least(p_level, allowed) > old.level then now() else old.updated_at end
    where secret = p_secret;
  else
    insert into scores (secret, name, level) values (p_secret, trim(p_name), least(p_level, 100));
  end if;

  delete from scores where updated_at < now() - interval '12 months';
end;
$$;

create or replace function public.report_name(p_reporter uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into reports (reporter, name) values (p_reporter, p_name) on conflict do nothing;
  if (select count(*) from reports where name = p_name) >= 3 then
    update scores set hidden = true where name = p_name;
  end if;
end;
$$;

create or replace function public.delete_score(p_secret uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from scores where secret = p_secret;
$$;

revoke all on function public.submit_score(uuid, text, int) from public;
revoke all on function public.report_name(uuid, text) from public;
revoke all on function public.delete_score(uuid) from public;
grant execute on function public.submit_score(uuid, text, int) to anon;
grant execute on function public.report_name(uuid, text) to anon;
grant execute on function public.delete_score(uuid) to anon;
