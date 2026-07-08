-- therapist_pickup_banners: 本体トップ＋全エリアページのサロン一覧中（20枚目直下）に表示する
-- 「セラピストピックアップ枠」。各行はセラピストに紐づき（therapist_id NOT NULL・on delete cascade＝
-- セラピスト削除で自動的に行も消える）、表示は横長バナー画像1枚のみ（タイトル・オーバーレイなし）。
-- 公開中（is_active=true）の枠から、ページを開くたびにクライアント側でランダム1枚を表示する。
-- 非公開（anon で取得不可）セラピストはリンクなし画像のみにフォールバックする。
--
-- ※ therapists.id は integer（uuid ではない）。コードベース全体のFKと一貫させて therapist_id も integer。
-- ※ Supabase SQL Editor で適用する。再適用しても安全なよう IF NOT EXISTS / DROP ... IF EXISTS /
--    ON CONFLICT で冪等化。10枠上限は DB 制約にせず admin の UI 側で制御する。

create table if not exists public.therapist_pickup_banners (
  id uuid primary key default gen_random_uuid(),
  therapist_id integer not null references public.therapists(id) on delete cascade,
  image_url text not null,                    -- therapist-pickup-banners バケットの公開URL（NOT NULL）
  alt_text text,                              -- 画像 alt（任意）
  display_order integer not null default 0,   -- 表示順（昇順）
  is_active boolean not null default true,    -- 公開フラグ（false は公開表示から除外）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_therapist_pickup_banners_order
  on public.therapist_pickup_banners (display_order);

-- updated_at 自動更新（既存の共通トリガ関数 public.set_updated_at を流用）。
drop trigger if exists trg_therapist_pickup_banners_updated_at on public.therapist_pickup_banners;
create trigger trg_therapist_pickup_banners_updated_at
  before update on public.therapist_pickup_banners
  for each row execute function public.set_updated_at();

alter table public.therapist_pickup_banners enable row level security;

-- 公開SELECT: is_active=true のみ（公開ページ用・anon 読取）。
drop policy if exists "public_read_active_therapist_pickup_banners" on public.therapist_pickup_banners;
create policy "public_read_active_therapist_pickup_banners"
  on public.therapist_pickup_banners for select
  using (is_active = true);

-- 運営（admin）: 全操作許可（非公開の閲覧・作成・編集・削除）。
drop policy if exists "admin_all_therapist_pickup_banners" on public.therapist_pickup_banners;
create policy "admin_all_therapist_pickup_banners"
  on public.therapist_pickup_banners for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- ── Storage: therapist-pickup-banners（公開バケット・専用） ──
insert into storage.buckets (id, name, public)
values ('therapist-pickup-banners', 'therapist-pickup-banners', true)
on conflict (id) do nothing;

-- SELECT: 全員（公開画像）。
drop policy if exists "public_read_therapist_pickup_banners" on storage.objects;
create policy "public_read_therapist_pickup_banners"
  on storage.objects for select
  using (bucket_id = 'therapist-pickup-banners');

-- INSERT/UPDATE/DELETE: admin のみ。
drop policy if exists "admin_write_therapist_pickup_banners" on storage.objects;
create policy "admin_write_therapist_pickup_banners"
  on storage.objects for insert
  with check (
    bucket_id = 'therapist-pickup-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_update_therapist_pickup_banners" on storage.objects;
create policy "admin_update_therapist_pickup_banners"
  on storage.objects for update
  using (
    bucket_id = 'therapist-pickup-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_delete_therapist_pickup_banners" on storage.objects;
create policy "admin_delete_therapist_pickup_banners"
  on storage.objects for delete
  using (
    bucket_id = 'therapist-pickup-banners'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
