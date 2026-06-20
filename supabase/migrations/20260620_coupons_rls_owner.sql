-- coupons テーブルにオーナー用 RLS ポリシーを追加
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- 目的：店舗オーナーが /mypage から「自分の店舗（salon_id）の」クーポンを
--       SELECT / INSERT / UPDATE / DELETE できるようにする。
-- スコープ：その行の salon_id がログインオーナーの担当サロン
--          （salons.owner_id = auth.uid()）と一致する場合のみ。他店舗は不可。
-- 既存ポリシー（公開SELECT・管理者UID用 INSERT/UPDATE/DELETE）は壊さない。

-- 1. SELECT: オーナーは自店舗のクーポンを公開・非公開に関わらず取得可能（/mypage 一覧用）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'coupons'
      AND policyname = 'coupons_select_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "coupons_select_owner"
        ON coupons FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = coupons.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 2. INSERT: オーナーは自店舗のクーポンを追加可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'coupons'
      AND policyname = 'coupons_insert_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "coupons_insert_owner"
        ON coupons FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = coupons.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 3. UPDATE: オーナーは自店舗のクーポンを編集可能（USING/WITH CHECK 両方で自店舗に限定）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'coupons'
      AND policyname = 'coupons_update_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "coupons_update_owner"
        ON coupons FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = coupons.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = coupons.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 4. DELETE: オーナーは自店舗のクーポンを削除可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'coupons'
      AND policyname = 'coupons_delete_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "coupons_delete_owner"
        ON coupons FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = coupons.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;
