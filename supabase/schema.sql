-- AI GAME FACTORY 評価データベース（Supabase 無料プラン用）
-- Supabase の SQL Editor にこのファイルの内容を貼り付けて実行してください。
-- テーブルへの直接アクセスは禁止し、下の関数（RPC）経由でのみ読み書きします。

-- ※ 古い版を実行済みの場合に備えて、関数を作り直す
drop function if exists public.submit_rating(text, uuid, int, int, int, int, text);
drop function if exists public.get_scores();
drop function if exists public.get_comments(text, int);

create table if not exists public.ratings (
  id           bigserial primary key,
  game_id      text        not null check (game_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  voter_id     uuid        not null,
  device       text        not null default 'pc' check (device in ('pc', 'mobile')),
  playable     smallint    not null check (playable between 0 and 2),
  fun          smallint    check (fun between 1 and 5),
  quality      smallint    check (quality between 1 and 5),
  originality  smallint    check (originality between 1 and 5),
  comment      text        check (char_length(comment) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (game_id, voter_id)
);
alter table public.ratings add column if not exists device text not null default 'pc' check (device in ('pc', 'mobile'));
create index if not exists ratings_game_idx on public.ratings (game_id);

alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;

-- 評価の登録・更新（同じブラウザからの再投票は上書き）
create or replace function public.submit_rating(
  p_game_id text, p_voter_id uuid, p_playable int,
  p_fun int default null, p_quality int default null, p_originality int default null, p_comment text default null,
  p_device text default 'pc'
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_playable > 0 and (p_fun is null or p_quality is null or p_originality is null) then
    raise exception '楽しさ・クオリティ・独創性を入力してください';
  end if;
  insert into ratings (game_id, voter_id, device, playable, fun, quality, originality, comment)
  values (p_game_id, p_voter_id, case when p_device = 'mobile' then 'mobile' else 'pc' end, p_playable, p_fun, p_quality, p_originality, nullif(trim(p_comment), ''))
  on conflict (game_id, voter_id) do update
    set device = excluded.device, playable = excluded.playable, fun = excluded.fun, quality = excluded.quality,
        originality = excluded.originality, comment = excluded.comment, updated_at = now();
end $$;

-- 全ゲームの集計
create or replace function public.get_scores()
returns table (game_id text, votes bigint, playable_rate numeric, fun numeric, quality numeric, originality numeric,
               votes_pc bigint, votes_mobile bigint, playable_pc_rate numeric, playable_mobile_rate numeric)
language sql stable security definer set search_path = public as $$
  select game_id,
         count(*),
         round(avg(playable) / 2.0 * 100, 1),
         round(avg(fun), 2), round(avg(quality), 2), round(avg(originality), 2),
         count(*) filter (where device = 'pc'), count(*) filter (where device = 'mobile'),
         round(avg(playable) filter (where device = 'pc') / 2.0 * 100, 1),
         round(avg(playable) filter (where device = 'mobile') / 2.0 * 100, 1)
  from ratings group by game_id;
$$;

-- ゲームごとのコメント（新しい順）
create or replace function public.get_comments(p_game_id text, p_limit int default 30)
returns table (comment text, device text, playable smallint, fun smallint, quality smallint, originality smallint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select comment, device, playable, fun, quality, originality, updated_at
  from ratings
  where game_id = p_game_id and comment is not null
  order by updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.submit_rating(text, uuid, int, int, int, int, text, text) from public;
revoke execute on function public.get_scores() from public;
revoke execute on function public.get_comments(text, int) from public;
grant execute on function public.submit_rating(text, uuid, int, int, int, int, text, text) to anon, authenticated;
grant execute on function public.get_scores() to anon, authenticated;
grant execute on function public.get_comments(text, int) to anon, authenticated;
