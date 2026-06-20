-- コース・料金（courses）テーブル
-- Supabase ダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS courses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id     int         NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  duration_min int,
  price        int,
  description  text,
  sort_order   int         NOT NULL DEFAULT 0,
  is_published boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- サロン別・表示順の取得を高速化
CREATE INDEX IF NOT EXISTS courses_salon_sort_idx
  ON courses (salon_id, sort_order ASC);

-- RLS 有効化
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- 公開（is_published=true）の行は誰でも SELECT 可
CREATE POLICY "courses_select_published"
  ON courses FOR SELECT
  USING (is_published = true);

-- 管理者のみ INSERT（既存テーブルの RLS 方針に準拠）
CREATE POLICY "courses_insert"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ UPDATE
CREATE POLICY "courses_update"
  ON courses FOR UPDATE
  USING  (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ DELETE
CREATE POLICY "courses_delete"
  ON courses FOR DELETE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
