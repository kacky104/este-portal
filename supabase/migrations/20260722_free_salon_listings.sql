-- free_salon_listings: /salons（掲載店舗一覧）のテキスト行（無料掲載枠）。
-- /salons は「掲載中サロン（salons テーブル・自動表示）＋本テーブルの手入力行」を統合した
-- 店名・地域・電話番号のみのシンプルなテキスト一覧。入力は /admin の「無料掲載枠」から行う。
-- area には areas.ts の AREA_ORDER キー（'博多・住吉' 等）を保存し、表示は areaLabel() を通す。
-- ※ Supabase SQL Editor で適用する。再適用しても安全なよう冪等化（IF NOT EXISTS / DROP ... IF EXISTS）。

create table if not exists public.free_salon_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- 店名
  area text not null default '',             -- 地域（AREA_ORDER のキー）
  phone text not null default '',             -- 電話番号（任意・純テキスト表示）
  display_order integer not null default 0,   -- 表示順（同一地域内・昇順）
  is_active boolean not null default true,    -- 公開フラグ（false は /salons に出さない）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_free_salon_listings_order
  on public.free_salon_listings (display_order);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_free_salon_listings_updated_at on public.free_salon_listings;
create trigger trg_free_salon_listings_updated_at
  before update on public.free_salon_listings
  for each row execute function public.set_updated_at();

alter table public.free_salon_listings enable row level security;

-- 公開SELECT: is_active=true のみ（/salons 表示用・anon 読取）。
drop policy if exists "public_read_active_free_salon_listings" on public.free_salon_listings;
create policy "public_read_active_free_salon_listings"
  on public.free_salon_listings for select
  using (is_active = true);

-- 運営（admin）: 全操作許可（非公開の閲覧・作成・編集・削除）。
drop policy if exists "admin_all_free_salon_listings" on public.free_salon_listings;
create policy "admin_all_free_salon_listings"
  on public.free_salon_listings for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
