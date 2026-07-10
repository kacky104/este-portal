-- fukuX: ストーリー機能（画像1枚＋任意キャプション・24時間で自動非表示）
-- 2026-07-10 に Supabase SQL Editor で直接適用済み。本ファイルは記録用（再実行しても安全な冪等形式で記載）。
-- コード側: /x タイムライン上部のストーリーバー（XStoryBar / XStoryViewer / XStoryComposer）。
-- 仕様: 投稿は therapist/shop/official ∧ approved のみ。閲覧はログインユーザー全員。期限切れは RLS で遮断。
-- 期限切れ行の物理削除・storage 画像の削除は今回スコープ外（RLSで見えなくなる。溜まれば pg_cron 等で別途対応）。

create table if not exists public.x_stories (
  id bigint generated always as identity primary key,
  author_profile_id uuid not null references public.x_profiles(id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint x_stories_caption_len check (caption is null or char_length(caption) <= 200)
);

create index if not exists x_stories_author_created_idx on public.x_stories (author_profile_id, created_at desc);
create index if not exists x_stories_expires_idx on public.x_stories (expires_at);

alter table public.x_stories enable row level security;

-- 閲覧: ログインユーザーのみ ∧（未失効 or 自分の投稿）
drop policy if exists x_stories_select on public.x_stories;
create policy x_stories_select on public.x_stories
  for select to authenticated
  using (expires_at > now() or author_profile_id = x_my_profile_id());

-- 投稿: 本人 ∧ 非BAN ∧ therapist/shop/official
drop policy if exists x_stories_insert on public.x_stories;
create policy x_stories_insert on public.x_stories
  for insert to authenticated
  with check (
    author_profile_id = x_my_profile_id()
    and x_me_can_act()
    and x_my_kind() in ('therapist','shop','official')
  );

-- 削除: 本人のみ（運営はサービスロール/SQLで対応）
drop policy if exists x_stories_delete on public.x_stories;
create policy x_stories_delete on public.x_stories
  for delete to authenticated
  using (author_profile_id = x_my_profile_id());
