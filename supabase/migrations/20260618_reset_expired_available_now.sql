-- 「今すぐ」フラグのクリーンアップ
--
-- 背景:
--   /mypage の「今すぐ」タブで3名制限の判定が出勤中セラピストのみを対象としていたため、
--   出勤外のセラピストに付いた古いフラグが保存時に取りこぼされ、is_available_now=true が
--   3名を超えて残存していた（例: salon 6 で5名）。
--   アプリ側のロジックは修正済み。本SQLは既に蓄積した期限切れフラグを一括リセットする。
--
-- 内容:
--   available_until が過去 もしくは NULL の「今すぐ」フラグを解除する。
--   （available_until が未来＝まだバッジ表示中の正常なフラグは残す）

UPDATE therapists
SET is_available_now = false,
    available_until  = NULL
WHERE is_available_now = true
  AND (available_until IS NULL OR available_until <= now());
