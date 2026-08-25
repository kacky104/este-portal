-- 取り込み: castId を therapists に持たせる ＋ 新規作成の記録 (2026-08-25 第35便)
--
-- 背景1（castId）
--   照合は今まで名前だけだった（normalizeName の完全一致・表記ゆれは import_aliases で手当て）。
--   駅ちかの castId は個人ページURLに入っていて、/api/import/ingest には body の
--   casts[].castId として最初から届いている（一度も使っていなかった）。
--   ★ create_missing を入れると「フクエス側で名前を変えた子」が未登録に見えて重複レコードが
--     静かに増える。これを防ぐため、castId が分かっている子は castId で先に照合する。
--   既存の子は空のままでよい。girlslist 方式（第34便4章）で castId が全員分ただで取れるので、
--   そのときに一括で埋める。
--
-- 背景2（created_names）
--   create_missing で作った子は is_active=false（非公開）で作る。サイトを見ても作られたことに
--   気づけないので、実行ログに名前を残して後から追えるようにする。
--   件数を入れる salon_import_runs.created は第28便から存在する（ingest が書いていなかった）。
--
-- 注意: therapists は公開側が anon で読むテーブル。import_cast_id は駅ちかの公開URLに
--   含まれている値なので秘密情報ではない。ただし公開表示には使わないこと。

alter table public.therapists
  add column if not exists import_cast_id text;

comment on column public.therapists.import_cast_id is
  '外部媒体取り込みの照合用ID（駅ちかの castId）。公開表示には使わない。';

-- 照合は「その店の中で castId 一致」を引くので複合。NULL は索引に載せない。
create index if not exists idx_therapists_salon_import_cast_id
  on public.therapists (salon_id, import_cast_id)
  where import_cast_id is not null;

alter table public.salon_import_runs
  add column if not exists created_names text[] not null default '{}';

comment on column public.salon_import_runs.created_names is
  'この回に新規作成したセラピスト名（create_missing）。件数は created 列。';

-- 適用後の確認（打つものではありません。別途 SQL Editor で流すと ok=2 が返れば成功）:
-- select count(*) as ok from information_schema.columns
--  where table_schema = 'public'
--    and ( (table_name = 'therapists'        and column_name = 'import_cast_id')
--       or (table_name = 'salon_import_runs' and column_name = 'created_names') );
