-- フクエスCRM：個人情報の保存期間（5年）と、過ぎたものを月1回消す（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
-- ※ 先に Supabase の Database → Extensions で pg_cron を ON にしておく。
--
-- ★ 決めたこと（カッキーさん 2026-09-20・案B）保存期間は一律5年。
--   1) 同意書（crm_consents）：作ってから5年を過ぎたら【行ごと消す】（サイン・文面の写しも）。
--   2) 顧客台帳（salon_customers と電話番号）：最後の動き（登録・更新・予約）から5年たったお客様を消す。
--      その人の予約は customer_id が空になる（外部キー on delete set null）。
--   3) 予約（salon_bookings）：予約の日時から5年を過ぎたら、名前・電話番号・備考を消す。
--      名前は「削除済み」、電話は 0000000000（どちらも列の決まりに引っかからない値）、備考は空。
--      金額・本数・日時・担当は残す（レポート・日報の数字は変わらない。日報はもともと締めたときの写し）。
-- ★ 毎月2日 3:00 JST（＝毎月1日 18:00 UTC）に pg_cron で動かす。対象が無ければ何もせず終わる。
-- ★ セラピスト本人の記録帳（cast_customer_logs）は対象外（本人のメモのため・別に決める）。

create or replace function public.crm_purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cut timestamptz := now() - interval '5 years';
  n_consents integer;
  n_customers integer;
  n_bookings integer;
begin
  -- 1) 同意書
  delete from public.crm_consents where created_at < cut;
  get diagnostics n_consents = row_count;

  -- 2) 顧客台帳（5年のあいだ登録・更新・予約が一度も無い人）
  delete from public.salon_customers c
   where c.created_at < cut
     and c.updated_at < cut
     and not exists (
       select 1 from public.salon_bookings b
        where b.customer_id = c.id and b.slot_start >= cut
     );
  get diagnostics n_customers = row_count;

  -- 3) 予約の個人情報
  update public.salon_bookings
     set customer_name = '削除済み',
         customer_tel  = '0000000000',
         note          = null
   where slot_start < cut
     and customer_tel is distinct from '0000000000';
  get diagnostics n_bookings = row_count;

  return jsonb_build_object('consents', n_consents, 'customers', n_customers, 'bookings', n_bookings, 'cut', cut);
end $$;

revoke all on function public.crm_purge_old_data() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'crm-purge-old-data',              -- 同じ名前なら上書き（何度流しても1つだけ）
  '0 18 1 * *',                      -- 毎月1日 18:00 UTC ＝ 毎月2日 3:00 JST
  $$select public.crm_purge_old_data();$$
);

-- ★ 確認（1行出れば登録できている）
select jobname, schedule, active from cron.job where jobname = 'crm-purge-old-data';

-- ★ 試しに今すぐ動かしたいとき（5年前より古いデータは無いはずなので、全部0が返る）：
-- select public.crm_purge_old_data();
