-- 第1704便（2026-10-30）: 予約の電話通知の設定（番号など）を salons から、サーバーだけが読める別の表へ移す。
--   ★ 理由：salons は表ごと anon（ログインしていない人）にも読める作り。10/30 に確かめたところ
--     has_column_privilege('anon','public.salons','booking_call_tel','SELECT') = true だった。
--     オーナー様の携帯番号が入ることがあるので、公開 API から読めない表に置く。
--   ★ 第1701便で salons に足した booking_call_* の5列は、まだ誰も使っていない（使っている店 0・Twilio 未開通）ので、そのまま消す。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等（再実行しても安全）。
--   ★ PUSH との順番は問わない（TWILIO_VOICE_ENABLED が入るまで、コードはこの設定を読まない）。

-- 1) 設定の表（1店1行・列の名前は salons のときと同じ）
create table if not exists public.salon_call_settings (
  salon_id              integer     primary key references public.salons(id) on delete cascade,
  booking_call_enabled  boolean     not null default false,
  booking_call_tel      text        check (booking_call_tel is null or booking_call_tel ~ '^0[0-9]{9,10}$'),
  booking_call_start    time,
  booking_call_end      time,
  booking_call_retry    boolean     not null default false,
  updated_at            timestamptz not null default now(),
  check ((booking_call_start is null and booking_call_end is null)
      or (booking_call_start is not null and booking_call_end is not null and booking_call_start <> booking_call_end))
);
comment on table public.salon_call_settings is
  E'予約の電話通知の設定（第1704便）。番号を公開 API から読めないよう salons から分けた。★ service_role 専用（RLS 有効・anon/authenticated は全部閉じる）。';

alter table public.salon_call_settings enable row level security;
revoke all on public.salon_call_settings from anon, authenticated;

create or replace function public.salon_call_settings_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists salon_call_settings_touch on public.salon_call_settings;
create trigger salon_call_settings_touch before update on public.salon_call_settings
  for each row execute function public.salon_call_settings_touch();

-- 2) salons の5列を消す（第1701便で足したもの・中身は全店 既定値のまま）
alter table public.salons drop constraint if exists salons_booking_call_tel_chk;
alter table public.salons drop constraint if exists salons_booking_call_hours_chk;
alter table public.salons
  drop column if exists booking_call_enabled,
  drop column if exists booking_call_tel,
  drop column if exists booking_call_start,
  drop column if exists booking_call_end,
  drop column if exists booking_call_retry;

-- 確認用（適用後に別途流す）。cols 0・settings 0・anon_can_read false なら OK:
--   select
--     (select count(*) from information_schema.columns where table_schema='public' and table_name='salons' and column_name like 'booking_call%') as cols,
--     (select count(*) from public.salon_call_settings) as settings,
--     has_table_privilege('anon','public.salon_call_settings','SELECT') as anon_can_read;
