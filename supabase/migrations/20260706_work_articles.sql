-- work_articles: 求職者向けSEO記事「コラム」（フクエスワーク フェーズ6・段階1）
-- ※ 2026-07-06 に Supabase SQL Editor で適用済み。これは記録用マイグレーション（再適用しても安全なよう
--    IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT で冪等化してある）。

create table if not exists public.work_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null default '',            -- Markdown 本文
  excerpt text not null default '',         -- 一覧カード・meta description 用抜粋（150字目安）
  hero_image_url text,                      -- OGP兼用ヒーロー画像（null許容）
  category text not null default 'work-guide'
    check (category in ('work-guide', 'money', 'interview', 'industry')),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_articles_status_published_idx
  on public.work_articles (status, published_at desc);
create index if not exists work_articles_category_idx
  on public.work_articles (category);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_work_articles_updated_at on public.work_articles;
create trigger trg_work_articles_updated_at
  before update on public.work_articles
  for each row execute function public.set_updated_at();

alter table public.work_articles enable row level security;

-- 公開SELECT: published のみ（段階3の公開ページ用）。
drop policy if exists "work_articles_public_select" on public.work_articles;
create policy "work_articles_public_select" on public.work_articles
  for select using (status = 'published');

-- 運営（admin）: 全操作許可（draft の閲覧・作成・編集・削除）。
drop policy if exists "work_articles_admin_all" on public.work_articles;
create policy "work_articles_admin_all" on public.work_articles
  for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- ── Storage: work-article-images（public バケット） ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-article-images', 'work-article-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- SELECT: 全員（公開画像）。
drop policy if exists "work_article_images_storage_select" on storage.objects;
create policy "work_article_images_storage_select" on storage.objects
  for select using (bucket_id = 'work-article-images');

-- INSERT/UPDATE/DELETE: admin のみ。
drop policy if exists "work_article_images_storage_insert" on storage.objects;
create policy "work_article_images_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'work-article-images'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

drop policy if exists "work_article_images_storage_update" on storage.objects;
create policy "work_article_images_storage_update" on storage.objects
  for update using (
    bucket_id = 'work-article-images'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

drop policy if exists "work_article_images_storage_delete" on storage.objects;
create policy "work_article_images_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'work-article-images'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
