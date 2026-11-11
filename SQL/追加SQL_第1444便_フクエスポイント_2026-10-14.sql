-- 第1444便（2026-10-14・カッキーさん）: フクエスポイント 第1弾「貯める」
--
-- ★ 決まりごと
--   ・フクエス共通ポイント（運営が負担）。来店1回 50pt（キャンペーン中）。1,000pt で税込 1,000円引き（使うのは第2弾）。
--   ・貯まるのは「ポイント加盟店」（salons.points_member = true・運営が /admin/points で ON）で、部屋の QR の同意書を送ったあと、
--     完了画面で「受け取る」を押した会員だけ。予約1件につき1回・同じ会員は1日（営業日）1回まで。受け取りは24時間以内。
--   ・有効期限は「最後に貯めた日から1年」（期限切れはアプリ側で expire の行を足す）。
--   ・お店には、誰が会員か・何ポイントかは見せない（この表はお店の画面からは読まない）。
--
-- ★ 作るもの
--   1) salons.points_member（ポイント加盟店か）
--   2) member_points（ポイントの出入りの記録。残高＝delta の合計）
--   3) point_claims（来店ポイントの受け取り券。予約1件に1枚）
--   4) claim_visit_points()（受け取りを1回の処理で行う。同時に押されても二重にならない）
--
-- ★ 何度流しても同じ結果。今ある表・データは変えない（salons に1列足すだけ）。
-- ★ 先にこの SQL を流してから第1444便を push してください。

-- 1) ポイント加盟店の印
alter table public.salons add column if not exists points_member boolean not null default false;
comment on column public.salons.points_member is 'フクエスポイント加盟店（第1444便）。運営が /admin/points で ON／OFF';

-- 2) ポイントの出入り
create table if not exists public.member_points (
  id            bigint generated always as identity primary key,
  user_id       uuid    not null references auth.users(id) on delete cascade,
  delta         integer not null check (delta <> 0),
  kind          text    not null check (kind in ('visit', 'use', 'expire', 'revoke', 'adjust')),
  salon_id      integer references public.salons(id) on delete set null,
  booking_id    text,              -- 予約の番号（同意書は8年で消えるので、ここは同意書に頼らない）
  business_date date,              -- 来店の営業日（1日1回の判定に使う）
  note          text    not null default '' check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index if not exists member_points_user_idx  on public.member_points (user_id, created_at desc);
create index if not exists member_points_salon_idx on public.member_points (salon_id, created_at);
-- 予約1件につき来店ポイントは1回
create unique index if not exists member_points_visit_booking_uq on public.member_points (booking_id) where kind = 'visit' and booking_id is not null;
-- 同じ会員は1日（営業日）1回
create unique index if not exists member_points_visit_daily_uq on public.member_points (user_id, business_date) where kind = 'visit';
comment on table public.member_points is 'フクエスポイントの出入り（第1444便）。残高＝delta の合計。会員本人は自分の行だけ読める';

-- 3) 受け取り券
create table if not exists public.point_claims (
  token         text primary key check (char_length(token) between 20 and 80),
  salon_id      integer not null references public.salons(id) on delete cascade,
  booking_id    text    not null unique,
  business_date date    not null,
  points        integer not null check (points > 0),
  expires_at    timestamptz not null,
  claimed_by    uuid references auth.users(id) on delete set null,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists point_claims_salon_idx on public.point_claims (salon_id, created_at);
comment on table public.point_claims is '来店ポイントの受け取り券（第1444便）。同意書の送信で予約1件に1枚。service_role だけ';

-- 見られる人の範囲
alter table public.member_points enable row level security;
alter table public.point_claims  enable row level security;
drop policy if exists member_points_self_read on public.member_points;
create policy member_points_self_read on public.member_points for select using (user_id = auth.uid());
-- point_claims は policy なし＝service_role だけ

-- 4) 受け取り（1回の処理で: 券を確かめる → 1日1回を確かめる → 記録 → 券を使用済みに）
create or replace function public.claim_visit_points(p_token text, p_user uuid)
returns table (r_status text, r_points integer, r_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  c   public.point_claims%rowtype;
  bal integer;
begin
  select * into c from public.point_claims where token = p_token for update;
  if not found then
    return query select 'invalid'::text, 0, 0;
    return;
  end if;
  select coalesce(sum(delta), 0)::integer into bal from public.member_points where user_id = p_user;
  if c.claimed_by is not null then
    return query select (case when c.claimed_by = p_user then 'mine' else 'taken' end)::text, c.points, bal;
    return;
  end if;
  if c.expires_at < now() then
    return query select 'expired'::text, c.points, bal;
    return;
  end if;
  if exists (select 1 from public.member_points where user_id = p_user and kind = 'visit' and business_date = c.business_date) then
    return query select 'daily'::text, c.points, bal;
    return;
  end if;
  insert into public.member_points (user_id, delta, kind, salon_id, booking_id, business_date)
    values (p_user, c.points, 'visit', c.salon_id, c.booking_id, c.business_date);
  update public.point_claims set claimed_by = p_user, claimed_at = now() where token = p_token;
  return query select 'ok'::text, c.points, bal + c.points;
end;
$$;
revoke all on function public.claim_visit_points(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_visit_points(text, uuid) to service_role;

-- 確認（3行出れば OK: points_member / member_points / point_claims）
select 'salons.points_member' as what, count(*)::text as n from information_schema.columns
  where table_schema = 'public' and table_name = 'salons' and column_name = 'points_member'
union all select 'member_points', count(*)::text from public.member_points
union all select 'point_claims',  count(*)::text from public.point_claims;
