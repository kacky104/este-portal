-- 第1115便（2026-10-03）: フクエスCRM の「お客様の来店回数」の集計を DB 側で行う関数
--
-- ★ それまで: スケジュール画面（60秒ごと）と顧客一覧の検索で、お客様ごとの【過去の予約を全件】（最大5,000行）読んで
--   JS で数えていた。これが CRM の読み取り量の大半だった。
-- ★ これから: この関数が DB の中で数えて、お客様1人につき【1行】だけ返す。読む行数は数千 → 数十。
-- ★ 数え方は今までの JS（crm.ts の statsFor）と同じ:
--   利用（visits）     … キャンセル以外で、開始時刻が今より前
--   これから（upcoming）… キャンセル以外で、開始時刻が今より後
--   キャンセル（cancels）… status = 'cancelled'（悪質を含む）／うち悪質（bad_cancels）… cancel_bad
--   最終来店（last_visit）… 利用のうち、いちばん新しい開始時刻
-- ★ 列の追加・トリガーは無し（★ 当初の案「集計列3つ＋トリガー」はやめた。時間で変わる「これから／利用」の
--   境目をトリガーでは保てないため。関数なら常に正しく、ずれる心配が無い）。
-- ★ 索引 salon_bookings_customer_idx (customer_id, slot_start desc) が効く。
-- ★ service_role 専用（画面からは呼べない）。
-- ★ このSQLを流す前にコード（第1115便）を push しても壊れない（関数が無ければ今までの読み方に戻る）。

create or replace function public.crm_customer_stats(p_salon_id integer, p_ids bigint[])
returns table (
  customer_id bigint,
  visits      integer,
  upcoming    integer,
  cancels     integer,
  bad_cancels integer,
  last_visit  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.customer_id,
    count(*) filter (where b.status <> 'cancelled' and b.slot_start <= now())::integer                      as visits,
    count(*) filter (where b.status <> 'cancelled' and b.slot_start >  now())::integer                      as upcoming,
    count(*) filter (where b.status =  'cancelled')::integer                                                 as cancels,
    count(*) filter (where b.status =  'cancelled' and coalesce(b.cancel_bad, false))::integer               as bad_cancels,
    max(b.slot_start) filter (where b.status <> 'cancelled' and b.slot_start <= now())                       as last_visit
  from public.salon_bookings b
  where b.salon_id = p_salon_id
    and b.customer_id = any(p_ids)
  group by b.customer_id;
$$;

revoke all on function public.crm_customer_stats(integer, bigint[]) from public, anon, authenticated;
grant execute on function public.crm_customer_stats(integer, bigint[]) to service_role;

comment on function public.crm_customer_stats(integer, bigint[]) is
  'フクエスCRM: お客様ごとの来店回数・これから・キャンセル・最終来店を DB 側で数える（第1115便）。service_role 専用';

-- 確認（適用後に別途流す）。1行出て、関数の名前が見えれば OK。
-- select proname, prosecdef from pg_proc where proname = 'crm_customer_stats';
