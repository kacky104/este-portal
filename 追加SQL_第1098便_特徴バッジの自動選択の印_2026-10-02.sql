-- 第1098便（2026-10-02）: 特徴バッジを自動で選んだ「印」の列を足す
--
-- ★ カッキーさん決定: 駅ちかから取り込んだセラピストで、バッジが空の方に、写真とサイズから自動でバッジを付ける。
-- ★ 自動で選ぶのは【1人1回だけ】。この列に「選んだ日時」を入れ、入っている方は二度と選び直さない
--   （選んだ結果が0個でも入れる。店舗様がバッジを全部外した方に、あとから勝手に付け直さないため）。
-- ★ 既存の行はすべて null（＝まだ自動で選んでいない）。既存のバッジには触らない。
-- ★ このSQLを流してから、コード（第1098便）を push すること。
--   逆順でも取り込みは壊れない（新しい口 /api/admin/therapist-badge-auto が「列が無い」と返すだけ）。

alter table public.therapists
  add column if not exists feature_badges_auto_at timestamptz;

comment on column public.therapists.feature_badges_auto_at is
  '特徴バッジを自動で選んだ日時（第1098便）。null＝まだ自動で選んでいない。入っている方は自動では選び直さない';

-- 確認（1行出れば OK）
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'therapists'
  and column_name = 'feature_badges_auto_at';
