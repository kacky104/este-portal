-- サロンカードの優先表示フラグ（リンクバナー設置特典）。
-- true のサロンは、トップ／地域ページのカード「30分ごとランダム表示」で
-- 一覧の上側（半数より上）に来やすくなる（重み付きシャッフル）。既定は false。
--
-- 更新は既存の salons_update_admin ポリシー（ADMIN_UUID のみ UPDATE 可）でカバーされる。
-- 公開読み取りは既存の SELECT ポリシー（非表示以外は公開）でそのまま参照可能。
--
-- ※ Supabase ダッシュボードの SQL Editor で実行してください。
alter table public.salons
  add column if not exists card_boost boolean not null default false;
