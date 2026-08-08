-- リンクバナー設置報告（banner_reports）に、無料掲載枠の転記用の店舗情報カラムを追加。
-- 背景: フクエス本体の設置報告フォーム（/banner/report・2026-08-08 新設）は
--   「3サイトのバナー設置 → 無料掲載（/salons のテキスト掲載）」の入口も兼ねる。
--   /admin「無料掲載枠」への手入力に必要な 地域・電話番号・公式HP を報告時に受け取れるようにする。
-- いずれも任意入力（fukuX 版フォーム /x/banner/report は従来どおり送らない＝NULL）。
-- Supabase SQL Editor で実行してください（コード push より先に適用推奨）。

alter table public.banner_reports
  add column if not exists area text check (char_length(area) <= 100),
  add column if not exists phone text check (char_length(phone) <= 30),
  add column if not exists official_url text check (char_length(official_url) <= 500);

comment on column public.banner_reports.area is '所在地域（無料掲載枠への転記用・任意）';
comment on column public.banner_reports.phone is '電話番号（無料掲載枠への転記用・任意）';
comment on column public.banner_reports.official_url is '公式ホームページURL（無料掲載枠への転記用・任意。page_url＝バナーを設置したページとは別）';
