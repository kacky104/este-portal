-- フクエスお知らせの【写真の箱】（第775便・2026-09-24・カッキーさん）
--
-- ★ 駅ちか新着情報の写真の箱（salon_article_settings.photo_therapist_ids・第373便）と同じ考え方を、
--   フクエスのお知らせにも付ける。★ 箱はフクエス用に別で持つ（駅ちかとは共用しない・カッキーさんの決定）。
-- ★ 投稿するたび（自動・再投稿・新規公開）に、画像なしのお知らせにだけ箱から1枚を入れる。
--   ★ 自分で付けた画像（announcement-images）は触らない（カッキーさんの決定）。
--   ★ 前回ランダムで入った写真（therapist-photos）は次の投稿で入れ替わる。
--
-- ★ salon_announce_state はサーバ側（service role）しか書けない表。★ 箱の保存も server action から。
--   photo_therapist_ids      … 箱に入っている写真の持ち主（therapists.id）。★ 最大10件。★ 空＝写真に触らない
--   last_photo_therapist_id  … 直前に入れた1枚。★ 次に選ぶとき同じは避ける。★ null＝まだ入れていない

alter table public.salon_announce_state
  add column if not exists photo_therapist_ids     bigint[] not null default '{}',
  add column if not exists last_photo_therapist_id bigint;

comment on column public.salon_announce_state.photo_therapist_ids is
  E'フクエスお知らせに付ける写真の箱（therapists.id の並び・最大10件）。★ 画像なしのお知らせを出すたびに、ここから1枚をランダムに入れる。★ 空なら写真に触らない。第775便。';

comment on column public.salon_announce_state.last_photo_therapist_id is
  E'直前にお知らせへ入れた写真の持ち主（therapists.id）。★ 次に選ぶとき同じ1枚は避ける。★ null はまだ入れていない。第775便。';

-- ★ 確かめ方（適用後に流す）
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='salon_announce_state'
--      and column_name in ('photo_therapist_ids','last_photo_therapist_id');
--   ★ 2行返れば成功（photo_therapist_ids は ARRAY・既定 '{}'）
