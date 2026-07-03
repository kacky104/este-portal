-- 求人バナー画像（job-hero-images）ストレージRLSの修正版（実際に適用したもの）
-- Supabase ダッシュボードの SQL Editor で実行してください。
--
-- 背景:
--   初版（20260703_job_hero_images_storage.sql）の書き込みポリシーは、WITH CHECK/USING 内で
--   public.salons を直接参照する EXISTS サブクエリでオーナー照合していた。しかし storage の
--   RLS 評価コンテキストではこのサブクエリが salons 側 RLS の影響等で意図どおり真にならず、
--   オーナーのアップロードが "new row violates row-level security policy" で失敗した。
--   （auth.role()='authenticated' 依存の salon-images 系が sb_publishable_* キーで不安定なのと同根の問題。）
--
-- 対応方針:
--   「auth.uid() IS NOT NULL のみ（誰でも書き込み可）」案はセキュリティ上不採用。
--   代わりに SECURITY DEFINER 関数 public.is_salon_owner_by_path() を用意し、
--   関数内でオーナー/運営を判定する（DEFINER 権限で salons を参照するため、RLS の絡みを受けずに
--   確実にオーナー照合できる）。ポリシーはこの関数を呼ぶだけにする。
--   パス形式は従来どおり {salon_id}/{timestamp}.{ext}。SELECT（公開閲覧）ポリシーは初版のまま変更なし。

-- ============================================================
-- 1. オーナー/運営 判定関数（SECURITY DEFINER）
--    引数 object_name = storage.objects.name（例: "5/1712345678.jpg"）
--    先頭フォルダ(=salon_id)のサロンのオーナー本人、または運営(ADMIN_UUID)なら true。
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_salon_owner_by_path(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    OR EXISTS (
      SELECT 1
      FROM public.salons
      WHERE salons.owner_id = auth.uid()
        AND salons.id::text = split_part(object_name, '/', 1)
    );
$$;

-- ポリシー評価時（authenticated ロール）に関数を実行できるよう権限付与。
GRANT EXECUTE ON FUNCTION public.is_salon_owner_by_path(text) TO authenticated, anon;

-- ============================================================
-- 2. 書き込みポリシー3本を関数ベースで再作成（INSERT / UPDATE / DELETE）
--    SELECT（誰でも閲覧可）は初版のまま。
-- ============================================================
DROP POLICY IF EXISTS "job_hero_images_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_hero_images_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "job_hero_images_storage_delete" ON storage.objects;

-- INSERT: 自サロン(ID)フォルダのオーナー、または運営のみ
CREATE POLICY "job_hero_images_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-hero-images'
    AND auth.uid() IS NOT NULL
    AND public.is_salon_owner_by_path(name)
  );

-- UPDATE: 自サロンのオーナー、または運営のみ（upsert 差し替え対応）
CREATE POLICY "job_hero_images_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'job-hero-images'
    AND auth.uid() IS NOT NULL
    AND public.is_salon_owner_by_path(name)
  );

-- DELETE: 自サロンのオーナー、または運営のみ
CREATE POLICY "job_hero_images_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-hero-images'
    AND auth.uid() IS NOT NULL
    AND public.is_salon_owner_by_path(name)
  );
