-- フクエスCRM：セラピスト向けの報酬明細（/cast）を見せるかどうか（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ お店が設定タブで ON にしたときだけ、セラピスト本人が /cast の「報酬」タブで自分の報酬明細を見られる。
--   初期は OFF（見せたくないお店もあるため）。
-- ★ 見せるのは【報酬確定した日の分だけ】（crm_pay_confirms：本数・予約の報酬・手当・一言）と、その日の予約ごとの報酬。
--   お客様の名前・電話番号・料金・お店の売上は見せない（本人の報酬に関係する時刻とコースだけ）。
-- ★ 読み出しはサーバー（service_role）でログイン中のセラピスト本人か確かめてから（今までどおり RLS 全閉）。

alter table public.crm_settings add column if not exists cast_pay_enabled boolean not null default false;

notify pgrst, 'reload schema';

-- ★ 確認（cast_pay_enabled が false で並べば成功）
select salon_id, cast_pay_enabled from public.crm_settings;
