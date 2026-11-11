-- 第1415便（2026-10-12・カッキーさん）: フクエスCRM の金銭授受を「使うか」と「受領を自動で」の設定
--
-- ★ crm_settings に2列足す:
--   money_enabled       … 金銭授受を使うか（既定 true＝今までどおり）。false のお店には「金銭授受」のタブ・報酬確定の精算欄・未受領と未精算の注意を出さない
--   auto_received_from  … 受領が未入力の予約を「女子が受領」とみなす日（から先・営業日）。null＝しない（既定）
--                         カード・PayPay で払われた分は「お店が受領」（現金とカードに分けた予約は、現金の分だけ女子が受領）
--                         ★ ON にした日から先だけ。それより前の予約・残高は変えない
-- ★ 残高を足す関数 crm_money_balances（第1226便）を、上の決め方を足して作り直す（引数・返す列は同じ）。
--   コードの読み方（crm.ts の moneyByDay・lib/crm/types.ts の crmReceivedByTherapist）と同じ決め方。
-- ★ 何度流しても同じ結果。
-- ★ このSQLを流す前にコード（第1415便）を push しても壊れない（列が無ければ「使う・自動なし」＝今までどおり）。
--   ただし設定の画面で OFF・自動を保存しようとすると「保存先が用意されていません」と出る。

alter table public.crm_settings add column if not exists money_enabled boolean not null default true;
alter table public.crm_settings add column if not exists auto_received_from date;
comment on column public.crm_settings.money_enabled is 'フクエスCRM: 金銭授受を使うか（第1415便）。false＝タブ・精算欄・未受領と未精算の注意を出さない';
comment on column public.crm_settings.auto_received_from is 'フクエスCRM: この営業日から先、受領が未入力の予約を「女子が受領」とみなす（カード・PayPay の分はお店）。null＝しない（第1415便）';

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
  bk as (
    -- 予約（料金か報酬のあるもの）を営業日に落とす
    select
      b.therapist_id,
      ((b.slot_start at time zone 'Asia/Tokyo') - interval '6 hours')::date as d,
      case
        when b.received_by = 'therapist' then coalesce(b.price_total, 0)
        when coalesce(b.received_by, '') <> '' then 0
        -- ★ 第1415便: 未入力で、設定の日から先 → 料金からカード・PayPay の分を引いた額（lib/crm/types.ts の crmReceivedByTherapist と同じ）
        when (select auto_from from st) is not null
             and ((b.slot_start at time zone 'Asia/Tokyo') - interval '6 hours')::date >= (select auto_from from st)
          then greatest(0, coalesce(b.price_total, 0) - (
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
  'フクエスCRM: 金銭授受の残高（女子ごとの通算と、ある日の分）を DB 側で足す（第1226便・第1415便で受領の自動を足した）。service_role 専用';

-- 確認（適用後に別途流す）:
-- select column_name, data_type, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'crm_settings' and column_name in ('money_enabled', 'auto_received_from');
-- select * from public.crm_money_balances(6, current_date, null, current_date);   -- ラビリンス様。設定を変える前は今までと同じ数字
