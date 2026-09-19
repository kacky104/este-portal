-- フクエスCRM 第1段階：店舗の顧客台帳（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため
--   お店（オーナー）が、予約してきたお客様を電話番号で名寄せして
--   分類・女子NG・要注意メモ・利用回数・キャンセル回数（悪質含む）を見られるようにする。
-- ★ 決めたこと（カッキーさん 2026-09-19）
--   ・ネット予約のお客様も自動で台帳に入れる（電話番号で名寄せ）
--   ・悪質キャンセルを記録する（salon_bookings.cancel_bad）
--   ・分類は 一般/会員/常連/VIP/NG の5つ固定
-- ★ 見られるのはその店のオーナー（と運営）だけ。RLS 有効・anon/authenticated は全部閉じる。
--   読み書きはサーバー処理（service_role）でオーナー本人か確かめてから（予約ボードと同じ流儀）。
-- ★ 利用回数・キャンセル数・最終利用は予約から数える（列は持たない）。
-- ★ 無料／有料の棲み分け（カッキーさん 2026-09-19）
--   ・予約ボードは無料のまま。CRM（顧客台帳の閲覧・専用画面 /mypage/crm）は有料。
--   ・有料かどうかは salons.crm_until（この日まで使える・null＝使えない）。/admin で手で入れる。
--   ・無料の店でも名寄せ（記録）はしておく。見せるのは有料の店だけ（サーバー側で判定）。

-- 1) 顧客
create table if not exists public.salon_customers (
  id               bigint generated always as identity primary key,
  salon_id         integer     not null references public.salons(id) on delete cascade,
  name             text        not null default '' check (char_length(name) <= 40),
  name_kana        text        not null default '' check (char_length(name_kana) <= 40),
  category         text        not null default 'general'
                   check (category in ('general','member','regular','vip','ng')),
  member_no        text        not null default '' check (char_length(member_no) <= 20),
  ng_therapist_ids bigint[]    not null default '{}',
  caution_memo     text        not null default '' check (char_length(caution_memo) <= 500),
  memo             text        not null default '' check (char_length(memo) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists salon_customers_salon_idx on public.salon_customers (salon_id, updated_at desc);
create index if not exists salon_customers_salon_name_idx on public.salon_customers (salon_id, name);

-- 2) 電話番号（1人に複数可・店の中で重複不可）。数字のみ（normalizePhone 済み）で持つ。
create table if not exists public.salon_customer_phones (
  id          bigint generated always as identity primary key,
  customer_id bigint  not null references public.salon_customers(id) on delete cascade,
  salon_id    integer not null references public.salons(id) on delete cascade,
  phone       text    not null check (phone ~ '^[0-9]{10,13}$'),
  created_at  timestamptz not null default now(),
  unique (salon_id, phone)
);
create index if not exists salon_customer_phones_customer_idx on public.salon_customer_phones (customer_id);

-- 3) 予約に顧客と悪質キャンセルを足す
alter table public.salon_bookings add column if not exists customer_id bigint
  references public.salon_customers(id) on delete set null;
alter table public.salon_bookings add column if not exists cancel_bad boolean not null default false;
create index if not exists salon_bookings_customer_idx on public.salon_bookings (customer_id, slot_start desc);

-- 3.5) 有料CRMの利用期限（null＝未契約）
alter table public.salons add column if not exists crm_until date;
comment on column public.salons.crm_until is
  E'フクエスCRM（有料）の利用期限。この日（JST）まで使える。null＝未契約。/admin で設定。';

-- 4) RLS（全部閉じる）
alter table public.salon_customers enable row level security;
alter table public.salon_customer_phones enable row level security;
revoke all on public.salon_customers from anon, authenticated;
revoke all on public.salon_customer_phones from anon, authenticated;

comment on table public.salon_customers is
  E'店舗の顧客台帳（フクエスCRM第1段階）。★ service_role 専用・オーナー本人チェックはサーバー側。';

-- 5) 既存の予約をひも付け（電話番号が 10〜13桁の数字になるものだけ）
--    同じ店・同じ番号は1人にまとめる。名前は一番新しい予約の customer_name。
do $$
declare r record; cid bigint;
begin
  for r in
    select salon_id, tel,
           (array_agg(customer_name order by slot_start desc))[1] as nm
    from (
      select salon_id, slot_start, coalesce(customer_name,'') as customer_name,
             regexp_replace(translate(coalesce(customer_tel,''),'０１２３４５６７８９','0123456789'),'[^0-9]','','g') as tel
      from public.salon_bookings
      where customer_id is null
    ) b
    where tel ~ '^[0-9]{10,13}$'
    group by salon_id, tel
  loop
    select customer_id into cid from public.salon_customer_phones where salon_id = r.salon_id and phone = r.tel;
    if cid is null then
      insert into public.salon_customers (salon_id, name) values (r.salon_id, left(r.nm, 40)) returning id into cid;
      insert into public.salon_customer_phones (customer_id, salon_id, phone) values (cid, r.salon_id, r.tel);
    end if;
    update public.salon_bookings
       set customer_id = cid
     where salon_id = r.salon_id and customer_id is null
       and regexp_replace(translate(coalesce(customer_tel,''),'０１２３４５６７８９','0123456789'),'[^0-9]','','g') = r.tel;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.salon_customers;
-- select id, name, crm_until from public.salons where crm_until is not null;
-- select count(*) filter (where customer_id is not null) as linked, count(*) as all_bookings from public.salon_bookings;
