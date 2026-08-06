-- 店舗別の「インプレッション」計測：一覧カード・バナーが画面に表示された回数の日次カウンタ。
-- Supabase ダッシュボードの SQL Editor で実行してください（コード push より先に適用）。
--
-- 設計メモ
--  - salon_action_daily と同じ「店舗 × 面(surface) × 日(JST)」の集計行。件数は有界。
--    surface: card=店舗カード（TOP/地域の一覧） / therapist=セラピストカード（出勤中スライダー・/working 等）
--            / banner=店舗バナー（ピックアップ店舗スライダー・おすすめ店舗バナー）
--  - 1ページの表示で数十件のインプレッションが発生するため、1件ずつではなく
--    クライアント側でまとめて（ImpressionMark.tsx が数秒ごとに）一括加算する。
--    そのため RPC は jsonb 配列 [{"s":店舗ID,"f":面,"n":件数}, ...] を受ける。
--  - いたずら対策：配列は最大100要素・1要素の n は 1〜20 に丸め・存在する店舗のみ加算。
--  - 読み取りは運営のみ（営業数値なので公開SELECTポリシーは作らない）。

create table if not exists public.salon_impression_daily (
  salon_id   bigint not null,
  surface    text   not null check (surface in ('card','therapist','banner')),
  day        date   not null,                    -- JST の日付
  count      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (salon_id, surface, day)
);

create index if not exists salon_impression_daily_day_idx
  on public.salon_impression_daily (day, salon_id);

alter table public.salon_impression_daily enable row level security;

drop policy if exists "admin_select_salon_impression_daily" on public.salon_impression_daily;
create policy "admin_select_salon_impression_daily"
  on public.salon_impression_daily for select
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- まとめて加算する RPC。SECURITY DEFINER で RLS をバイパスして upsert（呼び出し元は anon でよい）。
create or replace function public.increment_salon_impressions(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return;
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    return;
  end if;

  v_day := (now() at time zone 'Asia/Tokyo')::date;

  -- 同一 (salon, surface) が配列内に重複していても良いよう group by で先にまとめる
  -- （まとめないと ON CONFLICT が同一行を2回更新しようとしてエラーになる）。
  insert into public.salon_impression_daily (salon_id, surface, day, count, updated_at)
  select t.salon_id, t.surface, v_day, t.n, now()
  from (
    select
      (e ->> 's')::bigint as salon_id,
      (e ->> 'f')         as surface,
      sum(least(greatest(coalesce((e ->> 'n')::int, 1), 1), 20)) as n
    from jsonb_array_elements(p_items) e
    where (e ->> 'f') in ('card','therapist','banner')
      and (e ->> 's') ~ '^[0-9]+$'
    group by 1, 2
  ) t
  join public.salons s on s.id = t.salon_id   -- 存在しない店舗IDは捨てる（行増殖防止）
  on conflict (salon_id, surface, day)
  do update set count = public.salon_impression_daily.count + excluded.count,
                updated_at = now();
end;
$$;

grant execute on function public.increment_salon_impressions(jsonb) to anon, authenticated;
