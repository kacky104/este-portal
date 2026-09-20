-- フクエスCRM：予約アラーム（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（風俗CTIv2 の「予約アラーム」にあたる）
--   予約の開始○分前・終了○分前に、CRM のスケジュール画面で音を鳴らしてカードを点滅させる。
-- ★ crm_settings.alarms ＝ アラームの一覧（null ＝ まだ設定していない → アプリの既定を使う）
--   例 [{"on":"start","min":5,"sec":30,"sound":2},{"on":"end","min":10,"sec":30,"sound":4}]
--   on: start（予約開始）／end（予約終了）・min: 何分前・sec: 鳴らす秒数・sound: 音の番号（1〜4）
--   形のチェックはアプリ（サーバー）側で行う。
-- ★ crm_settings は RLS 全閉・service_role で読み書き（今までどおり）。

alter table public.crm_settings add column if not exists alarms jsonb;

notify pgrst, 'reload schema';

-- ★ 確認
-- select salon_id, alarms from public.crm_settings;
