-- salonsテーブルに管理者用UPDATEポリシーを追加
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- ※ salonsテーブルのRLSが無効の場合は先に有効化してください:
--    ALTER TABLE salons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- UPDATE ポリシーが存在しない場合のみ作成
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'salons'
      AND policyname = 'salons_update_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "salons_update_admin"
        ON salons FOR UPDATE
        USING     (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
        WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
    $p$;
  END IF;
END $$;
