-- ページ別ヒーロー画像の対象キーに、コラムの2ページを追加（2026-08-18 / 第23便）。
--   'column'      … メンズエステコラム（/column・本体タブ）
--   'jobs-column' … セラピストのお仕事コラム（/jobs/column・求人タブ）
--
-- ★★ 許可リストを持つ関数は【2本ある】。両方を直すこと。
--    ① admin_set_page_hero(p_key, p_url)                 … 旧・PC専用。画面からはもう呼んでいないが、
--                                                          デプロイ入れ替わり中の保険としてDB側に残してある。
--    ② admin_set_page_hero_image(p_key, p_variant, p_url) … 現行。PageHeroManager はこちらだけを呼ぶ。
--    ①だけ直すと保存できないままになり、②だけ直すと古い関数が「不正なキー」を持ち続ける。
--
-- どちらも「20260817_page_heroes_sp.sql 適用後の最新リスト＋今回の2キー」を丸ごと持つので、
-- この1本を流せば最新になります（冪等・create or replace）。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用推奨）。
--   先にコードが出ても公開ページは page_heroes を select するだけなので壊れません。
--   影響は「/admin でコラムの画像を保存しようとすると invalid page key で失敗する」だけです。

-- ① 旧・PC専用（残してあるほう）
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
  if p_key not in (
    'therapists','diary','reviews','newface','xshops','news',
    'jobs-matching','salons','reviews-therapist','reviews-hall','join','listing',
    'column','jobs-column'
  ) then
    raise exception 'invalid page key: %', p_key;
  end if;
  insert into public.page_heroes (page_key, image_url, updated_at)
    values (p_key, v_url, now())
    on conflict (page_key) do update
      set image_url = excluded.image_url, updated_at = now();
end;
$$;

grant execute on function public.admin_set_page_hero(text, text) to authenticated;

-- ② 現行・PC/SP 対応（画面が呼ぶほう）
create or replace function public.admin_set_page_hero_image(p_key text, p_variant text, p_url text)
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

  -- ★ 対象ページを増やすときは、ここと ① と lib/pageHero.ts の PageHeroKey の3か所を直すこと。
  if p_key not in (
    'therapists','diary','reviews','newface','xshops','news',
    'jobs-matching','salons','reviews-therapist','reviews-hall','join','listing',
    'column','jobs-column'
  ) then
    raise exception 'invalid page key: %', p_key;
  end if;

  if p_variant not in ('pc','sp') then
    raise exception 'invalid variant: %', p_variant;
  end if;

  if p_variant = 'pc' then
    insert into public.page_heroes (page_key, image_url, updated_at)
      values (p_key, v_url, now())
      on conflict (page_key) do update
        set image_url = excluded.image_url, updated_at = now();
  else
    insert into public.page_heroes (page_key, image_url_sp, updated_at)
      values (p_key, v_url, now())
      on conflict (page_key) do update
        set image_url_sp = excluded.image_url_sp, updated_at = now();
  end if;
end;
$$;

grant execute on function public.admin_set_page_hero_image(text, text, text) to authenticated;

-- 確認用（適用後に別途流す）。'column' と 'jobs-column' が両方の関数の定義に入っていること。
-- select proname,
--        (prosrc like '%''column''%')      as has_column,
--        (prosrc like '%''jobs-column''%')  as has_jobs_column
--   from pg_proc
--  where proname in ('admin_set_page_hero','admin_set_page_hero_image');
