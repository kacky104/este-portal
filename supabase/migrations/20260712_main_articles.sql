-- main_articles: フクエス本体（利用者向け）SEO記事「コラム」（/column 配下）
-- Supabase ダッシュボードの SQL Editor で実行してください
-- work_articles（20260706_work_articles.sql）と同じ構成・同じRLS方針の本体版。
-- カテゴリのみ利用者向け4種（howto=選び方ガイド / beginner=初めての方へ / manner=楽しみ方・マナー / glossary=用語解説）。

create table if not exists public.main_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null default '',            -- Markdown 本文
  excerpt text not null default '',         -- 一覧カード・meta description 用抜粋（150字目安）
  hero_image_url text,                      -- OGP兼用ヒーロー画像（null許容）
  category text not null default 'howto'
    check (category in ('howto', 'beginner', 'manner', 'glossary')),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists main_articles_status_published_idx
  on public.main_articles (status, published_at desc);
create index if not exists main_articles_category_idx
  on public.main_articles (category);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_main_articles_updated_at on public.main_articles;
create trigger trg_main_articles_updated_at
  before update on public.main_articles
  for each row execute function public.set_updated_at();

alter table public.main_articles enable row level security;

-- 公開SELECT: published のみ（公開ページ用）。
drop policy if exists "main_articles_public_select" on public.main_articles;
create policy "main_articles_public_select" on public.main_articles
  for select using (status = 'published');

-- 運営（admin）: 全操作許可（draft の閲覧・作成・編集・削除）。
drop policy if exists "main_articles_admin_all" on public.main_articles;
create policy "main_articles_admin_all" on public.main_articles
  for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

-- ── Storage: main-article-images（public バケット） ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('main-article-images', 'main-article-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- SELECT: 全員（公開画像）。
drop policy if exists "main_article_images_storage_select" on storage.objects;
create policy "main_article_images_storage_select" on storage.objects
  for select using (bucket_id = 'main-article-images');

-- INSERT/UPDATE/DELETE: admin のみ。
drop policy if exists "main_article_images_storage_insert" on storage.objects;
create policy "main_article_images_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'main-article-images'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

drop policy if exists "main_article_images_storage_update" on storage.objects;
create policy "main_article_images_storage_update" on storage.objects
  for update using (
    bucket_id = 'main-article-images'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

drop policy if exists "main_article_images_storage_delete" on storage.objects;
create policy "main_article_images_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'main-article-images'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');
