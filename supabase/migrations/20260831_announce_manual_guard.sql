-- お知らせの「押し直し」を専用の口だけにする（第68便・設計メモ 追記37 §191 守り3）。
-- ※ Supabase SQL Editor で実行してください（★ コード push より先に適用）。冪等。
--
-- ★★★ なぜ要るか —— 塞げていない穴が1つ残っていた
--   /mypage の「再投稿」ボタンは、いままで **画面から直に** announcements.published_at を
--   now() に書き替えていた（オーナー様は RLS で自店の行を UPDATE できる）。
--     ・押した回数の上限が無い
--     ・押した記録もどこにも残らない
--   → ★ フクエスTOPの1枠を、1店が押し続けて占有できる。
--     ★ 「その日に手動があったか」が分からないので、自動配信のスキップ判定も成り立たない（§192）。
--
-- ★★ 守り方は salon_bump（20260728_salon_bump.sql）と同じ形にした。
--   ただし通行証（set_config）ではなく **auth.uid() が無いこと** を通行証にする。
--   ・オーナー様の画面 … auth.uid() = そのユーザー   → 止める
--   ・server action    … service role なので auth.uid() は null → 通す
--   ・運営             … 管理者UUID                  → 通す（運用でずらす必要がある）
--   ★ 通行証を配って回るより、**触れる人が最初から居ない**ほうが短い（追記41 §213 と同じ）。
--
-- ★ 止めるのは published_at を「動かす」ときだけ。
--   題・本文・画像・公開/非公開の保存は今までどおり通る（published_at を触らないため）。
-- ★ 新規追加（INSERT）も今までどおり。書いたものはすぐ出る（§191：新規に待ち時間は置かない）。

create or replace function public.announcements_published_at_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.published_at is distinct from old.published_at
     and auth.uid() is not null
     and auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    raise exception '投稿日時は「再投稿」ボタンからのみ変更できます';
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_published_at_guard on public.announcements;
create trigger announcements_published_at_guard
  before update on public.announcements
  for each row execute function public.announcements_published_at_guard();

-- 確認用（適用後に別途流す）
-- ★ オーナー様のアカウントで /mypage の「保存」が通ること（published_at を触らないので通る）。
-- ★ 直に押し直そうとすると止まること（オーナー様のアカウントで実行。エラーになるのが正しい）:
-- update public.announcements set published_at = now() where id = '（自店のお知らせID）';
