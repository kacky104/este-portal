-- オーナー向けよくある質問（/mypage「運営から」タブ内のFAQサブタブ）
-- Supabase ダッシュボードの SQL Editor で実行してください
--
-- /admin「オーナー連絡」で運営が作成・編集・並べ替えし、全オーナーのマイページに共通表示される。
-- RLS 方針は owner_notices と同じ: 管理者（ADMIN_UUID）は全操作可、
-- サロンオーナー（salons.owner_id を持つ authenticated）は SELECT のみ。一般会員には見えない。

create table if not exists public.owner_faqs (
  id         uuid        primary key default gen_random_uuid(),
  question   text        not null check (char_length(question) between 1 and 200),
  answer     text        not null check (char_length(answer) between 1 and 4000),
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists owner_faqs_sort_idx
  on public.owner_faqs (sort_order asc, created_at asc);

alter table public.owner_faqs enable row level security;

-- 管理者: 全操作
drop policy if exists owner_faqs_admin on public.owner_faqs;
create policy owner_faqs_admin on public.owner_faqs
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- オーナー: SELECT のみ（サロンオーナーであれば全FAQを閲覧可）
drop policy if exists owner_faqs_select_owner on public.owner_faqs;
create policy owner_faqs_select_owner on public.owner_faqs
  for select to authenticated
  using (exists (select 1 from salons where salons.owner_id = auth.uid()));
