-- リンクバナー設置報告（/x/banner/report）。fukuX・フクエス本体・フクエスワーク共通の受付窓口。
-- 送信は未ログイン可＝クライアントからは書かせず、Server Action（service_role・src/app/actions/bannerReport.ts）
-- のみが INSERT する。運営は /x/admin「報告」タブで一覧・対応済み管理。
-- 特典: fukuX はお店カード画像+4枚（banner_installed）。本体・ワークの特典は今後拡張。

create table if not exists public.banner_reports (
  id uuid primary key default gen_random_uuid(),
  salon_name text not null check (char_length(salon_name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  sites text[] not null check (cardinality(sites) between 1 and 3), -- 'fukux' | 'fukues' | 'work'
  page_url text not null check (char_length(page_url) between 8 and 500),
  x_handle text check (char_length(x_handle) <= 30), -- fukuX の @ID（任意）
  comment text check (char_length(comment) <= 1000),
  status text not null default 'open' check (status in ('open', 'done')), -- open=未対応 / done=対応済み
  created_at timestamptz not null default now()
);

alter table public.banner_reports enable row level security;

-- INSERT ポリシーは作らない＝anon/authenticated からの直接投稿は不可（service_role は RLS 対象外）。
-- SELECT / UPDATE / DELETE: 最上位管理者（ADMIN_UUID＝src/app/lib/admin.ts と同一値）のみ。
drop policy if exists banner_reports_admin on public.banner_reports;
create policy banner_reports_admin on public.banner_reports
  for all to authenticated
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
