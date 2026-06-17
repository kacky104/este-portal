-- ============================================================
-- テーマ壁紙機能
-- Supabase ダッシュボードの SQL Editor で実行してください
-- ============================================================

-- 1. theme_wallpapers テーブル ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.theme_wallpapers (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theme_key  text NOT NULL UNIQUE,          -- white / black / pink / blue / red / purple
  image_url  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS 有効化
ALTER TABLE public.theme_wallpapers ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを掃除
DROP POLICY IF EXISTS theme_wallpapers_select ON public.theme_wallpapers;
DROP POLICY IF EXISTS theme_wallpapers_insert ON public.theme_wallpapers;
DROP POLICY IF EXISTS theme_wallpapers_update ON public.theme_wallpapers;
DROP POLICY IF EXISTS theme_wallpapers_delete ON public.theme_wallpapers;

-- SELECT: 誰でも閲覧可
CREATE POLICY theme_wallpapers_select
  ON public.theme_wallpapers FOR SELECT
  USING (true);

-- INSERT: 管理者のみ
CREATE POLICY theme_wallpapers_insert
  ON public.theme_wallpapers FOR INSERT
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- UPDATE: 管理者のみ（upsert 対応）
CREATE POLICY theme_wallpapers_update
  ON public.theme_wallpapers FOR UPDATE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- DELETE: 管理者のみ
CREATE POLICY theme_wallpapers_delete
  ON public.theme_wallpapers FOR DELETE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);


-- 2. theme-wallpapers ストレージバケット --------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'theme-wallpapers',
  'theme-wallpapers',
  true,
  5242880,                                  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 既存ポリシーを掃除
DROP POLICY IF EXISTS theme_wallpapers_storage_select ON storage.objects;
DROP POLICY IF EXISTS theme_wallpapers_storage_insert ON storage.objects;
DROP POLICY IF EXISTS theme_wallpapers_storage_update ON storage.objects;
DROP POLICY IF EXISTS theme_wallpapers_storage_delete ON storage.objects;

-- SELECT: 誰でも閲覧可
CREATE POLICY theme_wallpapers_storage_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'theme-wallpapers');

-- INSERT: 管理者のみ
CREATE POLICY theme_wallpapers_storage_insert
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'theme-wallpapers'
    AND auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
  );

-- UPDATE: 管理者のみ（upsert 対応）
CREATE POLICY theme_wallpapers_storage_update
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'theme-wallpapers'
    AND auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
  );

-- DELETE: 管理者のみ
CREATE POLICY theme_wallpapers_storage_delete
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'theme-wallpapers'
    AND auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
  );
