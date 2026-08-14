-- 予約ボードの「フリー客」レーン（2026-08-14）
-- フリー予約＝担当セラピスト未定の予約を therapist_id = NULL で保存する。
--  1) therapist_id の NOT NULL を外す（既に NULL 許可なら何も起きない）
--  2) フリー枠の二重予約防止：同一サロン・同一開始時刻の NULL 行を一意にする部分インデックス
--     （既存の UNIQUE(therapist_id, slot_start) は NULL 同士を重複とみなさないため別途必要）
ALTER TABLE salon_bookings ALTER COLUMN therapist_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS salon_bookings_free_slot_uniq
  ON salon_bookings (salon_id, slot_start)
  WHERE therapist_id IS NULL;
