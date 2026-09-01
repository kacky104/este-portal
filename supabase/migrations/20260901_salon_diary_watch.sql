-- 写メ日記の巡回の見張り（第100便・引き継ぎメモ 第99便 §9①）
--
-- ★★★ なぜ要るか —— 2026-09-01 深夜に実際に困ったこと
--   「最後の取り込みが19:03。いま22:51」を見て、
--     ・新着が無かっただけ
--     ・巡回そのものが止まっている
--   の【どちらなのか言えなかった】。★ 記録が残るのは取り込めた周だけだったため。
--     新着があった周   → salon_diary_imports に行が増える
--     新着が無かった周 → ★★ どこにも何も残らない
--
-- ★★★ なぜ salon_media_credentials.last_verified_at を使わないか
--   あれは【どの用事でも】成功すれば新しくなる。★ 出勤の巡回が動いているだけで新しいまま。
--   ★ 1本の時計で2つの周を見張った 2026-08-29 の事故と同じ形になる（importStall 冒頭）。
--
-- ★★★ なぜ2列に分けるか（1本にまとめないこと）
--   queued_at … 巡回の口がジョブを積んだ時刻       ★ 止まる = crontab か Vercel の口
--   listed_at … 駅ちかの一覧を読み終えた時刻       ★ 止まる = relay.sh か ログイン
--   ★ 1列にすると、どちらが止まったのか言えなくなる＝見に行く場所が決まらない。
--   ★ salon_diary_imports.checked_at と同じ考え方（意味の違うものを1つの列に入れない）。
--
-- ★★ 行は増えない（店舗×媒体×枠で1行を上書き）。★ 履歴は監査ログの担当。
-- ★ 当ててあっても空でも安全に通る（冪等）。

create table if not exists public.salon_diary_watch (
  salon_id   bigint      not null references public.salons(id) on delete cascade,
  provider   text        not null default 'ekichika',
  slot       smallint    not null default 1,

  -- ★ 巡回の口（/api/admin/diary-import）がジョブを積めた時刻
  queued_at  timestamptz,
  -- ★★ 駅ちかの一覧を読み終えた時刻。★ 取り込めたかどうかとは【別】。
  --   ★ 新着が無くてもここは新しくなる。★ それがこの表の存在理由。
  listed_at  timestamptz,
  -- ★ 最後に一覧を読んだときの一言（何ページ目・何件）。★ 秘密や駅ちかのURLを入れないこと
  last_note  text,

  updated_at timestamptz not null default now(),
  primary key (salon_id, provider, slot)
);

-- ★ salon_media_credentials / salon_diary_imports と同じ扱い。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ。
alter table public.salon_diary_watch enable row level security;
revoke all on public.salon_diary_watch from anon, authenticated;

comment on table public.salon_diary_watch is
  '写メ日記の巡回の心拍（店舗×媒体×枠で1行・上書き）。★ 取り込めた記録（salon_diary_imports）とは別。新着が無かった周も listed_at が新しくなるので、「新着が無かった」と「止まっている」を見分けられる。service_role専用（第100便）。';

comment on column public.salon_diary_watch.queued_at is
  E'巡回の口がジョブを積めた時刻。★ ここが古い = crontab か Vercel の口が動いていない。★ listed_at と1本にまとめないこと。';

comment on column public.salon_diary_watch.listed_at is
  E'駅ちかの一覧を読み終えた時刻。★ 新着が無くても新しくなる（それがこの列の存在理由）。★ ここだけ古い = relay.sh かログインの側。';

-- ────────────────────────────────────────────────────────────
-- 確認用（適用後に別途 SQL Editor で流す）
-- ────────────────────────────────────────────────────────────
-- ① 表ができていること。1行返れば成功
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name='salon_diary_watch';
--
-- ② 巡回が回りだしたか（★ 1周（最大15分）待ってから見る）
-- select salon_id, slot, queued_at, listed_at, last_note from public.salon_diary_watch order by salon_id, slot;
--   ★ 期待: salon_id 6 が1行・queued_at と listed_at がどちらも直近15分以内
