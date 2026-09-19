-- フクエスCRM：報酬確定と締め（日報）（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（風俗CTIv2 の「報酬確定（青いチェック）」と「締め作業（日報作成）」にあたる）
--   1) 報酬確定：セラピストごとに、その営業日の女子報酬を確定する（手当・交通費などを足し引きできる）。
--   2) 締め：その営業日の売上・報酬・経費・利益を日報として残す。
-- ★ どちらも【そのときの数字を写して】持つ。あとで予約を直しても日報は変わらない
--   （画面で「確定・締めのあとに変更あり」と知らせる。やり直しは取り消して確定・締め直す）。
-- ★ 営業日＝朝6時区切り（その日 6:00〜翌 6:00 に始まる予約）。CRM のスケジュールの日付と同じ。
-- ★ お店の内部情報。RLS で全部閉じる（service_role だけ）。

-- 1) 報酬確定（セラピスト×営業日で1行）
create table if not exists public.crm_pay_confirms (
  salon_id      integer not null references public.salons(id) on delete cascade,
  therapist_id  bigint  not null references public.therapists(id) on delete cascade,
  business_date date    not null,
  booking_count integer not null default 0,          -- 確定したときの本数（キャンセル除く）
  pay_total     integer not null default 0,          -- 確定したときの予約の報酬合計
  allowance     integer not null default 0 check (allowance between -1000000 and 1000000), -- 手当・交通費など（±）
  note          text    not null default '' check (char_length(note) <= 200),
  confirmed_at  timestamptz not null default now(),
  confirmed_by  uuid,
  primary key (salon_id, therapist_id, business_date)
);
create index if not exists crm_pay_confirms_salon_date_idx on public.crm_pay_confirms (salon_id, business_date);

-- 2) 日報（店×営業日で1行）
create table if not exists public.crm_daily_reports (
  salon_id       integer not null references public.salons(id) on delete cascade,
  business_date  date    not null,
  booking_count  integer not null default 0,   -- 本数（キャンセル除く）
  cancel_count   integer not null default 0,
  working_count  integer not null default 0,   -- 出勤人数
  sales          integer not null default 0,   -- 売上（料金合計）
  pay            integer not null default 0,   -- 女子報酬（予約の報酬合計＋確定時の手当）
  expense        integer not null default 0 check (expense between 0 and 100000000), -- 経費（手入力）
  profit         integer not null default 0,   -- 売上 − 報酬 − 経費
  cash_sales     integer not null default 0,   -- うち現金
  memo           text    not null default '' check (char_length(memo) <= 1000),
  closed_at      timestamptz not null default now(),
  closed_by      uuid,
  primary key (salon_id, business_date)
);

comment on table public.crm_pay_confirms is E'フクエスCRMの報酬確定（セラピスト×営業日）。★ service_role 専用。';
comment on table public.crm_daily_reports is E'フクエスCRMの日報（締め）。★ service_role 専用。';

alter table public.crm_pay_confirms enable row level security;
alter table public.crm_daily_reports enable row level security;
revoke all on public.crm_pay_confirms from anon, authenticated;
revoke all on public.crm_daily_reports from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.crm_pay_confirms;
-- select count(*) from public.crm_daily_reports;
