-- 第1995便（2026-11-12・カッキーさん）: 公式HP の「検索ワード」（Google Search Console）
-- ★ 独自ドメインの公式HP を、フクエスのサービスアカウントで Search Console に登録するための表（1店1行）。
--   ・token … Google の「持ち主の確認」用の文字（公式HP のトップに <meta name="google-site-verification"> で出す。公開されてよい文字）
--   ・state … none（まだ）／pending（確認待ち・失敗）／verified（登録済み）
-- ★ fukues.com/hp/〇〇 の公式HP は、もとからフクエスの Search Console に入っているので、この表は要らない（読むだけ）。
-- ★ RLS は全閉じ（service_role だけ）。画面からはサーバーの関数だけが読む。

create table if not exists public.hp_gsc_sites (
  salon_id     integer     primary key references public.salons(id) on delete cascade,
  domain       text        not null check (char_length(domain) between 3 and 253),
  token        text        not null default '' check (char_length(token) <= 200),
  state        text        not null default 'none' check (state in ('none', 'pending', 'verified')),
  last_error   text        not null default '' check (char_length(last_error) <= 500),
  verified_at  timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.hp_gsc_sites enable row level security;
comment on table public.hp_gsc_sites is '公式HP（独自ドメイン）を Search Console に登録した状態（第1995便）。service_role だけ';

-- 確かめる（0行で正しい）
select * from public.hp_gsc_sites;
