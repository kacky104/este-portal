-- fukuX 下書き（未送信の投稿）機能（2026-07-24）
-- 本家X型の下書き：本文/画像/リンク/リプライ不可設定を保存し、後で開いて投稿・編集・削除できる。
-- 通常投稿とリプライの両方で使う（parent_post_id 有り=リプライ下書き）。
-- 本人のみ CRUD 可（既存ヘルパー x_my_profile_id()＝auth.uid()→x_profiles.id を流用）。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。

create table if not exists public.x_drafts (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  body text,
  images text[] not null default '{}',
  link_url text,
  replies_disabled boolean not null default false,
  -- リプライ下書きの返信先（null=通常投稿の下書き）。x_posts.id は bigint。返信先が消えたら下書きも消す。
  parent_post_id bigint references public.x_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.x_drafts is
  'fukuX 下書き（未送信の投稿）。本人のみ閲覧・編集可。parent_post_id 有り=リプライ下書き';

-- 本人の下書き一覧（更新の新しい順）取得用インデックス。
create index if not exists x_drafts_author_updated_idx
  on public.x_drafts (author_profile_id, updated_at desc);

alter table public.x_drafts enable row level security;

-- 閲覧：本人の下書きのみ。
drop policy if exists x_drafts_select_own on public.x_drafts;
create policy x_drafts_select_own on public.x_drafts
  for select to authenticated
  using (author_profile_id = x_my_profile_id());

-- 追加：本人の author_profile_id でのみ作成可。
drop policy if exists x_drafts_insert_own on public.x_drafts;
create policy x_drafts_insert_own on public.x_drafts
  for insert to authenticated
  with check (author_profile_id = x_my_profile_id());

-- 更新：本人の下書きのみ。
drop policy if exists x_drafts_update_own on public.x_drafts;
create policy x_drafts_update_own on public.x_drafts
  for update to authenticated
  using (author_profile_id = x_my_profile_id())
  with check (author_profile_id = x_my_profile_id());

-- 削除：本人の下書きのみ。
drop policy if exists x_drafts_delete_own on public.x_drafts;
create policy x_drafts_delete_own on public.x_drafts
  for delete to authenticated
  using (author_profile_id = x_my_profile_id());

-- updated_at 自動更新トリガ（下書きを上書き保存したら「更新の新しい順」を正しく保つ）。
create or replace function public.x_drafts_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_x_drafts_touch_updated on public.x_drafts;
create trigger trg_x_drafts_touch_updated
  before update on public.x_drafts
  for each row execute function public.x_drafts_touch_updated();
