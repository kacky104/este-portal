-- option_banners に残り枠数（stock）を追加。
--   null … 枠表示なし（無制限扱い・「残りN枠」バッジを出さない）
--   0    … 売り切れ（オーナー側で「売り切れ」表示＋申込ボタン無効）
--   1以上 … 「残りN枠」表示
-- 申込では自動減算しない（運営が管理画面で手動調整する運用）。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（再適用しても安全なよう add column if not exists）。

alter table public.option_banners
  add column if not exists stock integer;
