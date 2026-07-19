-- 週間ランキングページのヒーロー（ヘッダー）画像。単一行の設定テーブル。
-- 画像ファイル自体は既存の公開バケット header-slider（jpeg/png/webp・5MB・public）を再利用し、
-- ここには公開URLだけを保存する。設定は管理者判定付きRPC経由。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。

create table if not exists public.ranking_hero (
  id         integer primary key default 1 check (id = 1),
  image_url  text,
  updated_at timestamptz not null default now()
);
insert into public.ranking_hero (id) values (1) on conflict (id) do nothing;

alter table public.ranking_hero enable row level security;

drop policy if exists ranking_hero_select_all on public.ranking_hero;
create policy ranking_hero_select_all on public.ranking_hero
  for select using (true);

-- 直接更新は不可。設定は下記RPC（管理者のみ）経由。
create or replace function public.admin_set_ranking_hero(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    raise exception 'forbidden';
  end if;
  update public.ranking_hero
    set image_url = nullif(btrim(coalesce(p_url, '')), ''),
        updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.admin_set_ranking_hero(text) to authenticated;
