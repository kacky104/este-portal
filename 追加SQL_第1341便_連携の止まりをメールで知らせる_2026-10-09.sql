-- 追加SQL_第1341便（2026-10-09）: 連携の止まりを、運営にメールで知らせる。「いま止まっているもの・知らせたか」を覚える表を足す。
--
-- ★ なぜ要るか: 止まりの見張りは前からあるが、出る場所が店ごとの画面で、運営へは知らせていなかった。
--     Vercel の定期実行（30分ごと・/api/cron/stall-watch）が全店ぶんを調べ、新しく止まったものをメールする。
--     同じものを30分ごとに何度も送らないために、「知らせたか」を覚える。くわしくは src/lib/stallDigest.ts。
-- ★ 足すもの: 表 public.ops_stall_alerts。今ある表・関数は変えない。
--     行は「いま止まっているもの」だけ（直ったら消える）。ほかに、毎朝のまとめを出した時刻を置く1行（key = 'meta:digest'）。
--     店の名前・電話番号・パスワードなどは入れない（店の番号・サイトの名前・理由の名前・時刻だけ）。
-- ★ 何度流しても同じ結果になる。流す順番: push の前でも後でもよい（表が無いあいだは、何も知らせない）。
-- ★ service_role 専用（サイトや外からは見えない）。

create table if not exists public.ops_stall_alerts (
  -- 同じ止まりを、次の回にも同じものと分かるための名前（見張り:店:サイト:枠:理由）
  key           text        primary key,
  -- import（出勤の取り込み）／write（出勤の書き込み）／diary（写メ日記の巡回）／problem（うまくいっていないこと）／meta（毎朝のまとめの印）
  watch         text        not null,
  salon_id      bigint,
  provider      text,
  slot          smallint,
  reason        text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- 何回続けて見えたか（「うまくいっていないこと」は2回続いたら知らせる）
  seen_count    integer     not null default 1,
  -- 知らせた時刻。まだなら null
  alerted_at    timestamptz
);

comment on table public.ops_stall_alerts is
  '連携の止まりを運営にメールで知らせるための覚え（いま止まっているものと、知らせた時刻）。直ったら行は消える。service_role専用（第1341便）。';

alter table public.ops_stall_alerts enable row level security;
revoke all on public.ops_stall_alerts from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認（1行。rls が true・anon_can と authed_can が false なら OK）
select c.relname as tbl,
       c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'select') as anon_can,
       has_table_privilege('authenticated', c.oid, 'select') as authed_can
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname = 'ops_stall_alerts';
