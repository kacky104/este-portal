-- 公式ホームページ: ヘッダーのロゴ画像（2026-08-10）。
--
-- 未設定なら従来どおり店名の文字を出す。設定すると共通ヘッダー（トップバー）の
-- 店名の位置にこの画像が入る（画像の alt には店名が入るので検索・読み上げは変わらない）。
-- 画像は salon-images バケットにアップロードし、その公開URLをこの列に持つ。
--
-- Supabase SQL Editor で実行してください（コード push より先に適用。
-- 実行しないと公開ページが logo_url を SELECT できず 404 になる）。

alter table public.salon_sites
  add column if not exists logo_url text;

-- 公開ページ（anon）が読めるように列単位の SELECT を追加。
-- （20260809_salon_sites_admin_lock.sql でテーブル単位の select を revoke し
--   列単位で grant し直しているため、新しい列は明示的に grant が必要）
grant select (logo_url) on public.salon_sites to anon, authenticated;
