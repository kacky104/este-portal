-- /cast 報酬帳（第498便・2026-09-18）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
--
-- ★ 何のため
--   セラピスト本人が「その日の1人目・2人目…の金額と一言メモ（60分コース・延長15分 等）」を残す。
--   日の合計・月の合計はこの表を足して画面で出す（合計の列は持たない）。
-- ★ 1行 ＝ 1人ぶん。work_date は営業日（0時〜朝までは前の日に数えるサイトの決め方と同じ）を画面の既定にする。
-- ★ 見られるのはセラピスト本人だけ。お店（オーナー）・運営画面には出さない。
--   RLS 有効・anon/authenticated は全部閉じる。読み書きはサーバー処理（service_role）で本人を確かめてから行う。

create table if not exists public.cast_earnings (
  id            bigint generated always as identity primary key,
  therapist_id  bigint      not null references public.therapists(id) on delete cascade,
  work_date     date        not null,
  position      smallint    not null check (position between 1 and 50),
  amount        integer     not null check (amount between 0 and 9999999),
  memo          text        not null default '' check (char_length(memo) <= 60),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (therapist_id, work_date, position)
);

create index if not exists cast_earnings_therapist_date_idx
  on public.cast_earnings (therapist_id, work_date);

comment on table public.cast_earnings is
  E'/cast 報酬帳（第498便）。1行＝その日のN人目。★ セラピスト本人専用・service_role 専用（お店・運営には出さない）。';

alter table public.cast_earnings enable row level security;
revoke all on public.cast_earnings from anon, authenticated;

-- ★ 確認
-- select count(*) from public.cast_earnings;
