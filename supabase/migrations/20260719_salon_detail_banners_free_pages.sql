-- 店舗詳細ページのバナー枠（最大3・出勤セラピストブロックの下に縦表示）＋ フリーページ（最大3）。
-- 画像は既存の salon-images バケットを流用。Supabase SQL Editor で実行してください（コード push より先に適用）。

-- 1) 詳細バナー用カラム（salons）。ポップアップ画像と同方式（列で保持）。
alter table public.salons
  add column if not exists detail_banner_enabled    boolean not null default false,
  add column if not exists detail_banner_image_url  text,
  add column if not exists detail_banner_link       text,
  add column if not exists detail_banner_image_url2 text,
  add column if not exists detail_banner_link2      text,
  add column if not exists detail_banner_image_url3 text,
  add column if not exists detail_banner_link3      text;

-- 2) フリーページ（1店舗 最大3・上限はアプリ側で制御）。タイトル＋本文＋画像URL配列。
create table if not exists public.salon_free_pages (
  id            bigint generated always as identity primary key,
  salon_id      bigint not null references public.salons(id) on delete cascade,
  title         text not null default '',
  body          text not null default '',
  images        jsonb not null default '[]'::jsonb,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists salon_free_pages_salon_idx on public.salon_free_pages (salon_id, display_order, id);

alter table public.salon_free_pages enable row level security;

-- 公開: 誰でも閲覧可
drop policy if exists salon_free_pages_select on public.salon_free_pages;
create policy salon_free_pages_select on public.salon_free_pages for select using (true);

-- オーナー（自店）＋管理者: 追加/更新/削除
drop policy if exists salon_free_pages_insert on public.salon_free_pages;
create policy salon_free_pages_insert on public.salon_free_pages for insert
  with check (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  );

drop policy if exists salon_free_pages_update on public.salon_free_pages;
create policy salon_free_pages_update on public.salon_free_pages for update
  using (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  )
  with check (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  );

drop policy if exists salon_free_pages_delete on public.salon_free_pages;
create policy salon_free_pages_delete on public.salon_free_pages for delete
  using (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid
    or exists (select 1 from public.salons s where s.id = salon_id and s.owner_id = auth.uid())
  );
