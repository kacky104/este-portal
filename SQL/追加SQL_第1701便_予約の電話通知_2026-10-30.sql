-- 第1701便（2026-10-30）: 予約の電話通知（Twilio・050番号）の土台。設計メモ_2026-10-30_予約の電話通知_Twilio.md
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等（再実行しても安全）。
--   ★ コードはまだ何も読まない・書かない（列と表を足すだけ）。PUSH との順番は問わない。
--   ★ 先に pg_cron が ON であること（第1256便で ON 済み）。
--
-- ★ 決めたこと（カッキーさん 2026-10-30）
--   ・有料プラン掲載の店舗なら使える（CRM 不要・料金は有料プランに含める）。店ごとに付ける／付けない。既定は付けない
--   ・かける番号は 1店に1つ（掲載用の salons.phone とは別）
--   ・鳴らす時間帯は店舗様が決める（空なら いつでも）。日をまたぐ時間帯（例 10:00〜03:00）も可
--   ・再発信は店舗様が選ぶ。既定はオフ。オンなら 出ない・話中・失敗 のとき 3分後にもう1回（合計2回まで）
--     留守電に入った回は「つながった」扱いなので、かけ直さない（携帯に着信履歴は残る）
--   ・留守電判定（AMD）と「1を押してください」は使わない（confirmed_at は後で付ける場合のための空き列）
--   ・発信の記録は 90 日で行ごと消す
-- ★ 守り
--   ・booking_calls は RLS 有効・anon/authenticated は全部閉じる。読み書きは service_role（Server Action・webhook・cron）だけ
--   ・Twilio の Auth Token などは DB に置かない（Vercel の環境変数だけ）

-- 1) salons に設定の列
alter table public.salons add column if not exists booking_call_enabled boolean not null default false;
alter table public.salons add column if not exists booking_call_tel     text;
alter table public.salons add column if not exists booking_call_start   time;      -- 鳴らしてよい時間帯の始め（JST）
alter table public.salons add column if not exists booking_call_end     time;      -- 終わり（JST）。start > end なら日をまたぐ
alter table public.salons add column if not exists booking_call_retry   boolean not null default false;

-- 番号は数字だけ・0 始まり 10〜11 桁（送るときに +81 に直す）
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'salons_booking_call_tel_chk') then
    alter table public.salons add constraint salons_booking_call_tel_chk
      check (booking_call_tel is null or booking_call_tel ~ '^0[0-9]{9,10}$');
  end if;
  -- 時間帯は 両方空（いつでも）か 両方あり・同じ時刻は不可
  if not exists (select 1 from pg_constraint where conname = 'salons_booking_call_hours_chk') then
    alter table public.salons add constraint salons_booking_call_hours_chk
      check ((booking_call_start is null and booking_call_end is null)
          or (booking_call_start is not null and booking_call_end is not null and booking_call_start <> booking_call_end));
  end if;
end $$;

comment on column public.salons.booking_call_enabled is '予約の電話通知を使う（第1701便）';
comment on column public.salons.booking_call_tel     is '予約の電話通知でかける番号（数字のみ・0始まり）。掲載用の phone とは別（第1701便）';
comment on column public.salons.booking_call_start   is '電話通知を鳴らしてよい時間帯の始め（JST）。null＝いつでも（第1701便）';
comment on column public.salons.booking_call_end     is '電話通知を鳴らしてよい時間帯の終わり（JST）。start > end は日をまたぐ（第1701便）';
comment on column public.salons.booking_call_retry   is '出ない・話中・失敗のとき3分後にもう1回かける（留守電はかけ直さない）（第1701便）';

-- 2) 発信の記録
create table if not exists public.booking_calls (
  id               bigint generated always as identity primary key,
  salon_id         integer     not null references public.salons(id) on delete cascade,
  kind             text        not null default 'booking' check (kind in ('booking', 'test')),
  to_tel           text        check (to_tel is null or to_tel ~ '^0[0-9]{9,10}$'),
  attempt          smallint    not null default 1 check (attempt between 1 and 5),
  call_sid         text        unique check (call_sid is null or call_sid ~ '^CA[0-9a-f]{32}$'),
  status           text        not null default 'queued'
                   check (status in ('queued','initiated','ringing','in-progress','completed','busy','no-answer','failed','canceled','skipped')),
  skip_reason      text        check (skip_reason is null or skip_reason in ('off','no_tel','hours','limit','global_limit','disabled','not_new','error')),
  duration_sec     integer     check (duration_sec is null or duration_sec >= 0),
  price            numeric(10,4),                 -- Twilio が返す料金（返ってこない回は null）
  price_unit       text,
  error            text        check (error is null or char_length(error) <= 500),
  next_attempt_at  timestamptz,                   -- 再発信の予定（null＝予定なし）
  confirmed_at     timestamptz,                   -- 「1を押す」を付けた場合の受け取り時刻（今は使わない）
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- booking_id は salon_bookings.id と同じ型で足す（予約を消しても記録は残す＝空に戻す）
do $$
declare t text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'booking_calls' and column_name = 'booking_id') then
    select format_type(a.atttypid, a.atttypmod) into t
      from pg_attribute a where a.attrelid = 'public.salon_bookings'::regclass and a.attname = 'id';
    execute format('alter table public.booking_calls add column booking_id %s references public.salon_bookings(id) on delete set null', t);
  end if;
end $$;

create index if not exists booking_calls_salon_created_idx on public.booking_calls (salon_id, created_at desc);
create index if not exists booking_calls_booking_idx       on public.booking_calls (booking_id);
create index if not exists booking_calls_next_idx          on public.booking_calls (next_attempt_at) where next_attempt_at is not null;
create index if not exists booking_calls_created_idx       on public.booking_calls (created_at);   -- 上限の数え上げ・掃除

comment on table public.booking_calls is
  E'予約の電話通知: 発信の記録（第1701便）。かけなかった回も skipped で残す。90 日で行ごと消す（booking_calls_purge）。★ service_role 専用。';

-- updated_at を自動で
create or replace function public.booking_calls_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists booking_calls_touch on public.booking_calls;
create trigger booking_calls_touch before update on public.booking_calls
  for each row execute function public.booking_calls_touch();

-- 3) RLS（全部閉じる）
alter table public.booking_calls enable row level security;
revoke all on public.booking_calls from anon, authenticated;

-- 4) 90 日で消す（毎日 4:20 JST ＝ 前日 19:20 UTC）。★ crm-cti-purge（4:00）とずらす
create or replace function public.booking_calls_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cut timestamptz := now() - interval '90 days';
  n integer;
begin
  delete from public.booking_calls where created_at < cut;
  get diagnostics n = row_count;
  return jsonb_build_object('calls', n, 'cut', cut);
end $$;
revoke all on function public.booking_calls_purge() from public, anon, authenticated;

select cron.schedule(
  'booking-calls-purge',             -- 同じ名前なら上書き（何度流しても1つだけ）
  '20 19 * * *',                     -- 毎日 19:20 UTC ＝ 毎日 4:20 JST
  $$select public.booking_calls_purge();$$
);

-- 確認用（適用後に別途流す）:
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema='public' and table_name='salons' and column_name like 'booking_call%' order by column_name;   -- 5行
--   select count(*) from public.booking_calls;                                                                         -- 0
--   select jobname, schedule from cron.job where jobname = 'booking-calls-purge';                                       -- 1行
--   select count(*) from public.salons where booking_call_enabled;                                                     -- 0（全店オフのまま）
