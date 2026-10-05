-- お店のお知らせ（新着情報）を、週に1回、そのお店のフクエックスの店舗アカウントへ自動投稿する（第1189便・2026-10-05・カッキーさんの指示）
-- ※ Supabase SQL Editor で実行してください（★ コード push より【先】に・冪等＝何度流しても安全）。
--
-- ★ 足すのは、お知らせの自動投稿の進み具合の表（salon_announce_state・第67便）に2つの列だけ。新しい表は無い。
--   x_last_week       … フクエックスへ最後に自動投稿した週（その週の月曜・JST）。「今週はもう出した」の印。
--   x_rotation_index  … フクエックスへ最後に出した1本の位置（0始まり）。★ 毎日の自動投稿の順番（rotation_index）とは別に進む。
-- ★ この表はオーナー様から書けない（ポリシーは SELECT だけ）＝列を足しても、週1回の守りを店舗側から外せない。
-- ★ 列が無いあいだは、周（/api/admin/x-announce-weekly）は状態を読めず、何も投稿しない。

alter table public.salon_announce_state
  add column if not exists x_last_week date,
  add column if not exists x_rotation_index integer;

comment on column public.salon_announce_state.x_last_week is
  E'フクエックスへ最後に自動投稿した週（月曜の日付・JST）。★ 週1回の守り（第1189便）。';
comment on column public.salon_announce_state.x_rotation_index is
  E'フクエックスへ最後に自動投稿した1本の位置（0始まり・null＝まだ無い）。★ 毎日の自動投稿の rotation_index とは別（第1189便）。';

notify pgrst, 'reload schema';

-- ★ 確認（実行しても何も変わらない）: 列が2つ出れば OK
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'salon_announce_state'
   and column_name in ('x_last_week', 'x_rotation_index');
