-- salon_intakes: 契約後の新規店舗に一度だけ入力してもらう「初回情報入力フォーム」。
-- 運営が /admin の「新規店舗 入力フォーム発行」で店舗ごとにワンタイムURL（トークン）を発行し、
-- メール/LINE等で送付。店舗は未ログインで /salon-intake/{token} から入力・写真アップ・送信する。
-- 送信で status='submitted' となり再送信不可。有効期限は発行から14日（期限切れは再発行）。
--
-- セキュリティ: RLS ポリシーは運営（ADMIN_UUID）のみ＝anon の直接読み書きは不可。
-- 公開側（フォーム）は Server Action（service_role・src/app/actions/salonIntake.ts）経由のみで、
-- トークン一致＋pending＋期限内を毎回検証する。写真は署名付きアップロードURL方式（ポリシー不要）。

create table if not exists public.salon_intakes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,            -- URLトークン（48桁hex・推測不能）
  label text,                             -- 発行時のメモ（店舗名等・運営用）
  status text not null default 'pending' check (status in ('pending', 'submitted', 'done')),
  expires_at timestamptz not null,
  -- ▼ 店舗の入力内容（submitted 時に埋まる）
  salon_name text,
  area text,
  area2 text,
  address text,
  access text,
  phone text,
  hours text,
  closed_days text,
  price_courses text,
  description text,
  payment_methods text,
  official_url text,
  contact_name text,
  contact_email text,
  note text,
  photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists idx_salon_intakes_token on public.salon_intakes (token);

alter table public.salon_intakes enable row level security;

-- 運営（ADMIN_UUID＝src/app/lib/admin.ts と同一値）のみ全操作可。anon/一般authenticatedはポリシーなし＝不可。
drop policy if exists salon_intakes_admin on public.salon_intakes;
create policy salon_intakes_admin on public.salon_intakes
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- ── Storage: salon-intake-photos（公開読み取りバケット） ──
-- 書き込みポリシーは作らない：アップロードは Server Action が発行する署名付きURL経由のみ
-- （service_role 発行のためRLS対象外）。読み取りは公開（掲載用写真のため公開で問題ない）。
insert into storage.buckets (id, name, public)
values ('salon-intake-photos', 'salon-intake-photos', true)
on conflict (id) do nothing;

drop policy if exists "public_read_salon_intake_photos" on storage.objects;
create policy "public_read_salon_intake_photos"
  on storage.objects for select
  using (bucket_id = 'salon-intake-photos');

-- 削除は運営のみ（/admin の行削除時に写真を掃除する用）。
drop policy if exists "admin_delete_salon_intake_photos" on storage.objects;
create policy "admin_delete_salon_intake_photos"
  on storage.objects for delete
  using (
    bucket_id = 'salon-intake-photos'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
