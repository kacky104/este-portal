-- fukuX モデレーション3点セット（投稿カードの「…」ドロワーから使用）:
--   x_mutes   … ミュート（自分のタイムラインから相手の投稿を非表示。相手には通知されない）
--   x_blocks  … ブロック（シンプル版＝ミュートと同じ非表示効果＋相互フォローを自動解除）
--   x_reports … 通報（/x/admin「通報」タブで一覧・対応管理。送信時に運営宛メールも飛ぶ）
-- 既存ヘルパー x_my_profile_id()（auth.uid()→x_profiles.id）を流用。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。

-- ── 1. x_mutes ───────────────────────────────────────────────
create table if not exists public.x_mutes (
  id uuid primary key default gen_random_uuid(),
  muter_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  muted_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (muter_profile_id, muted_profile_id)
);
create index if not exists idx_x_mutes_muter on public.x_mutes (muter_profile_id);

alter table public.x_mutes enable row level security;

drop policy if exists x_mutes_select_own on public.x_mutes;
create policy x_mutes_select_own on public.x_mutes
  for select to authenticated
  using (muter_profile_id = x_my_profile_id());

drop policy if exists x_mutes_insert_own on public.x_mutes;
create policy x_mutes_insert_own on public.x_mutes
  for insert to authenticated
  with check (muter_profile_id = x_my_profile_id() and muted_profile_id <> x_my_profile_id());

drop policy if exists x_mutes_delete_own on public.x_mutes;
create policy x_mutes_delete_own on public.x_mutes
  for delete to authenticated
  using (muter_profile_id = x_my_profile_id());

-- ── 2. x_blocks ──────────────────────────────────────────────
create table if not exists public.x_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_profile_id, blocked_profile_id)
);
create index if not exists idx_x_blocks_blocker on public.x_blocks (blocker_profile_id);

alter table public.x_blocks enable row level security;

drop policy if exists x_blocks_select_own on public.x_blocks;
create policy x_blocks_select_own on public.x_blocks
  for select to authenticated
  using (blocker_profile_id = x_my_profile_id());

drop policy if exists x_blocks_insert_own on public.x_blocks;
create policy x_blocks_insert_own on public.x_blocks
  for insert to authenticated
  with check (blocker_profile_id = x_my_profile_id() and blocked_profile_id <> x_my_profile_id());

drop policy if exists x_blocks_delete_own on public.x_blocks;
create policy x_blocks_delete_own on public.x_blocks
  for delete to authenticated
  using (blocker_profile_id = x_my_profile_id());

-- ── 3. x_reports ─────────────────────────────────────────────
-- post_id は投稿が削除されても通報記録を残すため on delete set null。
-- ※ x_posts.id は bigint（uuid ではない）。型を合わせる（2026-07-17 修正）。
create table if not exists public.x_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  target_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  post_id bigint references public.x_posts(id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists idx_x_reports_created on public.x_reports (created_at desc);

alter table public.x_reports enable row level security;

-- 送信: 本人（reporter）。閲覧・更新・削除: 運営のみ（同一コマンドの複数ポリシーはORのため共存可）。
drop policy if exists x_reports_insert_own on public.x_reports;
create policy x_reports_insert_own on public.x_reports
  for insert to authenticated
  with check (reporter_profile_id = x_my_profile_id());

drop policy if exists x_reports_admin_all on public.x_reports;
create policy x_reports_admin_all on public.x_reports
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
