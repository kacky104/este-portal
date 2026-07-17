-- ポップアップ画像を最大3枚＋各画像に個別リンクへ拡張（1枚目は既存の popup_image_url / popup_link を流用）。
-- Supabase ダッシュボードの SQL Editor で全文を実行してください（冪等・再実行可）。
--
-- 追加する列（2枚目・3枚目分）:
--   popup_image_url2 / popup_link2 : 2枚目の画像URLとリンク（任意）
--   popup_image_url3 / popup_link3 : 3枚目の画像URLとリンク（任意）
-- ※ 表示ON/OFFは既存の popup_enabled（全体マスタ）をそのまま使用。
--   公開ページ側は登録済み画像の中から、ページを開くたびに1枚をランダム表示する。

alter table public.salons add column if not exists popup_image_url2 text;
alter table public.salons add column if not exists popup_link2      text;
alter table public.salons add column if not exists popup_image_url3 text;
alter table public.salons add column if not exists popup_link3      text;
