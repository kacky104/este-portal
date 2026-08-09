-- 公式ホームページ: フラッグシップひな形「タイプS」を追加（2026-08-09）。
-- LPのキービジュアルに描かれたサイト（白×シャンパンゴールド×明朝・上部固定ナビ）の実物化。
-- template_key の CHECK 制約に 's' を足すだけ。
--
-- ※ このSQLを実行しなくてもコードのデプロイ自体は壊れない（プレビューはDBに書かないため）。
--   ただし タイプS で確定（confirmHpDesign）しようとすると制約違反で失敗するので、
--   タイプS を実際の店舗に適用する前には必ず実行しておくこと。

alter table public.salon_sites drop constraint if exists salon_sites_template_key_check;
alter table public.salon_sites add constraint salon_sites_template_key_check
  check (template_key in ('s', 'a', 'b', 'c'));
