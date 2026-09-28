-- おすすめランキングに「セラピストページ連携率 ÷2」の点を足す（第948便・2026-09-28・カッキーさんの指示）
-- ※ Supabase SQL Editor で実行してください（★ コード push より先でも後でもよい・冪等＝何度流しても安全）。
--
-- ★ 連携率＝その店の公開中（is_active）のセラピストのうち、本人がログインまで済んだ人（user_id あり）の割合（％・四捨五入）。
--   ★ マイページ「セラピストページ連携」の％と同じ数え方。
-- ★ 点数＝連携率 ÷2（小数は切り捨て）。例: 4% → 2点、25% → 12点、100% → 50点。
-- ★ 週に1回だけ計算: 毎週月曜0時（JST）に全店の連携率を記録し、その週はその数字を使う（週の途中の連携は翌週から）。
-- ★ 手動の動きが0でも、連携率の点があればランキングに載る（ページ側で 0点の店だけ外している）。

-- ============================================================
-- 1. 週ごとの記録の表（★ 店舗様からは読めない・書けない）
-- ============================================================
create table if not exists public.salon_cast_link_weekly (
  salon_id    bigint  not null references public.salons(id) on delete cascade,
  week_start  date    not null,               -- その週の月曜（JST）
  linked      integer not null default 0,     -- 連携済み（公開中のうち）
  total       integer not null default 0,     -- 公開中のセラピスト数
  pct         integer not null default 0,     -- 連携率（％・四捨五入）
  created_at  timestamptz not null default now(),
  primary key (salon_id, week_start)
);
alter table public.salon_cast_link_weekly enable row level security;
revoke all on public.salon_cast_link_weekly from anon, authenticated;

-- ============================================================
-- 2. 記録する関数（★ その週の記録がもうある店は触らない＝週1回だけ）
-- ============================================================
create or replace function public.snapshot_cast_link_weekly()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_week date := date_trunc('week', (now() at time zone 'Asia/Tokyo'))::date;  -- 月曜（JST）
  v_n integer;
begin
  insert into public.salon_cast_link_weekly (salon_id, week_start, linked, total, pct)
  select s.id,
         v_week,
         count(t.id) filter (where t.user_id is not null)::int,
         count(t.id)::int,
         case when count(t.id) > 0
              then round(count(t.id) filter (where t.user_id is not null) * 100.0 / count(t.id))::int
              else 0 end
    from public.salons s
    left join public.therapists t on t.salon_id = s.id and t.is_active = true
   group by s.id
  on conflict (salon_id, week_start) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.snapshot_cast_link_weekly() from public, anon, authenticated;

-- ============================================================
-- 3. 毎週月曜 0:00 JST（＝日曜 15:00 UTC）に記録。★ 同じ名前なら上書き（何度流しても1つだけ）
-- ============================================================
create extension if not exists pg_cron;
select cron.schedule('cast-link-weekly-snapshot', '0 15 * * 0', $$select public.snapshot_cast_link_weekly();$$);

-- ★ 今週（この SQL を流した週）の分を、いま記録しておく
select public.snapshot_cast_link_weekly();

-- ============================================================
-- 4. 週の点数に「連携率 ÷2」を足す（★ 返り値に link_points が増えるので作り直し）
-- ============================================================
drop function if exists public.salon_recommend_scores(timestamptz, timestamptz);
create or replace function public.salon_recommend_scores(p_from timestamptz, p_to timestamptz)
returns table (salon_id bigint, bumps integer, announces integer, x_points integer, link_points integer, points integer)
language sql
stable
security definer set search_path = public
as $$
  with ev as (
    select e.salon_id,
           count(*) filter (where e.kind = 'bump_manual')::int     as bumps,
           count(*) filter (where e.kind = 'announce_manual')::int as announces
      from public.salon_rank_events e
     where e.created_at >= p_from and e.created_at < p_to
     group by e.salon_id
  ),
  xday as (
    -- ★ 店舗アカウント＝ x_profiles.kind='shop' かつ auth_user_id = salons.owner_id（xLink.ts と同じつなぎ方）
    -- ★ 朝6時区切りの日ごとに数えて、1日10点で頭打ち
    select s.id as salon_id,
           (((p.created_at at time zone 'Asia/Tokyo') - interval '6 hours')::date) as d,
           least(count(p.id), 10)::int as n
      from public.salons s
      join public.x_profiles xpf on xpf.auth_user_id = s.owner_id and xpf.kind = 'shop' and xpf.status = 'approved'
      join public.x_posts p on p.author_profile_id = xpf.id and p.parent_post_id is null
                           and p.created_at >= p_from and p.created_at < p_to
     group by s.id, d
  ),
  xp as (
    select xday.salon_id, sum(xday.n)::int as x_points from xday group by xday.salon_id
  ),
  lk as (
    -- ★ 第948便: その週（p_from の月曜・JST）に記録した連携率 ÷2（切り捨て）
    select w.salon_id, (w.pct / 2)::int as link_points
      from public.salon_cast_link_weekly w
     where w.week_start = (p_from at time zone 'Asia/Tokyo')::date
  )
  select s.id,
         coalesce(ev.bumps, 0),
         coalesce(ev.announces, 0),
         coalesce(xp.x_points, 0),
         coalesce(lk.link_points, 0),
         (coalesce(ev.bumps, 0) + coalesce(ev.announces, 0) * 5 + coalesce(xp.x_points, 0) + coalesce(lk.link_points, 0))::int
    from public.salons s
    left join ev on ev.salon_id = s.id
    left join xp on xp.salon_id = s.id
    left join lk on lk.salon_id = s.id
   where s.is_hidden = false
     and s.listing_plan = 'standard';
$$;

revoke all on function public.salon_recommend_scores(timestamptz, timestamptz) from public;
grant execute on function public.salon_recommend_scores(timestamptz, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認1: 月曜0時の予約（1行・0 15 * * 0・true）
select jobname, schedule, active from cron.job where jobname = 'cast-link-weekly-snapshot';
-- ★ 確認2: 今週の記録（店ごとの連携率）
select w.salon_id, s.name, w.linked, w.total, w.pct, (w.pct / 2) as link_points
  from public.salon_cast_link_weekly w join public.salons s on s.id = w.salon_id
 where w.week_start = date_trunc('week', (now() at time zone 'Asia/Tokyo'))::date
 order by w.pct desc;
-- ★ 確認3: 今週の点数
-- select * from public.salon_recommend_scores((date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'), now() + interval '7 days') order by points desc limit 10;
