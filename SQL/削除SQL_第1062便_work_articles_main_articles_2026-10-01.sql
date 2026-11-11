-- 第1062便（2026-10-01）: 使われなくなったコラムのテーブル2つを削除する
--
-- ★ 前提: コラムは全52本 md 化済み（src/content/column・src/content/work-column）。
--   公開ページ・管理画面・sitemap とも、この2テーブルを一切読んでいない（第1054便・第1062便で確認）。
--
-- ★★ Storage の work-article-images / main-article-images は【消さない】。
--   md 52本の heroImage がまだこのバケットの画像を指している。消すとコラムの画像が全部切れる。
--   バケットごと消したい場合は、先に画像を public/column/・public/work-column/ へ移して heroImage を書き換えること。

-- ① 念のため件数を確認（消す前に見るだけ）
select 'work_articles' as t, count(*) from public.work_articles
union all
select 'main_articles', count(*) from public.main_articles;

-- ② ほかのテーブルから外部キーで参照されていないか確認（0行なら OK）
select conrelid::regclass as from_table, conname
from pg_constraint
where contype = 'f'
  and confrelid in ('public.work_articles'::regclass, 'public.main_articles'::regclass);

-- ③ 削除（トリガー・RLS ポリシーはテーブルと一緒に消える。storage.objects のポリシーは触らない）
-- ★ ② が0行のときだけ実行。cascade は付けない（想定外の参照があれば止まってほしいので）。
drop table if exists public.work_articles;
drop table if exists public.main_articles;
