-- fukuX: ストーリーバーを未ログインにも表示するための「投稿者情報のみ」返す RPC。
-- 2026-07-10 に Supabase SQL Editor で直接適用済み。本ファイルは記録用（再実行しても安全な冪等形式で記載）。
-- コード側: xStories.ts の fetchStoryAuthorsPublic（createPublicClient=anon から呼ぶ）／XStoryBar。
-- 目的: x_stories 本体の RLS はログイン必須のまま維持し、匿名にはサークル表示に必要な最小情報だけを渡す。
--       ストーリー画像・キャプション等の本体は一切返さない（タップするとログイン誘導モーダル）。

-- security definer で x_stories/x_profiles を横断集計し、未失効ストーリーの投稿者を最新順に返す。
-- status=rejected（凍結）の投稿者は除外。返すのはサークル描画に必要な最小列のみ。
create or replace function public.x_story_authors()
returns table (
  id uuid,
  handle text,
  display_name text,
  avatar_url text,
  kind text,
  is_verified boolean,
  story_count bigint,
  latest_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.handle,
    p.display_name,
    p.avatar_url,
    p.kind::text,
    p.is_verified,
    count(s.id) as story_count,
    max(s.created_at) as latest_at
  from public.x_stories s
  join public.x_profiles p on p.id = s.author_profile_id
  where s.expires_at > now()
    and p.status <> 'rejected'
  group by p.id, p.handle, p.display_name, p.avatar_url, p.kind, p.is_verified
  order by latest_at desc
$$;

-- 匿名・ログインの双方から実行可（本体は返さないので公開して問題ない）。
grant execute on function public.x_story_authors() to anon, authenticated;
