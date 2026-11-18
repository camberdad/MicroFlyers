-- MicroFlyers online leaderboard (Supabase / Postgres).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run. Players can READ public columns and can only WRITE through
-- submit_score(), which validates every field, keeps one best score per player
-- per board, rate-limits repeat posts and returns the player's world rank.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  board text not null check (board ~ '^(survival|blitz|rings):[a-z]+(:[1-3])?$'),
  name text not null check (name ~ '^[A-Z0-9 _-]{1,12}$'),
  value numeric not null check (value >= 0 and value < 1000000000),
  detail text not null default '' check (char_length(detail) <= 60),
  player uuid not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board, player)
);
create index if not exists scores_board_value on public.scores (board, value);

alter table public.scores enable row level security;
drop policy if exists "Public read" on public.scores;
create policy "Public read" on public.scores for select using (true);

-- Browsers may read only these columns (the private player id stays hidden)
-- and may never insert, update or delete rows directly.
revoke all on public.scores from anon, authenticated;
grant select (id, board, name, value, detail, version, created_at, updated_at) on public.scores to anon, authenticated;

create or replace function public.submit_score(
  p_board text, p_name text, p_value numeric, p_detail text, p_player uuid, p_version integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  low boolean := p_board like 'rings:%';
  last_post timestamptz;
  best numeric;
begin
  if p_board is null or p_board !~ '^(survival|blitz|rings):[a-z]+(:[1-3])?$' then raise exception 'invalid board'; end if;
  if p_name is null or p_name !~ '^[A-Z0-9 _-]{1,12}$' then raise exception 'invalid name'; end if;
  if p_player is null then raise exception 'invalid player'; end if;
  if p_value is null or p_value < 0 then raise exception 'invalid value'; end if;
  -- Plausibility limits for each mode (raise these if the game rules change).
  if low and (p_value < 3 or p_value > 3600) then raise exception 'implausible time'; end if;
  if p_board like 'blitz:%' and p_value > 300000 then raise exception 'implausible score'; end if;
  if p_board like 'survival:%' and p_value > 20000000 then raise exception 'implausible score'; end if;

  select updated_at into last_post from scores where board = p_board and player = p_player;
  if last_post is not null and last_post > now() - interval '5 seconds' then raise exception 'too many submissions'; end if;

  insert into scores (board, name, value, detail, player, version)
  values (p_board, p_name, round(p_value, 3), left(coalesce(p_detail, ''), 60), p_player, coalesce(p_version, 0))
  on conflict (board, player) do update set
    name = excluded.name,
    detail = case when (low and excluded.value < scores.value) or (not low and excluded.value > scores.value)
                  then excluded.detail else scores.detail end,
    value = case when low then least(scores.value, excluded.value) else greatest(scores.value, excluded.value) end,
    version = excluded.version,
    updated_at = now();

  select value into best from scores where board = p_board and player = p_player;
  return 1 + (select count(*) from scores where board = p_board and (case when low then value < best else value > best end))::integer;
end;
$$;

revoke all on function public.submit_score(text, text, numeric, text, uuid, integer) from public;
grant execute on function public.submit_score(text, text, numeric, text, uuid, integer) to anon, authenticated;
