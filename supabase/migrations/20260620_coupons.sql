-- クーポン（coupons）テーブル
-- Supabase ダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS coupons (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id     int         NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  discount     text        NOT NULL,
  conditions   text,
  valid_until  date,
  is_published boolean     NOT NULL DEFAULT true,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- サロン別・表示順の取得を高速化
CREATE INDEX IF NOT EXISTS coupons_salon_sort_idx
  ON coupons (salon_id, sort_order ASC);

-- RLS 有効化
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- 公開（is_published=true）の行は誰でも SELECT 可
CREATE POLICY "coupons_select_published"
  ON coupons FOR SELECT
  USING (is_published = true);

-- 管理者のみ INSERT（既存テーブルの RLS 方針に準拠）
CREATE POLICY "coupons_insert"
  ON coupons FOR INSERT
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ UPDATE
CREATE POLICY "coupons_update"
  ON coupons FOR UPDATE
  USING  (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  WITH CHECK (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- 管理者のみ DELETE
CREATE POLICY "coupons_delete"
  ON coupons FOR DELETE
  USING (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
