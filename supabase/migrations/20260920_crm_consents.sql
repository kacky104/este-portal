-- フクエスCRM：来店時の同意書（ペーパーレス）（2026-09-20）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 流れ（カッキーさん 2026-09-20）
--   各部屋に QR を置く → お客様（かセラピスト・お店のタブレット）が読む → 同意書のページ
--   → 最後の「上記の内容をすべて了承します」に☑ → スマホでサイン → セラピストが確認して送信
--   → その部屋のいまの予約に「了承済」とサインが記録される（CRM の予約の詳細で見られる）。
-- ★ 同意は毎回取る。同じ予約でサインし直したら新しいほうを有効にし、前のものは消さずに残す（superseded_at）。
-- ★ 予約が見つからない／2件以上あるときは booking_id を空で残し、CRM の「ひも付け待ち」からスタッフが付ける。
-- ★ 同意した文面は写しで残す（あとで文面を直しても、その日の文面がわかる）。
-- ★ すべてお店の内部情報。RLS で全部閉じる（service_role だけ）。公開ページもサーバー経由でしか触らない。

-- 1) 部屋ごとの QR の合言葉（推測されにくい文字列。作り直すと前の QR は使えなくなる）
create table if not exists public.crm_room_tokens (
  salon_id   integer not null references public.salons(id) on delete cascade,
  room       text    not null check (char_length(room) between 1 and 30),
  token      text    not null unique check (char_length(token) between 16 and 64),
  created_at timestamptz not null default now(),
  primary key (salon_id, room)
);

-- 2) 同意書の文面（お店ごと・設定タブで編集）
alter table public.crm_settings add column if not exists consent_enabled boolean not null default false;
alter table public.crm_settings add column if not exists consent_title   text    not null default '';
alter table public.crm_settings add column if not exists consent_body    text    not null default '';

-- 3) 送られた同意
create table if not exists public.crm_consents (
  id             bigint generated always as identity primary key,
  salon_id       integer not null references public.salons(id) on delete cascade,
  room           text    not null default '',
  therapist_id   bigint  references public.therapists(id) on delete set null,
  business_date  date    not null,
  agreed_title   text    not null default '',
  agreed_body    text    not null default '',                                -- 同意した文面の写し
  signature_png  text    not null check (char_length(signature_png) <= 400000), -- サイン画像（data:image/png;base64,…）
  user_agent     text    not null default '' check (char_length(user_agent) <= 300),
  created_at     timestamptz not null default now(),
  superseded_at  timestamptz                                                   -- サインし直しで古くなった時刻（null＝有効）
);

-- booking_id は salon_bookings.id と同じ型で足す（予約を消したら空に戻す＝ひも付け待ちになる）
do $$
declare t text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_consents' and column_name = 'booking_id') then
    select format_type(a.atttypid, a.atttypmod) into t
      from pg_attribute a where a.attrelid = 'public.salon_bookings'::regclass and a.attname = 'id';
    execute format('alter table public.crm_consents add column booking_id %s references public.salon_bookings(id) on delete set null', t);
  end if;
end $$;

create index if not exists crm_consents_booking_idx on public.crm_consents (salon_id, booking_id);
create index if not exists crm_consents_salon_created_idx on public.crm_consents (salon_id, created_at desc);

comment on table public.crm_room_tokens is E'フクエスCRM：部屋ごとの同意書QRの合言葉。★ service_role 専用。';
comment on table public.crm_consents is E'フクエスCRM：来店時の同意（文面の写し・サイン画像）。★ service_role 専用。個人情報に近いので公開しない。';

alter table public.crm_room_tokens enable row level security;
alter table public.crm_consents enable row level security;
revoke all on public.crm_room_tokens from anon, authenticated;
revoke all on public.crm_consents from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認（2行出れば成功・booking_id の型が salon_bookings.id と同じ）
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'crm_consents' and column_name = 'booking_id')
     or (table_name = 'salon_bookings' and column_name = 'id'));
