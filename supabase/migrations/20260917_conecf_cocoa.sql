-- コネックエフ：ココア（風俗求人ココア）店長ブログの自動投稿（第404便・2026-09-17）
-- ※ Supabase SQL Editor で実行してください（コード push より先に適用）。冪等（再実行しても安全）。
--
-- ★★★ この適用だけでは何も変わりません。
--   ・enabled 既定 false。★ 投稿用アドレスも空 → 何も送らない。
--
-- ★★ しくみ（駅ちか新着情報の応用・メール投稿）
--   ・ココアの「店長ブログ」の投稿用メールアドレス（アドレス管理に出るもの）へ、件名＝タイトル・本文＝本文・添付＝写真1枚 を送る
--   ・テンプレを何本か持ち、1日1回、最後に投稿した時刻が古い順に1本ずつ回す（3ヶ月で消えるので新しく保てる）
--   ・時刻は店舗IDから決まる（announceAuto.autoPostMinuteOfDay・選ばせない）
--   ・ココアは駅ちかと同じ ranking-deli 系。★ 写メ日記転送（forwardDiary）と同じメール送信を使う
--   ・読み書きはサーバー（service_role）だけ

-- 1. 設定（店舗に1行）
create table if not exists public.conecf_cocoa_settings (
  salon_id       bigint      primary key references public.salons(id) on delete cascade,
  enabled        boolean     not null default false,
  post_email     text,                    -- ★ ココアの店長ブログ投稿用アドレス（アドレス管理に出るもの）
  last_auto_day  text,                    -- ★ 最後に自動投稿した区切りの日（announceAuto.dayKeyJST・朝6時）
  last_posted_at timestamptz,
  last_result    text,
  updated_at     timestamptz not null default now()
);

comment on table public.conecf_cocoa_settings is
  E'コネックエフのココア店長ブログ自動投稿の設定（第404便）。★ enabled 既定 false。★ post_email はココアの投稿用アドレス（パスワードではないが service_role 専用にする）。★ 1日1回・announceAuto の朝6時区切り。';

alter table public.conecf_cocoa_settings enable row level security;
revoke all on public.conecf_cocoa_settings from anon, authenticated;

-- 2. テンプレ（何本か持って回す）
create table if not exists public.conecf_cocoa_templates (
  id             bigint      generated always as identity primary key,
  salon_id       bigint      not null references public.salons(id) on delete cascade,
  title          text        not null default '',
  body           text        not null default '',
  image_url      text,                    -- ★ 添付する写真（1枚・salon-images バケット）。null なら文だけ
  is_active      boolean     not null default true,
  sort_order     integer     not null default 0,
  last_posted_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.conecf_cocoa_templates is
  E'ココア店長ブログのテンプレ（第404便）。★ 1店に最大10本。★ タイトル全角48・本文全角3333の制限はココア側（画面で見張る）。★ service_role 専用。';

create index if not exists conecf_cocoa_templates_salon_idx on public.conecf_cocoa_templates (salon_id);

alter table public.conecf_cocoa_templates enable row level security;
revoke all on public.conecf_cocoa_templates from anon, authenticated;
