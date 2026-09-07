-- フクエスの「今すぐ」→ 駅ちかの「即ヒメ」を【自動】にするスイッチ（第215便・2026-09-08）。
--
-- ★★★ なぜ出勤の write_auto に相乗りしないか（2026-09-08・カッキーさんの判断）
--   出勤の自動反映（link_mode='write_auto'）は「30分ごとに出勤表を書き換える」。
--   即ヒメの自動は「5分ごとに、いま今すぐの方を1人ずつ相手の枠へ載せる」。
--   ★ 周期も、触る画面も、失敗したときの見え方も違う。
--   ★★ 相乗りにすると「出勤は自動にしたいが、即ヒメはまだ手で確かめたい」が作れない。
--     ★ 逆も同じ。★ 1つのスイッチに2つの意味を持たせない（第48便 §55 の「状態は1列」は
--       【向き】の話であって、機能ごとの入切まで1列にまとめる話ではない）。
--
-- ★★★ ただし【向きは必ず見る】。★ この列だけでは動かない（第215便の受け口）。
--   周の対象は「link_mode が write / write_auto」かつ「sokuhime_auto = true」。
--   ★ 駅ちかから取り込んでいる店（read）へフクエスから書かない、という第214便の方針は崩さない
--     （指示書_フクエス_プロジェクト指示.md §6・両方から同じ媒体へ書かない）。
--
-- ★ 既定 false ＝ 既存の店には勝手に効かない。★ 店舗様が「出勤を送る」で自分で入れる。

alter table public.salon_import_sources
  add column if not exists sokuhime_auto boolean not null default false;

comment on column public.salon_import_sources.sokuhime_auto is
  E'フクエスの「今すぐ」を駅ちかの「即ヒメ」へ自動で送る（第215便）。★ 既定 false。★ link_mode が write / write_auto のときだけ効く。';

-- 確認用（適用後に別途流す）
-- select column_name, data_type, column_default from information_schema.columns
--  where table_schema='public' and table_name='salon_import_sources' and column_name='sokuhime_auto';
