-- 運営⇔オーナー連絡機能（/mypage「運営から」タブ＋/admin「オーナー連絡」）
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- 1) owner_notices      : 運営→オーナーのお知らせ。salon_id NULL＝全店舗一斉、指定＝その店舗のみ。
-- 2) owner_notice_reads : 店舗ごとの既読記録（mypage タブの未読バッジ用）。
-- 3) owner_inquiries    : オーナー→運営のお問い合わせ。INSERT は Server Action（actions/ownerInquiry.ts・
--                         ログインオーナーの RLS 経由）＋運営宛メール通知（notifyAdmin）。
--
-- RLS 方針:
--  - 管理者（ADMIN_UUID＝src/app/lib/admin.ts と同一値）は全操作可。
--  - オーナーは「自店舗ぶん」のみ: お知らせSELECT（一斉分は salons.owner_id を持つ人なら可）・
--    既読のSELECT/INSERT・問い合わせのSELECT/INSERT。UPDATE/DELETE は不可（対応状況は運営のみ変更）。

-- ── 1. owner_notices ─────────────────────────────────────────
create table if not exists public.owner_notices (
  id         uuid        primary key default gen_random_uuid(),
  salon_id   int         references salons(id) on delete cascade, -- NULL = 全店舗一斉
  title      text        not null check (char_length(title) between 1 and 100),
  body       text        not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists owner_notices_salon_created_idx
  on public.owner_notices (salon_id, created_at desc);

alter table public.owner_notices enable row level security;

-- 管理者: 全操作
drop policy if exists owner_notices_admin on public.owner_notices;
create policy owner_notices_admin on public.owner_notices
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- オーナー: SELECT のみ。一斉（salon_id IS NULL）はサロンオーナーなら誰でも、
-- 個別は自店舗宛のみ（一般会員 authenticated には一切見えない）。
drop policy if exists owner_notices_select_owner on public.owner_notices;
create policy owner_notices_select_owner on public.owner_notices
  for select to authenticated
  using (
    case
      when salon_id is null then
        exists (select 1 from salons where salons.owner_id = auth.uid())
      else
        exists (select 1 from salons where salons.id = owner_notices.salon_id and salons.owner_id = auth.uid())
    end
  );

-- ── 2. owner_notice_reads ────────────────────────────────────
create table if not exists public.owner_notice_reads (
  notice_id uuid        not null references owner_notices(id) on delete cascade,
  salon_id  int         not null references salons(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (notice_id, salon_id)
);

alter table public.owner_notice_reads enable row level security;

-- 管理者: 全操作（既読状況の確認用）
drop policy if exists owner_notice_reads_admin on public.owner_notice_reads;
create policy owner_notice_reads_admin on public.owner_notice_reads
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- オーナー: 自店舗の既読を SELECT / INSERT（既読の取り消し＝DELETE は不要のため作らない）
drop policy if exists owner_notice_reads_select_owner on public.owner_notice_reads;
create policy owner_notice_reads_select_owner on public.owner_notice_reads
  for select to authenticated
  using (
    exists (select 1 from salons where salons.id = owner_notice_reads.salon_id and salons.owner_id = auth.uid())
  );

drop policy if exists owner_notice_reads_insert_owner on public.owner_notice_reads;
create policy owner_notice_reads_insert_owner on public.owner_notice_reads
  for insert to authenticated
  with check (
    exists (select 1 from salons where salons.id = owner_notice_reads.salon_id and salons.owner_id = auth.uid())
  );

-- ── 3. owner_inquiries ───────────────────────────────────────
create table if not exists public.owner_inquiries (
  id         uuid        primary key default gen_random_uuid(),
  salon_id   int         not null references salons(id) on delete cascade,
  subject    text        not null check (char_length(subject) between 1 and 100),
  body       text        not null check (char_length(body) between 1 and 4000),
  status     text        not null default 'open' check (status in ('open', 'done')), -- open=未対応 / done=対応済み
  created_at timestamptz not null default now()
);

create index if not exists owner_inquiries_salon_created_idx
  on public.owner_inquiries (salon_id, created_at desc);

alter table public.owner_inquiries enable row level security;

-- 管理者: 全操作（一覧・対応済みトグル・削除）
drop policy if exists owner_inquiries_admin on public.owner_inquiries;
create policy owner_inquiries_admin on public.owner_inquiries
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- オーナー: 自店舗の問い合わせを SELECT（送信履歴表示）/ INSERT（送信）。編集・削除は不可。
drop policy if exists owner_inquiries_select_owner on public.owner_inquiries;
create policy owner_inquiries_select_owner on public.owner_inquiries
  for select to authenticated
  using (
    exists (select 1 from salons where salons.id = owner_inquiries.salon_id and salons.owner_id = auth.uid())
  );

drop policy if exists owner_inquiries_insert_owner on public.owner_inquiries;
create policy owner_inquiries_insert_owner on public.owner_inquiries
  for insert to authenticated
  with check (
    exists (select 1 from salons where salons.id = owner_inquiries.salon_id and salons.owner_id = auth.uid())
  );
