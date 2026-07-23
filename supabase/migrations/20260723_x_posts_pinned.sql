-- fukuX タイムライン固定（ピン止め）機能（2026-07-23）
-- 運営が選んだ投稿を /x おすすめタブの最上部に固定表示する。
-- pinned_at: 固定日時（null=非固定）。更新は管理サーバーアクション（service_role）経由のみ。
--            表示側は pinned_at desc で最大3件を使用（xPosts.ts の PINNED_LIMIT）。

alter table public.x_posts
  add column if not exists pinned_at timestamptz default null;

comment on column public.x_posts.pinned_at is
  '運営によるタイムライン固定日時（null=非固定）。service_role のみ更新可（トリガで保護）。表示は pinned_at desc 最大3件';

-- 固定投稿の取得（pinned_at is not null）用の部分インデックス。
create index if not exists x_posts_pinned_at_idx
  on public.x_posts (pinned_at desc)
  where pinned_at is not null;

-- 保護トリガ: 投稿者本人の UPDATE（RLSで許可されている自投稿編集）で pinned_at を
-- 書き換えられないようにする。service_role（管理アクション）以外からの変更はサイレントに元へ戻す。
-- ※ Supabase の RLS は列単位の制限ができないため、トリガで列を守る方式。
create or replace function public.x_posts_protect_pinned()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.pinned_at is distinct from old.pinned_at and auth.role() <> 'service_role' then
    new.pinned_at := old.pinned_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_x_posts_protect_pinned on public.x_posts;
create trigger trg_x_posts_protect_pinned
  before update on public.x_posts
  for each row execute function public.x_posts_protect_pinned();
