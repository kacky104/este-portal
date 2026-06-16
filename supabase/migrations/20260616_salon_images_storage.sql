-- salon-images ストレージバケットのポリシー設定
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- ※ バケット自体はダッシュボード Storage > New bucket から作成が必要な場合があります:
--     バケット名: salon-images  /  公開: ON  /  5MB  /  image/jpeg,image/png,image/webp
--   以下の INSERT はバケット未作成の場合に自動作成し、既存の場合は設定を上書きします。

-- バケット作成 / 設定更新
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

-- SELECT: 誰でも閲覧可（publicバケットでも明示的に設定）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'salon_images_storage_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "salon_images_storage_select"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'salon-images')
    $p$;
  END IF;
END $$;

-- INSERT: 認証済みユーザーが自分のサロン(ID)フォルダにのみアップロード可
--   パス形式: {salon_id}/{timestamp}.{ext}
--   split_part(name, '/', 1) でフォルダ名(= salon_id)を取り出してオーナー確認
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'salon_images_storage_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "salon_images_storage_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'salon-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.salons
            WHERE salons.owner_id = auth.uid()
              AND salons.id::text = split_part(name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;

-- UPDATE: オーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'salon_images_storage_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "salon_images_storage_update"
        ON storage.objects FOR UPDATE
        USING (
          bucket_id = 'salon-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.salons
            WHERE salons.owner_id = auth.uid()
              AND salons.id::text = split_part(name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;

-- DELETE: オーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'salon_images_storage_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "salon_images_storage_delete"
        ON storage.objects FOR DELETE
        USING (
          bucket_id = 'salon-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.salons
            WHERE salons.owner_id = auth.uid()
              AND salons.id::text = split_part(name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;
