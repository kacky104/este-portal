-- フクエスが駅ちかの即ヒメを ON にした記録（第214便・2026-09-08）。
-- ★ 消してよいのは【フクエスが押した枠】だけ（店舗様が駅ちかで直接押した子は触らない）。★ その見分けに使う。
-- ★ removed_at: フクエスが解除した／切れたのを確認した時刻。null なら「こちらが押して、まだ生きているはず」。
create table if not exists public.media_sokuhime_pushes (
  id bigserial primary key,
  salon_id int not null references public.salons(id) on delete cascade,
  provider text not null default 'ekichika',
  slot int not null default 1,
  therapist_id int not null,
  cast_id text not null,
  slot_index int not null,
  sokuiku_id text,
  pushed_at timestamptz not null default now(),
  expires_at timestamptz,
  removed_at timestamptz,
  flow_id text
);
create index if not exists media_sokuhime_pushes_salon_idx on public.media_sokuhime_pushes (salon_id, provider, slot, pushed_at desc);
alter table public.media_sokuhime_pushes enable row level security;
revoke all on public.media_sokuhime_pushes from anon, authenticated;
