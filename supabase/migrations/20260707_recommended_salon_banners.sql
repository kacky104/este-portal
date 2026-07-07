-- recommended_salon_banners: 本体トップのサロン一覧中（15枚目直下）に表示する「おすすめサロンバナー」。
-- 各行は必ずサロンに紐づき（salon_id NOT NULL・on delete cascade＝サロン削除で自動的に行も消える）、
-- 表示時は admin がアップロードした画像の上にピックアップサロンと同一のオーバーレイ
-- （サロン名／セラピスト丸アイコン／地域バッジ／「詳しく見る」／下部暗色グラデ）を重ねる。
-- 非公開（is_hidden=true）サロンは anon で取得できないため、表示側でオーバーレイなし（画像のみ）にフォールバックする。
--
-- ※ salons.id は integer（uuid ではない）。コードベース全体のFKと一貫させて salon_id も integer。
-- ※ Supabase SQL Editor で適用済み。これは記録用マイグレーション（再適用しても安全なよう
--    IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT で冪等化）。適用済みSQLと同一スキーマ。

create table if not exists public.recommended_salon_banners (
  id uuid primary key default gen_random_uuid(),
  salon_id integer not null references public.salons(id) on delete cascade,
  image_url text not null,                    -- recommended-salon-banners バケットの公開URL（NOT NULL）
  alt_text text,                              -- 画像 alt（任意）
  display_order integer not null default 0,   -- 表示順（昇順）
  is_active boolean not null default true,    -- 公開フラグ（false は公開スライダー非表示）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recommended_salon_banners_order
  on public.recommended_salon_banners (display_order);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_recommended_salon_banners_updated_at on public.recommended_salon_banners;
create trigger trg_recommended_salon_banners_updated_at
  before update on public.recommended_salon_banners
  for each row execute function public.set_updated_at();

alter table public.recommended_salon_banners enable row level security;

-- 公開SELECT: is_active=true のみ（トップのスライダー用・anon 読取）。
drop policy if exists "public_read_active_recommended_banners" on public.recommended_salon_banners;
create policy "public_read_active_recommended_banners"
  on public.recommended_salon_banners for select
  using (is_active = true);

-- 運営（admin）: 全操作許可（非公開の閲覧・作成・編集・削除）。
drop policy if exists "admin_all_recommended_banners" on public.recommended_salon_banners;
create policy "admin_all_recommended_banners"
  on public.recommended_salon_banners for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- ── Storage: recommended-salon-banners（公開バケット・専用） ──
insert into storage.buckets (id, name, public)
values ('recommended-salon-banners', 'recommended-salon-banners', true)
on conflict (id) do nothing;

-- SELECT: 全員（公開画像）。
drop policy if exists "public_read_recommended_salon_banners" on storage.objects;
create policy "public_read_recommended_salon_banners"
  on storage.objects for select
  using (bucket_id = 'recommended-salon-banners');

-- INSERT/UPDATE/DELETE: admin のみ。
drop policy if exists "admin_write_recommended_salon_banners" on storage.objects;
create policy "admin_write_recommended_salon_banners"
  on storage.objects for insert
  with check (
    bucket_id = 'recommended-salon-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_update_recommended_salon_banners" on storage.objects;
create policy "admin_update_recommended_salon_banners"
  on storage.objects for update
  using (
    bucket_id = 'recommended-salon-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_delete_recommended_salon_banners" on storage.objects;
create policy "admin_delete_recommended_salon_banners"
  on storage.objects for delete
  using (
    bucket_id = 'recommended-salon-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
