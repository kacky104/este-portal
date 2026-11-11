-- 第1226便（2026-10-06）: フクエスCRM の「金銭授受」の残高の集計を DB 側で行う関数
--
-- ★ それまで: 金銭授受タブ・報酬確定の精算欄・締め作業（未精算の判定）のたびに、その店の
--   【開店以来の全予約（料金か報酬のあるもの）・報酬確定・金銭の動き】を 3 表ぶん全部読んで JS で足していた。
--   1店なら数百行だが、今週 CRM の店が 3 店増える＋1年分たまると、締めのたびに数万行を読むことになる。
-- ★ これから: この関数が DB の中で足して、セラピスト1人につき【1行】だけ返す。
-- ★ 数え方は今までの JS（crm.ts の moneyByDay）と同じ:
--   営業日 … 朝6時区切り（JST）。予約は slot_start から営業日を求める。
--   received（女子が受領した料金）… received_by = 'therapist' の予約の price_total
--   pay（女子の報酬）… 報酬確定【していない】日は予約の pay_total の合計／確定した日は crm_pay_confirms の pay_total + allowance
--   to_shop／to_therapist … crm_money_moves（取り消していないもの）
--   残高 ＝ received − pay − to_shop + to_therapist（＋ならお店が受け取る側）
-- ★ 引数:
--   p_until        … この営業日まで（含む）。null＝全部
--   p_therapist_id … この人だけ。null＝全員
--   p_day          … この日の分を別の列（day_*）で返す。null＝day_* は 0・day_active は false
-- ★ 列の追加・トリガーは無し。索引は既存のもの（salon_bookings の salon_id／slot_start、crm_pay_confirms・crm_money_moves の (salon_id, business_date)）。
-- ★ service_role 専用（画面からは呼べない）。
-- ★ このSQLを流す前にコード（第1226便）を push しても壊れない（関数が無ければ今までの読み方に戻る）。

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
  with bk as (
    -- 予約（料金か報酬のあるもの）を営業日に落とす
    select
      b.therapist_id,
      ((b.slot_start at time zone 'Asia/Tokyo') - interval '6 hours')::date as d,
      case when b.received_by = 'therapist' then coalesce(b.price_total, 0) else 0 end as received,
      coalesce(b.pay_total, 0) as pay_raw
    from public.salon_bookings b
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
  'フクエスCRM: 金銭授受の残高（女子ごとの通算と、ある日の分）を DB 側で足す（第1226便）。service_role 専用';

-- 確認（適用後に別途流す）。1行出て、関数の名前が見えれば OK。
-- select proname, prosecdef from pg_proc where proname = 'crm_money_balances';
-- 試し（ラビリンス様 = salon_id 6・今日まで）:
-- select * from public.crm_money_balances(6, current_date, null, current_date);
