-- 第1433便（2026-10-13・カッキーさん）: 請求書の自動催促
--
-- ★ invoices に2列足す（自動で送った催促メールの日時）:
--   auto_remind1_at … 1回目（期限の翌日）。送ったときにマイページの帯（payment_notice_on）も ON にする＝赤い帯が出る
--   auto_remind2_at … 2回目（1回目から5日後）
--   入金済み（status = 'paid'）・取り消しになった請求書には送らない。帯は入金済みで自動で消える（今までどおり）。
-- ★ 毎日 10:00（日本時間）に /api/cron/invoice-remind が見回る（vercel.json）。
-- ★ 管理画面の手動の「催促メール」（reminder_sent_at）とは別に数える（手で送っても自動の分は送る）。
-- ★ 何度流しても同じ結果。
-- ★ このSQLを流す前にコード（第1433便）を push しても壊れない（列が無ければ見回りは何もしない）。

alter table public.invoices add column if not exists auto_remind1_at timestamptz;
alter table public.invoices add column if not exists auto_remind2_at timestamptz;
comment on column public.invoices.auto_remind1_at is '自動催促メール1回目（期限の翌日・第1433便）。送ったとき帯も ON';
comment on column public.invoices.auto_remind2_at is '自動催促メール2回目（1回目から5日後・第1433便）';
