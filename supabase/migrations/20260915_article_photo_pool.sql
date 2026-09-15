-- 新着情報の【写真の箱】（第373便・2026-09-15）
--
-- ★★★ 文章ごとに写真を持つ形（第172便: salon_article_templates.therapist_ids）をやめ、
--     店舗（＋媒体＋枠）に1つの箱を持つ。★ どの枠（速報NEWS・新人速報・…）から出すときも、
--     この箱から1枚をランダムに選んで送る。（カッキーさん・2026-09-15）
--
--   photo_therapist_ids      … ★ 箱に入っている写真の持ち主（therapists.id）。★ 最大10件。★ 空＝写真に触らない
--   last_photo_therapist_id  … ★ 直前に出した1枚。★ 次に選ぶとき、これと同じは避ける。★ null＝まだ出していない
--
-- ★★ salon_article_templates.therapist_ids / last_photo_therapist_id / ekichika_girl_id は【消さない】。
--   ★ 第373便からは読まない・書かない（★ 新規行は空で埋める）。
--   ★ 戻すときは articlePost.ts / articleTemplates.ts のコメントを見る。

alter table public.salon_article_settings
  add column if not exists photo_therapist_ids     bigint[] not null default '{}',
  add column if not exists last_photo_therapist_id bigint;

comment on column public.salon_article_settings.photo_therapist_ids is
  E'新着情報に付ける写真の箱（therapists.id の並び・最大10件）。★ どの枠から出すときも、ここから1枚をランダムに選ぶ。★ 空なら写真に触らない（駅ちかの写真のまま）。第373便。';

comment on column public.salon_article_settings.last_photo_therapist_id is
  E'直前に新着情報へ付けて出した写真の持ち主（therapists.id）。★ 次に選ぶとき同じ1枚は避ける。★ null はまだ出していない。第373便。';

-- ★ 確かめ方（適用後に別途流す）
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='salon_article_settings'
--      and column_name in ('photo_therapist_ids','last_photo_therapist_id');
--   ★ 2行返れば成功（photo_therapist_ids は ARRAY・既定 '{}'）
