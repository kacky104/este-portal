-- セラピストに複数プロフィール画像（最大5枚）を保存する配列カラムを追加
ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS profile_images text[] DEFAULT '{}';

-- 既存の単一画像(profile_image_url)を1枚目として移行し互換性を維持
UPDATE therapists
SET profile_images = ARRAY[profile_image_url]
WHERE profile_image_url IS NOT NULL
  AND profile_image_url <> ''
  AND (profile_images IS NULL OR cardinality(profile_images) = 0);
