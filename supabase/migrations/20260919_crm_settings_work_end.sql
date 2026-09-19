-- フクエスCRM：設定（スケジュールの表示時間）と「受まで／上がり」（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 1) crm_settings（店ごとに1行）
--   day_start_min / day_end_min ＝ スケジュールの時間軸の始まりと終わり（その日 0:00 からの分）。
--     例：10:00 → 600 ／ 翌5:00 → 1740。始まりは 6:00〜、終わりは 〜翌7:00（1860）まで。
--   default_end_type ＝ セラピストの終わりの時刻の既定のバッジ（'accept'＝受まで ／ 'finish'＝上がり）。
-- ★ 2) crm_work_ends（セラピスト×営業日で1行）
--   その日の終わりの時刻を「受まで（受付まで）」か「上がり（この時間で終わり）」のどちらにするか。
--   行が無い日は crm_settings.default_end_type を使う。
-- ★ お店の内部情報。RLS で全部閉じる（service_role だけ）。

create table if not exists public.crm_settings (
  salon_id         integer primary key references public.salons(id) on delete cascade,
  day_start_min    integer not null default 600  check (day_start_min between 360 and 1800),
  day_end_min      integer not null default 1740 check (day_end_min between 420 and 1860),
  default_end_type text    not null default 'finish' check (default_end_type in ('accept','finish')),
  updated_at       timestamptz not null default now(),
  check (day_end_min > day_start_min)
);

create table if not exists public.crm_work_ends (
  salon_id      integer not null references public.salons(id) on delete cascade,
  therapist_id  bigint  not null references public.therapists(id) on delete cascade,
  business_date date    not null,
  end_type      text    not null check (end_type in ('accept','finish')),
  updated_at    timestamptz not null default now(),
  primary key (salon_id, therapist_id, business_date)
);

comment on table public.crm_settings  is E'フクエスCRMの店ごとの設定（表示時間・終わりの既定のバッジ）。★ service_role 専用。';
comment on table public.crm_work_ends is E'フクエスCRMの「受まで／上がり」（セラピスト×営業日）。★ service_role 専用。';

alter table public.crm_settings  enable row level security;
alter table public.crm_work_ends enable row level security;
revoke all on public.crm_settings  from anon, authenticated;
revoke all on public.crm_work_ends from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select * from public.crm_settings;
-- select count(*) from public.crm_work_ends;
