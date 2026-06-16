-- featured-salon-images ストレージポリシー修正
-- auth.role() = 'authenticated' から auth.uid() IS NOT NULL に変更
-- (supabase-js v2.108 + sb_publishable_* キー形式との互換性対応)
-- Supabase ダッシュボードの SQL Editor で実行してください

-- バケット作成 / 設定更新
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

-- 既存ポリシーをすべて削除
DROP POLICY IF EXISTS "featured_salon_images_select" ON storage.objects;
DROP POLICY IF EXISTS "featured_salon_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "featured_salon_images_delete" ON storage.objects;
DROP POLICY IF EXISTS "featured_salon_images_update" ON storage.objects;

-- SELECT: 誰でも閲覧可
CREATE POLICY "featured_salon_images_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'featured-salon-images');

-- INSERT: 認証済みユーザーのみ（auth.uid() IS NOT NULL で判定）
CREATE POLICY "featured_salon_images_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'featured-salon-images'
    AND auth.uid() IS NOT NULL
  );

-- UPDATE: 認証済みユーザーのみ（upsert: true に対応）
CREATE POLICY "featured_salon_images_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'featured-salon-images'
    AND auth.uid() IS NOT NULL
  );

-- DELETE: 認証済みユーザーのみ
CREATE POLICY "featured_salon_images_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'featured-salon-images'
    AND auth.uid() IS NOT NULL
  );
