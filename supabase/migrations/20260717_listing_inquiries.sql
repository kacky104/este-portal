-- listing_inquiries: /listing（掲載について）の掲載お問い合わせフォームの受け皿。
-- 未ログインの一般公開フォームのため、INSERT はサーバーアクション（service_role）経由のみで行い、
-- 公開INSERTポリシーは作らない（PostgREST直叩きのスパムを遮断）。閲覧・管理は運営のみ。
-- 送信時に notifyAdmin で運営宛メールも飛ぶ（テーブルは記録・バックアップ用）。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。

create table if not exists public.listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null,        -- 店舗名
  area text not null,             -- 所在エリア（自由記載）
  contact_name text not null,     -- ご担当者名
  email text not null,            -- 連絡先メール
  phone text,                     -- 電話（任意）
  website text,                   -- 店舗ホームページ等（任意）
  message text,                   -- ご質問・メッセージ（任意）
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists idx_listing_inquiries_created on public.listing_inquiries (created_at desc);

alter table public.listing_inquiries enable row level security;

-- 運営のみ全操作可（公開ポリシーは作らない）。
drop policy if exists "admin_all_listing_inquiries" on public.listing_inquiries;
create policy "admin_all_listing_inquiries"
  on public.listing_inquiries for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
