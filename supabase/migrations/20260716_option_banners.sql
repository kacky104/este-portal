-- option_banners: /mypage「運営から」タブの「オプション申込」サブタブに並べる有料オプション商品。
-- オーナーは各商品の「申込」ボタンから運営へ申込を送る（申込自体は既存の owner_inquiries を流用するため専用テーブルは無い）。
-- 画像は持たず、商品名・説明・価格（円・整数／null＝「応相談」表示）・表示順・公開フラグのみ。
--
-- ※ Supabase SQL Editor で適用する。これは記録用マイグレーション（再適用しても安全なよう
--    IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT で冪等化）。適用済みSQLと同一スキーマ。
-- ※ admin UUID・共通トリガ関数 public.set_updated_at() は他バナー系テーブルと同一のものを流用。

create table if not exists public.option_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,                        -- 商品名（必須）
  description text,                           -- 説明（任意）
  price integer,                              -- 価格（円・整数）。null は「応相談」として表示。
  display_order integer not null default 0,   -- 表示順（昇順）
  is_active boolean not null default true,    -- 公開フラグ（false はオーナー側に非表示）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_option_banners_order
  on public.option_banners (display_order);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_option_banners_updated_at on public.option_banners;
create trigger trg_option_banners_updated_at
  before update on public.option_banners
  for each row execute function public.set_updated_at();

alter table public.option_banners enable row level security;

-- 公開SELECT: is_active=true のみ（オーナー側の申込一覧用・anon/authenticated 読取）。
drop policy if exists "public_read_active_option_banners" on public.option_banners;
create policy "public_read_active_option_banners"
  on public.option_banners for select
  using (is_active = true);

-- 運営（admin）: 全操作許可（非公開の閲覧・作成・編集・削除）。
drop policy if exists "admin_all_option_banners" on public.option_banners;
create policy "admin_all_option_banners"
  on public.option_banners for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
