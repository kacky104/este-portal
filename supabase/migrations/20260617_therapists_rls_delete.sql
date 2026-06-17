-- therapistsテーブルにオーナー用DELETEポリシーを追加
-- Supabase ダッシュボードの SQL Editor で実行してください

-- 1. therapists DELETE: オーナーが自分のサロンのセラピストを削除可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'therapists'
      AND policyname = 'therapists_delete_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "therapists_delete_owner"
        ON therapists FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM salons
            WHERE salons.id = therapists.salon_id
              AND salons.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- 2. therapist_schedules DELETE: オーナーが自分のサロンのスケジュールを削除可能
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'therapist_schedules'
      AND policyname = 'therapist_schedules_delete_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "therapist_schedules_delete_owner"
        ON therapist_schedules FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM therapists t
            JOIN salons s ON s.id = t.salon_id
            WHERE t.id = therapist_schedules.therapist_id
              AND s.owner_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;
