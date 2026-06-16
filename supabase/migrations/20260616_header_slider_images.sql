-- header_slider_images テーブル作成 & RLS設定
-- Supabase ダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS header_slider_images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url     text        NOT NULL,
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE header_slider_images ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーをクリーンアップ
DROP POLICY IF EXISTS "header_slider_images_select" ON header_slider_images;
DROP POLICY IF EXISTS "header_slider_images_insert" ON header_slider_images;
DROP POLICY IF EXISTS "header_slider_images_update" ON header_slider_images;
DROP POLICY IF EXISTS "header_slider_images_delete" ON header_slider_images;

-- SELECT: 誰でも閲覧可
CREATE POLICY "header_slider_images_select"
  ON header_slider_images FOR SELECT
  USING (true);

-- INSERT: 管理者のみ
CREATE POLICY "header_slider_images_insert"
  ON header_slider_images FOR INSERT
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- UPDATE: 管理者のみ
CREATE POLICY "header_slider_images_update"
  ON header_slider_images FOR UPDATE
  USING  (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- DELETE: 管理者のみ
CREATE POLICY "header_slider_images_delete"
  ON header_slider_images FOR DELETE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- ─── header-slider ストレージバケット ───────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'header-slider',
  'header-slider',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = true,
  file_size_limit    = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 既存ストレージポリシーをクリーンアップ
DROP POLICY IF EXISTS "header_slider_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "header_slider_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "header_slider_storage_delete" ON storage.objects;

-- SELECT: 誰でも閲覧可
CREATE POLICY "header_slider_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'header-slider');

-- INSERT: 認証済みユーザーのみ
CREATE POLICY "header_slider_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'header-slider'
    AND auth.role() = 'authenticated'
  );

-- DELETE: 認証済みユーザーのみ
CREATE POLICY "header_slider_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'header-slider'
    AND auth.role() = 'authenticated'
  );
