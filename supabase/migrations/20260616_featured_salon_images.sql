-- featured_salons に image_url カラムを追加
ALTER TABLE featured_salons ADD COLUMN IF NOT EXISTS image_url text;

-- featured-salon-images バケット作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'featured-salon-images',
  'featured-salon-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 既存ポリシーをクリーンアップ
DROP POLICY IF EXISTS "featured_salon_images_select" ON storage.objects;
DROP POLICY IF EXISTS "featured_salon_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "featured_salon_images_delete" ON storage.objects;

-- SELECT: 誰でも閲覧可
CREATE POLICY "featured_salon_images_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'featured-salon-images');

-- INSERT: 認証済みユーザーのみ
CREATE POLICY "featured_salon_images_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'featured-salon-images'
    AND auth.role() = 'authenticated'
  );

-- DELETE: 認証済みユーザーのみ
CREATE POLICY "featured_salon_images_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'featured-salon-images'
    AND auth.role() = 'authenticated'
  );
