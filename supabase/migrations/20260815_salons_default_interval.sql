-- ネット予約のインターバル自動付与（2026-08-15）
-- 店舗ごとに「施術後のインターバル（準備・片付け時間）」を1つ設定できるようにする。
-- ネット予約が入ったときに slot_end へ自動で足し、次の予約が詰めて入らないようにする。
--   予約枠 = コース時間 + default_interval_min
-- 0＝なし（従来と同じ挙動）。既存店はすべて 0 で入るので、この列を足しただけでは何も変わらない。
-- 手入力（電話予約）フォームの初期値にも使う（その場で変更可）。
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS default_interval_min smallint NOT NULL DEFAULT 0;

-- 選べるのは 0/15/30/45/60 分のみ（アプリ側の INTERVAL_OPTIONS と対）。
ALTER TABLE salons
  DROP CONSTRAINT IF EXISTS salons_default_interval_min_check;
ALTER TABLE salons
  ADD CONSTRAINT salons_default_interval_min_check
  CHECK (default_interval_min IN (0, 15, 30, 45, 60));

COMMENT ON COLUMN salons.default_interval_min IS
  '施術後のインターバル（分・0/15/30/45/60）。ネット予約の slot_end に自動で加算し、手入力フォームの初期値にも使う。';
