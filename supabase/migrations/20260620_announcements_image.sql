-- お知らせ（announcements）に画像添付機能を追加
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- 既存の写メ日記（diary-images）と同じ方針：
--   ・公開バケット（誰でも閲覧可）
--   ・オーナーは自店舗分のみアップロード/削除可
--   ・パス形式： {salon_id}/{timestamp}.{ext}

-- ============================================================
-- 1. announcements に image_url 列を追加（NULL可）
-- ============================================================
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS image_url text;

-- ============================================================
-- 2. announcement-images バケット作成 / 設定更新（Public・5MB・画像のみ）
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images',
  'announcement-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ------------------------------------------------------------
-- ストレージポリシー
--   パス形式: {salon_id}/{timestamp}.{ext}
--   split_part(name, '/', 1) でフォルダ名(= salon_id)を取り出し、
--   そのサロンのオーナーかどうかで判定する。
-- ------------------------------------------------------------

-- SELECT: 誰でも閲覧可
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'announcement_images_storage_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcement_images_storage_select"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'announcement-images')
    $p$;
  END IF;
END $$;

-- INSERT: そのサロンのオーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'announcement_images_storage_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcement_images_storage_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'announcement-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.salons s
            WHERE s.owner_id = auth.uid()
              AND s.id::text = split_part(storage.objects.name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;

-- DELETE: そのサロンのオーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'announcement_images_storage_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcement_images_storage_delete"
        ON storage.objects FOR DELETE
        USING (
          bucket_id = 'announcement-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.salons s
            WHERE s.owner_id = auth.uid()
              AND s.id::text = split_part(storage.objects.name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;
