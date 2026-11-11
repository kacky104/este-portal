-- 第1312便（2026-10-08・カッキーさんの決定）: 駅ちか → フクエスの「当日の出勤」の取り込みを 15分ごと → 30分ごと にする。
--   ★ 駅ちかへの負荷（公開ページの読み）を半分にするため。週間出勤（1日1回）は変えない。VPS の crontab も変えない。
--   ★★ 順番: 【第1312便の push（デプロイ完了）のあと】に流すこと（今すぐの保険の期限 50→80分 が先に効いている必要がある）。
--   ★ 何度流しても同じ。
--
-- ★★★ 第1版でエラーになった理由（2026-10-08 15:05）:
--   salon_import_sources_imasugu_interval_check（第40便）が「即ヒメを読む行は間隔20分以下」と止めていた。
--   ★ 20 は当時の今すぐの期限（20分）にそろえた値。期限を80分にした（30分間隔×2＋停止10分＋余裕10分）ので、上限を30分に上げる。
--   ★ 制約そのものは残す（間隔を期限より長くすると「今すぐ」が出たり消えたりする。それを止めるための制約）。

-- 1) 流す前の様子（確認用）
select salon_id, slot, import_imasugu, import_interval_min, is_enabled
  from public.salon_import_sources
 where provider = 'ekichika'
 order by salon_id, slot;

-- 2) 即ヒメを読む行の間隔の上限を 20分 → 30分
alter table public.salon_import_sources
  drop constraint if exists salon_import_sources_imasugu_interval_check;
alter table public.salon_import_sources
  add constraint salon_import_sources_imasugu_interval_check
  check (import_imasugu = false or import_interval_min <= 30);

-- 3) 列の既定も 30 に（アプリの新規登録も30で立てる）
alter table public.salon_import_sources
  alter column import_interval_min set default 30;

comment on column public.salon_import_sources.import_interval_min is
  '取り込みの最短間隔（分）。/api/import/targets?mode=list が last_run_at と突き合わせて、経過していない店を返さない（第36便）。既定30（第1312便で15から変更）。mode=full は無視する。★ import_imasugu=true の店は30分以下（CHECK 制約。今すぐの期限80分＝lib/importListInterval.ts とそろえる）。';

-- 4) 15分の行を30分に
update public.salon_import_sources
   set import_interval_min = 30, updated_at = now()
 where provider = 'ekichika'
   and import_interval_min = 15;

-- 5) 流したあと（すべて 30 になっていれば OK）
select salon_id, slot, import_imasugu, import_interval_min
  from public.salon_import_sources
 where provider = 'ekichika'
 order by salon_id, slot;
