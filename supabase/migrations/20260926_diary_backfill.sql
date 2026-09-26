-- 第897便: 駅ちかの写メ日記の「過去60日分」を、はじめて ID・PW を入れた店で自動で遡って取り込む（2026-09-26・カッキーさん・案B）。
-- ★ diary_backfill_since … ここまで遡る（はじめて保存したときに「今から60日前」を入れる）。入りきったら null に戻す。
-- ★ diary_backfill_until … この時刻より前に書かれた日記だけ取り込む。
--    ★ 遡っている途中で「フクエスで書く」に切り替えたら、切り替えた時刻を入れる（★ 切り替え後の日記は取り込まない＝二重にならない）。
--    ★ null なら上限なし（ふつうに「駅ちかで書く」の店）。
-- ★ どちらも null＝今までどおり（ラビリンス様を含む既存の店は何も変わらない）。

alter table public.salons
  add column if not exists diary_backfill_since timestamptz,
  add column if not exists diary_backfill_until timestamptz;

-- 確認用（流したあとに）。2行返れば成功。
-- select column_name from information_schema.columns where table_schema='public' and table_name='salons' and column_name in ('diary_backfill_since','diary_backfill_until');
