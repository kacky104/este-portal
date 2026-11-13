-- フリー（担当未定）の予約を、同じ時間に3件まで入れられるように（第1788便・2026-11-08・カッキーさん）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ なぜ: フクエスCRM のフリーの行を3行まで出せるようにした（第1786便）・グループ予約（第1787便）。
--   今は「フリーは同じ開始時刻に1件」の一意索引（salon_bookings_free_slot_uniq・20260814 → 第1227便で作り直し）があり、
--   同じ時刻に2件目のフリーが入らない。
-- ★ 何をするか: その一意索引を外すだけ。★ 「3件まで」はサーバー（src/app/lib/booking/freeLane.ts）で数えて止める。
-- ★ 担当ありの予約の守り（salon_bookings_active_slot_uniq・salon_bookings_no_overlap）は変えない。

drop index if exists public.salon_bookings_free_slot_uniq;

-- ★ 確認（一意のものが salon_bookings_active_slot_uniq と主キーだけならOK）
-- select indexname, indexdef from pg_indexes where schemaname='public' and tablename='salon_bookings' and indexdef ilike '%unique%';
