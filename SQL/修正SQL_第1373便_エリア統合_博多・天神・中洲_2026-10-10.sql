-- 修正SQL 第1373便（2026-10-10・カッキーさん）: エリアの統合。
--   「博多・住吉」と「中洲・天神・薬院」を、1つのエリア「博多・天神・中洲」にまとめる。
--
-- ★ なぜ: 2つのエリアの掲載店がほぼ同じで、ページの中身が重なっていた（Search Console でエリアページ6本が3か月 未登録のまま）。
-- ★ 流す順番: 【この SQL が先 → そのあと push】。
--     SQL だけ先に入っている数分のあいだ、古いエリアページ（/area/hakata-eki など）は空になる（TOP・店舗・セラピストのページはそのまま）。
--     push が先になっても壊れないが、そのあいだは新しいエリアページのピックアップ・求人が空になる。
-- ★ 触るもの（確認SQL 第1373便で数えた 9つの列・古い値がある行だけ）:
--     salons.area / salons.area2 / therapists.area / featured_salons.area / featured_jobs.area /
--     salon_intakes.area（と area2）/ area_browse_icons.area / area_hero_banners.area / work_match_entries.desired_areas
-- ★ 決め:
--     ・店の area2（2つ目のエリア）は、area が「博多・天神・中洲」になった店では空にする（同じ値を2つ持たせない）。
--     ・フクエスワークのエリアの絵（area_browse_icons）と上の帯（area_hero_banners）は、【博多・住吉の行】を新しいエリアのものにする。
--       中洲・天神・薬院の行は消さずにそのまま置く（どこにも出ない）。絵は /admin から入れ替えられる。
-- ★ 触らないもの: 行は足さない・消さない。住所・店名・写真・出勤・口コミには触らない。
-- ★ 副作用: salons と therapists の updated_at が「今」になる（約590行）。サイトマップの更新日が新しくなるだけ（ページのタイトルのエリア名が変わるので、本当の更新）。
-- ★ 何度流しても同じ結果になる（2回目はどれも 0 行）。
-- ★ 結果の見方（最後の表）: 「古い値の残り」が area_browse_icons と area_hero_banners の 中洲・天神・薬院 の2行だけなら OK。

begin;

-- 1) 店（area → area2 の順。area2 は area を直したあとで見る）
update public.salons
   set area = '博多・天神・中洲'
 where area in ('博多・住吉', '中洲・天神・薬院');

update public.salons
   set area2 = case when area = '博多・天神・中洲' then null else '博多・天神・中洲' end
 where area2 in ('博多・住吉', '中洲・天神・薬院');

-- 2) セラピスト
update public.therapists
   set area = '博多・天神・中洲'
 where area in ('博多・住吉', '中洲・天神・薬院');

-- 3) ピックアップ（本体・ワーク）
update public.featured_salons
   set area = '博多・天神・中洲'
 where area in ('博多・住吉', '中洲・天神・薬院');

update public.featured_jobs
   set area = '博多・天神・中洲'
 where area in ('博多・住吉', '中洲・天神・薬院');

-- 4) 掲載の申込み（入力フォームの控え）
update public.salon_intakes
   set area = '博多・天神・中洲'
 where area in ('博多・住吉', '中洲・天神・薬院');

update public.salon_intakes
   set area2 = case when area = '博多・天神・中洲' then null else '博多・天神・中洲' end
 where area2 in ('博多・住吉', '中洲・天神・薬院');

-- 5) フクエスワークのエリアの絵・上の帯: 博多・住吉の行を新しいエリアに（★ もう新しいエリアの行があるときは何もしない）
update public.area_browse_icons
   set area = '博多・天神・中洲'
 where area = '博多・住吉'
   and not exists (select 1 from public.area_browse_icons x where x.area = '博多・天神・中洲');

update public.area_hero_banners
   set area = '博多・天神・中洲'
 where area = '博多・住吉'
   and not exists (select 1 from public.area_hero_banners x where x.area = '博多・天神・中洲');

-- 6) 求人マッチングの希望エリア（配列）: 古い値を新しい値に置き換えて、同じ値は1つにまとめる（並びはそのまま）
update public.work_match_entries w
   set desired_areas = (
         select coalesce(array_agg(x.v order by x.o), '{}')
         from (
           select s.v, min(s.o) as o
           from (
             select case when u.a in ('博多・住吉', '中洲・天神・薬院') then '博多・天神・中洲' else u.a end as v, u.o
             from unnest(w.desired_areas) with ordinality as u(a, o)
           ) s
           group by s.v
         ) x
       )
 where w.desired_areas && array['博多・住吉', '中洲・天神・薬院']::text[];

commit;

-- 7) 確認
select '古い値の残り' as "見るもの", t.tbl as "表・列", t.n as "件数"
from (
  select 'salons.area' as tbl, count(*) as n from public.salons where area in ('博多・住吉', '中洲・天神・薬院')
  union all select 'salons.area2', count(*) from public.salons where area2 in ('博多・住吉', '中洲・天神・薬院')
  union all select 'therapists.area', count(*) from public.therapists where area in ('博多・住吉', '中洲・天神・薬院')
  union all select 'featured_salons.area', count(*) from public.featured_salons where area in ('博多・住吉', '中洲・天神・薬院')
  union all select 'featured_jobs.area', count(*) from public.featured_jobs where area in ('博多・住吉', '中洲・天神・薬院')
  union all select 'salon_intakes.area/area2', count(*) from public.salon_intakes where area in ('博多・住吉', '中洲・天神・薬院') or area2 in ('博多・住吉', '中洲・天神・薬院')
  union all select 'area_browse_icons.area（2つ目は残ってよい）', count(*) from public.area_browse_icons where area in ('博多・住吉', '中洲・天神・薬院')
  union all select 'area_hero_banners.area（2つ目は残ってよい）', count(*) from public.area_hero_banners where area in ('博多・住吉', '中洲・天神・薬院')
  union all select 'work_match_entries.desired_areas', count(*) from public.work_match_entries where desired_areas && array['博多・住吉', '中洲・天神・薬院']::text[]
) t
union all
select '新しい値の数', t.tbl, t.n
from (
  select 'salons.area' as tbl, count(*) as n from public.salons where area = '博多・天神・中洲'
  union all select 'salons.area2', count(*) from public.salons where area2 = '博多・天神・中洲'
  union all select 'therapists.area', count(*) from public.therapists where area = '博多・天神・中洲'
  union all select 'featured_salons.area', count(*) from public.featured_salons where area = '博多・天神・中洲'
  union all select 'featured_jobs.area', count(*) from public.featured_jobs where area = '博多・天神・中洲'
  union all select 'area_browse_icons.area', count(*) from public.area_browse_icons where area = '博多・天神・中洲'
  union all select 'area_hero_banners.area', count(*) from public.area_hero_banners where area = '博多・天神・中洲'
  union all select 'work_match_entries.desired_areas', count(*) from public.work_match_entries where desired_areas && array['博多・天神・中洲']::text[]
) t;
