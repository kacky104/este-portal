-- フクエスCRM「女子メモ」（2026-09-19）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため
--   CRM のスケジュールで、セラピストの行に【お店の内部メモ】を出す（風俗CTIv2 の「女子メモ」）。
--   例：「交通費1000」「送迎（姪浜）」「Lルーム NG」「新規は90分まで」など。
-- ★ なぜ therapists の列にしないか
--   therapists は公開SELECT可（ネット予約・セラピスト一覧で使う）。列を足すと内部メモが外から読めてしまう。
--   → 別の表にして、RLS で全部閉じる（読み書きはサーバー処理＝service_role だけ）。
-- ★ 1人1行（セラピストごとに1つ・日付は持たない）。見られるのはその店のオーナー（と運営）だけ。

create table if not exists public.crm_therapist_memos (
  therapist_id bigint      primary key references public.therapists(id) on delete cascade,
  salon_id     integer     not null references public.salons(id) on delete cascade,
  memo         text        not null default '' check (char_length(memo) <= 500),
  updated_at   timestamptz not null default now()
);
create index if not exists crm_therapist_memos_salon_idx on public.crm_therapist_memos (salon_id);

comment on table public.crm_therapist_memos is
  E'フクエスCRMの女子メモ（お店の内部メモ・セラピスト1人1行）。★ service_role 専用。公開の therapists には置かない。';

alter table public.crm_therapist_memos enable row level security;
revoke all on public.crm_therapist_memos from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認
-- select count(*) from public.crm_therapist_memos;
