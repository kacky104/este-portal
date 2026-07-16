-- admin_documents: /admin「書類」タブの書類置き場（PDF・Word）。管理者専用の保管庫。
-- 実ファイルは非公開バケット admin-documents に `{uuid}.{ext}` で保存し（日本語ファイル名による
-- ストレージキー問題を回避）、元のファイル名はこのテーブルで持つ。ダウンロードは authenticated の
-- admin セッションから storage.download() で行う（署名URL不要・RLSで守る）。
-- ※ Supabase SQL Editor で適用する記録用マイグレーション（冪等）。

create table if not exists public.admin_documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,          -- 元のファイル名（表示・ダウンロード名）
  storage_path text not null,     -- admin-documents バケット内のキー（{uuid}.{ext}）
  mime text,                       -- MIMEタイプ（pdf / word 判定用）
  size bigint,                     -- バイト数（表示用）
  created_at timestamptz not null default now()
);

alter table public.admin_documents enable row level security;

-- 管理者のみ全操作可（公開ポリシーは作らない＝オーナー・匿名は一切見えない）。
drop policy if exists "admin_all_admin_documents" on public.admin_documents;
create policy "admin_all_admin_documents"
  on public.admin_documents for all
  using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

-- ── Storage: admin-documents（非公開バケット・管理者専用） ──
insert into storage.buckets (id, name, public)
values ('admin-documents', 'admin-documents', false)
on conflict (id) do nothing;

drop policy if exists "admin_select_admin_documents" on storage.objects;
create policy "admin_select_admin_documents"
  on storage.objects for select
  using (bucket_id = 'admin-documents'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_insert_admin_documents" on storage.objects;
create policy "admin_insert_admin_documents"
  on storage.objects for insert
  with check (bucket_id = 'admin-documents'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_update_admin_documents" on storage.objects;
create policy "admin_update_admin_documents"
  on storage.objects for update
  using (bucket_id = 'admin-documents'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);

drop policy if exists "admin_delete_admin_documents" on storage.objects;
create policy "admin_delete_admin_documents"
  on storage.objects for delete
  using (bucket_id = 'admin-documents'
    and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
