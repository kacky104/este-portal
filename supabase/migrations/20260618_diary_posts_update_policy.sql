-- 写メ日記の編集（UPDATE）用 RLS ポリシー
-- diary_posts には SELECT/INSERT/DELETE は設定済みだが UPDATE が無く、
-- オーナーが自分のサロンの日記を更新できなかったため追加する。
-- そのセラピストの所属サロンのオーナーのみ UPDATE 可。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diary_posts'
      AND policyname = 'diary_posts_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "diary_posts_update"
        ON public.diary_posts FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM public.therapists t
            JOIN public.salons s ON s.id = t.salon_id
            WHERE s.owner_id = auth.uid()
              AND t.id = diary_posts.therapist_id
          )
        )
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
