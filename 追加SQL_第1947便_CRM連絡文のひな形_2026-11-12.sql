-- フクエスCRM「連絡文のひな形」（第1947便・2026-11-12）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため
--   予約から、女子への予約連絡などの文章をボタン1つでコピーする（風俗CTIv2 の「テンプレート」）。
--   本文の {日付} {コース} などの差し込みは、画面側で予約の中身に置き換える。
-- ★ 決めたこと（2026-11-11 カッキーさん）
--   ・使うかどうかはお店の判断（ひな形が無い店には何も出ない）
--   ・{電話番号} は作らない（セラピストに電話番号を見せない方針）
--   ・送った文章は保存しない（お客様の情報をよけいに残さない）
--   ・支払い方法での切り替え・SMS・ドライバー・住所などは要望があってから
-- ★ 1店に何個でも。見られるのはその店のオーナー（と運営）だけ＝RLS で全部閉じ、読み書きは service_role だけ。

create table if not exists public.crm_message_templates (
  id          bigint generated always as identity primary key,
  salon_id    integer     not null references public.salons(id) on delete cascade,
  name        text        not null check (char_length(name) between 1 and 40),
  body        text        not null default '' check (char_length(body) <= 4000),
  -- 差し込みが空の行を消すか（例: オプションが無い予約では「[オプション]：」の行ごと消す）
  hide_empty_lines boolean not null default true,
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crm_message_templates_salon_idx on public.crm_message_templates (salon_id, sort_order);

comment on table public.crm_message_templates is
  E'フクエスCRMの連絡文のひな形（第1947便）。本文の {差し込み} は画面側で置き換える。★ service_role 専用。';

alter table public.crm_message_templates enable row level security;
revoke all on public.crm_message_templates from anon, authenticated;

notify pgrst, 'reload schema';

-- ★ 確認（0 と出れば表ができている）
select count(*) from public.crm_message_templates;
