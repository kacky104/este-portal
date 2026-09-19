-- フクエスCRM 第2段階：料金と報酬（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 決めたこと（カッキーさん 2026-09-19）
--   ・女子報酬は【料金表の項目ごとに金額】で持つ（例：70分コース 料金11,000・報酬6,000）。
--   ・ランク別の料金表は後回し（全員同じ表。差は「オプション」か「報酬補正」で）。
-- ★ 料金表（crm_price_items）は【お店の内部情報】（報酬が入る）。
--   公開の salons.courses / booking_courses とは別の表にし、RLS で全部閉じる（service_role だけ）。
-- ★ 予約には、そのとき選んだ項目を【写し】で持つ（crm_items）。あとで料金表を直しても、過去の予約の金額は変わらない。
--   合計（price_total / pay_total）は サーバーで items の合計＋補正 を計算して入れる。

-- 1) 料金表
create table if not exists public.crm_price_items (
  id         bigint generated always as identity primary key,
  salon_id   integer not null references public.salons(id) on delete cascade,
  kind       text    not null check (kind in ('course','nomination','extension','option','discount')),
  name       text    not null check (char_length(btrim(name)) between 1 and 40),
  minutes    integer not null default 0 check (minutes between 0 and 720),  -- コース・延長の分数（他は0）
  price      integer not null default 0 check (price between 0 and 1000000), -- 料金（割引は「引く額」を正の数で）
  pay        integer not null default 0 check (pay between 0 and 1000000),   -- 女子報酬（割引は「報酬から引く額」）
  sort       integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_price_items_salon_idx on public.crm_price_items (salon_id, kind, sort);

comment on table public.crm_price_items is
  E'フクエスCRMの料金表（料金＋女子報酬）。★ お店の内部情報・service_role 専用。公開のコースメニューとは別。';

alter table public.crm_price_items enable row level security;
revoke all on public.crm_price_items from anon, authenticated;

-- 2) 予約に料金・報酬を足す（salon_bookings は公開SELECTなし・service_role で読み書き）
alter table public.salon_bookings add column if not exists crm_items    jsonb   not null default '[]'::jsonb;
alter table public.salon_bookings add column if not exists price_adjust integer not null default 0;  -- 料金補正（±）
alter table public.salon_bookings add column if not exists pay_adjust   integer not null default 0;  -- 報酬補正（±）
alter table public.salon_bookings add column if not exists price_total  integer;                     -- null＝まだ料金を入れていない
alter table public.salon_bookings add column if not exists pay_total    integer;
alter table public.salon_bookings add column if not exists payment_method text not null default ''; -- 現金／カード／PayPay など

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.crm_price_items;
-- select column_name from information_schema.columns where table_name = 'salon_bookings' and column_name in ('crm_items','price_total','pay_total','price_adjust','pay_adjust','payment_method');
