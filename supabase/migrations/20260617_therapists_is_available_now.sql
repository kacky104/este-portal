-- therapistsテーブルに「今すぐ対応可能」フラグを追加
-- Supabase ダッシュボードの SQL Editor で実行してください

ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS is_available_now boolean NOT NULL DEFAULT false;
