-- 第1840便（2026-11-09・カッキーさん）駅ちかの動画投稿をコネックエフから（設計メモ_2026-11-09_駅ちか動画投稿.md）
-- ★ 3つ作る: バケット conecf-videos・表 conecf_videos（店の動画置き場）・表 conecf_ekichika_movies（枠ごとの設定）
-- ★ どれも service_role のサーバーだけが読み書き（RLS は閉じる・バケットは非公開）

-- 1. バケット（非公開・1本 256MB まで・mp4 / mov）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conecf-videos', 'conecf-videos', false, 268435456, array['video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2. 店の動画置き場（ベンリーの「動画登録 / 管理」にあたる）
create table if not exists public.conecf_videos (
  id           bigint      generated always as identity primary key,
  salon_id     bigint      not null references public.salons(id) on delete cascade,
  name         text        not null default '',          -- 表示名（例: りな動画）
  path         text        not null unique,              -- conecf-videos の中の置き場 <店>/<時刻>_<英数字>.mp4
  bytes        bigint,
  content_type text        not null default 'video/mp4',
  created_at   timestamptz not null default now()
);
create index if not exists conecf_videos_salon_idx on public.conecf_videos (salon_id);
alter table public.conecf_videos enable row level security;
revoke all on public.conecf_videos from anon, authenticated;

-- 3. 駅ちかの動画投稿の設定（店 × 駅ちかの枠 = 1行）
--   schedule = [{"min":720, "girlName":"りな", "videoId":3, "title":"りな", "body":"ご予約お待ちしてます", "deleteSame":true}, …]
--     min … 朝6時はじまりの分（12:00 = 720・翌1:00 = 1500）。★ 駅ちかは1日5件まで（画面で5行まで）
create table if not exists public.conecf_ekichika_movies (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  slot          smallint    not null default 1 check (slot between 1 and 5),
  admin_enabled boolean     not null default false,        -- 運営が /admin で ON にした店だけ
  auto          boolean     not null default false,
  schedule      jsonb       not null default '[]'::jsonb,
  last_due_at   timestamptz,                               -- 最後に受け持った予定時刻（二重に送らない）
  last_at       timestamptz,
  last_outcome  text,
  updated_at    timestamptz not null default now(),
  primary key (salon_id, slot)
);
alter table public.conecf_ekichika_movies enable row level security;
revoke all on public.conecf_ekichika_movies from anon, authenticated;

-- ★ オイルクエスト様（salon_id=5・駅ちか枠1）を ON に（自動は OFF・中身は画面で入れる）
insert into public.conecf_ekichika_movies (salon_id, slot, admin_enabled) values (5, 1, true)
on conflict (salon_id, slot) do nothing;

-- 確認:
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'conecf-videos';
-- select * from public.conecf_ekichika_movies;
