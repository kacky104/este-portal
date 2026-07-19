-- 週間アクセスランキング用：ページ閲覧の週次集計テーブル＋加算RPC
-- 週の起点は「月曜（JST/Asia/Tokyo）」。Postgres の date_trunc('week') は月曜起点なので一致する。
-- Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用）。

-- 週次カウンタ（item×週 で1行）。生ログではなく集計行なので件数は有界。
create table if not exists public.page_view_weekly (
  item_type  text   not null check (item_type in ('salon','therapist')),
  item_id    bigint not null,
  week_start date   not null,               -- その週の月曜（JST）
  views      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (item_type, item_id, week_start)
);

create index if not exists page_view_weekly_rank_idx
  on public.page_view_weekly (item_type, week_start, views desc);

alter table public.page_view_weekly enable row level security;

-- 公開読み取り可（ランキング表示は匿名クライアントから）。
drop policy if exists "page_view_weekly_select_all" on public.page_view_weekly;
create policy "page_view_weekly_select_all" on public.page_view_weekly
  for select using (true);

-- 直接の insert/update ポリシーは作らない＝加算は下記 RPC（SECURITY DEFINER）経由のみ。

-- 現在の週（月曜JST起点）に対して該当 item の views を +1。
-- SECURITY DEFINER でRLSをバイパスして upsert する（呼び出し元は anon でもよい）。
create or replace function public.increment_page_view(p_item_type text, p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date;
begin
  if p_item_type not in ('salon','therapist') then
    return;
  end if;
  if p_item_id is null then
    return;
  end if;
  -- JST の現在日時から月曜起点の週初を求める。
  v_week_start := (date_trunc('week', (now() at time zone 'Asia/Tokyo')))::date;

  insert into public.page_view_weekly (item_type, item_id, week_start, views, updated_at)
  values (p_item_type, p_item_id, v_week_start, 1, now())
  on conflict (item_type, item_id, week_start)
  do update set views = public.page_view_weekly.views + 1,
                updated_at = now();
end;
$$;

grant execute on function public.increment_page_view(text, bigint) to anon, authenticated;
