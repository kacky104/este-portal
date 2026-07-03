-- 求人バナー画像（salon_jobs.hero_image_url）用ストレージバケットと RLS 設定
-- Supabase ダッシュボードの SQL Editor で実行してください。
-- salon_jobs.hero_image_url text（nullable）は追加済み前提。
--
-- ⚠ 書き込みポリシー（INSERT/UPDATE/DELETE）は後続の
--    20260703_job_hero_images_storage_fix.sql で「SECURITY DEFINER 関数 is_salon_owner_by_path()
--    ベース」に置き換え済み（本ファイルの EXISTS サブクエリ版は storage RLS 評価下でオーナー照合が
--    通らず失敗したため）。再適用する場合は必ず fix 版を後から流すこと。バケット作成と SELECT
--    ポリシーは本ファイルのままで有効。
--
-- 方針: salon-images バケットと同一方式。
--   パス形式: {salon_id}/{timestamp}.{ext}
--   split_part(name, '/', 1) でフォルダ名(= salon_id)を取り出し、そのサロンのオーナーか判定する。
--   ただし /admin の代理編集からもアップロードするため、運営（ADMIN_UUID）も書き込み可にする。
--   認証判定は auth.role() ではなく auth.uid()（sb_publishable_* キー互換。featured 系の修正と同方針）。

-- ============================================================
-- 1. job-hero-images バケット作成 / 設定更新（Public・5MB・画像のみ）
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-hero-images',
  'job-hero-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- SELECT: 誰でも閲覧可（public バケットでも明示）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'job_hero_images_storage_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "job_hero_images_storage_select"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'job-hero-images')
    $p$;
  END IF;
END $$;

-- INSERT: 自サロン(ID)フォルダのオーナー、または運営(ADMIN_UUID)のみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'job_hero_images_storage_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "job_hero_images_storage_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'job-hero-images'
          AND auth.uid() IS NOT NULL
          AND (
            auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'
            OR EXISTS (
              SELECT 1 FROM public.salons
              WHERE salons.owner_id = auth.uid()
                AND salons.id::text = split_part(name, '/', 1)
            )
          )
        )
    $p$;
  END IF;
END $$;

-- UPDATE: 自サロンのオーナー、または運営のみ（upsert 差し替え対応）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'job_hero_images_storage_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "job_hero_images_storage_update"
        ON storage.objects FOR UPDATE
        USING (
          bucket_id = 'job-hero-images'
          AND auth.uid() IS NOT NULL
          AND (
            auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'
            OR EXISTS (
              SELECT 1 FROM public.salons
              WHERE salons.owner_id = auth.uid()
                AND salons.id::text = split_part(name, '/', 1)
            )
          )
        )
    $p$;
  END IF;
END $$;

-- DELETE: 自サロンのオーナー、または運営のみ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'job_hero_images_storage_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "job_hero_images_storage_delete"
        ON storage.objects FOR DELETE
        USING (
          bucket_id = 'job-hero-images'
          AND auth.uid() IS NOT NULL
          AND (
            auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'
            OR EXISTS (
              SELECT 1 FROM public.salons
              WHERE salons.owner_id = auth.uid()
                AND salons.id::text = split_part(name, '/', 1)
            )
          )
        )
    $p$;
  END IF;
END $$;
