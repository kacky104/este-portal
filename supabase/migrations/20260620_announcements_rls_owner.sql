-- announcements テーブルにオーナー用 RLS ポリシーを追加
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- 目的：店舗オーナーが /mypage から「自分の店舗（salon_id）の」お知らせを
--       SELECT / INSERT / UPDATE / DELETE できるようにする。
-- スコープ：その行の salon_id がログインオーナーの担当サロン
--          （salons.owner_id = auth.uid()）と一致する場合のみ。他店舗は不可。
-- coupons のオーナー用RLS（20260620_coupons_rls_owner.sql）と同じ考え方・同じ書き方。
-- 既存ポリシー（公開SELECT・管理者UID用 INSERT/UPDATE/DELETE）は壊さない。

-- 1. SELECT: オーナーは自店舗のお知らせを公開・非公開に関わらず取得可能（/mypage 一覧用）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'announcements'
      AND policyname = 'announcements_select_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcements_select_owner"
        ON announcements FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = announcements.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 2. INSERT: オーナーは自店舗のお知らせを追加可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'announcements'
      AND policyname = 'announcements_insert_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcements_insert_owner"
        ON announcements FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = announcements.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 3. UPDATE: オーナーは自店舗のお知らせを編集可能（USING/WITH CHECK 両方で自店舗に限定）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'announcements'
      AND policyname = 'announcements_update_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcements_update_owner"
        ON announcements FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = announcements.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = announcements.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 4. DELETE: オーナーは自店舗のお知らせを削除可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'announcements'
      AND policyname = 'announcements_delete_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "announcements_delete_owner"
        ON announcements FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = announcements.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;
