-- 退会（会員アカウント削除）で口コミが道連れに消える問題の修正。
--
-- 経緯：therapist_reviews.user_id → auth.users(id) の外部キーが ON DELETE CASCADE だったため、
-- 会員が退会して auth.users の行が消えると、その会員の口コミも連鎖削除されていた
-- （2026-08-03 の退会テストで発生）。口コミは「本文を残して表示名だけ匿名化」が方針なので、
-- 削除ルールを SET NULL に張り替え、user_id を NULL 許容にする。
--
-- 効果：退会すると user_id が NULL になり、profiles も CASCADE で消えるため、
-- src/app/lib/reviews.ts の nickname 解決が外れて表示名が「ゲスト」に落ちる。
-- 口コミ本文・評価は残るので、店舗の口コミ件数・★平均・ランキングは変動しない。
--
-- ⚠ コード側（lib/reviews.ts・moderation/page.tsx）が user_id の NULL を扱えるようになってから
--    適用しても、先に適用しても問題ない（NULL 行は退会が起きるまで発生しないため）。
--    ただし退会機能を本番で使う前に、必ずこの migration を適用しておくこと。
-- Supabase SQL Editor で実行してください。

alter table public.therapist_reviews
  drop constraint if exists therapist_reviews_user_id_fkey;

alter table public.therapist_reviews
  alter column user_id drop not null;

alter table public.therapist_reviews
  add constraint therapist_reviews_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 確認用（実行後に流して on_delete が SET NULL になっていること・is_nullable が YES になっていることを見る）。
-- information_schema は auth スキーマ宛のFKを隠すので、必ず pg_catalog 側で確認すること。
--
-- select con.conname,
--        case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' else con.confdeltype::text end as on_delete
-- from pg_constraint con
-- join pg_class c on c.oid = con.conrelid
-- where c.relname = 'therapist_reviews' and con.contype = 'f';
--
-- select column_name, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'therapist_reviews' and column_name = 'user_id';
