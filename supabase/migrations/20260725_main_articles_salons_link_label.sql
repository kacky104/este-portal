-- 公開済み本体コラム記事の本文内リンク文言を新ページ名へ一括置換：
--   [掲載店舗一覧](/salons) → [福岡のメンズエステ店一覧](/salons)
-- （/salons のページ名変更に伴う追随。プリセット src/app/lib/mainArticlePresets.ts も同時に修正済み）
-- ※ main_articles には updated_at 自動更新トリガ（trg_main_articles_updated_at）があるため、
--   一時的に無効化してから置換する。リンク文言の追随だけで updated_at を上げると
--   コラム一覧の並び（更新日優先）とカードの日付表示が全記事分動いてしまうのを避けるため。
-- Supabase SQL Editor で実行してください。

alter table public.main_articles disable trigger trg_main_articles_updated_at;

update public.main_articles
  set body = replace(body, '[掲載店舗一覧](/salons)', '[福岡のメンズエステ店一覧](/salons)')
  where body like '%[掲載店舗一覧](/salons)%';

alter table public.main_articles enable trigger trg_main_articles_updated_at;

-- 確認用（実行後に件数が0になっていればOK）：
-- select count(*) from public.main_articles where body like '%[掲載店舗一覧](/salons)%';
