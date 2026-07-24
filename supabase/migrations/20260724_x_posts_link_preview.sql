-- fukuX リンクプレビュー（OGPカード）機能（2026-07-24）
-- 投稿の link_url（fukues.com のみ対象）のOGPを取得し、サムネイル付きカードで表示するためのキャッシュ列。
-- 取得・書き込みはサーバーアクション（本人のセッションで own 投稿のみ update）。fukues.com 以外は null のまま＝従来のテキストリンク表示。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。

alter table public.x_posts
  add column if not exists link_image text default null,
  add column if not exists link_title text default null,
  add column if not exists link_description text default null;

comment on column public.x_posts.link_image is
  'リンクプレビューのサムネイル画像URL（og:image・fukues.com のみ取得。null=カード無し＝テキストリンク表示）';
comment on column public.x_posts.link_title is 'リンクプレビューのタイトル（og:title）';
comment on column public.x_posts.link_description is 'リンクプレビューの説明（og:description）';
