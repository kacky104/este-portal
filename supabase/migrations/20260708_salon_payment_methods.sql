-- 店舗基本情報「支払い方法」（現金・クレカ・QR・電子マネーのスラッグ配列）
alter table salons add column if not exists payment_methods text[] not null default '{}';
