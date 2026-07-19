-- 週間ランキングのヒーロー画像をタブ別（総合／店舗／セラピスト）に拡張。
-- 既存の単一ヒーロー(image_url)は「総合」に引き継ぐ。設定は管理者判定付きRPC(2引数版)。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。

alter table public.ranking_hero
  add column if not exists hero_overall   text,
  add column if not exists hero_salon     text,
  add column if not exists hero_therapist text;

-- 既存の単一ヒーロー(image_url)を「総合」に引き継ぐ（未設定時のみ・冪等）。
update public.ranking_hero
  set hero_overall = image_url
  where id = 1 and hero_overall is null and image_url is not null;

-- タブ指定で設定する新RPC（既存の1引数版と併存）。p_tab: overall / salon / therapist。
create or replace function public.admin_set_ranking_hero(p_tab text, p_url text)
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
  if p_tab = 'overall' then
    update public.ranking_hero set hero_overall = v_url, updated_at = now() where id = 1;
  elsif p_tab = 'salon' then
    update public.ranking_hero set hero_salon = v_url, updated_at = now() where id = 1;
  elsif p_tab = 'therapist' then
    update public.ranking_hero set hero_therapist = v_url, updated_at = now() where id = 1;
  else
    raise exception 'invalid tab: %', p_tab;
  end if;
end;
$$;

grant execute on function public.admin_set_ranking_hero(text, text) to authenticated;
