-- コネックエフ: 運営として操作中でも「フクエスお知らせ」「フクエスワーク新着情報」を扱えるようにする（第1963便・2026-11-12・カッキーさん）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため
--   この2つの画面は、ブラウザから直接 DB と画像の箱を読み書きする。今の決まりは「その店の持ち主だけ」が中心で、
--   運営アカウント（63aca737-…）に足りないのは次の3つ。ここで運営アカウントにだけ開ける。
--     1. お知らせ（announcements）の【非公開のものを読む】 … 書く・直す・消すは前から運営に開いている
--     2. お知らせの画像の箱（announcement-images）に【入れる・消す】
--     3. ワーク新着情報の画像の箱（work-news-images）に【入れる・消す】 … 表（work_news）は前から運営に開いている
-- ★ 店舗様・一般の方の決まりは何も変えない（足すだけ）。

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'announcements_select_admin') then
    execute $p$
      create policy "announcements_select_admin" on public.announcements
        for select using (auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'announcement_images_storage_insert_admin') then
    execute $p$
      create policy "announcement_images_storage_insert_admin" on storage.objects
        for insert with check (bucket_id = 'announcement-images' and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
    $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'announcement_images_storage_delete_admin') then
    execute $p$
      create policy "announcement_images_storage_delete_admin" on storage.objects
        for delete using (bucket_id = 'announcement-images' and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
    $p$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'work_news_images_storage_insert_admin') then
    execute $p$
      create policy "work_news_images_storage_insert_admin" on storage.objects
        for insert with check (bucket_id = 'work-news-images' and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
    $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'work_news_images_storage_delete_admin') then
    execute $p$
      create policy "work_news_images_storage_delete_admin" on storage.objects
        for delete using (bucket_id = 'work-news-images' and auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69')
    $p$;
  end if;
end $$;

-- 確認（5行出れば OK）
select schemaname, tablename, policyname, cmd
from pg_policies
where policyname in (
  'announcements_select_admin',
  'announcement_images_storage_insert_admin', 'announcement_images_storage_delete_admin',
  'work_news_images_storage_insert_admin', 'work_news_images_storage_delete_admin'
)
order by tablename, policyname;
