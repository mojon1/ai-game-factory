-- 2026-10-10: 評価をリセットする（最初期の評価の影響が大きいため）。実行済み。
-- 評価は消さずに、保管用の表 ratings_archive へ移した（集計からは外れる。サイトからは読めない）。

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

select (select count(*) from public.ratings_archive) as archived, (select count(*) from public.ratings) as remaining;
