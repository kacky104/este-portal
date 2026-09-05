-- 記事に「誰の紹介か」を持たせる（第160便・2026-09-05）
--
-- ★★★ なぜこうしたか（カッキーさんのご質問「投稿と一緒に画像も送れるのか」から）
--   駅ちかの記事の画像は3通り:
--     img_flg=0 + g_image1 … 独自の画像（★ アップロードは記事の保存とは【別の口】。形は未実測）
--     img_flg=1 + girl_id  … 【登録済みの女の子の写真】を使う  ← ★ ここは今日から使える
--     何もしない            … 前の記事の画像がそのまま残る（★ いままではこれ）
--
-- ★★★ そして、名前は【相手の編集ページが出している】。
--   <select name="girl_id"><option value="5232208">さら</option>… が37人ぶん入っている。
--   ★ フクエスの import_cast_id との突き合わせを待たなくても、そのまま選ばせられる。
--   ★★ 私（Claude）は自分のDBから引くことばかり考えて、相手が既に見せているものを見ていなかった。


-- ① 写しに「選べる女の子」を持たせる
--   ★ 一覧には入っていない。★ 編集ページにしかないので、枠の状態を読むときに1枚だけ開いて拾う。
--   ★ null と空配列を分ける: null = まだ読めていない ／ [] = 読めたが1人もいなかった
alter table public.media_article_slots
  add column if not exists girls jsonb;

comment on column public.media_article_slots.girls is
  E'[{id,name}] 駅ちかの編集ページの <select name="girl_id"> から読んだ選択肢。★ null は【まだ読めていない】。★ [] は【読めたが0人】。混ぜないこと。';


-- ② テンプレートに「誰の紹介か」を持たせる
--   ★★ 持つのは【駅ちかの番号】。★ フクエスのセラピストIDではない。
--     ★ 相手の画面が出している選択肢をそのまま使う、が第160便の趣旨。
--     ★ フクエス側のセラピストと結ぶのは、突き合わせが確かめられてから（therapist_id は残してある）。
--   ★★★ null は【いまの写真のまま】。★ 0や空文字と混ぜない。★ 既定は null＝触らない。
alter table public.salon_article_templates
  add column if not exists ekichika_girl_id text;

comment on column public.salon_article_templates.ekichika_girl_id is
  E'駅ちかの girl_id（誰の紹介か）。★ null なら【いまの写真のまま】＝駅ちかの画像に触らない。★ 値が入っていれば img_flg=1 でその人の写真になる。';


-- ★ 確かめ方（適用後に別途流す）
--   select column_name from information_schema.columns
--    where table_schema='public'
--      and ((table_name='media_article_slots' and column_name='girls')
--        or (table_name='salon_article_templates' and column_name='ekichika_girl_id'));
--   ★ 2行返れば成功
