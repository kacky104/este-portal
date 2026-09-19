-- /cast 記録帳：お客様記録帳にコース金額を足す（第518便・2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
--
-- ★ 何のため
--   お客様記録帳と報酬帳を1つの「記録帳」にまとめる。1行（1回の接客）にコース金額を持たせ、
--   今日の報酬・カレンダーの日ごとの合計は、この金額を営業日（朝6時区切り）で足して画面で出す（合計の列は持たない）。
-- ★ 空欄OK（金額を入れない記録もある）。0〜9,999,999円。
-- ★ 旧報酬帳（cast_earnings）はそのまま残す。画面では合計に足して見せるだけ（新しい入力はしない）。
-- ★ RLS・権限は第496便のまま（anon/authenticated 閉じ・service_role で本人確認してから読み書き）。

alter table public.cast_customer_logs
  add column if not exists amount integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cast_customer_logs_amount_range' and conrelid = 'public.cast_customer_logs'::regclass
  ) then
    alter table public.cast_customer_logs
      add constraint cast_customer_logs_amount_range check (amount is null or amount between 0 and 9999999);
  end if;
end $$;

comment on column public.cast_customer_logs.amount is
  E'コース金額（円・空欄可）。第518便。★ 日・月の合計は画面で営業日（朝6時区切り）ごとに足す。';

-- ★ 確認
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_name = 'cast_customer_logs' and column_name = 'amount';
