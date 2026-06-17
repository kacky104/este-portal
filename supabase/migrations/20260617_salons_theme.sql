-- salons テーブルにテーマカラムを追加
ALTER TABLE salons ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'white';
