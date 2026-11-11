-- 第1437便（2026-10-13・カッキーさん）: 楽天口座の入金明細（マネーフォワード経由）と請求書の照らし合わせ
--
-- ★ bank_deposits ＝ マネーフォワードから読んだ入金明細（1明細1行・MF の明細 ID が主キー＝二重に数えない）
--   status: pending（候補・まだ決めていない）／ matched（この請求書の入金と決めた）／ ignored（対象外：預金利息など）
--   suggested_invoice_id ＝ 金額と振込名義から出した「たぶんこれ」の請求書（決めるのはカッキーさん）
--   invoice_id ＝ 決めた請求書
-- ★ 最初の1〜2か月は自動で入金済みにしない（全部「候補」・管理画面で押して決める）。決めたときの振込名義を
--   salon_billing_profiles.transfer_name（第831便の列）に覚える（空のときだけ）。
-- ★ 毎朝 9:00（日本時間）に /api/cron/bank-deposits が直近14日の入金を読む（vercel.json）。管理画面の「今すぐ読む」でも読める。
-- ★ 読み書きは service_role だけ（RLS を有効にして、ポリシーは作らない＝店舗様からは見えない）。
-- ★ 何度流しても同じ結果。

create table if not exists public.bank_deposits (
  mf_id                text primary key,
  deposit_date         date not null,
  amount               integer not null,
  content              text not null default '',
  status               text not null default 'pending' check (status in ('pending', 'matched', 'ignored')),
  suggested_invoice_id bigint references public.invoices(id) on delete set null,
  suggest_reason       text,
  invoice_id           bigint references public.invoices(id) on delete set null,
  decided_at           timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists bank_deposits_status_idx on public.bank_deposits (status, deposit_date desc);
alter table public.bank_deposits enable row level security;
comment on table public.bank_deposits is '楽天口座の入金明細（マネーフォワード経由・第1437便）。service_role だけが読み書き';
