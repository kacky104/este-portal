-- coupons テーブルに券の背景色プリセット列を追加
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- color：券の背景色プリセットのキー。デフォルトは 'pink'。
-- 取り得る値は src/app/lib/couponColors.ts の COUPON_COLORS のキーと一致させる。
-- 既存行は default の 'pink' になる。

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'pink';

-- 取り得る値を7プリセットに限定する CHECK 制約
-- （存在しない場合のみ追加。ALTER TABLE ... ADD CONSTRAINT は IF NOT EXISTS 非対応のため DO ブロックで判定）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coupons_color_check'
      AND conrelid = 'coupons'::regclass
  ) THEN
    ALTER TABLE coupons
      ADD CONSTRAINT coupons_color_check
      CHECK (color IN ('gold', 'orange_pink', 'red', 'blue', 'green', 'pink', 'black'));
  END IF;
END $$;
