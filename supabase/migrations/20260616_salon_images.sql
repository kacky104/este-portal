-- salon_images テーブル: サロンヘッダースライダー画像
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- ストレージバケットは別途ダッシュボードで作成してください:
--   バケット名: salon-images
--   公開: ON (Public)
--   最大ファイルサイズ: 5 MB
--   許可MIMEタイプ: image/jpeg, image/png, image/webp

CREATE TABLE IF NOT EXISTS salon_images (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id      integer NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE salon_images ENABLE ROW LEVEL SECURITY;

-- 誰でも閲覧可
CREATE POLICY "salon_images_select_public"
  ON salon_images FOR SELECT
  USING (true);

-- オーナーのみ自分のサロン画像を操作可
CREATE POLICY "salon_images_owner_insert"
  ON salon_images FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = salon_images.salon_id
        AND salons.owner_id = auth.uid()
    )
  );

CREATE POLICY "salon_images_owner_update"
  ON salon_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = salon_images.salon_id
        AND salons.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = salon_images.salon_id
        AND salons.owner_id = auth.uid()
    )
  );

CREATE POLICY "salon_images_owner_delete"
  ON salon_images FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = salon_images.salon_id
        AND salons.owner_id = auth.uid()
    )
  );
