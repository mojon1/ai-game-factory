-- 2026-10-10: 評価をリセットする（最初期の評価の影響が大きいため）
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて、1回だけ実行してください。
--
-- 評価は消さずに、保管用の表 ratings_archive へ移します（集計からは外れる。あとで見返したり戻したりできる）。
-- 保管用の表は、サイトからは読めないようにしてあります。

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

-- 確認: 移した件数と、残っている件数（0 になっていればリセット完了）
select (select count(*) from public.ratings_archive) as archived, (select count(*) from public.ratings) as remaining;
