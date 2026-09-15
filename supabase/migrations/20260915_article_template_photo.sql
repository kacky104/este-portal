-- 新着情報：文章ごとに写真を1人固定できるようにする（第379便・2026-09-15）
--
-- ★★★ 発端（カッキーさん・2026-09-15）
--   「新人速報、場合によっては速報NEWSや他のカテゴリーでも
--     特定のセラピストの写真を出す必要がある場面があると思います」
--
-- ★★★ 決めたこと（案A）
--   ・写真の決め方は【2段】。★ 文章が指しているならその人、指していなければ店舗の箱からランダム。
--       photo_therapist_id が入っている → **その人で固定**
--       null                            → 店舗の箱（salon_article_settings.photo_therapist_ids）から1枚
--   ・選べるのは【写真があるセラピスト全員】。★ 店舗の箱の10枚に限らない
--       ★ 新人は箱に入っていないことが多い。★ 「先に箱へ入れてから」は手間が1つ増える
--
-- ★★ なぜ therapist_ids（第172便の列）を再利用しないか
--   ★ あちらの意味は「この文章の中で回す複数枚」。★ 第379便の意味は「この1人で固定」。
--   ★★ 意味の違う値を同じ列に入れると、次に読む人が【どちらの決まりか】を読み解けない。
--   → ★ 新しい列を1つ足す。★ therapist_ids は読まないまま残す（第373便の判断のまま）。

alter table public.salon_article_templates
  add column if not exists photo_therapist_id bigint;

comment on column public.salon_article_templates.photo_therapist_id is
  E'この文章のときだけ固定で出す写真の持ち主（therapists.id）。★ null なら店舗の写真の箱からランダム。★ 特定のセラピストを紹介する文章のための指定。第379便。';

-- ★ 確かめ方（適用後に別途流す）
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='salon_article_templates'
--      and column_name='photo_therapist_id';
--   ★ 1行返れば成功
