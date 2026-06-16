-- salon-images Storageポリシー修正
-- 前回の複雑なオーナー確認ポリシーを削除し、シンプルなポリシーに置き換える
-- Supabase ダッシュボードの SQL Editor で実行してください

-- バケット作成 / 設定更新（未作成の場合に備えて）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'salon-images',
  'salon-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 既存ポリシーをすべて削除（前回マイグレーションの残骸も含めてクリーンアップ）
DROP POLICY IF EXISTS "salon_images_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "salon_images_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "salon_images_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "salon_images_storage_delete" ON storage.objects;

-- SELECT: 誰でも閲覧可
CREATE POLICY "salon_images_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'salon-images');

-- INSERT: 認証済みユーザーのみ
CREATE POLICY "salon_images_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'salon-images'
    AND auth.role() = 'authenticated'
  );

-- DELETE: 認証済みユーザーのみ
CREATE POLICY "salon_images_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'salon-images'
    AND auth.role() = 'authenticated'
  );
