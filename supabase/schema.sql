-- AI GAME FACTORY 評価データベース（Supabase 無料プラン用）
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて実行してください。
-- テーブルへの直接アクセスは禁止し、下の関数（RPC）経由でのみ読み書きします。
--
-- ratings : 1人1作品1件の最新の評価（星 1〜5、動かなかった報告）。平均とランキングに使う。
-- rating_events : 付けた評価をすべて記録したもの（同じ人が何度評価してもすべて残る）。verdict は 2026-10-09 までの3段階評価の名残（今は使わない）
-- 変更履歴: supabase/migrations/ （既存のデータベースには、そこにあるファイルを順に実行する）
-- plays   : 1回の訪問ごとのプレイ回数と時間（遊ぶ人には見えない計測）

create table if not exists public.ratings (
  id          bigserial primary key,
  game_id     text        not null check (game_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  voter_id    uuid        not null,
  device      text        not null default 'mobile' check (device in ('pc', 'mobile')),
  stars       smallint    check (stars between 1 and 5),
  verdict     smallint    check (verdict between 0 and 2),
  broken      boolean     not null default false,
  plays       integer     not null default 0 check (plays between 0 and 10000),
  seconds     integer     not null default 0 check (seconds between 0 and 86400),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (game_id, voter_id),
  constraint ratings_has_value check (stars is not null or verdict is not null or broken)
);
create index if not exists ratings_game_idx on public.ratings (game_id);

create table if not exists public.plays (
  id          bigserial primary key,
  game_id     text        not null check (game_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  voter_id    uuid        not null,
  device      text        not null default 'mobile' check (device in ('pc', 'mobile')),
  plays       integer     not null default 0 check (plays between 0 and 10000),
  seconds     integer     not null default 0 check (seconds between 0 and 86400),
  created_at  timestamptz not null default now()
);
create index if not exists plays_game_idx on public.plays (game_id);

alter table public.ratings enable row level security;
alter table public.plays enable row level security;
revoke all on public.ratings from anon, authenticated;
revoke all on public.plays from anon, authenticated;

-- ---------- 評価の記録（2026-10-10〜）: 付けた評価をすべて残す ----------
create table if not exists public.rating_events (
  id          bigserial primary key,
  game_id     text        not null check (game_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  voter_id    uuid        not null,
  device      text        not null default 'mobile' check (device in ('pc', 'mobile')),
  stars       smallint    check (stars between 1 and 5),
  broken      boolean     not null default false,
  plays       integer     not null default 0 check (plays between 0 and 10000),
  seconds     integer     not null default 0 check (seconds between 0 and 86400),
  created_at  timestamptz not null default now(),
  check (stars is not null or broken)
);
create index if not exists rating_events_game_idx on public.rating_events (game_id, voter_id, created_at);
alter table public.rating_events enable row level security;
revoke all on public.rating_events from anon, authenticated;

-- 評価の登録: 記録に1件足し、1人1件の最新の評価を上書きする
create or replace function public.submit_rating(
  p_game_id text, p_voter_id uuid, p_device text default 'mobile',
  p_stars int default null, p_broken boolean default false,
  p_plays int default 0, p_seconds int default 0,
  p_verdict int default null   -- 古い画面（3段階）からの送信用
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stars int := coalesce(p_stars, case p_verdict when 2 then 5 when 1 then 3 when 0 then 1 end);
  v_device text := case when p_device = 'pc' then 'pc' else 'mobile' end;
  v_plays int := least(greatest(coalesce(p_plays, 0), 0), 10000);
  v_seconds int := least(greatest(coalesce(p_seconds, 0), 0), 86400);
begin
  insert into rating_events (game_id, voter_id, device, stars, broken, plays, seconds)
  values (p_game_id, p_voter_id, v_device, v_stars, coalesce(p_broken, false), v_plays, v_seconds);
  insert into ratings (game_id, voter_id, device, stars, verdict, broken, plays, seconds)
  values (p_game_id, p_voter_id, v_device, v_stars, null, coalesce(p_broken, false), v_plays, v_seconds)
  on conflict (game_id, voter_id) do update
    set device = excluded.device, stars = coalesce(excluded.stars, ratings.stars), verdict = null, broken = excluded.broken,
        plays = greatest(ratings.plays, excluded.plays), seconds = greatest(ratings.seconds, excluded.seconds), updated_at = now();
end $$;


-- 1回の訪問のプレイ記録
create or replace function public.log_play(
  p_game_id text, p_voter_id uuid, p_device text default 'mobile', p_plays int default 0, p_seconds int default 0
) returns void
language sql security definer set search_path = public as $$
  insert into plays (game_id, voter_id, device, plays, seconds)
  values (p_game_id, p_voter_id, case when p_device = 'pc' then 'pc' else 'mobile' end,
          least(greatest(coalesce(p_plays, 0), 0), 10000), least(greatest(coalesce(p_seconds, 0), 0), 86400));
$$;

-- ---------- 全作品の集計 ----------
drop function if exists public.get_scores();
create or replace function public.get_scores()
returns table (game_id text, votes bigint, stars_avg numeric,
               s1 bigint, s2 bigint, s3 bigint, s4 bigint, s5 bigint, broken bigint,
               sessions bigint, avg_seconds numeric, total_seconds bigint, replay_rate numeric)
language sql stable security definer set search_path = public as $$
  with r as (
    select game_id,
           count(*) filter (where stars is not null) as votes,
           round(avg(stars), 2) as stars_avg,
           count(*) filter (where stars = 1) as s1, count(*) filter (where stars = 2) as s2,
           count(*) filter (where stars = 3) as s3, count(*) filter (where stars = 4) as s4,
           count(*) filter (where stars = 5) as s5,
           count(*) filter (where broken) as broken
    from ratings group by game_id
  ), p as (
    select game_id, count(*) as sessions, round(avg(seconds), 1) as avg_seconds, sum(seconds) as total_seconds,
           round(100.0 * count(*) filter (where plays >= 2) / nullif(count(*), 0), 1) as replay_rate
    from plays group by game_id
  )
  select coalesce(r.game_id, p.game_id), coalesce(r.votes, 0), r.stars_avg,
         coalesce(r.s1, 0), coalesce(r.s2, 0), coalesce(r.s3, 0), coalesce(r.s4, 0), coalesce(r.s5, 0), coalesce(r.broken, 0),
         coalesce(p.sessions, 0), p.avg_seconds, coalesce(p.total_seconds, 0), p.replay_rate
  from r full outer join p on r.game_id = p.game_id;
$$;

revoke execute on function public.submit_rating(text, uuid, text, int, boolean, int, int, int) from public;
revoke execute on function public.log_play(text, uuid, text, int, int) from public;
revoke execute on function public.get_scores() from public;
grant execute on function public.submit_rating(text, uuid, text, int, boolean, int, int, int) to anon, authenticated;
grant execute on function public.log_play(text, uuid, text, int, int) to anon, authenticated;
grant execute on function public.get_scores() to anon, authenticated;
