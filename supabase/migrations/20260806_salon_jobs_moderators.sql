-- 求人管理（salon_jobs＋求人画像）を審査スタッフにも開放（2026-08-06）。
-- Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用）。
--
-- 背景:
--   /moderation に求人管理タブを追加し、審査スタッフ（MODERATOR_UUIDS・src/app/lib/admin.ts と対）
--   にも求人の一覧・編集・公開切替・代理作成を可能にする。
--   書類置き場の開放（20260717_admin_documents_moderators.sql）と同方針。
--   ※ スタッフを増減させたら src/app/lib/admin.ts の MODERATOR_UUIDS とここのリストを両方更新すること。
--   ※ 応募者情報（job_applications）は個人情報を含むため開放しない（従来どおり owner/運営のみ）。
--
-- 対応:
--   1) salon_jobs に審査スタッフ用の追加ポリシーを1本足す。
--      既存の「owner本人 or 運営」ポリシーには触らない（permissive ポリシーは OR で合成されるため、
--      既存ポリシー名に依存せず安全に開放できる）。
--   2) 求人画像（job-hero-images バケット）の書き込み判定関数 is_salon_owner_by_path() を
--      「owner本人 or 運営 or 審査スタッフ」に差し替える（CREATE OR REPLACE・ポリシー本体は不変）。

-- ── 1. salon_jobs：審査スタッフの全操作を許可する追加ポリシー ──
drop policy if exists "moderator_all_salon_jobs" on public.salon_jobs;
create policy "moderator_all_salon_jobs"
  on public.salon_jobs for all
  using (auth.uid() = any (array[
    '63aca737-b399-4fb2-bf92-8a3816955d69',  -- 運営（ADMIN_UUID）
    '2cace8de-0156-4f0d-ac06-675f35a2f774'   -- 審査スタッフ
  ]::uuid[]))
  with check (auth.uid() = any (array[
    '63aca737-b399-4fb2-bf92-8a3816955d69',
    '2cace8de-0156-4f0d-ac06-675f35a2f774'
  ]::uuid[]));

-- ── 2. 求人画像の書き込み判定関数を「owner or 運営 or 審査スタッフ」に更新 ──
-- （20260703_job_hero_images_storage_fix.sql で作成した関数の差し替え。
--   job-hero-images の INSERT/UPDATE/DELETE ポリシーはこの関数を呼ぶだけなので変更不要。）
-- ※ 引数名は path_name。本番に適用済みの関数がこの名前で作られており、
--   CREATE OR REPLACE は引数名を変更できない（42P13）ため必ず合わせること。
--   （fix ファイル内の記載は object_name だが、実際の適用時に path_name になっていた。）
CREATE OR REPLACE FUNCTION public.is_salon_owner_by_path(path_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = any (array[
      '63aca737-b399-4fb2-bf92-8a3816955d69',  -- 運営（ADMIN_UUID）
      '2cace8de-0156-4f0d-ac06-675f35a2f774'   -- 審査スタッフ
    ]::uuid[])
    OR EXISTS (
      SELECT 1
      FROM public.salons
      WHERE salons.owner_id = auth.uid()
        AND salons.id::text = split_part(path_name, '/', 1)
    );
$$;

-- 適用後の確認（1行返ればOK）:
--   select policyname from pg_policies
--   where schemaname='public' and tablename='salon_jobs' and policyname='moderator_all_salon_jobs';
