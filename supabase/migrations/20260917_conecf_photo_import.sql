-- コネックエフ：駅ちかの写真だけ取り込む（1店舗1回）（第427便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください（★ コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わりません（3列とも null ＝ だれも押していない）。
-- ★ しくみは「最初の1回」（20260917_conecf_first_import.sql）と同じ:
--   1) 店舗様が /girls の「駅ちかの写真を取り込む」を押す → requested_at
--   2) 次の /api/import/targets（15分ごと）がその店の駅ちか枠を渡す → started_at（★ 最初の1回が終わっていない店は待つ）
--   3) その次の targets で done_at
-- ★ 取り込むのは、コネックエフの写真が0枚の人だけ。★ 取り込んだ写真は conecf_photo_pushes に記録（枠N ← その写真）
-- ★ 最初の1回（第427便以降に押した店）でも同じように写真を取り込みます

alter table public.salons add column if not exists conecf_photo_import_requested_at timestamptz;
alter table public.salons add column if not exists conecf_photo_import_started_at   timestamptz;
alter table public.salons add column if not exists conecf_photo_import_done_at      timestamptz;

-- ★ 確認
-- select id, name, conecf_photo_import_requested_at, conecf_photo_import_started_at, conecf_photo_import_done_at
--   from public.salons where conecf_enabled_at is not null;

-- ★ 戻す（もう1回押せるようにする）
-- update public.salons set conecf_photo_import_requested_at = null, conecf_photo_import_started_at = null, conecf_photo_import_done_at = null where id = 6;
