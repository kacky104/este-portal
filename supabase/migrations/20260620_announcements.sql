-- お知らせ（announcements）テーブル
-- Supabase ダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS announcements (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id     int         NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  content      text,
  is_published boolean     NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- サロン別・公開日時順の取得を高速化
CREATE INDEX IF NOT EXISTS announcements_salon_published_idx
  ON announcements (salon_id, published_at DESC);

-- RLS 有効化
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- 公開（is_published=true）の行は誰でも SELECT 可
CREATE POLICY "announcements_select_published"
  ON announcements FOR SELECT
  USING (is_published = true);

-- 管理者のみ INSERT（既存テーブルの RLS 方針に準拠）
CREATE POLICY "announcements_insert"
  ON announcements FOR INSERT
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ UPDATE
CREATE POLICY "announcements_update"
  ON announcements FOR UPDATE
  USING  (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ DELETE
CREATE POLICY "announcements_delete"
  ON announcements FOR DELETE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
