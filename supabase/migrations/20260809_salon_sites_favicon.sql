-- 公式ホームページ: 店舗ごとのファビコン（2026-08-09・段階4）。
-- 独自ドメインで開いたとき、ブラウザタブにその店のアイコンを出せるようにする。
-- 画像は salon-images バケットに 512×512 PNG でアップロードし、URLをこの列に持つ。
-- Supabase SQL Editor で実行してください（コード push より先に適用。
-- 実行しないと公開ページが favicon_url を SELECT できず 404 になる）。

alter table public.salon_sites
  add column if not exists favicon_url text;

-- 公開ページ（anon）が読めるように列単位の SELECT を追加。
-- （20260809_salon_sites_admin_lock.sql でテーブル単位の select を revoke し
--   列単位で grant し直しているため、新しい列は明示的に grant が必要）
grant select (favicon_url) on public.salon_sites to anon, authenticated;
