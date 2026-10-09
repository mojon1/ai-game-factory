-- 2026-10-09: 評価を「面白い / まあまあ / つまらない」の3段階から、星5段階（★1〜★5）に変更する
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて、1回だけ実行してください（何度実行しても同じ結果になります）。
--
-- ・ratings に stars（1〜5）を追加し、これまでの3段階の評価を 面白い→★5 / まあまあ→★3 / つまらない→★1 に置き換える
-- ・submit_rating は p_stars を受け取る（古い画面からの p_verdict も星に置き換えて受け付ける）
-- ・get_scores は星の平均・★1〜★5 の人数・総プレイ時間を返す

-- ---------- 評価テーブル ----------
alter table public.ratings add column if not exists stars smallint check (stars between 1 and 5);
update public.ratings
   set stars = case verdict when 2 then 5 when 1 then 3 when 0 then 1 end
 where stars is null and verdict is not null;

-- 「評価か動かなかった報告のどちらかがある」の条件を、星も含めた形に付け替える
alter table public.ratings drop constraint if exists ratings_check;
do $$ begin
  alter table public.ratings add constraint ratings_has_value check (stars is not null or verdict is not null or broken);
exception when duplicate_object then null; end $$;

-- ---------- 評価の登録・更新 ----------
drop function if exists public.submit_rating(text, uuid, text, int, boolean, int, int);
create or replace function public.submit_rating(
  p_game_id text, p_voter_id uuid, p_device text default 'mobile',
  p_stars int default null, p_broken boolean default false,
  p_plays int default 0, p_seconds int default 0,
  p_verdict int default null   -- 古い画面（3段階）からの送信用
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stars int := coalesce(p_stars, case p_verdict when 2 then 5 when 1 then 3 when 0 then 1 end);
begin
  insert into ratings (game_id, voter_id, device, stars, verdict, broken, plays, seconds)
  values (p_game_id, p_voter_id, case when p_device = 'pc' then 'pc' else 'mobile' end, v_stars, null, coalesce(p_broken, false),
          least(greatest(coalesce(p_plays, 0), 0), 10000), least(greatest(coalesce(p_seconds, 0), 0), 86400))
  on conflict (game_id, voter_id) do update
    set device = excluded.device, stars = excluded.stars, verdict = null, broken = excluded.broken,
        plays = greatest(ratings.plays, excluded.plays), seconds = greatest(ratings.seconds, excluded.seconds), updated_at = now();
end $$;

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
revoke execute on function public.get_scores() from public;
grant execute on function public.submit_rating(text, uuid, text, int, boolean, int, int, int) to anon, authenticated;
grant execute on function public.get_scores() to anon, authenticated;

-- 画面側（PostgREST）に関数の変更をすぐ反映させる
notify pgrst, 'reload schema';
