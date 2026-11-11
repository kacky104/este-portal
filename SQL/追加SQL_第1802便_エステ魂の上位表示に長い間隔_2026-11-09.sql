-- ★ 第1802便（2026-11-09・カッキーさん「B」）: エステ魂の集客アピールの自動に、90分・120分・180分の間隔も選べるようにする
--   いまの決まり（salon_import_sources_bump_range）は間隔が 10 / 15 / 20 / 30 / 60 だけ。
--   ★ 駅ちかで選べるのは今までどおり 10〜60分（アプリの受け口で分ける）。この SQL は DB の決まりを広げるだけ。
--   ★ 1文ずつ流してください（どちらも書き込み）。

alter table public.salon_import_sources drop constraint if exists salon_import_sources_bump_range;

alter table public.salon_import_sources add constraint salon_import_sources_bump_range check (
  bump_start_min    between 0 and 1439
  and bump_end_min  between 0 and 1439
  and bump_interval_min in (10, 15, 20, 30, 60, 90, 120, 180)
);

-- 確かめ（読むだけ）: 決まりの中身
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'salon_import_sources_bump_range';
