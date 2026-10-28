-- 第1685便（2026-10-28）: フクエスCRM 着信ポップ（CTI・D 方式）の土台。設計メモ_2026-10-28_CTI着信ポップ_D方式.md
--   ★ 受付の Android に入れたフクエスのアプリが「かかってきた番号」を送ってくる → CRM の画面にポップ。
--   ★ Supabase ダッシュボードの SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--   ★ 先に pg_cron が ON であること（第1256便の定期削除で ON 済み）。
--
-- ★ 決めたこと（カッキーさん 2026-10-28）
--   ・端末は1店に1台の想定（複数台でも作りは同じ）
--   ・着信の記録は 90 日で行ごと消す（台帳の 8 年とは別・番号だけの個人情報なので短く）
--   ・非通知の着信も記録に残す（phone は null・hidden_reason に理由）
-- ★ 守り
--   ・トークンの生の値は DB に置かない（sha256 だけ）。/admin で発行した瞬間に1回だけ見せる
--   ・両方の表とも RLS 有効・anon/authenticated は全部閉じる。読み書きは service_role（API と Server Action）だけ
--   ・サーバー → 端末には何も返さない（端末を落としても台帳は漏れない）

-- 1) 受付端末（店舗ごと）
create table if not exists public.crm_cti_devices (
  id               bigint generated always as identity primary key,
  salon_id         integer     not null references public.salons(id) on delete cascade,
  name             text        not null default '受付' check (char_length(name) between 1 and 30),
  token_hash       text        not null unique check (char_length(token_hash) = 64),   -- sha256(hex)
  is_enabled       boolean     not null default true,
  last_seen_at     timestamptz,            -- アプリの生存確認（ping）
  last_call_at     timestamptz,            -- 最後に着信を送ってきた時刻
  app_version      text        not null default '' check (char_length(app_version) <= 40),
  device_model     text        not null default '' check (char_length(device_model) <= 80),
  android_version  text        not null default '' check (char_length(android_version) <= 20),
  created_at       timestamptz not null default now()
);
create index if not exists crm_cti_devices_salon_idx on public.crm_cti_devices (salon_id);
comment on table public.crm_cti_devices is
  E'フクエスCRM 着信ポップ: 受付の Android 端末（第1685便）。token_hash は sha256。生のトークンは発行時に1回だけ見せる。★ service_role 専用。';

-- 2) 着信の記録
create table if not exists public.crm_cti_calls (
  id             bigint generated always as identity primary key,
  salon_id       integer     not null references public.salons(id) on delete cascade,
  device_id      bigint      references public.crm_cti_devices(id) on delete set null,  -- null＝テスト着信（運営・店舗様のボタン）
  phone          text        check (phone is null or phone ~ '^[0-9]{10,13}$'),         -- 数字のみ。非通知・公衆電話は null
  hidden_reason  text        check (hidden_reason is null or hidden_reason in ('withheld','payphone','unknown')),
  event_id       text        not null default gen_random_uuid()::text check (char_length(event_id) between 8 and 64),
  rang_at        timestamptz not null default now(),   -- 端末が鳴った時刻（端末の時計）
  received_at    timestamptz not null default now(),   -- サーバーが受けた時刻
  created_at     timestamptz not null default now(),
  check (phone is not null or hidden_reason is not null)   -- 番号か理由のどちらかはある
);
-- ★ 同じ端末からの同じ着信は1行（アプリの再送で二重にしない）。テスト着信（device_id null）は対象外
create unique index if not exists crm_cti_calls_event_uq on public.crm_cti_calls (device_id, event_id) where device_id is not null;
-- ★ ブラウザは「この店の、この id より後」を 3 秒ごとに聞く
create index if not exists crm_cti_calls_salon_id_idx on public.crm_cti_calls (salon_id, id desc);
create index if not exists crm_cti_calls_received_idx on public.crm_cti_calls (received_at);
comment on table public.crm_cti_calls is
  E'フクエスCRM 着信ポップ: 着信の記録（第1685便）。90 日で行ごと消す（crm_cti_purge）。★ service_role 専用。';

-- 3) RLS（全部閉じる）
alter table public.crm_cti_devices enable row level security;
alter table public.crm_cti_calls   enable row level security;
revoke all on public.crm_cti_devices from anon, authenticated;
revoke all on public.crm_cti_calls   from anon, authenticated;

-- 4) 90 日で消す（毎日 4:00 JST ＝ 前日 19:00 UTC）。★ 第1256便の crm_purge_old_data（8年）とは別の関数・別のジョブ
create or replace function public.crm_cti_purge()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cut timestamptz := now() - interval '90 days';
  n integer;
begin
  delete from public.crm_cti_calls where received_at < cut;
  get diagnostics n = row_count;
  return jsonb_build_object('calls', n, 'cut', cut);
end $$;
revoke all on function public.crm_cti_purge() from public, anon, authenticated;

select cron.schedule(
  'crm-cti-purge',                   -- 同じ名前なら上書き（何度流しても1つだけ）
  '0 19 * * *',                      -- 毎日 19:00 UTC ＝ 毎日 4:00 JST
  $$select public.crm_cti_purge();$$
);

notify pgrst, 'reload schema';

-- ★ 確認（1行ずつ出れば OK）
select jobname, schedule, active from cron.job where jobname = 'crm-cti-purge';
select count(*) as devices from public.crm_cti_devices;
select count(*) as calls from public.crm_cti_calls;
