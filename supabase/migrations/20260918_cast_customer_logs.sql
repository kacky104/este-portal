-- /cast お客様記録帳（第496便・2026-09-18）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
--
-- ★ 何のため
--   セラピスト本人が「いつ・誰を・何回目・一言メモ」を残す手帳。名前で検索できる。
-- ★ 1行 ＝ 1回の接客。回数は「同じ名前の行を日時順に数えた番号」を画面で出す（visit_count が null のとき）。
--   visit_count に数字を入れた行はその数字を優先（アプリ以前からの常連さん用）。
-- ★ 見られるのはセラピスト本人だけ。お店（オーナー）・運営画面には出さない。
--   RLS は有効・anon/authenticated は全部閉じる。読み書きはサーバー処理（service_role）で
--   ログイン中の user_id → therapists.id を確かめてから行う（castImasugu と同じ流儀）。

create table if not exists public.cast_customer_logs (
  id             bigint generated always as identity primary key,
  therapist_id   bigint      not null references public.therapists(id) on delete cascade,
  served_at      timestamptz not null,
  customer_name  text        not null check (char_length(btrim(customer_name)) between 1 and 40),
  visit_count    smallint    check (visit_count is null or visit_count between 1 and 9999),
  memo           text        not null default '' check (char_length(memo) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists cast_customer_logs_therapist_served_idx
  on public.cast_customer_logs (therapist_id, served_at desc);
create index if not exists cast_customer_logs_therapist_name_idx
  on public.cast_customer_logs (therapist_id, customer_name);

comment on table public.cast_customer_logs is
  E'/cast お客様記録帳（第496便）。1行＝1回の接客。★ セラピスト本人専用・service_role 専用（お店・運営には出さない）。';

alter table public.cast_customer_logs enable row level security;
revoke all on public.cast_customer_logs from anon, authenticated;

-- ★ 確認
-- select count(*) from public.cast_customer_logs;
