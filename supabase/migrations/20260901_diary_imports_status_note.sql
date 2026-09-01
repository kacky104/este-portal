-- 写メ日記の取り込み: status の説明に skipped:unreadable を足す（第95便）
--
-- ★ 列も索引も足さない。★ **説明（comment）だけ**を直す。
-- ★★ なぜ要るか: 第94便で「読み取れなかった1件」を見送る道を足した。
--   ★ 止めてしまうと、その1件で次の周も止まり、その店は永久に1件も入らない。
--   → 見送って記録に残し、§375 のとおり1日1回だけ開き直す。
--   ★ 説明を直さないと、半年後に行を見た人が status の意味を数えきれない。

comment on column public.salon_diary_imports.status is
  E'imported / skipped:private / skipped:no_match / skipped:unreadable。★ post が無い理由を行だけで言えるようにするための列。★ imported 以外は checked_at から24時間で開き直す（§375）。';

-- 確認用（適用後に別途流す）
-- select col_description('public.salon_diary_imports'::regclass, ordinal_position)
--   from information_schema.columns
--  where table_schema='public' and table_name='salon_diary_imports' and column_name='status';
