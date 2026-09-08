-- 第217便（2026-09-08）: セラピストの写真が1枚も無いときの【既定画像】
--
-- ① salons.therapist_placeholder_url … 店舗ごとの既定画像（店舗様が /mypage で入れる）
-- ② page_heroes に page_key='therapist_placeholder' の1行 … 運営の既定画像（/admin で入れる）
--    ★ ヒーロー画像の RPC（admin_set_page_hero_image）の許可リストには【入れない】。
--      あちらは PC/SP の2枚・ページの無効化と結びついていて、既定画像とは用途が違う。
--      ★ 代わりに専用の RPC を1つ足す（書けるのは運営だけ）。読むのは anon の select（既存のポリシー）。
--
-- ★ Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用推奨）。
--   先にコードが出ても、列が無いあいだは「既定画像なし」に倒れるだけで公開ページは壊れません。

alter table public.salons
  add column if not exists therapist_placeholder_url text;

comment on column public.salons.therapist_placeholder_url is
  'セラピストの写真が無いときの店舗の既定画像（第217便）。null なら運営の既定（page_heroes therapist_placeholder）へ';

create or replace function public.admin_set_therapist_placeholder(p_url text)
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
    values ('therapist_placeholder', v_url, now())
  on conflict (page_key) do update
    set image_url = excluded.image_url, updated_at = now();
end;
$$;

grant execute on function public.admin_set_therapist_placeholder(text) to authenticated;

-- 確認用（適用後に別途流す）。
-- select page_key, image_url from public.page_heroes where page_key = 'therapist_placeholder';
-- select id, therapist_placeholder_url from public.salons where therapist_placeholder_url is not null;
