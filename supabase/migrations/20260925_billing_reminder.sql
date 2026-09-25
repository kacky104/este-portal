-- 第832便: 「お支払い期限を過ぎています」のお知らせを送った日時（事務員さんが押して送る・何度でも送れる・最後の日時を持つ）
alter table public.invoices
  add column if not exists reminder_sent_at timestamptz;
