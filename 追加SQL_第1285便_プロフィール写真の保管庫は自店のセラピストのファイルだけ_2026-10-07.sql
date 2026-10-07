-- 追加SQL 第1285便（2026-10-07）: プロフィール写真の保管庫（therapist-photos）で、消す・上げるを【自店のセラピストのファイルだけ】に絞る
--
-- ■ 何のためか
--   いまの決まり（2026-10-07 に pg_policies で確認）:
--     owners can delete therapist-photos  DELETE  using      (bucket_id = 'therapist-photos' AND auth.role() = 'authenticated')
--     owners can upload therapist-photos  INSERT  with check (bucket_id = 'therapist-photos' AND auth.role() = 'authenticated')
--     anyone can view therapist-photos    SELECT  using      (bucket_id = 'therapist-photos')
--   名前は「owners」だが、中身は【ログインしていること】しか見ていない。
--   → ログインできる人なら誰でも（オーナーに限らない）、どの店のプロフィール写真でも消せる・好きな名前で置ける。
--   画面にそういうボタンは無いが、Supabase を直接呼べば通る。
--   写メ日記の保管庫（diary-images）は、はじめから「そのセラピストの店のオーナーだけ」に絞ってある（20260618_diary_posts_storage.sql）。そろえる。
--
-- ■ 新しい決まり
--   消す・上げるは、ファイル名の先頭の番号（「41-….jpg」の 41）が【自分の店のセラピストの番号】のときだけ。
--   運営のアカウントは今までどおり通す。見る（SELECT）は変えない（公開の写真）。
--   ★ 名前の決まり（番号-…）は、アップロードする場所すべてで確かめた（src/lib/storageOwnPath.ts の頭）。
--   ★ 持ち主の確認は関数（owns_therapist_photo）で行う。非公開のセラピストでも、表の決まり（RLS）に左右されずに確かめられるように。
--
-- ■ 影響しないもの（運営の権限＝service_role で動くので、この決まりの外）
--   駅ちかからの写真の取り込み／セラピスト削除や入れ替えのときの掃除／各サイトへ写真を送るときの読み出し
--
-- ■ 順番   ★ SQL Editor は複数の文を流すと最後の結果しか出ない → 【1】【2】を別々に流す
--   ① 【1】を流す（決まりを入れ替える。流した瞬間から本番に効く）
--   ② 【2】を流して、決まりが3行（DELETE・INSERT が新しい名前、SELECT はそのまま）になっているのを見る
--   ③ コネックエフ（またはマイページ）で、セラピスト1人に写真を1枚上げて保存できることを見る。
--      ★ 上げられなかったら、すぐ【戻すとき】を流す（元の決まりに戻る）。
--   ④ push する（コードの直し＝削除の掃除と、写真の保存の受け口）


-- 【1】決まりを入れ替える（何度流しても同じ）
begin;

create or replace function public.owns_therapist_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid   -- 運営
    or exists (
      select 1
        from public.therapists t
        join public.salons s on s.id = t.salon_id
       where s.owner_id = auth.uid()
         and t.id::text = split_part(object_name, '-', 1)
    );
$$;

comment on function public.owns_therapist_photo(text) is
  'therapist-photos のファイル名（番号-…）の番号が、呼んだ人の店のセラピストか（第1285便）。保管庫の決まり（storage.objects の policy）から呼ぶ。運営は常に true。';

revoke all on function public.owns_therapist_photo(text) from public;
grant execute on function public.owns_therapist_photo(text) to anon, authenticated;

drop policy if exists "owners can delete therapist-photos" on storage.objects;
drop policy if exists "owners can upload therapist-photos" on storage.objects;
drop policy if exists "therapist_photos_delete_own" on storage.objects;
drop policy if exists "therapist_photos_insert_own" on storage.objects;

create policy "therapist_photos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'therapist-photos'
    and auth.role() = 'authenticated'
    and public.owns_therapist_photo(name)
  );

create policy "therapist_photos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'therapist-photos'
    and auth.role() = 'authenticated'
    and public.owns_therapist_photo(name)
  );

commit;


-- 【2】確かめる（読むだけ）: DELETE・INSERT が therapist_photos_…_own に、SELECT は anyone can view のまま
-- select policyname, cmd, roles, qual, with_check
--   from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and (coalesce(qual, '') like '%therapist-photos%' or coalesce(with_check, '') like '%therapist-photos%')
--  order by cmd, policyname;


-- ■ 戻すとき（写真を上げられなくなった等。★ 元の決まり＝ログインしていれば誰でも、に戻る）
-- begin;
-- drop policy if exists "therapist_photos_delete_own" on storage.objects;
-- drop policy if exists "therapist_photos_insert_own" on storage.objects;
-- create policy "owners can upload therapist-photos" on storage.objects for insert
--   with check (bucket_id = 'therapist-photos' and auth.role() = 'authenticated');
-- create policy "owners can delete therapist-photos" on storage.objects for delete
--   using (bucket_id = 'therapist-photos' and auth.role() = 'authenticated');
-- commit;
