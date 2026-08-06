-- 店舗別の「送客アクション」計測：電話タップ／LINE予約／ネット予約ボタン の日次カウンタ。
-- Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用）。
--
-- 設計メモ
--  - 生ログではなく「店舗 × アクション × 日（JST）」の集計行なので件数は有界
--    （店舗数 × 3 × 日数）。既存の page_view_weekly と同じ考え方。
--  - 日次にしたのは、画面側で「今週」「先週」「過去4週」「全期間」など任意の期間に
--    足し上げられるようにするため。PV（page_view_weekly）は週単位なので、
--    画面の期間選択は両者が揃うよう「週（月曜起点）」に丸めて使う。
--  - 加算はクライアント（匿名）から呼ぶため、insert/update ポリシーは作らず
--    SECURITY DEFINER の RPC 経由のみに限定する（page_view_weekly と同方式）。
--  - 読み取りは運営のみ。PV と違い営業数値なので公開SELECTポリシーは作らない。

create table if not exists public.salon_action_daily (
  salon_id   bigint not null,
  action     text   not null check (action in ('tel','line','book')),
  day        date   not null,                    -- JST の日付
  count      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (salon_id, action, day)
);

-- 期間で絞ってから店舗ごとに足す使い方なので day を先頭に。
create index if not exists salon_action_daily_day_idx
  on public.salon_action_daily (day, salon_id);

alter table public.salon_action_daily enable row level security;

-- 運営のみ閲覧可（公開SELECTポリシーは作らない）。
drop policy if exists "admin_select_salon_action_daily" on public.salon_action_daily;
create policy "admin_select_salon_action_daily"
  on public.salon_action_daily for select
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- 該当店舗・該当アクションの「今日（JST）」のカウントを +1。
-- SECURITY DEFINER で RLS をバイパスして upsert する（呼び出し元は anon でよい）。
create or replace function public.increment_salon_action(p_salon_id bigint, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  if p_action not in ('tel','line','book') then
    return;
  end if;
  if p_salon_id is null then
    return;
  end if;
  -- 存在しない salon_id での行増殖を防ぐ（いたずら対策）。
  if not exists (select 1 from public.salons where id = p_salon_id) then
    return;
  end if;

  v_day := (now() at time zone 'Asia/Tokyo')::date;

  insert into public.salon_action_daily (salon_id, action, day, count, updated_at)
  values (p_salon_id, p_action, v_day, 1, now())
  on conflict (salon_id, action, day)
  do update set count = public.salon_action_daily.count + 1,
                updated_at = now();
end;
$$;

grant execute on function public.increment_salon_action(bigint, text) to anon, authenticated;
