-- 駅ちかの即ヒメ設定画面の写し（第213便・2026-09-08）。
-- ★ media_roster_snapshots と同じ形（店舗×媒体×枠に1行・上書き）。★ 読むだけの写し。
-- ★ boxes: [{index, girlId, sokuikuId, expiresAtUnix, untilLabel}]  working: [{castId, name, isSokuhime, raw}]
create table if not exists public.media_sokuhime_snapshots (
  salon_id int not null references public.salons(id) on delete cascade,
  provider text not null,
  slot int not null default 1,
  flow_id text,
  read_at timestamptz not null default now(),
  slot_count int not null default 0,
  boxes jsonb not null default '[]'::jsonb,
  working jsonb not null default '[]'::jsonb,
  counted_plan boolean not null default false,
  remaining_count int,
  primary key (salon_id, provider, slot)
);
alter table public.media_sokuhime_snapshots enable row level security;
-- ★ 読み書きは service_role（server action / relay）だけ。anon/authenticated には GRANT しない（salon_media_credentials と同じ）
revoke all on public.media_sokuhime_snapshots from anon, authenticated;
