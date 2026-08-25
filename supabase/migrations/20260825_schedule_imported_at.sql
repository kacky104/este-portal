-- 出勤の「取り込み由来」印 (2026-08-25 第34便)
--
-- 背景: 取り込みには削除処理が無く、駅ちかの在籍一覧(girlslist)から消えた子は
-- 個人ページを取りに行かないため、最後に書かれた出勤が残り続ける（禁則234）。
-- 実例: 美澄おとは（アバンティ）。11:14 に書いた 21:00〜03:00 が、その後の5回の取り込みを素通りした。
--
-- 対策の要: 「取り込みが触った行」と「人が触った行」を区別できるようにする。
-- updated_at では区別できない（取り込みも手作業も同じ列を更新するため）。実際、応急処置で
-- 手動 UPDATE した直後、その子は updated_at ベースの点検クエリから消えてしまった。
-- そこで取り込みだけが書く列を1本足す。手入力の行は imported_at が NULL のままなので、
-- 掃除処理の対象に一度も入らない＝フクエス専任の子が構造的に守られる。
--
-- ★★★ この列を書いてよいのは /api/import/ingest だけ。
--   人が SQL で出勤を直すときは imported_at を触らないこと。触ると掃除対象に化ける。

alter table public.therapist_schedules
  add column if not exists imported_at timestamptz;

comment on column public.therapist_schedules.imported_at is
  '外部媒体取り込みが最後にこの行を書いた時刻。取り込み以外は書かないこと。NULL=人が入れた行（掃除の対象外）。';

-- バックフィル。今日以降の既存行はすべて取り込み由来とみなす。
-- 根拠（2026-08-25 実測）: 8:00〜1:00 のプレースホルダは全店ぶん掃除済み（禁則235）、
-- 点検クエリが0行、棚卸し対象7名は行ゼロ。加えて「フクエス側の手入力出勤は存在しない」を
-- オーナーに確認済み。★この設計を将来再利用するときは、この前提を必ず取り直すこと。
update public.therapist_schedules
set imported_at = updated_at
where schedule_date >= (now() at time zone 'Asia/Tokyo')::date
  and imported_at is null;

create index if not exists idx_therapist_schedules_imported
  on public.therapist_schedules (schedule_date, imported_at);

-- 確認用（適用後に別途流す）。Supabase の SQL Editor は更新件数を出さない（禁則229）ので必ず数える。
-- select count(*) as remaining from public.therapist_schedules
--   where schedule_date >= (now() at time zone 'Asia/Tokyo')::date and imported_at is null;
-- 期待値: 0
