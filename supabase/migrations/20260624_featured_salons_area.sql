-- ピックアップサロンを「エリアごと」に設定できるようにする拡張。
-- Supabase ダッシュボードの SQL Editor で実行してください。
--
-- area 列の意味：
--   NULL        … トップページ（/）用の共通ピックアップ
--   '博多・住吉' 等 … その地域ページ（/area/<slug>）用のピックアップ
-- area にはサロンの area と同じ「値（キー）」を入れる（表示ラベルではない）。

-- 1) area 列を追加（既存行は NULL のまま＝トップ用として維持）
ALTER TABLE featured_salons
  ADD COLUMN IF NOT EXISTS area text;

-- 2) 旧 UNIQUE(salon_id) を解除（同じサロンを複数エリアでピックアップ可能にするため）
ALTER TABLE featured_salons
  DROP CONSTRAINT IF EXISTS featured_salons_salon_id_key;

-- 3) 「エリアごとに同一サロンは1回まで」を担保する一意インデックス。
--    NULL（トップ用）も COALESCE で空文字に正規化して重複を防ぐ。
CREATE UNIQUE INDEX IF NOT EXISTS featured_salons_area_salon_uniq
  ON featured_salons (COALESCE(area, ''), salon_id);

-- 4) エリア別の並び替え取得を高速化する補助インデックス。
CREATE INDEX IF NOT EXISTS featured_salons_area_order_idx
  ON featured_salons (area, display_order);
