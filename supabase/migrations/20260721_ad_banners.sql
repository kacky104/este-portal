-- ad_banners: 各ページに差し込む「細い広告バナー」枠（横長の細い帯）。
-- 公開中（is_active=true）の枠から、ページを開くたびにクライアント側でランダム1枚を表示する
-- （TherapistPickupBanner と同じ抽選方式）。クリックで link_url へ遷移。最大20枠は admin の UI 側で制御。
-- 差し込み先（初期）: /therapists・/diary・/reviews・/x-shops の見出し直下。今後 /ranking 等にも展開予定。
--
-- ※ Supabase SQL Editor で適用する。再適用しても安全なよう IF NOT EXISTS / DROP ... IF EXISTS /
--    ON CONFLICT で冪等化。admin UUID・共通トリガ関数 public.set_updated_at() は他バナー系と同一のものを流用。

create table if not exists public.ad_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,                    -- ad-banners バケットの公開URL（PC用・NOT NULL）
  mobile_image_url text,                      -- スマホ用画像（任意）。未設定はスマホでも image_url を表示。
  alt_text text,                              -- 画像 alt（任意）
  link_url text,                              -- リンク先URL（相対 /... または https:// 絶対）。空はリンクなし。
  display_order integer not null default 0,   -- 表示順（昇順）
  is_active boolean not null default true,    -- 公開フラグ（false は公開表示から除外）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ad_banners_order
  on public.ad_banners (display_order);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_ad_banners_updated_at on public.ad_banners;
create trigger trg_ad_banners_updated_at
  before update on public.ad_banners
  for each row execute function public.set_updated_at();

alter table public.ad_banners enable row level security;

-- 公開SELECT: is_active=true のみ（公開ページ用・anon 読取）。
drop policy if exists "public_read_active_ad_banners" on public.ad_banners;
create policy "public_read_active_ad_banners"
  on public.ad_banners for select
  using (is_active = true);

-- 運営（admin）: 全操作許可（非公開の閲覧・作成・編集・削除）。
drop policy if exists "admin_all_ad_banners" on public.ad_banners;
create policy "admin_all_ad_banners"
  on public.ad_banners for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- ── Storage: ad-banners（公開バケット・専用） ──
insert into storage.buckets (id, name, public)
values ('ad-banners', 'ad-banners', true)
on conflict (id) do nothing;

-- SELECT: 全員（公開画像）。
drop policy if exists "public_read_ad_banners" on storage.objects;
create policy "public_read_ad_banners"
  on storage.objects for select
  using (bucket_id = 'ad-banners');

-- INSERT/UPDATE/DELETE: admin のみ。
drop policy if exists "admin_write_ad_banners" on storage.objects;
create policy "admin_write_ad_banners"
  on storage.objects for insert
  with check (
    bucket_id = 'ad-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_update_ad_banners" on storage.objects;
create policy "admin_update_ad_banners"
  on storage.objects for update
  using (
    bucket_id = 'ad-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_delete_ad_banners" on storage.objects;
create policy "admin_delete_ad_banners"
  on storage.objects for delete
  using (
    bucket_id = 'ad-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
