-- 第831便: 店舗の振込名義（通帳に出る名前）のメモ。請求書には出ない・運営だけ（2026-09-25・流し済み）
alter table public.salon_billing_profiles
  add column if not exists transfer_name text not null default '' check (char_length(transfer_name) <= 60);
