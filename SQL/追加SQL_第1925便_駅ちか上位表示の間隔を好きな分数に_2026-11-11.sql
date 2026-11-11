-- 第1925便（2026-11-11・カッキーさん「ベンリーみたいに好きな分数を」）: 上位表示のタイマー更新の間隔を、10〜240分の好きな分数にできるようにする
--   いまの決まり（salon_import_sources_bump_range・第1802便）は 10 / 15 / 20 / 30 / 60 / 90 / 120 / 180 だけ
--   ★ 決まりを「10〜240分の整数」に広げるだけ（今ある行の値はどれもこの中に入る＝何も書き換わらない）
--   ★ エステ魂で選べるのは今までどおり選択肢だけ（アプリの受け口で分ける）

alter table public.salon_import_sources drop constraint if exists salon_import_sources_bump_range;

alter table public.salon_import_sources add constraint salon_import_sources_bump_range check (
  bump_start_min    between 0 and 1439
  and bump_end_min  between 0 and 1439
  and bump_interval_min between 10 and 240
);

-- 確かめ（読むだけ）: 決まりの中身
select pg_get_constraintdef(oid) from pg_constraint where conname = 'salon_import_sources_bump_range';
