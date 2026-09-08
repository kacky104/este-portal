-- 第218便（2026-09-08）: 「一覧を見る」カード（出勤中・新人の横スクロールの末尾）の画像
--
-- 保存先: page_heroes の page_key='list_more_card'（image_url）。★ 新しい表は作らない。
-- ★ 書くのは専用の RPC（運営UIDだけ）。読むのは anon の select（既存のポリシー）。
-- ★ 第217便の admin_set_therapist_placeholder と同じ形。★ ヒーロー画像の RPC には入れない。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用推奨）。
--   先にコードが出ても、行が無いあいだは今までどおりのグラデーションのカードが出るだけです。

create or replace function public.admin_set_list_more_card_image(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    raise exception 'forbidden';
  end if;
  insert into public.page_heroes (page_key, image_url, updated_at)
    values ('list_more_card', v_url, now())
  on conflict (page_key) do update
    set image_url = excluded.image_url, updated_at = now();
end;
$$;

grant execute on function public.admin_set_list_more_card_image(text) to authenticated;

-- 確認用: select page_key, image_url from public.page_heroes where page_key = 'list_more_card';
