-- コネックエフ：駅ちかから最初に1回だけ取り込む（第406便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください（★ コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わりません（3列とも null ＝ だれも押していない）。
--
-- ★★ しくみ（VPS の import.sh は変えない）
--   1) 店舗様が /girls の「駅ちかから取り込む」を押す → requested_at
--   2) 次の /api/import/targets（15分ごと）がその店の駅ちか枠を渡す → started_at
--   3) その次の targets で done_at
-- ★ 1店舗1回だけ。★ やり直させるときは運営が下の「戻す」を実行。

alter table public.salons add column if not exists conecf_import_requested_at timestamptz;
alter table public.salons add column if not exists conecf_import_started_at   timestamptz;
alter table public.salons add column if not exists conecf_import_done_at      timestamptz;

-- ★ 確認
-- select id, name, conecf_enabled_at, conecf_import_requested_at, conecf_import_started_at, conecf_import_done_at
--   from public.salons where conecf_enabled_at is not null;

-- ★ 戻す（もう1回押せるようにする）
-- update public.salons set conecf_import_requested_at = null, conecf_import_started_at = null, conecf_import_done_at = null where id = 6;
