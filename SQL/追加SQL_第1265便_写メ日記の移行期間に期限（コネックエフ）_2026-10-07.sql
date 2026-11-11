-- 追加SQL 第1265便（2026-10-07）: 写メ日記の「移行期間」に期限を付ける（コネックエフに切り替えた店）
--
-- ■ 何のためか（カッキーさんの決定）
--   コネックエフに切り替えた店は駅ちかを読まないが、写メ日記だけは例外にする。
--     ・切り替えてから30日間は「移行期間」。セラピストがフクエスで1度写メ日記を投稿するまでは、
--       駅ちかに書いた写メ日記もフクエスに取り込む（15分ごと・見分けは第1140便と同じ）。
--     ・30日を過ぎたら、駅ちかへ見に行くのをやめる（ログインも0回）。
--     ・店舗様がコネックエフの「写メ日記転送」で「14日間延長する」を何回でも押せる（押すたびに連携の記録に残る）。
--   この列に【期限の時刻】を入れる。「◯月◯日まで」＝その翌日 0:00（日本時間）。
--   ★ フクエスリンクの店（切り替えていない店）は、この列を見ない＝「フクエスで書く」に期限は無い。
--
-- ■ 順番   ★ SQL Editor は複数の文を流すと最後の結果しか出ない → 【1】【2】を別々に流す
--   ① 【1】を流す（列を足すだけ。どの店の動きも変わらない）
--   ② 【2】を流す（ラビリンス様の期限を入れる。★ まだ何も動かない＝いまのコードはこの列を読まない）
--   ③ push する。★ デプロイされた時点から、ラビリンス様の駅ちかの写メ日記の取り込みが再開する（15分ごと）。
--      切り替え（10/5 21:41）から止まっていた間の日記は、駅ちかの一覧の1ページ目に残っている分だけ入る。
--   ④ 15〜30分たったら【3】で確かめる。

-- 【1】列を足す（何度流しても同じ）
alter table public.salons
  add column if not exists diary_mixed_until timestamptz;

comment on column public.salons.diary_mixed_until is
  '写メ日記の移行期間の期限（第1265便）。コネックエフに切り替えた店は、この時刻より前だけ駅ちかの写メ日記を取り込む。「◯月◯日まで」＝翌日 0:00 JST。切り替えたときに30日で入り、店舗様が14日ずつ延長できる。切り替えていない店では見ない。';

select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'salons' and column_name = 'diary_mixed_until';


-- 【2】ラビリンス様（salon_id = 6）: 期限を 11/6 まで（＝ 11/7 0:00 日本時間）にする
--   ★ 始まりの時刻（diary_mixed_since・10/3）はそのまま。10/3 以降にフクエスで書いた方が出れば、その方の線になる。
update public.salons
   set diary_mixed_until = '2026-11-07 00:00:00+09'
 where id = 6 and conecf_enabled_at is not null;

select id, name,
       conecf_enabled_at at time zone 'Asia/Tokyo' as switched_jst,
       diary_source,
       diary_mixed_since at time zone 'Asia/Tokyo' as mixed_since_jst,
       diary_mixed_until at time zone 'Asia/Tokyo' as mixed_until_jst
  from public.salons where id = 6;


-- 【3】デプロイのあとで確かめる（読むだけ）: 取り込みが再開したか
--   last_import_jst が、デプロイより後の時刻になっていれば回っている。
-- select s.id, s.name,
--        s.diary_mixed_until at time zone 'Asia/Tokyo' as mixed_until_jst,
--        (select max(d.checked_at) at time zone 'Asia/Tokyo' from public.salon_diary_imports d
--          where d.salon_id = s.id and d.provider = 'ekichika') as last_import_jst,
--        (select count(*) from public.salon_diary_imports d
--          where d.salon_id = s.id and d.provider = 'ekichika' and d.status = 'imported'
--            and d.checked_at >= now() - interval '1 day') as imported_1day,
--        (select count(*) from public.salon_diary_imports d
--          where d.salon_id = s.id and d.provider = 'ekichika' and d.status = 'skipped:fukues_copy'
--            and d.checked_at >= now() - interval '1 day') as copy_1day
--   from public.salons s where s.id = 6;

-- ■ 止めたいとき（運営）: 期限を過去にすれば、次の周から駅ちかへ行かない
-- update public.salons set diary_mixed_until = now() where id = 6;
