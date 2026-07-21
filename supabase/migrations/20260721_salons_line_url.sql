-- 店舗のLINE予約URL（サロン詳細のLINE予約ボタン用）。
-- 空欄はボタン非表示、'#' はアイコンのみ（クリック不可）、URLならクリックで開く。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。
-- オーナーは既存の salons 更新ポリシーで自店の line_url を保存できる（新規ポリシー不要）。
alter table public.salons add column if not exists line_url text;
