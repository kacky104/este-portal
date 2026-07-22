-- ページ別ヒーロー画像の対象キーに「新着情報(/news)」を追加。
-- admin_set_page_hero の許可キーリストへ 'news' を加えて関数を再作成する（他は 20260721_page_heroes.sql と同一）。
-- Supabase SQL Editor で実行してください（コード push より先に適用推奨）。

create or replace function public.admin_set_page_hero(p_key text, p_url text)
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
  if p_key not in ('therapists','diary','reviews','newface','xshops','news') then
    raise exception 'invalid page key: %', p_key;
  end if;
  insert into public.page_heroes (page_key, image_url, updated_at)
    values (p_key, v_url, now())
    on conflict (page_key) do update
      set image_url = excluded.image_url, updated_at = now();
end;
$$;

grant execute on function public.admin_set_page_hero(text, text) to authenticated;
