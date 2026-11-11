-- 第1931便（2026-11-11・カッキーさん「フクエスも駅ちかやエステ魂みたいに時間設定・タイマー設定を細かく」）
--   ① フクエスの上位表示の【時刻指定】をしまう表（salons には足さない＝店の更新日時 updated_at を周が動かさないため）
--   ② フクエスのタイマー更新の間隔を、10・15・20・30・60分のほかに 10〜240分の好きな分数にできるようにする
--   ★ 今の設定・回数（1日40回・朝6時）は何も変えない

-- ① 時刻指定
create table if not exists public.conecf_fukues_bump_times (
  salon_id      bigint      primary key references public.salons(id) on delete cascade,
  times         integer[]   not null check (cardinality(times) between 1 and 40),  -- 押す時刻（0時からの分）
  times_done_at timestamptz,                                                     -- 押しに行った最後の回
  updated_at    timestamptz not null default now()
);
alter table public.conecf_fukues_bump_times enable row level security;  -- ★ 読み書きはサーバー（service role）だけ

-- ② 間隔の決まりを 10〜240分に
alter table public.salons drop constraint if exists salons_bump_auto_range;
alter table public.salons add constraint salons_bump_auto_range check (
  bump_auto_start_min    between 0 and 1439
  and bump_auto_end_min  between 0 and 1439
  and bump_auto_interval_min between 10 and 240
);

-- 確かめ（読むだけ）
select pg_get_constraintdef(oid) from pg_constraint where conname = 'salons_bump_auto_range';
