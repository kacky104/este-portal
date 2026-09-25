-- 第833便: 店舗マイページの黄色い帯「お支払いのお願い」を出すかどうか（事務員さんが管理画面で押したときだけ true・入金済みで自動的に消える）
alter table public.invoices
  add column if not exists payment_notice_on boolean not null default false;
