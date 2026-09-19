-- フクエスCRM：セラピストのその日の「出勤情報」（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ スケジュールで名前を押すと出る「出勤情報」に使う（風俗CTIv2 の「出勤情報の編集」にあたる）。
-- ★ 出勤の開始・終了時刻は【ここでは持たない・変えない】（therapist_schedules のまま。サイトと媒体に出る元のため）。
-- ★ 1) crm_work_days（セラピスト×営業日で1行）
--   break_start_min / break_end_min ＝ 休憩（その日 0:00 からの分。翌2:00 は 1560）。無しは null
--   break_memo ＝ 休憩メモ／room ＝ 待機場所（部屋）／attendance ＝ 遅刻・当欠・休ませた
--   transport ＝ 交通費（報酬確定の手当の初期値に入る）
-- ★ 2) crm_settings.rooms ＝ 待機場所（部屋）の一覧（設定タブで作る）
-- ★ お店の内部情報。RLS で全部閉じる（service_role だけ）。

create table if not exists public.crm_work_days (
  salon_id        integer not null references public.salons(id) on delete cascade,
  therapist_id    bigint  not null references public.therapists(id) on delete cascade,
  business_date   date    not null,
  break_start_min integer check (break_start_min is null or break_start_min between 0 and 1860),
  break_end_min   integer check (break_end_min   is null or break_end_min   between 0 and 1860),
  break_memo      text    not null default '' check (char_length(break_memo) <= 100),
  room            text    not null default '' check (char_length(room) <= 30),
  attendance      text    not null default '' check (attendance in ('', 'late', 'absent', 'sent_home')),
  transport       integer not null default 0 check (transport between 0 and 100000),
  updated_at      timestamptz not null default now(),
  primary key (salon_id, therapist_id, business_date)
);

comment on table public.crm_work_days is
  E'フクエスCRMの出勤情報（休憩・待機場所・遅刻当欠・交通費）。セラピスト×営業日。★ service_role 専用。出勤時刻は持たない。';

alter table public.crm_work_days enable row level security;
revoke all on public.crm_work_days from anon, authenticated;

alter table public.crm_settings add column if not exists rooms text[] not null default '{}';

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.crm_work_days;
-- select salon_id, rooms from public.crm_settings;
