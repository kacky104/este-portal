-- 新着情報：1本の文章に写真を何枚も持たせる（第172便・2026-09-06）
--
-- ★★★ 発端（カッキーさん）
--   「同じ文章でいいのです。それに毎回違うセラピストの写真がランダムで載るシステムが欲しい」
--   「新規割引き1,000円とかは明日明後日に内容が変わるものではない。
--     毎日1回同じ内容の投稿に写真は違うのが好まれます」
--   「逆に特定のセラピスト紹介の時は選んだ画像がずっと出続けるようにできる。
--     例えば新人で推しの子を2週間お知らせで上げ続けるなど」
--
--   ★★ つまり【文章と写真は寿命が別】。
--      ★ 文章 … 変えない（新規割引の告知は何日も同じ）
--      ★ 写真 … 毎回変わってほしい
--   ★★★ 私（Claude）は当初「同じ文章を3本登録すればよい」と答えた。★ 間違い。
--      ★ 文章を直すとき3か所直すことになり、★ 一覧に同じ文章が3本並ぶ。


-- ────────────────────────────────────────────────────────────
-- ① 写真を【複数】持つ
-- ────────────────────────────────────────────────────────────
--
-- ★★★ 「1枚固定」と「複数から回す」を**別の設定にしない**。
--   ★ 1枚だけ選べば固定。★ 10枚選べば回る。★ 同じ操作で両方できる。
--   ★★ 設定を増やさないこと自体が、この案件でずっと守っていること（第167便）。

alter table public.salon_article_templates
  add column if not exists therapist_ids jsonb not null default '[]'::jsonb;

comment on column public.salon_article_templates.therapist_ids is
  E'この文章に付ける写真の持ち主（フクエスのセラピストのid・配列）。★ 空配列は「いまの写真のまま」。★ 1件なら固定、2件以上なら出すたびにランダムで1枚（第172便）。';


-- ★ 直前に出した写真。★ 2枚しか選んでいないときに「変わっていない」と見えるのを避けるため
alter table public.salon_article_templates
  add column if not exists last_photo_therapist_id bigint;

comment on column public.salon_article_templates.last_photo_therapist_id is
  E'直前に出した写真の持ち主。★ 次に選ぶとき、これと同じ1枚は避ける。★ null は「まだ出していない」（★ 0と混ぜない）。';


-- ────────────────────────────────────────────────────────────
-- ② いままでの1枚を、配列へ移す
-- ────────────────────────────────────────────────────────────
--
-- ★★ すでに登録されている文章が、この便で**写真を失わない**ようにする。
-- ★ therapist_id が入っている行だけ、[その1件] にする。

update public.salon_article_templates
   set therapist_ids = jsonb_build_array(therapist_id)
 where therapist_id is not null
   and (therapist_ids is null or therapist_ids = '[]'::jsonb);


-- ★★★ 旧 therapist_id はこの便から【読みません】。
--   ★ ただし、この便を戻せるように**残します**。★ 落とすのは次の掃除で。
--   ★★ 2つの正本を作らないため、コード側は therapist_ids しか見ません。
comment on column public.salon_article_templates.therapist_id is
  E'★ 第172便から使っていません（therapist_ids が正本）。★ 戻せるように残しているだけ。★ 読まないこと。';


-- ★ 確かめ方（適用後に別途流す）
--   select id, article_slot, therapist_id, therapist_ids
--     from public.salon_article_templates
--    where salon_id = 6 order by id;
--   ★ therapist_id が入っている行は、therapist_ids が [その番号] になっていれば成功
