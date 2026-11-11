-- おすすめランキングに「フクエスサイトで公式HPを公開 +5」「フクエックスの店舗アカウントを開設 +5」を足す
-- （第1188便・2026-10-05・カッキーさんの指示）
-- ※ Supabase SQL Editor で実行してください（★ コード push より先でも後でもよい・冪等＝何度流しても安全）。
--
-- ★ フクエスサイト +5 ＝ salon_sites（公式HPの、1店舗1行の表）の status が 'live'（公開中）のお店。
--   ★ 制作中（draft）・停止（suspended）には付かない。
--   ★ 店舗基本設定の「公式サイトURL」（他社で作ったサイトも入る欄）は見ない。
-- ★ フクエックス +5 ＝ お店のオーナーと同じログインの、承認済みの店舗アカウント（x_profiles.kind='shop'）があるお店。
--   ★ 店舗基本設定の「fukuX URL」を手で入れただけでは付かない（アカウントが連携していないため）。
--   ★ 投稿の点（1日10点まで）とは別。開設しているだけで毎週 +5。
-- ★ どちらも【毎週】付く（おすすめランキングは週ごとの点数のため）。週の途中で公開・開設しても、その時点から付く。
-- ★ 手動の動きが0でも、この点があればランキングに載る（ページ側で 0点の店だけ外している）。
-- ★ 点数を変えるときは、画面の説明文の数字（src/lib/rankingPoints.ts の RECOMMEND_SITE_BONUS・RECOMMEND_FUKUX_SHOP_BONUS）も同じ数に。
-- ★ 表は増やさない・既存の表も変えない（関数を作り直すだけ）。返り値に site_points・fukux_points が増える。

begin;

drop function if exists public.salon_recommend_scores(timestamptz, timestamptz);
create function public.salon_recommend_scores(p_from timestamptz, p_to timestamptz)
returns table (salon_id bigint, bumps integer, announces integer, x_points integer, link_points integer, site_points integer, fukux_points integer, points integer)
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
  ),
  st as (
    -- ★ 第1188便: フクエスサイトで公式HPを公開中（live）のお店に +5
    select ss.salon_id, 5 as site_points
      from public.salon_sites ss
     where ss.status = 'live'
  ),
  fx as (
    -- ★ 第1188便: フクエックスの店舗アカウント（オーナーと同じログイン・承認済み）があるお店に +5
    select s.id as salon_id, 5 as fukux_points
      from public.salons s
     where exists (
       select 1 from public.x_profiles xpf
        where xpf.auth_user_id = s.owner_id and xpf.kind = 'shop' and xpf.status = 'approved'
     )
  )
  select s.id,
         coalesce(ev.bumps, 0),
         coalesce(ev.announces, 0),
         coalesce(xp.x_points, 0),
         coalesce(lk.link_points, 0),
         coalesce(st.site_points, 0),
         coalesce(fx.fukux_points, 0),
         (coalesce(ev.bumps, 0) + coalesce(ev.announces, 0) * 5 + coalesce(xp.x_points, 0) + coalesce(lk.link_points, 0)
          + coalesce(st.site_points, 0) + coalesce(fx.fukux_points, 0))::int
    from public.salons s
    left join ev on ev.salon_id = s.id
    left join xp on xp.salon_id = s.id
    left join lk on lk.salon_id = s.id
    left join st on st.salon_id = s.id
    left join fx on fx.salon_id = s.id
   where s.is_hidden = false
     and s.listing_plan = 'standard';
$$;

revoke all on function public.salon_recommend_scores(timestamptz, timestamptz) from public;
grant execute on function public.salon_recommend_scores(timestamptz, timestamptz) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ★ 確認（実行しても何も変わらない）: 今週の点数の内訳。site_points・fukux_points の列が増えていれば OK。
select r.salon_id, s.name, r.bumps, r.announces, r.x_points, r.link_points, r.site_points, r.fukux_points, r.points
  from public.salon_recommend_scores(
         (date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'),
         (date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo') + interval '7 days'
       ) r
  join public.salons s on s.id = r.salon_id
 order by r.points desc, r.salon_id;
