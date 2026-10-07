-- 第1296便（2026-10-08・カッキーさんの決定）: 人が押した操作（削除・プロフィール更新・新規登録）を、
--   前の更新が動いているときに断らず「順番待ち」で受け付ける。
--   中継ジョブの status に 'waiting'（順番待ち）を足す。★ 新しい表・列は無い。
--
--   ★ 走っているジョブを1件に限る索引（media_relay_jobs_one_active）は ('queued','leased') のまま＝順番待ちは数えない。
--   ★ VPS の relay.sh は status を見ない（/api/relay/lease と /api/relay/result を叩くだけ）＝配り直しは不要。
--   ★ 順番: push の前でも後でもよい。
--       ・SQL が先 … 許す値が1つ増えるだけ。古いコードは 'waiting' を書かない。
--       ・push が先 … 順番待ちで入れようとして断られたら、今までどおり「少し待ってから…」を返す。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等（何度流しても同じ）。

-- ── 1. status に 'waiting' を足す（外すのと付けるのを1文で＝あいだに制約の無い瞬間を作らない）──
alter table public.media_relay_jobs
  drop constraint if exists media_relay_jobs_status_check,
  add constraint media_relay_jobs_status_check
    check (status in ('queued', 'leased', 'done', 'failed', 'expired', 'waiting'));

-- ── 2. 順番待ちを古い順に引くための索引（順番待ちの行だけ＝ふだんは空）──
create index if not exists media_relay_jobs_waiting
  on public.media_relay_jobs (created_at)
  where status = 'waiting';

comment on column public.media_relay_jobs.status is
  E'queued（積んだ）/ leased（中継が掴んだ）/ done / failed / expired / waiting（第1296便: 順番待ち。同じ店・サイト・枠の前の更新が終わったら queued に繰り上がる。15分で expired）';

notify pgrst, 'reload schema';

-- ★ 確認（1行。'waiting' が入っていれば OK）
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.media_relay_jobs'::regclass and contype = 'c';

-- ★ 見張り（順番待ちの様子。ふだんは 0 行）
-- select salon_id, provider, slot, purpose, created_at at time zone 'Asia/Tokyo' as jst
--   from public.media_relay_jobs where status = 'waiting' order by created_at;
