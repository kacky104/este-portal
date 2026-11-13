-- 【下書き・まだ実行しない】フクエスCRM 着信ポップ iPhone 方式（③）の土台（2026-11-05）
--   設計メモ_2026-11-05_CTI着信ポップ_iPhone方式.md の 4-1。前提: 追加SQL_第1685便_CTI着信ポップの土台_2026-10-28.sql（実行済み）
--   ★ 実行するのは、受け口（/api/twilio/cti/incoming）を作る便の PUSH 前。Supabase SQL Editor で。冪等（再実行しても安全）。
--
-- ★ 流れ: お客様 → お店の 070 →（携帯会社の無条件転送）→ お店専用の 050（Twilio）→ フクエスの webhook
--   → crm_cti_calls に1行（source='twilio'）→ CRM にポップ（便B の見張りがそのまま拾う）→ TwiML でお店の iPhone アプリを鳴らす
-- ★ 決めたこと（11/5）: 1店1台の iPhone・1店1番号・お客様が切るまで鳴らす・電話通知（予約の Twilio）とは番号も webhook も分ける
-- ★ 守り: 3つの表とも RLS 有効・anon/authenticated は全部閉じる（service_role だけ）。着信の記録は今までどおり 90 日で消える（crm_cti_purge）

-- ── 1) 受付端末に「種類」を足す（android ／ iphone）────────────────
--   ・iPhone も今の端末と同じく QR（トークン）でお店とつなぐ。トークンの扱い（sha256 だけ置く）は同じ
--   ・Twilio の identity（アプリを鳴らす宛先）は列に持たず、アプリ側で `cti-dev-<id>` と決め打ちにする（id から作れるため）
--   ・os_version は iPhone 用（Android は今の android_version のまま）
alter table public.crm_cti_devices add column if not exists kind text not null default 'android';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_cti_devices_kind_chk') then
    alter table public.crm_cti_devices add constraint crm_cti_devices_kind_chk check (kind in ('android', 'iphone'));
  end if;
end $$;
alter table public.crm_cti_devices add column if not exists os_version text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_cti_devices_os_version_chk') then
    alter table public.crm_cti_devices add constraint crm_cti_devices_os_version_chk check (char_length(os_version) <= 20);
  end if;
end $$;
comment on column public.crm_cti_devices.kind is
  'android＝着信番号を送ってくる Android アプリ（D 方式）／iphone＝Twilio で鳴らす iPhone アプリ（③）';

-- ── 2) お店 ↔ 050 の結びつけ（新しい表）──────────────────────
--   ・webhook の To（050）からお店を引く。1店1番号（使っている番号は1店に1つだけ）
--   ・番号を取り直したとき（かけ放題の対象外だった等）は、古い行を is_enabled=false にして新しい行を足す（行は消さない）
--   ・予約の電話通知（TWILIO_VOICE_*）の番号はここに入れない
create table if not exists public.crm_cti_numbers (
  id           bigint generated always as identity primary key,
  salon_id     integer     not null references public.salons(id) on delete cascade,
  e164         text        not null unique check (e164 ~ '^\+8150[0-9]{8}$'),          -- 例 +815012345678
  twilio_sid   text        not null unique check (twilio_sid ~ '^PN[0-9a-f]{32}$'),     -- Twilio の番号の SID
  is_enabled   boolean     not null default true,
  note         text        not null default '' check (char_length(note) <= 100),        -- 運営のメモ（取った日・取り直した理由など）
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists crm_cti_numbers_one_per_salon on public.crm_cti_numbers (salon_id) where is_enabled;
comment on table public.crm_cti_numbers is
  E'フクエスCRM 着信ポップ（iPhone 方式）: お店専用の 050（Twilio）。webhook の To からお店を引く。1店1番号（is_enabled の行）。★ service_role 専用。';

-- ── 3) 着信の記録に「どこから来たか」と Twilio の通話の印を足す ────────
--   ★ source が要る理由: 今は「device_id が null ＝ テスト着信」で見分けている（actions/crmCti.ts）。
--     Twilio の着信も device_id が null なので、そのままだと本物の着信が「テスト」と出てしまう → source で見分ける形にする。
--     ついでに「端末を消したあとの着信の記録」（device_id が null になる）もテストと出なくなる。
--   ・source: 'android'（D 方式のアプリ）／'twilio'（③）／'test'（運営・店舗様のテスト着信ボタン）
--   ・call_sid: Twilio の通話の SID（CA…）。Twilio の再送で二重にしない
--   ・number_id: どの 050 に来たか
--   ・answered_at: 受付が出た時刻（Twilio の知らせで入れる）。★ 11/5 カッキーさん「ポップさえ出ればよい」＋「取りこぼした件数はお願いします」
--     → 列はこれ1つだけ。取りこぼし＝ source='twilio' で answered_at が null の着信（終わった時刻・終わり方は持たない）
alter table public.crm_cti_calls add column if not exists source text not null default 'android';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_cti_calls_source_chk') then
    alter table public.crm_cti_calls add constraint crm_cti_calls_source_chk check (source in ('android', 'twilio', 'test'));
  end if;
end $$;
alter table public.crm_cti_calls add column if not exists call_sid   text;
alter table public.crm_cti_calls add column if not exists number_id  bigint references public.crm_cti_numbers(id) on delete set null;
alter table public.crm_cti_calls add column if not exists answered_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_cti_calls_call_sid_chk') then
    alter table public.crm_cti_calls add constraint crm_cti_calls_call_sid_chk check (call_sid is null or call_sid ~ '^CA[0-9a-f]{32}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_cti_calls_twilio_sid_chk') then
    alter table public.crm_cti_calls add constraint crm_cti_calls_twilio_sid_chk check (source <> 'twilio' or call_sid is not null);
  end if;
end $$;
create unique index if not exists crm_cti_calls_call_sid_uq on public.crm_cti_calls (call_sid) where call_sid is not null;

-- ★ 今までのテスト着信（device_id が null の行）に印を付ける。
--   ※ 端末を消したあとの記録も device_id は null だが、見分けられないので今までどおり「テスト」扱い（90 日で消える）。
--   ※ この SQL から PUSH までのあいだのテスト着信も拾えるよう、PUSH の直後にもう一度この1文だけ流してもよい（何度流しても同じ）。
update public.crm_cti_calls set source = 'test' where device_id is null and source = 'android';

-- ── 4) RLS（全部閉じる）────────────────────────────────
alter table public.crm_cti_numbers enable row level security;
revoke all on public.crm_cti_numbers from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select kind, count(*) from public.crm_cti_devices group by kind;
-- select source, count(*) from public.crm_cti_calls group by source;
-- select * from public.crm_cti_numbers;
-- 取りこぼし（直近7日）: select salon_id, count(*) from public.crm_cti_calls where source = 'twilio' and answered_at is null and received_at > now() - interval '7 days' group by salon_id;
