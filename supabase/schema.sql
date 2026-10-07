-- AI GAME FACTORY 評価データベース（Supabase 無料プラン用）
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて実行してください。
-- テーブルへの直接アクセスは禁止し、下の関数（RPC）経由でのみ読み書きします。
--
-- ratings : 1人1作品1件の評価（面白い=2 / まあまあ=1 / つまらない=0、動かなかった報告）
-- plays   : 1回の訪問ごとのプレイ回数と時間（遊ぶ人には見えない計測）

create table if not exists public.ratings (
  id          bigserial primary key,
  game_id     text        not null check (game_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  voter_id    uuid        not null,
  device      text        not null default 'mobile' check (device in ('pc', 'mobile')),
  verdict     smallint    check (verdict between 0 and 2),
  broken      boolean     not null default false,
  plays       integer     not null default 0 check (plays between 0 and 10000),
  seconds     integer     not null default 0 check (seconds between 0 and 86400),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (game_id, voter_id),
  check (verdict is not null or broken)
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

-- 評価の登録・更新（同じブラウザからの再評価は上書き）
create or replace function public.submit_rating(
  p_game_id text, p_voter_id uuid, p_device text default 'mobile',
  p_verdict int default null, p_broken boolean default false,
  p_plays int default 0, p_seconds int default 0
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into ratings (game_id, voter_id, device, verdict, broken, plays, seconds)
  values (p_game_id, p_voter_id, case when p_device = 'pc' then 'pc' else 'mobile' end, p_verdict, coalesce(p_broken, false),
          least(greatest(coalesce(p_plays, 0), 0), 10000), least(greatest(coalesce(p_seconds, 0), 0), 86400))
  on conflict (game_id, voter_id) do update
    set device = excluded.device, verdict = excluded.verdict, broken = excluded.broken,
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

-- 全作品の集計
create or replace function public.get_scores()
returns table (game_id text, votes bigint, fun bigint, meh bigint, boring bigint, broken bigint,
               sessions bigint, avg_seconds numeric, replay_rate numeric)
language sql stable security definer set search_path = public as $$
  with r as (
    select game_id,
           count(*) filter (where verdict is not null) as votes,
           count(*) filter (where verdict = 2) as fun,
           count(*) filter (where verdict = 1) as meh,
           count(*) filter (where verdict = 0) as boring,
           count(*) filter (where broken) as broken
    from ratings group by game_id
  ), p as (
    select game_id, count(*) as sessions, round(avg(seconds), 1) as avg_seconds,
           round(100.0 * count(*) filter (where plays >= 2) / nullif(count(*), 0), 1) as replay_rate
    from plays group by game_id
  )
  select coalesce(r.game_id, p.game_id), coalesce(r.votes, 0), coalesce(r.fun, 0), coalesce(r.meh, 0), coalesce(r.boring, 0),
         coalesce(r.broken, 0), coalesce(p.sessions, 0), p.avg_seconds, p.replay_rate
  from r full outer join p on r.game_id = p.game_id;
$$;

revoke execute on function public.submit_rating(text, uuid, text, int, boolean, int, int) from public;
revoke execute on function public.log_play(text, uuid, text, int, int) from public;
revoke execute on function public.get_scores() from public;
grant execute on function public.submit_rating(text, uuid, text, int, boolean, int, int) to anon, authenticated;
grant execute on function public.log_play(text, uuid, text, int, int) to anon, authenticated;
grant execute on function public.get_scores() to anon, authenticated;
