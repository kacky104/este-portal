-- work_news: サロンの新着情報（フクエスワーク）
-- ※ 2026-07-06 に Supabase SQL Editor で適用済み。記録用マイグレーション。

create table public.work_news (
  id uuid primary key default gen_random_uuid(),
  salon_id int not null references public.salons(id) on delete cascade,
  title text not null,
  content text,
  image_url text,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_news_salon_published_idx
  on public.work_news (salon_id, published_at desc);

create trigger trg_work_news_updated_at
  before update on public.work_news
  for each row execute function public.set_updated_at();

alter table public.work_news enable row level security;

create policy "work_news_public_select" on public.work_news
  for select using (is_published = true);

create policy "work_news_owner_select" on public.work_news
  for select using (exists (
    select 1 from public.salons s
    where s.id = salon_id and s.owner_id = auth.uid()));

create policy "work_news_owner_insert" on public.work_news
  for insert with check (exists (
    select 1 from public.salons s
    where s.id = salon_id and s.owner_id = auth.uid()));

create policy "work_news_owner_update" on public.work_news
  for update using (exists (
    select 1 from public.salons s
    where s.id = salon_id and s.owner_id = auth.uid()));

create policy "work_news_owner_delete" on public.work_news
  for delete using (exists (
    select 1 from public.salons s
    where s.id = salon_id and s.owner_id = auth.uid()));

create policy "work_news_admin_all" on public.work_news
  for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-news-images', 'work-news-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy "work_news_images_storage_select" on storage.objects
  for select using (bucket_id = 'work-news-images');

create policy "work_news_images_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'work-news-images'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.salons s
      where s.owner_id = auth.uid()
        and (s.id)::text = split_part(objects.name, '/', 1)));

create policy "work_news_images_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'work-news-images'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.salons s
      where s.owner_id = auth.uid()
        and (s.id)::text = split_part(objects.name, '/', 1)));
