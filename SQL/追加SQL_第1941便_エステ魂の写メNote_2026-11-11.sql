-- 第1941便（2026-11-11・カッキーさん）エステ魂の写メNote（ベンリーの「エステ魂【オプション】(【新】写メNote)」をコネックエフへ）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH の前でも後でもかまいません（表が無い間は画面に出ないだけ）
--
-- ★ お店ごとに1行。投稿内容（items）を並べ、決めた間隔で上から順に1件ずつ、選んだセラピストの写メNote に投稿する（代理ログイン）。
--   items = [{ title, body, categoryId('1'〜'6'), therapistId(フクエスのセラピスト番号), images(salon-images の置き場・3枚まで) }, ...]
-- ★ 読み書きはサーバー（service role）だけ。

create table if not exists public.conecf_esutama_notes (
  salon_id      bigint      primary key references public.salons(id) on delete cascade,
  admin_enabled boolean     not null default false,  -- 運営が /admin で ON にした店だけ
  auto          boolean     not null default false,
  items         jsonb       not null default '[]'::jsonb,
  start_min     int         not null default 360,    -- 何時から（朝6時はじまりの分）
  end_min       int         not null default 1800,   -- 何時まで（翌6時＝30時）
  interval_min  int         not null default 90,     -- 何分おき
  next_index    int         not null default 0,      -- 次に送る行（0 はじまり）
  last_at       timestamptz,                         -- 最後に送れた時刻
  read_at       timestamptz,                         -- 最後に始めた時刻（立て続けに始めない）
  last_outcome  text,
  updated_at    timestamptz not null default now()
);
alter table public.conecf_esutama_notes enable row level security;  -- ポリシー無し（サーバーだけ）

-- ── オイルクエスト様: ON にして、ベンリーの6件を写す（★ 自動は OFF のまま。画面で中身を確かめてから自動を入れる）──
--   ★ ベンリーの画面からではなく【スクショから写した】。絵文字・顔文字は見た目で近いものを入れたので、画面で見比べてください。
--   ★ 2件目の本文は3行目から先がスクショに写っていなかった（途中まで）。5件目のカテゴリとセラピストも写っていなかった（日常・未選択にしてある）。
--   ★ セラピストはフクエスの在籍の名前で探す。見つからない行は「未選択」になる（画面で選び直す）。
--   ★ すでに中身がある（items が空でない）ときは上書きしない。
with s as (
  select id from public.salons where name like 'Oil Quest%' order by id limit 1
), t as (
  select name, id from public.therapists where salon_id = (select id from s) and is_active
)
insert into public.conecf_esutama_notes (salon_id, admin_enabled, auto, start_min, end_min, interval_min, items)
select (select id from s), true, false, 360, 1800, 90, jsonb_build_array(
  jsonb_build_object('title', '会いに来てね💗', 'categoryId', '1', 'images', '[]'::jsonb,
    'therapistId', (select id from t where name = 'まゆゆ' limit 1),
    'body', $b1$楽しい思い出作りに来てね(#^^#)
有意義な時間なれるよう頑張るよ(=ﾟωﾟ)ﾉ$b1$),
  jsonb_build_object('title', 'みあです(ᐡ◍>ᴗ<◍)。✧♡', 'categoryId', '1', 'images', '[]'::jsonb,
    'therapistId', (select id from t where name = 'みあ' limit 1),
    'body', $b2$見てくれてありがとう💘
沢山のお兄様と会える事毎日楽しみにお待ちしてます♡$b2$),
  jsonb_build_object('title', '初めましてみあです♡', 'categoryId', '4', 'images', '[]'::jsonb,
    'therapistId', (select id from t where name = 'みみ' limit 1),
    'body', $b3$最近入店したばかりのミミです♡
お昼ごろから夜までの出勤が多いのでお時間のタイミング合えば会いに来てください❤︎

入ったばかりなのに本指名様沢山来てくれて嬉しい💗
すでに来て下さったお兄様もこれから出会うお兄様も仲良くして下さると嬉しいです♡

可愛い可愛いてこんなに言われたことないから恥ずかしい(/ω＼)
でも、、嬉しいです♡　出勤の時会いに来てくださいね(*´ω｀*)
これからよろしくお願い致します🎶$b3$),
  jsonb_build_object('title', '初めましてユユです♡', 'categoryId', '2', 'images', '[]'::jsonb,
    'therapistId', (select id from t where name = 'ゆゆ' limit 1),
    'body', $b4$この度、入店しました(˘ᵕ˘)💕

まだまだ分からないことばかりでドキドキしています…！

少し緊張していますが、皆さんに癒しの時間を過ごしてもらえるように一生懸命頑張ります♡

優しく仲良くしてくれたら嬉しいです🥺💗

これからよろしくお願いします♡$b4$),
  jsonb_build_object('title', '初めましてマユユです♡', 'categoryId', '1', 'images', '[]'::jsonb,
    'therapistId', null,
    'body', $b5$はじめまして🐰

初めてのお仕事で、まだドキドキが止まりません…！

ちゃんとできるかな？って少し不安もあるけど、優しいスタッフさんに教えてもらいながら頑張っています♡

初めて会うお兄さんたちとも、楽しくお話できたらいいな🥰

温かく見守ってくれたら嬉しいです♡$b5$),
  jsonb_build_object('title', 'ミカナです、日記初めてましてです❣', 'categoryId', '2', 'images', '[]'::jsonb,
    'therapistId', (select id from t where name = 'みかな' limit 1),
    'body', $b6$初めましてっ♡♡

入店したばかりで、まだちょっと緊張しちゃうかも…🥺💕

でも仲良くなれたら、いっぱいお話したいです♡

優しくしてくれるお兄さんに出会えたらいいなぁ…♪

新人の私ですが、会いに来てくれたらとっても嬉しいです🐰💗$b6$)
)
where (select id from s) is not null
on conflict (salon_id) do update set admin_enabled = true, items = excluded.items,
  start_min = excluded.start_min, end_min = excluded.end_min, interval_min = excluded.interval_min
  where public.conecf_esutama_notes.items = '[]'::jsonb;

notify pgrst, 'reload schema';

-- ★ 確認（オイルクエスト様の行・件数・セラピストが見つかったか）
-- select n.salon_id, n.admin_enabled, n.auto, jsonb_array_length(n.items) as 件数,
--        (select string_agg(coalesce(x->>'therapistId', '未選択'), ',') from jsonb_array_elements(n.items) x) as セラピスト
--   from public.conecf_esutama_notes n;
