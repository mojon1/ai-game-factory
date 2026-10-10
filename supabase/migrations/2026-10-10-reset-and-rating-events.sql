-- 2026-10-10: (1) 評価をリセットする（最初期の評価の影響が大きいため）
--             (2) 評価を何度でも付けられるようにし、付けた評価はすべて記録する（平均・ランキングは1人につき最新の評価だけ）
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて、1回だけ実行してください。

-- ---------- (1) 評価のリセット: 消さずに保管用の表 ratings_archive へ移す（サイトからは読めない） ----------
create table if not exists public.ratings_archive as
  select r.*, now() as archived_at from public.ratings r where false;
alter table public.ratings_archive enable row level security;
revoke all on public.ratings_archive from anon, authenticated;
insert into public.ratings_archive select r.*, now() from public.ratings r;
delete from public.ratings;

-- ▼ プレイ回数・プレイ時間（総プレイ時間のランキングに使う）もリセットする場合は、
--   次の4行の先頭の「-- 」を消してから実行してください。
-- create table if not exists public.plays_archive as select p.*, now() as archived_at from public.plays p where false;
-- alter table public.plays_archive enable row level security;
-- revoke all on public.plays_archive from anon, authenticated;
-- insert into public.plays_archive select p.*, now() from public.plays p; delete from public.plays;

-- ---------- (2) 評価の記録: 付けた評価をすべて残す ----------
-- ratings（1人1作品1件・最新の評価）は平均とランキングに使い、rating_events（すべての評価）は「遊ぶほど評価が変わるか」を見るのに使う
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

notify pgrst, 'reload schema';

-- 確認: 保管した件数・残っている評価（0 ならリセット完了）・評価の記録の表ができたか
select (select count(*) from public.ratings_archive) as archived,
       (select count(*) from public.ratings) as remaining,
       (select count(*) from public.rating_events) as events;
