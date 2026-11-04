-- シフト提出・シフト管理表（2026-11-04・店舗様のご要望・カッキーさんの決定）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 流れ: セラピストが /cast「シフト提出」で希望を書く → 店がシフト管理表で確定（時間を直して確定も可）
--   → 確定した時点で therapist_schedules（出勤の正本）に書く → サイト・駅ちか・エステ魂へは今までどおり。
-- ★ 却下は無い。確定しなかった希望は「希望」のまま残す（欠勤が出たときの声かけ用）。
-- ★ 部屋数を超える確定はさせない（入れ替え時間を足して数える）。数えるのはアプリ側（確定の瞬間）。
-- ★ 締切なし。確定するまではセラピストが書き直せる。確定した日は本人からは変えられない。
-- ★ 確定後に店が週間スケジュールで直したら、出勤の正本（therapist_schedules）が正。
--   セラピストページでは conf_* と正本を見比べて「お店が変更しました」と出す（列は足さない）。
-- ★ テスト運用はラビリンス様（salon 6）だけ。使える店は環境変数 SHIFT_SALON_IDS（カンマ区切り・all で全店）。
-- ★ お店の内部情報。RLS で全部閉じる（service_role だけ）。ログイン中の本人・店を確かめてから service_role で読む。

-- ── 1) 店の設定（1店1行）─────────────────────────────────
--   period         … 提出する期間 '1w'（来週の月〜日）／'2w'（来週の月〜再来週の日）／'1m'（翌月の1日〜末日）
--   room_count     … 部屋数（0＝未設定＝チェックしない）
--   changeover_min … 入れ替え時間（分）。終わりにこの分を足した時間まで部屋が埋まっているとして数える
create table if not exists public.shift_settings (
  salon_id        integer primary key references public.salons(id) on delete cascade,
  period          text    not null default '1w' check (period in ('1w', '2w', '1m')),
  room_count      integer not null default 0  check (room_count between 0 and 50),
  changeover_min  integer not null default 0  check (changeover_min between 0 and 180),
  updated_at      timestamptz not null default now()
);

comment on table public.shift_settings is
  E'シフト管理表の設定（提出期間・部屋数・入れ替え時間）。★ service_role 専用。';

-- ── 2) シフトの希望と確定（セラピスト×日付で1行）──────────────
--   時刻は crm_work_days と同じ「その日 0:00 からの分」。翌2:00 は 1560。
--   req_*  … セラピストの希望（確定後もそのまま残す＝「希望 21〜02 → 22〜02 で確定」を出すため）
--   conf_* … 店が確定した時間（status='confirmed' のときだけ入る）
create table if not exists public.shift_requests (
  id             bigserial primary key,
  salon_id       integer not null references public.salons(id) on delete cascade,
  therapist_id   bigint  not null references public.therapists(id) on delete cascade,
  work_date      date    not null,
  req_start_min  integer not null check (req_start_min between 0 and 1860),
  req_end_min    integer not null check (req_end_min   between 1 and 1860),
  note           text    not null default '' check (char_length(note) <= 100),
  status         text    not null default 'requested' check (status in ('requested', 'confirmed')),
  conf_start_min integer check (conf_start_min is null or conf_start_min between 0 and 1860),
  conf_end_min   integer check (conf_end_min   is null or conf_end_min   between 1 and 1860),
  confirmed_at   timestamptz,
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (therapist_id, work_date),
  check (req_end_min > req_start_min),
  check (status = 'requested' or (conf_start_min is not null and conf_end_min is not null and conf_end_min > conf_start_min))
);

create index if not exists idx_shift_requests_salon_date on public.shift_requests (salon_id, work_date);

comment on table public.shift_requests is
  E'シフトの希望と確定。確定すると therapist_schedules に書く（アプリ側）。却下は無く、未確定は希望のまま残す。★ service_role 専用。';

alter table public.shift_settings enable row level security;
alter table public.shift_requests enable row level security;
revoke all on public.shift_settings from anon, authenticated;
revoke all on public.shift_requests from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.shift_settings;
-- select count(*) from public.shift_requests;
