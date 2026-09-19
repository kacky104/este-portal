-- フクエスCRM：待機場所（部屋）のバッジの色（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ crm_settings.room_colors ＝ { "部屋の名前": "色の名前" } （例 {"P401":"navy","P1011":"red"}）
--   色の名前はアプリ側で決めた一覧（navy/blue/sky/green/lime/yellow/orange/red/pink/purple/gray/black）。
--   無い部屋は紺（navy）で出す。

alter table public.crm_settings add column if not exists room_colors jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';

-- ★ 確認
-- select salon_id, rooms, room_colors from public.crm_settings;
