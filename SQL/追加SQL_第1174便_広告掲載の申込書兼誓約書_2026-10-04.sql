-- 第1174便: 広告掲載 申込書 兼 誓約書（運営 ⇄ 店舗）のサインを残す表（2026-10-04・カッキーさん）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
-- ※ ★ 順番: この SQL を【先に】実行 → そのあと PUSH。（先に PUSH すると /mypage/agreement が「読めませんでした」になる。ほかの画面には影響しない）
--
-- ★ 何を残すか（1行＝1回のサイン）
--   ・どの店が（salon_id）・誰のアカウントで（signed_by）・いつ（signed_at）
--   ・どの版の文面に（version）・その文面の写し（body_text）と、写しが変わっていないことを確かめる値（body_sha256）
--   ・記入欄（店舗名・所在地・電話・メール・法人名・代表者名）
--   ・手書きのサイン（signature_png：data:image/png か webp の文字列。CRM の同意書 crm_consents と同じ持ち方）
--   ・端末の種類（user_agent）と接続元（ip）
-- ★ 出し直し（内容が変わったとき・版が変わったとき）は、前の行を消さずに新しい行を足す（いちばん新しい行が今のもの）。
-- ★ 既存の表は変えない。
-- ★ RLS は全閉（ポリシー無し）。読み書きはサーバー（service_role）だけ：
--     店舗オーナー … 自分の店のぶんだけ（actions/listingAgreement.ts が owner_id を確かめてから読む）
--     運営         … 全店（ADMIN_UUID を確かめてから読む）

create table if not exists public.listing_agreements (
  id              bigint generated always as identity primary key,
  salon_id        integer     references public.salons(id) on delete set null,  -- ★ 店舗を消してもサインの記録は残す（店舗名は salon_name に写してある）
  version         text        not null,
  body_text       text        not null,
  body_sha256     text        not null,
  salon_name      text        not null,
  address         text        not null,
  phone           text        not null,
  email           text        not null,
  company_name    text        not null default '',
  representative  text        not null,
  signature_png   text        not null,
  signed_by       uuid        not null,
  signed_at       timestamptz not null default now(),
  user_agent      text        not null default '',
  ip              text        not null default ''
);

create index if not exists listing_agreements_salon_idx
  on public.listing_agreements (salon_id, signed_at desc);

alter table public.listing_agreements enable row level security;
-- ★ ポリシーは作らない（anon・authenticated からは読めも書けもしない）。

comment on table public.listing_agreements is '広告掲載 申込書 兼 誓約書のサイン（第1174便）。1行＝1回のサイン。出し直しは行を足す。RLS 全閉・service_role だけ';

-- ── 様子を見る（実行しても何も変わらない）──────────────────────────────
-- 店ごとの、いちばん新しいサイン
-- select distinct on (salon_id) salon_id, salon_name, representative, version, signed_at
--   from public.listing_agreements order by salon_id, signed_at desc;
