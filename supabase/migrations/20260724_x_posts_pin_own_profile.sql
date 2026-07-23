-- ピン止めの仕様変更（2026-07-24）: 「タイムライン最上部に固定」→ 本家X同様の
-- 「自分の投稿を自分のプロフィール先頭に固定」へ変更。
-- pinned_at の意味: 本人がプロフィールに固定した日時（null=非固定）。1人1件運用（アプリ側で既存固定を解除）。
-- 更新者: 投稿者本人（RLSの自投稿UPDATEポリシー経由・クライアントから直接更新）。
--
-- 20260723_x_posts_pinned.sql で作成した保護トリガ（service_role 以外の pinned_at 変更を無効化）は
-- 本人による固定操作を妨げるため撤去する。列と部分インデックスはそのまま流用。

drop trigger if exists trg_x_posts_protect_pinned on public.x_posts;
drop function if exists public.x_posts_protect_pinned();

comment on column public.x_posts.pinned_at is
  'プロフィール固定日時（null=非固定）。本人が自分のプロフィール先頭に固定（本家Xのピン留め相当・1人1件運用）';
