-- 追加SQL_第1339便（2026-10-09）: VPS の見張り。「VPS が最後に来た時刻」を1行で持つ表を足す。
--
-- ★ なぜ要るか: 定期の処理は全部 VPS の crontab から動いている。VPS が止まると、だまって止まる。
--     VPS が5分ごとに「動いています・ディスク%・メモリ残り」を送り（/api/relay/heartbeat）、ここに書く。
--     Vercel の定期実行（10分ごと・/api/cron/vps-watch）がこの行を見て、20分連絡が無ければ運営にメールする。
--     くわしくは src/lib/vpsWatch.ts の頭。
-- ★ 足すもの: 表 public.vps_heartbeat（1行だけ使う。name = 'main'）。今ある表・関数は変えない。
-- ★ 何度流しても同じ結果になる。流す順番: push の前でも後でもよい
--     （表が無いあいだ、見張りは「何も知らせない」、VPS からの連絡は「書けなかった」を返すだけ）。
-- ★ service_role 専用（サイトや外からは見えない）。

create table if not exists public.vps_heartbeat (
  name            text        primary key,
  -- VPS が最後に来た時刻（5分ごとに上書き）
  last_seen_at    timestamptz,
  -- そのときのディスクの使用率（%）とメモリの残り（MB）。読めなかったときは null
  disk_pct        smallint,
  mem_avail_mb    integer,
  -- 「止まっている」を知らせた時刻。連絡が戻ったら null に戻す（戻ったメールを1回出す）
  down_alerted_at timestamptz,
  -- 「ディスクが80%以上」を知らせた時刻。下回ったら null に戻す
  disk_alerted_at timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.vps_heartbeat is
  'VPS（取り込み・中継）が最後に来た時刻と、そのときのディスク・メモリ。1行だけ（name=main）。service_role専用（第1339便）。';

alter table public.vps_heartbeat enable row level security;
revoke all on public.vps_heartbeat from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認（1行。rls が true・anon_can と authed_can が false なら OK）
select c.relname as tbl,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_can,
       has_table_privilege('authenticated', c.oid, 'select') as authed_can
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname = 'vps_heartbeat';
