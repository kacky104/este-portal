-- girlslist方式（第36便・フェーズ4）の切り替えフラグを足す。
--
-- list_mode = true の店は、毎時の取り込みで個人ページを1件も取らない。
-- 女の子一覧(girlslist)を1〜2ページ取るだけで当日の出勤を反映する（/api/import/ingest-list）。
-- 週間予定は一覧に載っていないので、1日1回の full 周（/api/import/ingest・個人ページ）で維持する。
--
-- 背景（第36便で実測）: VPSは毎周 girlslist を取っているのに、castId を抜いたあとHTMLを捨てて
-- いた。その捨てていたHTMLに本日の出勤時刻・名前・年齢・サイズが全部載っていた。
--   1周 343リクエスト・約12分  →  13リクエスト・約20秒
--
-- ★★★ このマイグレーションは列を足すだけで、どの店も ON にしない（禁則254の実践）。
--   「どの店を ON にするか」は運用の判断で変わるので、SQLで明示的に切り替える。
--   マイグレーションに書いてしまうと、再実行したときに運用側の判断を巻き戻してしまう。
--   切り替えは returning 付きの UPDATE で行うこと（第36便の朝、変更したつもりで
--   入っていなかった事故が2回起きたため）:
--
--     update public.salon_import_sources
--        set list_mode = true, updated_at = now()
--      where provider = 'ekichika' and salon_id in (6)
--     returning salon_id, list_mode;
--
alter table public.salon_import_sources
  add column if not exists list_mode boolean not null default false;

comment on column public.salon_import_sources.list_mode is
  'true=毎時はgirlslist(一覧)だけを取り /api/import/ingest-list で当日の出勤を反映する（第36便）。週間予定は1日1回のfull周で維持する。';
