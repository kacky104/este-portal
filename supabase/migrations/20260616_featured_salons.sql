-- ピックアップサロンテーブル
-- Supabase ダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS featured_salons (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id      int         NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  display_order int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id)
);

-- RLS 有効化
ALTER TABLE featured_salons ENABLE ROW LEVEL SECURITY;

-- 誰でも SELECT 可
CREATE POLICY "featured_salons_select"
  ON featured_salons FOR SELECT
  USING (true);

-- 管理者のみ INSERT
CREATE POLICY "featured_salons_insert"
  ON featured_salons FOR INSERT
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ UPDATE
CREATE POLICY "featured_salons_update"
  ON featured_salons FOR UPDATE
  USING  (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ DELETE
CREATE POLICY "featured_salons_delete"
  ON featured_salons FOR DELETE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
