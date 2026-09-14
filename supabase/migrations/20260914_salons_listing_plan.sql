-- salons.listing_plan: 'standard'（本契約・既存の全店）／'free'（無料掲載枠）。
-- 無料掲載枠は TOP 最下部の簡易カード＋店舗基本情報と口コミだけの詳細ページ（第368便）。
-- ※ Supabase SQL Editor で適用する。冪等。

alter table public.salons
  add column if not exists listing_plan text not null default 'standard';

alter table public.salons drop constraint if exists salons_listing_plan_check;
alter table public.salons
  add constraint salons_listing_plan_check check (listing_plan in ('standard', 'free'));

create index if not exists idx_salons_listing_plan_free
  on public.salons (listing_plan) where listing_plan = 'free';
