-- 書類置き場（admin_documents）を審査スタッフにも開放（2026-07-17）。
-- /moderation に書類タブを追加し、審査スタッフ（MODERATOR_UUIDS・src/app/lib/admin.ts と対）も
-- 閲覧・ダウンロード・アップロード・削除の全操作を可能にする。
-- 既存の管理者専用ポリシーを「管理者＋審査スタッフ」の in リストに差し替える（冪等）。
-- ※ スタッフを増減させたら src/app/lib/admin.ts の MODERATOR_UUIDS とこのリストを両方更新すること。

-- ── テーブル（admin_documents） ──
drop policy if exists "admin_all_admin_documents" on public.admin_documents;
create policy "admin_all_admin_documents"
  on public.admin_documents for all
  using (auth.uid() = any (array[
    '63aca737-b399-4fb2-bf92-8a3816955d69',  -- 運営（ADMIN_UUID）
    '2cace8de-0156-4f0d-ac06-675f35a2f774'   -- 審査スタッフ
  ]::uuid[]))
  with check (auth.uid() = any (array[
    '63aca737-b399-4fb2-bf92-8a3816955d69',
    '2cace8de-0156-4f0d-ac06-675f35a2f774'
  ]::uuid[]));

-- ── Storage（admin-documents バケット） ──
drop policy if exists "admin_select_admin_documents" on storage.objects;
create policy "admin_select_admin_documents"
  on storage.objects for select
  using (bucket_id = 'admin-documents'
    and auth.uid() = any (array[
      '63aca737-b399-4fb2-bf92-8a3816955d69',
      '2cace8de-0156-4f0d-ac06-675f35a2f774'
    ]::uuid[]));

drop policy if exists "admin_insert_admin_documents" on storage.objects;
create policy "admin_insert_admin_documents"
  on storage.objects for insert
  with check (bucket_id = 'admin-documents'
    and auth.uid() = any (array[
      '63aca737-b399-4fb2-bf92-8a3816955d69',
      '2cace8de-0156-4f0d-ac06-675f35a2f774'
    ]::uuid[]));

drop policy if exists "admin_update_admin_documents" on storage.objects;
create policy "admin_update_admin_documents"
  on storage.objects for update
  using (bucket_id = 'admin-documents'
    and auth.uid() = any (array[
      '63aca737-b399-4fb2-bf92-8a3816955d69',
      '2cace8de-0156-4f0d-ac06-675f35a2f774'
    ]::uuid[]));

drop policy if exists "admin_delete_admin_documents" on storage.objects;
create policy "admin_delete_admin_documents"
  on storage.objects for delete
  using (bucket_id = 'admin-documents'
    and auth.uid() = any (array[
      '63aca737-b399-4fb2-bf92-8a3816955d69',
      '2cace8de-0156-4f0d-ac06-675f35a2f774'
    ]::uuid[]));
