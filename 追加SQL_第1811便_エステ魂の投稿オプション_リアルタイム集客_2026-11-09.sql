-- 第1811便（2026-11-09）エステ魂の投稿オプション（リアルタイム集客など）。お店ごと・種類ごとに1行
-- ★ salons.id は bigint（第1799便の conecf_esutama_options と同じ）
create table if not exists public.conecf_esutama_posts (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  post_key      text        not null,              -- 'guest_realtime'（あとで 'job_realtime' など）
  admin_enabled boolean     not null default false, -- こちらで有効にしたお店だけ
  auto          boolean     not null default false,
  title         text        not null default '',   -- 30文字まで
  body          text        not null default '',   -- 300文字まで
  images        text[]      not null default '{}', -- 画像の置き場所（順番に使う）
  next_image    int         not null default 0,    -- 次に使う画像の番号
  start_min     int         not null default 360,  -- 何時から（分）
  end_min       int         not null default 1740, -- 何時まで（翌5時＝29時）
  interval_min  int         not null default 60,   -- 何分おき
  last_at       timestamptz,
  last_outcome  text,
  updated_at    timestamptz not null default now(),
  primary key (salon_id, post_key)
);
alter table public.conecf_esutama_posts enable row level security; -- ポリシー無し（サーバーだけが読み書き）

-- 確認: select * from public.conecf_esutama_posts;

-- ★ 追記（同じ第1811便）: 「始めた時刻」の列。周が同じ行を立て続けに始めない（二重に投稿しない）ために使う
alter table public.conecf_esutama_posts add column if not exists read_at timestamptz;
