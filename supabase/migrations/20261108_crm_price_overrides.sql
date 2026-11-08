-- フクエスCRM 女の子別の料金（第1782便・2026-11-08・カッキーさん／店舗様のご要望）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 決めたこと（カッキーさん 2026-11-08）
--   ・基本の料金表（crm_price_items）はそのまま。女の子ごとに、項目ごとの「料金」「女子報酬」を上書きできる。
--   ・対象は全部の項目（コース・指名・延長・オプション・割引）。
--   ・空（null）は「基本と同じ」。両方 null の行は持たない（保存のときに消す）。
--   ・予約の担当がその女の子のとき、予約の料金・報酬はこちらの金額で計算する（サーバーで計算）。フリーは基本のまま。
--   ・予約には今までどおり金額を【写し】で持つ＝あとでここを直しても、過去の予約の金額は変わらない。
-- ★ お店の内部情報（報酬が入る）→ RLS で全部閉じる（service_role だけ・crm_price_items と同じ）。

create table if not exists public.crm_price_overrides (
  id             bigint generated always as identity primary key,
  salon_id       integer not null references public.salons(id) on delete cascade,
  therapist_id   bigint  not null references public.therapists(id) on delete cascade,
  price_item_id  bigint  not null references public.crm_price_items(id) on delete cascade,
  price          integer check (price is null or price between 0 and 1000000),
  pay            integer check (pay is null or pay between 0 and 1000000),
  updated_at     timestamptz not null default now(),
  unique (therapist_id, price_item_id)
);
create index if not exists crm_price_overrides_salon_idx on public.crm_price_overrides (salon_id, therapist_id);

comment on table public.crm_price_overrides is
  E'フクエスCRMの女の子別の料金（料金表の項目ごとの料金・女子報酬の上書き）。null は基本と同じ。★ お店の内部情報・service_role 専用。';

alter table public.crm_price_overrides enable row level security;
revoke all on public.crm_price_overrides from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.crm_price_overrides;
