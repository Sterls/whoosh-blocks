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

-- ---------- Friend challenges ("duels") ----------
-- A player shares a link to a level with their time and bumps; friends who
-- open it play the same level and their results are stored against it.
-- Lowest time + 5 seconds per bump wins. Challenges expire after 30 days.

create table if not exists public.duels (
  code text primary key,
  creator uuid not null,
  name text not null,
  level int not null check (level between 1 and 10000000),
  time_ms int not null check (time_ms between 0 and 86400000),
  bumps int not null check (bumps between 0 and 100000),
  created_at timestamptz not null default now()
);

create table if not exists public.duel_results (
  code text not null references public.duels (code) on delete cascade,
  player uuid not null,
  name text not null,
  time_ms int not null check (time_ms between 0 and 86400000),
  bumps int not null check (bumps between 0 and 100000),
  created_at timestamptz not null default now(),
  primary key (code, player)
);

alter table public.duels enable row level security;
alter table public.duel_results enable row level security;

-- A challenge and everyone's results, best first. Never includes player ids.
create or replace function public.get_duel(p_code text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code', d.code, 'name', d.name, 'level', d.level, 'time_ms', d.time_ms, 'bumps', d.bumps,
    'results', coalesce((
      select json_agg(json_build_object('name', r.name, 'time_ms', r.time_ms, 'bumps', r.bumps)
                      order by r.time_ms + 5000 * r.bumps, r.created_at)
      from duel_results r where r.code = d.code), '[]'::json))
  from duels d
  where d.code = upper(p_code) and d.created_at > now() - interval '30 days';
$$;

create or replace function public.create_duel(p_secret uuid, p_name text, p_level int, p_time_ms int, p_bumps int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not name_ok(p_name) then
    raise exception 'name not allowed' using errcode = '22023';
  end if;
  if p_level < 1 or p_time_ms < 500 or p_bumps < 0 then
    raise exception 'bad result' using errcode = '22023';
  end if;
  if (select count(*) from duels where creator = p_secret and created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many challenges today' using errcode = '22023';
  end if;

  delete from duels where created_at < now() - interval '30 days';
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from duels where code = v_code);
  end loop;
  insert into duels (code, creator, name, level, time_ms, bumps)
    values (v_code, p_secret, trim(p_name), p_level, p_time_ms, p_bumps);
  return get_duel(v_code);
end;
$$;

-- Record a friend's attempt, keeping their best. The creator's own replays
-- aren't recorded, and each challenge keeps at most 100 players.
create or replace function public.submit_duel_result(p_code text, p_secret uuid, p_name text, p_time_ms int, p_bumps int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(p_code);
begin
  if not name_ok(p_name) then
    raise exception 'name not allowed' using errcode = '22023';
  end if;
  if p_time_ms < 500 or p_bumps < 0 then
    raise exception 'bad result' using errcode = '22023';
  end if;
  if get_duel(v_code) is null then
    raise exception 'challenge not found' using errcode = '22023';
  end if;

  if not exists (select 1 from duels where code = v_code and creator = p_secret)
     and (exists (select 1 from duel_results where code = v_code and player = p_secret)
          or (select count(*) from duel_results where code = v_code) < 100) then
    insert into duel_results (code, player, name, time_ms, bumps)
      values (v_code, p_secret, trim(p_name), p_time_ms, p_bumps)
    on conflict (code, player) do update set
      name = excluded.name,
      time_ms = case when excluded.time_ms + 5000 * excluded.bumps < duel_results.time_ms + 5000 * duel_results.bumps
                     then excluded.time_ms else duel_results.time_ms end,
      bumps = case when excluded.time_ms + 5000 * excluded.bumps < duel_results.time_ms + 5000 * duel_results.bumps
                   then excluded.bumps else duel_results.bumps end;
  end if;
  return get_duel(v_code);
end;
$$;

-- "Remove me" also removes this player's challenges and results.
create or replace function public.delete_score(p_secret uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from scores where secret = p_secret;
  delete from duels where creator = p_secret;
  delete from duel_results where player = p_secret;
$$;

revoke all on function public.submit_score(uuid, text, int) from public;
revoke all on function public.report_name(uuid, text) from public;
revoke all on function public.delete_score(uuid) from public;
grant execute on function public.submit_score(uuid, text, int) to anon;
grant execute on function public.report_name(uuid, text) to anon;
grant execute on function public.delete_score(uuid) to anon;
revoke all on function public.get_duel(text) from public;
revoke all on function public.create_duel(uuid, text, int, int, int) from public;
revoke all on function public.submit_duel_result(text, uuid, text, int, int) from public;
grant execute on function public.get_duel(text) to anon;
grant execute on function public.create_duel(uuid, text, int, int, int) to anon;
grant execute on function public.submit_duel_result(text, uuid, text, int, int) to anon;
