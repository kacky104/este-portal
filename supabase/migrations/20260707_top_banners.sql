-- top_banners: 本体トップページのサロン一覧中（15枚目直下）に挿入する画像バナースライダー（admin管理）。
-- ※ Supabase SQL Editor で適用済み。これは記録用マイグレーション（再適用しても安全なよう
--    IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT で冪等化）。適用済みSQLと同一内容。

create table if not exists public.top_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,                    -- top-banners バケットの公開URL（NOT NULL）
  link_url text,                              -- クリック遷移先（任意・内部パス or 外部URL）
  alt_text text,                              -- 画像 alt（任意）
  display_order int not null default 0,       -- 表示順（昇順）
  is_active boolean not null default true,    -- 公開フラグ（false は公開スライダー非表示）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists top_banners_active_order_idx
  on public.top_banners (is_active, display_order);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_top_banners_updated_at on public.top_banners;
create trigger trg_top_banners_updated_at
  before update on public.top_banners
  for each row execute function public.set_updated_at();

alter table public.top_banners enable row level security;

-- 公開SELECT: is_active=true のみ（トップのスライダー用・anon 読取）。
drop policy if exists "top_banners_public_select" on public.top_banners;
create policy "top_banners_public_select" on public.top_banners
  for select using (is_active = true);

-- 運営（admin）: 全操作許可（非公開の閲覧・作成・編集・削除）。複数ポリシーはORされるため admin は全件見える。
drop policy if exists "top_banners_admin_all" on public.top_banners;
create policy "top_banners_admin_all" on public.top_banners
  for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- ── Storage: top-banners（public バケット・top-banners 専用。既存バケットは使わない） ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('top-banners', 'top-banners', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- SELECT: 全員（公開画像）。
drop policy if exists "top_banners_images_storage_select" on storage.objects;
create policy "top_banners_images_storage_select" on storage.objects
  for select using (bucket_id = 'top-banners');

-- INSERT/UPDATE/DELETE: admin のみ。
drop policy if exists "top_banners_images_storage_insert" on storage.objects;
create policy "top_banners_images_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'top-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

drop policy if exists "top_banners_images_storage_update" on storage.objects;
create policy "top_banners_images_storage_update" on storage.objects
  for update using (
    bucket_id = 'top-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

drop policy if exists "top_banners_images_storage_delete" on storage.objects;
create policy "top_banners_images_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'top-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
