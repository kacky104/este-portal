-- お気に入り保存（saved_items）テーブル
-- 店舗・セラピストのお気に入りをユーザー単位で保存する（現状の localStorage 版を将来 DB へ移行するための受け皿）。
-- Supabase ダッシュボードの SQL Editor で実行してください

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('salon','therapist')),
  item_id bigint not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

alter table public.saved_items enable row level security;

create policy "saved_items_select_own" on public.saved_items
  for select using (auth.uid() = user_id);
create policy "saved_items_insert_own" on public.saved_items
  for insert with check (auth.uid() = user_id);
create policy "saved_items_delete_own" on public.saved_items
  for delete using (auth.uid() = user_id);

create index if not exists saved_items_user_idx on public.saved_items (user_id, item_type);
