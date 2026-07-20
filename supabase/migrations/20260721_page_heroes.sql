-- ページ別ヒーロー（ヘッダー）画像。ランキングと同方式（設定テーブル＋管理者判定付きRPC）。
-- 対象: 特徴で探す(/therapists) / 写メ日記(/diary) / 口コミ(/reviews) / 新人(/therapist/new) / SNS(/x-shops)
-- 画像は既存の公開バケット header-slider を再利用し、公開URLだけを保存する。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。

create table if not exists public.page_heroes (
  page_key   text primary key,
  image_url  text,
  updated_at timestamptz not null default now()
);

alter table public.page_heroes enable row level security;

drop policy if exists page_heroes_select_all on public.page_heroes;
create policy page_heroes_select_all on public.page_heroes
  for select using (true);

-- 直接更新は不可。設定は下記RPC（管理者のみ）経由。
-- p_key: therapists / diary / reviews / newface / xshops
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
  if p_key not in ('therapists','diary','reviews','newface','xshops') then
    raise exception 'invalid page key: %', p_key;
  end if;
  insert into public.page_heroes (page_key, image_url, updated_at)
    values (p_key, v_url, now())
    on conflict (page_key) do update
      set image_url = excluded.image_url, updated_at = now();
end;
$$;

grant execute on function public.admin_set_page_hero(text, text) to authenticated;
