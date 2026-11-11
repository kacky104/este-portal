-- 第1104便（2026-10-02）: キャッチフレーズ・紹介文を自動で作った「印」の列を足す
--
-- ★ カッキーさん決定: 特徴バッジを自動で付けた方（駅ちかから取り込んだ方）に、写真とスリーサイズから
--   キャッチフレーズと紹介文も自動で作る。
-- ★ 自動で作るのは【1人1回だけ】。この列に「作った日時」を入れ、入っている方は二度と作り直さない
--   （店舗様が紹介文を消した・短くした方に、あとから勝手に書き直さないため）。
-- ★ 既存の行はすべて null（＝まだ自動で作っていない）。既存のキャッチ・紹介文には触らない。
-- ★ このSQLを流してから、コード（第1104便）を push すること。
--   逆順でも壊れない（新しい口 /api/admin/therapist-copy-auto が「列が無い」と返すだけ）。

alter table public.therapists
  add column if not exists profile_copy_auto_at timestamptz;

comment on column public.therapists.profile_copy_auto_at is
  'キャッチフレーズ・紹介文を自動で作った日時（第1104便）。null＝まだ自動で作っていない。入っている方は自動では作り直さない';

-- 確認（1行出れば OK）
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'therapists'
  and column_name = 'profile_copy_auto_at';
