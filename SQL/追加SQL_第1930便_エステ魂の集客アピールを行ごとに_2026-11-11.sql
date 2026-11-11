-- 第1930便（2026-11-11・カッキーさん）: エステ魂の集客ワンクリックアピールを、店舗情報・クーポン情報・お店体験談の【行ごと】に
--   タイマー更新（時間帯＋間隔）／時刻指定更新を設定できるようにする。★ 行ごとに1日10回（エステ魂の画面で行ごとに残り回数がある）
--   ★ この表に行がある店は、今までの「3行まとめて」（salon_import_sources の provider='esutama'）では押さなくなる
--   ★ 下の ② で、今「3行まとめて」の自動が入っている店（オイルクエスト様など）の設定を、3行それぞれに写す＝止まらない
--   ★ push の前に実行してください（push の前でも後でも壊れない作り。前に流すと、push した瞬間から行ごとに切り替わる）

-- ① 表
create table if not exists public.conecf_esutama_appeal_rows (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  row_key       text        not null check (row_key in ('shop,guest_appeal', 'shop_coupon,guest_appeal', 'shop_exp,guest_appeal')),
  auto          boolean     not null default false,                       -- 自動で押す
  start_min     integer     not null default 600  check (start_min between 0 and 1439),   -- タイマー更新の時間帯のはじめ（0時からの分）
  end_min       integer     not null default 240  check (end_min   between 0 and 1439),   -- 時間帯のおわり
  interval_min  integer     not null default 120  check (interval_min between 10 and 240),-- 間隔（分）
  times         integer[]   check (times is null or cardinality(times) between 1 and 40), -- 時刻指定（0時からの分）。null＝タイマー更新
  times_done_at timestamptz,                                              -- 時刻指定で、押しに行った最後の回
  auto_at       timestamptz,                                              -- 周が最後に流れを始めた時刻
  last_at       timestamptz,                                              -- エステ魂の画面の「最終アピール」
  remaining     integer,                                                  -- エステ魂の画面の残り回数
  read_at       timestamptz,                                              -- 最後に読んだ時刻
  updated_at    timestamptz not null default now(),
  primary key (salon_id, row_key)
);
-- ★ 読み書きはサーバー（service role）だけ。店舗様のログインからは直接触らない
alter table public.conecf_esutama_appeal_rows enable row level security;

-- ② 今の「3行まとめて」の自動の設定を、3行それぞれに写す（今の残り回数・最終アピールも店舗情報の値で入れておく）
insert into public.conecf_esutama_appeal_rows (salon_id, row_key, auto, start_min, end_min, interval_min, last_at, remaining, read_at)
select s.salon_id, k.row_key, s.bump_auto, s.bump_start_min, s.bump_end_min,
       least(greatest(s.bump_interval_min, 10), 240), s.bump_last_at, s.bump_remaining, s.bump_read_at
from public.salon_import_sources s
cross join (values ('shop,guest_appeal'), ('shop_coupon,guest_appeal'), ('shop_exp,guest_appeal')) as k(row_key)
where s.provider = 'esutama' and s.slot = 1 and s.bump_auto = true
on conflict (salon_id, row_key) do nothing;

-- 確かめ（読むだけ）
select salon_id, row_key, auto, start_min, end_min, interval_min, remaining from public.conecf_esutama_appeal_rows order by salon_id, row_key;
