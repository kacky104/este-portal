-- /cast 予約ポップアップの「ニックネーム」（第630便・2026-09-21）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため（カッキーさんの指示）
--   セラピストに電話番号は見せられない。代わりに、セラピストが自分だけのニックネームを
--   お客様に付けておくと、次にそのお客様が予約したとき（名前を変えていても）同じニックネームが出る。
--   ＝「前に入ったことのあるお客様か」がセラピスト本人に分かる。
-- ★ ひも付けの鍵は salon_customers.id（お店の顧客台帳の名寄せ＝電話番号で同じ人）。
--   セラピストには customer_id も電話番号も渡さない。画面は予約を指して保存し、サーバーが予約→customer_id を引く。
-- ★ 1人のセラピスト × 1人のお客様 で1つ。ほかのセラピスト・お店（オーナー）・運営画面には出さない。
-- ★ RLS 有効・anon/authenticated は全部閉じる。読み書きは service_role で、
--   ログイン中の user_id → therapists.id を確かめてから（cast_customer_logs と同じ流儀）。
-- ★ お店が顧客を消す／統合で消えたお客様のニックネームは一緒に消える（on delete cascade）。

create table if not exists public.cast_customer_nicknames (
  therapist_id  bigint      not null references public.therapists(id)      on delete cascade,
  customer_id   bigint      not null references public.salon_customers(id) on delete cascade,
  nickname      text        not null check (char_length(btrim(nickname)) between 1 and 30),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (therapist_id, customer_id)
);

comment on table public.cast_customer_nicknames is
  E'/cast 予約ポップアップのニックネーム（第630便）。セラピスト本人だけのお客様の呼び名。★ service_role 専用（お店・運営には出さない）。';

alter table public.cast_customer_nicknames enable row level security;
revoke all on public.cast_customer_nicknames from anon, authenticated;

-- ★ 確認
-- select count(*) from public.cast_customer_nicknames;
