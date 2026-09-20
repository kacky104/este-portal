-- フクエスCRM：解約の90日後に店舗データを消す・規約への同意の記録（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
-- ※ 20260920_crm_purge_old_data.sql（5年で消す）を実行済みの前提。その関数に「解約90日」を足し、毎日動かす形に変える。
--
-- ★ 決めたこと（カッキーさん 2026-09-20・利用規約 第8条）
--   契約が終わったら90日のあいだ店舗データを残し、そのあと消す。そのあいだに再契約すれば元どおり。
--   予約（予約ボード＝無料のもの）は消さない。顧客とのひも付け（customer_id）は外れる。
-- ★ 契約が終わった日を覚える：/admin で CRM を OFF にすると crm_until が null になり日付が消えるため、
--   salons.crm_ended_on を足し、トリガーで自動で入れる（ON に戻すと空に戻る）。
-- ★ 規約への同意：crm_terms_agreements（店舗×規約の版ごとに1行・誰がいつ）。

-- 1) 契約が終わった日・消した日
alter table public.salons add column if not exists crm_ended_on date;
alter table public.salons add column if not exists crm_data_purged_at timestamptz;

create or replace function public.salons_track_crm_end()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.crm_until is null and old.crm_until is not null then
    new.crm_ended_on := (now() at time zone 'Asia/Tokyo')::date;   -- OFF にした日
  elsif new.crm_until is not null and new.crm_until >= (now() at time zone 'Asia/Tokyo')::date then
    new.crm_ended_on := null;                                        -- 再契約（ON）
    new.crm_data_purged_at := null;
  end if;
  return new;
end $$;

drop trigger if exists salons_track_crm_end on public.salons;
create trigger salons_track_crm_end
  before update of crm_until on public.salons
  for each row execute function public.salons_track_crm_end();

-- 2) オーナーが自分で変えられない列に足す（運営だけの列の見張りを更新）
create or replace function public.salons_guard_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    return new;
  end if;
  if new.crm_until          is distinct from old.crm_until
  or new.jobs_enabled       is distinct from old.jobs_enabled
  or new.listing_plan       is distinct from old.listing_plan
  or new.show_on_top        is distinct from old.show_on_top
  or new.is_hidden          is distinct from old.is_hidden
  or new.crm_ended_on       is distinct from old.crm_ended_on
  or new.crm_data_purged_at is distinct from old.crm_data_purged_at then
    raise exception 'この項目は運営だけが変更できます' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists salons_guard_admin_columns on public.salons;
create trigger salons_guard_admin_columns
  before update of crm_until, jobs_enabled, listing_plan, show_on_top, is_hidden, crm_ended_on, crm_data_purged_at on public.salons
  for each row execute function public.salons_guard_admin_columns();

-- 3) 規約への同意の記録
create table if not exists public.crm_terms_agreements (
  id          bigint generated always as identity primary key,
  salon_id    integer not null references public.salons(id) on delete cascade,
  version     text    not null check (char_length(version) between 1 and 20),
  agreed_by   uuid,
  user_agent  text    not null default '' check (char_length(user_agent) <= 300),
  agreed_at   timestamptz not null default now(),
  unique (salon_id, version)
);
alter table public.crm_terms_agreements enable row level security;
revoke all on public.crm_terms_agreements from anon, authenticated;
comment on table public.crm_terms_agreements is E'フクエスCRM：利用規約・顧客データの取り扱いへの同意（店舗×版）。★ service_role 専用。';

-- 4) 解約した店の店舗データを消す（契約が終わって90日たった店）
create or replace function public.crm_purge_ended_salons()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  n integer := 0;
  today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  for s in
    select id from public.salons
     where crm_data_purged_at is null
       and (
         (crm_until is null and crm_ended_on is not null and crm_ended_on <= today - 90)
         or (crm_until is not null and crm_until <= today - 90)
       )
  loop
    delete from public.crm_consents        where salon_id = s.id;
    delete from public.crm_room_tokens     where salon_id = s.id;
    delete from public.crm_money_moves     where salon_id = s.id;
    delete from public.crm_pay_confirms    where salon_id = s.id;
    delete from public.crm_daily_reports   where salon_id = s.id;
    delete from public.crm_price_items     where salon_id = s.id;
    delete from public.crm_therapist_memos where salon_id = s.id;
    delete from public.crm_work_days       where salon_id = s.id;
    delete from public.crm_work_ends       where salon_id = s.id;
    delete from public.crm_settings        where salon_id = s.id;
    delete from public.salon_customers     where salon_id = s.id;   -- 電話番号も一緒に消える・予約の customer_id は空になる
    update public.salons set crm_data_purged_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.crm_purge_ended_salons() from public, anon, authenticated;

-- 5) 5年の片づけに「解約90日」を足す（関数を作り直す）
create or replace function public.crm_purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cut timestamptz := now() - interval '5 years';
  n_consents integer;
  n_customers integer;
  n_bookings integer;
  n_salons integer;
begin
  delete from public.crm_consents where created_at < cut;
  get diagnostics n_consents = row_count;

  delete from public.salon_customers c
   where c.created_at < cut
     and c.updated_at < cut
     and not exists (select 1 from public.salon_bookings b where b.customer_id = c.id and b.slot_start >= cut);
  get diagnostics n_customers = row_count;

  update public.salon_bookings
     set customer_name = '削除済み', customer_tel = '0000000000', note = null
   where slot_start < cut and customer_tel is distinct from '0000000000';
  get diagnostics n_bookings = row_count;

  n_salons := public.crm_purge_ended_salons();

  return jsonb_build_object('consents', n_consents, 'customers', n_customers, 'bookings', n_bookings, 'ended_salons', n_salons, 'cut', cut);
end $$;
revoke all on function public.crm_purge_old_data() from public, anon, authenticated;

-- 6) 毎日 3:00 JST に変える（90日を過ぎた日に消すため。対象が無ければ一瞬で終わる）
select cron.schedule('crm-purge-old-data', '0 18 * * *', $$select public.crm_purge_old_data();$$);

notify pgrst, 'reload schema';

-- ★ 確認
select jobname, schedule, active from cron.job where jobname = 'crm-purge-old-data';   -- 0 18 * * * ・true
-- いま消える対象になる店が無いこと（0行ならOK）
select id, name, crm_until, crm_ended_on from public.salons
 where crm_data_purged_at is null
   and ((crm_until is null and crm_ended_on is not null and crm_ended_on <= (now() at time zone 'Asia/Tokyo')::date - 90)
     or (crm_until is not null and crm_until <= (now() at time zone 'Asia/Tokyo')::date - 90));
