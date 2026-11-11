-- 第1247便（2026-10-06・カッキーさんの決定）: 自動の周で、店舗ごとに相手サイトへ行く時刻を 0〜3分ずらす。
--   中継ジョブに「この時刻まで引き取らない」（not_before）を足す。null＝今までどおりすぐ。
--   ★ 中継（/api/relay/lease）は not_before を過ぎたジョブだけ引き取る。★ 新しい表は無い。
--   ★ 順番: push の前でも後でもよい（列が無いあいだは、ずらしを付けずに今までどおり積む）。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等。

alter table public.media_relay_jobs add column if not exists not_before timestamptz;
comment on column public.media_relay_jobs.not_before is
  E'第1247便: この時刻まで中継は引き取らない（店舗ごとの時刻のずらし・lib/relayStagger.ts）。null＝すぐ。';

notify pgrst, 'reload schema';

-- ★ 確認（1行出ればOK）
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'media_relay_jobs' and column_name = 'not_before';
