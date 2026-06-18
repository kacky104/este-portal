-- 写メ日記（diary_posts）用ストレージバケットと RLS 設定
-- Supabase ダッシュボードの SQL Editor で実行してください。
-- diary_posts テーブルは作成済み（id, therapist_id, images text[], comment, created_at）。

-- ============================================================
-- 1. diary-images バケット作成 / 設定更新（Public・5MB・画像のみ）
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diary-images',
  'diary-images',
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
--   パス形式: {therapist_id}/{timestamp}.{ext}
--   split_part(name, '/', 1) でフォルダ名(= therapist_id)を取り出し、
--   そのセラピストが所属するサロンのオーナーかどうかで判定する。
-- ------------------------------------------------------------

-- SELECT: 誰でも閲覧可
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'diary_images_storage_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_images_storage_select"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'diary-images')
    $p$;
  END IF;
END $$;

-- INSERT: そのセラピストのサロンオーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'diary_images_storage_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_images_storage_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'diary-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.therapists t
            JOIN public.salons s ON s.id = t.salon_id
            WHERE s.owner_id = auth.uid()
              AND t.id::text = split_part(name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;

-- DELETE: そのセラピストのサロンオーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'diary_images_storage_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_images_storage_delete"
        ON storage.objects FOR DELETE
        USING (
          bucket_id = 'diary-images'
          AND auth.role() = 'authenticated'
          AND EXISTS (
            SELECT 1 FROM public.therapists t
            JOIN public.salons s ON s.id = t.salon_id
            WHERE s.owner_id = auth.uid()
              AND t.id::text = split_part(name, '/', 1)
          )
        )
    $p$;
  END IF;
END $$;

-- ============================================================
-- 2. diary_posts テーブルの RLS
-- ============================================================
ALTER TABLE public.diary_posts ENABLE ROW LEVEL SECURITY;

-- SELECT: 誰でも閲覧可（公開サイト用）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diary_posts'
      AND policyname = 'diary_posts_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_posts_select"
        ON public.diary_posts FOR SELECT
        USING (true)
    $p$;
  END IF;
END $$;

-- INSERT: そのセラピストのサロンオーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diary_posts'
      AND policyname = 'diary_posts_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_posts_insert"
        ON public.diary_posts FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.therapists t
            JOIN public.salons s ON s.id = t.salon_id
            WHERE s.owner_id = auth.uid()
              AND t.id = diary_posts.therapist_id
          )
        )
    $p$;
  END IF;
END $$;

-- DELETE: そのセラピストのサロンオーナーのみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diary_posts'
      AND policyname = 'diary_posts_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_posts_delete"
        ON public.diary_posts FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM public.therapists t
            JOIN public.salons s ON s.id = t.salon_id
            WHERE s.owner_id = auth.uid()
              AND t.id = diary_posts.therapist_id
          )
        )
    $p$;
  END IF;
END $$;

-- 新しい順取得を高速化
CREATE INDEX IF NOT EXISTS diary_posts_therapist_created_idx
  ON public.diary_posts (therapist_id, created_at DESC);
