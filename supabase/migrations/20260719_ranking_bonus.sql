-- 週間ランキングの「下駄（ハンデ）」：店舗・セラピストごとに、週間アクセス数へ毎週加算する固定値。
-- 例: ラビリンス(店舗)に 1000 を設定 → 毎週その週の実アクセス + 1000 で順位が決まる（数値は公開ページ非表示）。
-- Supabase SQL Editor で実行してください（コード push より先に適用）。

alter table public.salons     add column if not exists ranking_bonus integer not null default 0;
alter table public.therapists add column if not exists ranking_bonus integer not null default 0;

-- 管理者だけが下駄を設定できる RPC（SECURITY DEFINER）。
-- 各テーブルの一般的な更新RLSに依存せず、ranking_bonus 列だけを安全に更新する。
-- 呼び出し元が管理者(auth.uid())でなければ例外。負値は0に丸める。
create or replace function public.admin_set_ranking_bonus(
  p_item_type text,
  p_item_id   bigint,
  p_bonus     integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus integer := greatest(coalesce(p_bonus, 0), 0);
begin
  if auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    raise exception 'forbidden';
  end if;

  if p_item_type = 'salon' then
    update public.salons set ranking_bonus = v_bonus where id = p_item_id;
  elsif p_item_type = 'therapist' then
    update public.therapists set ranking_bonus = v_bonus where id = p_item_id;
  else
    raise exception 'invalid item_type: %', p_item_type;
  end if;
end;
$$;

grant execute on function public.admin_set_ranking_bonus(text, bigint, integer) to authenticated;
