-- ページ別ヒーロー画像の対象キーに「掲載店舗一覧(/salons)」を追加。
-- admin_set_page_hero の許可キーリストへ 'salons' を加えて関数を再作成する
-- （'jobs-matching' を含む＝同日の 20260725_page_heroes_jobs_matching.sql 適用済みでも未適用でも、これ1本で最新になる）。
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
  if p_key not in ('therapists','diary','reviews','newface','xshops','news','jobs-matching','salons') then
    raise exception 'invalid page key: %', p_key;
  end if;
  insert into public.page_heroes (page_key, image_url, updated_at)
    values (p_key, v_url, now())
    on conflict (page_key) do update
      set image_url = excluded.image_url, updated_at = now();
end;
$$;

grant execute on function public.admin_set_page_hero(text, text) to authenticated;
