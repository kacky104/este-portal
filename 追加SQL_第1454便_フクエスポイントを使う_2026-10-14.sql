-- 第1454便（2026-10-14・カッキーさん）: フクエスポイント 第2弾「使う」
--
-- ★ 決まりごと
--   ・1,000pt で税込 1,000円引き。1回の来店（予約1件）で1回まで。使えるのは加盟店（salons.points_member）だけ。
--   ・使うのは、同意書の完了画面（受け取り券 point_claims の画面）で、ログインした会員本人が「1,000pt 使う」を押したとき。
--     予約の終わりの時刻を過ぎた・取り消された予約・券の期限（同意から24時間）が過ぎたものには使えない。
--   ・負担はフクエス（運営）。お店の売上・女子報酬は変えない。お客様から受け取る額が 1,000円少なくなる分は、
--     月の請求書でフクエスが差し引く（アプリ側）。
--   ・金銭授受: 女子が受け取った額は「料金 − 1,000円」になる（このSQLで crm_money_balances を作り直す）。
--   ・同意後に予約が取り消された分は、運営が /admin/points で「利用の取り消し」（refund の行・ポイントを戻す）。自動では戻さない。
--
-- ★ 作るもの
--   1) member_points の種類に refund（利用の取り消し）を足す
--   2) 予約1件に「使う」は1回・「利用の取り消し」も1回（一意の決まり）＋予約の番号で引く索引
--   3) use_visit_points()（使うのを1回の処理で行う。同時に押されても二重にならない・残高が足りないと使えない）
--   4) crm_money_balances（金銭授受の残高）を作り直す: 女子が受け取った額からフクエスポイントの分を引く（引数・返す列は同じ）
--
-- ★ 何度流しても同じ結果。今あるデータは変えない。
-- ★ 先にこの SQL を流してから第1454便を push してください。

-- 1) 種類に refund を足す
alter table public.member_points drop constraint if exists member_points_kind_check;
alter table public.member_points add constraint member_points_kind_check
  check (kind in ('visit', 'signup', 'review', 'use', 'refund', 'expire', 'revoke', 'adjust'));

-- 2) 予約1件に1回
create unique index if not exists member_points_use_booking_uq    on public.member_points (booking_id) where kind = 'use'    and booking_id is not null;
create unique index if not exists member_points_refund_booking_uq on public.member_points (booking_id) where kind = 'refund' and booking_id is not null;
create index if not exists member_points_use_lookup_idx on public.member_points (booking_id) where kind in ('use', 'refund');
create index if not exists member_points_use_salon_idx  on public.member_points (salon_id, created_at) where kind in ('use', 'refund');

