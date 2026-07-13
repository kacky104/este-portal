-- 求人カードの優先表示フラグ（リンクバナー設置特典・求人版）。
-- true の求人は、フクエスワークの求人一覧（/jobs・エリア・エリア×タグ・タグ・出張）の
-- 「30分ごとランダム表示」で一覧の上側（半数より上）に来やすくなる（重み付きシャッフル）。既定は false。
--
-- 本体サロンカードの card_boost（salons.card_boost）とは独立した求人専用フラグ。
-- 更新は既存の salon_jobs 書き込みRLS（owner本人 or ADMIN_UUID）でカバーされる（admin がUUID判定で許可）。
-- 公開読み取りは既存の SELECT ポリシー（is_active かつ salons.is_hidden=false）でそのまま参照可能。
--
-- ※ Supabase ダッシュボードの SQL Editor で実行してください。
alter table public.salon_jobs
  add column if not exists job_boost boolean not null default false;
