-- salons に郵便番号列を追加（求人ページの JobPosting 構造化データ用）。
-- Google Search Console の「求人情報」で
-- 「項目『postalCode』がありません（『jobLocation.address』に含まれる）」と指摘されたため、
-- jobLocation.address.postalCode を出力できるようにする。
-- 表示用ではなく構造化データ専用（サロン詳細ページの住所表示は既存の address のまま）。
-- ※ Supabase SQL Editor で適用する。冪等（IF NOT EXISTS）。

alter table public.salons
  add column if not exists postal_code text not null default '';
