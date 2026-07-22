-- free_salon_listings に公式ホームページURL列を追加（/salons の2行レイアウト対応）。
-- /salons の各行2行目・右カラム「公式ホームページ」リンクに使う。掲載中サロンは salons.official_url を使用。
-- ※ Supabase SQL Editor で適用する。冪等（IF NOT EXISTS）。

alter table public.free_salon_listings
  add column if not exists website_url text not null default '';
