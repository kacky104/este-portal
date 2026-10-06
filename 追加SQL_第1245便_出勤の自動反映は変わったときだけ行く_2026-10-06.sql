-- 第1245便（2026-10-06・カッキーさんの決定＝案B）: 出勤の自動反映は、フクエス側の出勤が変わったときだけ相手サイトへ行く。
--   そのために「前回同期できたときのフクエス側の材料の指紋と時刻」を枠（店舗×媒体×枠）ごとに覚える列を2つ足す。
--   ★ 新しい表は無い。既存の行は null（＝最初の周は今までどおり行き、同期できたら入る）。
--   ★ 順番: この SQL は push の前でも後でもよい（列が無いあいだはコードが「今までどおり毎周行く」に倒れる）。
--     ただし列を足すまでは減らない。★ Supabase ダッシュボードの SQL Editor で実行してください。冪等。

alter table public.salon_import_sources
  add column if not exists auto_synced_hash text,
  add column if not exists auto_synced_at   timestamptz;

comment on column public.salon_import_sources.auto_synced_hash is
  E'出勤の自動反映（第1245便）: 前回「相手サイトと同期できた」と記録したときの、フクエス側の材料の指紋（lib/workInputHash.ts）。同じ指紋で24時間以内なら周は相手サイトへ行かない。';
comment on column public.salon_import_sources.auto_synced_at is
  E'出勤の自動反映（第1245便）: auto_synced_hash を記録した時刻。24時間を過ぎたら指紋が同じでも行く（相手側で手で直されたぶんを拾う）。';

notify pgrst, 'reload schema';

-- ★ 確認（2行出ればOK）
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'salon_import_sources'
   and column_name in ('auto_synced_hash', 'auto_synced_at');
