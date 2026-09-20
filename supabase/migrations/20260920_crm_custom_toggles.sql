-- フクエスCRM：自由に作れる「出勤情報の項目」（最大2つ）（第597便・2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 設定で「題名＋選択肢」を最大2つ作る（例：掛け持ち出勤 ／ A・B・C）。
-- ★ スケジュールで名前を押すと出る「出勤情報」に、選択肢のボタンが並ぶ（1つだけ選ぶ・もう一度押すと外れる）。
-- ★ 選んだものは、スケジュールの名前の下にも小さなバッジで出る。
--
-- 1) crm_settings.custom_toggles … 項目の定義。[{ "id": "t1", "title": "掛け持ち出勤", "options": ["A","B","C"] }, …]（最大2つ）
-- 2) crm_work_days.toggle_values … その日の選択。{ "t1": "B" }（項目の id → 選んだ選択肢）
-- ★ id で持つので、題名を変えても選んだ値は残る。★ 選択肢を消したときは、その値は画面で出さない（行は消さない）。

alter table public.crm_settings
  add column if not exists custom_toggles jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.crm_settings
    add constraint crm_settings_custom_toggles_max2
    check (jsonb_typeof(custom_toggles) = 'array' and jsonb_array_length(custom_toggles) <= 2);
exception when duplicate_object then null; end $$;

alter table public.crm_work_days
  add column if not exists toggle_values jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.crm_work_days
    add constraint crm_work_days_toggle_values_obj
    check (jsonb_typeof(toggle_values) = 'object');
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

-- ★ 確認
-- select salon_id, custom_toggles from public.crm_settings;
-- select count(*) from public.crm_work_days where toggle_values <> '{}'::jsonb;