-- 3) 使う（1回の処理で: 券 → この予約でもう使ったか → 予約が使える状態か → 加盟店か → 残高 → 記録）
--    結果 r_status: ok（使った）／used（この予約で自分がもう使っている）／taken（この予約はほかのアカウントで使用済み）
--                   short（残高が足りない）／closed（予約が終わった・取り消された・券の期限切れ・加盟店でない）／invalid（券が無い）
create or replace function public.use_visit_points(p_token text, p_user uuid, p_points integer)
returns table (r_status text, r_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  c    public.point_claims%rowtype;
  u    record;
  bk   record;
  mem  boolean;
  bal  integer;
begin
  if p_points is null or p_points <= 0 or p_points > 100000 then
    return query select 'invalid'::text, 0;
    return;
  end if;
  select * into c from public.point_claims where token = p_token for update;
  if not found then
    return query select 'invalid'::text, 0;
    return;
  end if;
  -- 同じ会員の同時押し（別の予約で同時に使う）でも残高を割らないように、会員ごとに順番にする
  perform pg_advisory_xact_lock(hashtextextended('member_points:' || p_user::text, 0));
  select coalesce(sum(delta), 0)::integer into bal from public.member_points where user_id = p_user;
  select m.user_id into u from public.member_points m where m.kind = 'use' and m.booking_id = c.booking_id limit 1;
  if found then
    return query select (case when u.user_id = p_user then 'used' else 'taken' end)::text, bal;
    return;
  end if;
  select b.status, b.slot_end into bk from public.salon_bookings b where b.id::text = c.booking_id;
  select s.points_member into mem from public.salons s where s.id = c.salon_id;
  if bk is null or bk.status = 'cancelled' or bk.slot_end < now() or c.expires_at < now() or mem is not true then
    return query select 'closed'::text, bal;
    return;
  end if;
  if bal < p_points then
    return query select 'short'::text, bal;
    return;
  end if;
  insert into public.member_points (user_id, delta, kind, salon_id, booking_id, business_date, note)
    values (p_user, -p_points, 'use', c.salon_id, c.booking_id, c.business_date, 'ご来店で利用（割引）');
  return query select 'ok'::text, bal - p_points;
end;
$$;
revoke all on function public.use_visit_points(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.use_visit_points(text, uuid, integer) to service_role;

-- 4) 金銭授受の残高（第1226便・第1415便）を作り直す。★ 変わるのは「received（女子が受け取った額）」だけ:
--    その予約でフクエスポイントが使われていたら（use があって refund が無い）、その額を引く。
--    コードの読み方（crm.ts の moneyByDay・lib/crm/types.ts の crmReceivedByTherapist）と同じ決め方。
create or replace function public.crm_money_balances(
  p_salon_id     integer,
  p_until        date   default null,
  p_therapist_id bigint default null,
  p_day          date   default null
)
returns table (
  therapist_id     bigint,
  received         bigint,
  pay              bigint,
  to_shop          bigint,
  to_therapist     bigint,
  day_received     bigint,
  day_pay          bigint,
  day_to_shop      bigint,
  day_to_therapist bigint,
  day_active       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with st as (
    -- ★ 第1415便: 受領が未入力の予約を「女子が受領」とみなす日（から先）。null＝しない
    select s.auto_received_from as auto_from from public.crm_settings s where s.salon_id = p_salon_id
  ),
  pt as (
    -- ★ 第1454便: 予約ごとのフクエスポイントの利用額（円）。use −1,000 と refund +1,000 の合計を反対にした額（取り消し済みは 0）
    select m.booking_id, greatest(0, -sum(m.delta))::bigint as yen
    from public.member_points m
    where m.salon_id = p_salon_id and m.kind in ('use', 'refund') and m.booking_id is not null
    group by m.booking_id
  ),
  bk as (
    -- 予約（料金か報酬のあるもの）を営業日に落とす
    select
      b.therapist_id,
      ((b.slot_start at time zone 'Asia/Tokyo') - interval '6 hours')::date as d,
      case
        when b.received_by = 'therapist' then greatest(0, coalesce(b.price_total, 0) - coalesce(pt.yen, 0))
        when coalesce(b.received_by, '') <> '' then 0
        -- ★ 第1415便: 未入力で、設定の日から先 → 料金からカード・PayPay の分（と第1454便のフクエスポイントの分）を引いた額
        when (select auto_from from st) is not null
             and ((b.slot_start at time zone 'Asia/Tokyo') - interval '6 hours')::date >= (select auto_from from st)
          then greatest(0, coalesce(b.price_total, 0) - coalesce(pt.yen, 0) - (
            case
              when jsonb_typeof(b.payment_split) = 'array' and jsonb_array_length(b.payment_split) > 0 then coalesce((
                select sum(greatest(0, round(coalesce(nullif(e->>'amount', '')::numeric, 0))))::bigint
                from jsonb_array_elements(b.payment_split) e
                where btrim(coalesce(e->>'method', '')) in ('カード', 'PayPay')
              ), 0)
              when b.payment_method in ('カード', 'PayPay') then coalesce(b.price_total, 0)
              else 0
            end))
        else 0
      end as received,
      coalesce(b.pay_total, 0) as pay_raw
    from public.salon_bookings b
    left join pt on pt.booking_id = b.id::text
    where b.salon_id = p_salon_id
      and b.status <> 'cancelled'
      and b.therapist_id is not null
      and (b.price_total is not null or b.pay_total is not null)
      and (p_therapist_id is null or b.therapist_id = p_therapist_id)
      and (p_until is null or b.slot_start < (((p_until + 1)::text || ' 06:00:00+09')::timestamptz))
  ),
  cf as (
    select c.therapist_id, c.business_date as d, (c.pay_total + c.allowance)::bigint as pay
    from public.crm_pay_confirms c
    where c.salon_id = p_salon_id
      and (p_therapist_id is null or c.therapist_id = p_therapist_id)
      and (p_until is null or c.business_date <= p_until)
  ),
  cells as (
    -- 予約: 受領。報酬は、その日が確定【されていない】ときだけ予約の pay_total
    select bk.therapist_id, bk.d, bk.received,
           case when cf.therapist_id is null then bk.pay_raw else 0 end as pay,
           0::bigint as to_shop, 0::bigint as to_therapist
    from bk
    left join cf on cf.therapist_id = bk.therapist_id and cf.d = bk.d
    union all
    -- 確定した日: 確定のときの報酬＋手当
    select cf.therapist_id, cf.d, 0, cf.pay, 0, 0 from cf
    union all
    -- 金銭の動き（取り消していないもの）
    select m.therapist_id, m.business_date, 0, 0,
           case when m.direction = 'to_shop' then m.amount else 0 end,
           case when m.direction = 'to_therapist' then m.amount else 0 end
    from public.crm_money_moves m
    where m.salon_id = p_salon_id
      and m.cancelled_at is null
      and (p_therapist_id is null or m.therapist_id = p_therapist_id)
      and (p_until is null or m.business_date <= p_until)
  )
  select
    cells.therapist_id,
    sum(cells.received)::bigint,
    sum(cells.pay)::bigint,
    sum(cells.to_shop)::bigint,
    sum(cells.to_therapist)::bigint,
    coalesce(sum(cells.received)     filter (where p_day is not null and cells.d = p_day), 0)::bigint,
    coalesce(sum(cells.pay)          filter (where p_day is not null and cells.d = p_day), 0)::bigint,
    coalesce(sum(cells.to_shop)      filter (where p_day is not null and cells.d = p_day), 0)::bigint,
    coalesce(sum(cells.to_therapist) filter (where p_day is not null and cells.d = p_day), 0)::bigint,
    coalesce(bool_or(p_day is not null and cells.d = p_day), false)
  from cells
  group by cells.therapist_id;
$$;

revoke all on function public.crm_money_balances(integer, date, bigint, date) from public, anon, authenticated;
grant execute on function public.crm_money_balances(integer, date, bigint, date) to service_role;
comment on function public.crm_money_balances(integer, date, bigint, date) is
  'フクエスCRM: 金銭授受の残高（女子ごとの通算と、ある日の分）を DB 側で足す（第1226便・第1415便で受領の自動・第1454便でフクエスポイントの分を引く）。service_role 専用';

notify pgrst, 'reload schema';

-- 確認（2行出れば OK: kind の決まりに refund が入っている／use_visit_points がある）
select 'kind' as what, pg_get_constraintdef(oid) as def from pg_constraint where conname = 'member_points_kind_check'
union all
select 'use_visit_points', p.oid::regprocedure::text from pg_proc p where p.proname = 'use_visit_points';
