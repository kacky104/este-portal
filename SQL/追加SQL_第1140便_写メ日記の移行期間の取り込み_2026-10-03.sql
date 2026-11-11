-- 追加SQL 第1140便（2026-10-03）: 写メ日記の「移行期間の取り込み」
--
-- ■ 何のためか
--   店が「写メ日記はフクエスで書く」に切り替えても、セラピストは出勤日に1人ずつ切り替えていく。
--   しばらくのあいだ「フクエスで書く人」と「駅ちかで書く人」が混じる。
--   この列に【移行期間の始まりの時刻】が入っている店は、入口が「フクエスで書く」でも、
--   15分ごとの取り込みを回し、駅ちかで書かれた日記だけをフクエスに取り込む。
--     ・フクエスでまだ1件も書いていないセラピスト … 駅ちかの日記を取り込む
--     ・フクエスで書いたことがあるセラピスト       … その最初の日記より後に駅ちかへ載った日記は取り込まない
--                                                   （フクエスから送ったものの写しとみなす）
--   列が空（null）の店は、今までどおり（「フクエスで書く」の店は取り込まない）。
--
-- ■ 順番
--   ① いま: 下の【1】を実行する（列を足すだけ。どの店の動きも変わらない）。
--   ② ラビリンスを「写メ日記はフクエスで書く」に切り替える【直前】に、下の【2】を実行する。
--      ★ 先に【2】、そのあと画面で切り替える（順番が逆でも数分なら問題ない）。
--   ③ 移行が終わったら【3】を実行する（入れたままでも害は無い）。

-- 【1】列を足す（何度流しても同じ）
alter table public.salons
  add column if not exists diary_mixed_since timestamptz;

comment on column public.salons.diary_mixed_since is
  '写メ日記の移行期間の取り込み（第1140便）。始まりの時刻が入っている店は、入口が fukues でも駅ちかの日記を取り込む（フクエスで書いた日記の写しは、セラピストごとに見分けて取り込まない）。null＝今までどおり。運営が店ごとに入れる。';

-- 確認（列ができたか）
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'salons' and column_name = 'diary_mixed_since';


-- 【2】ラビリンス（salon_id = 6）の移行期間を始める ★ 切り替える直前に、この3行だけを実行する
-- update public.salons set diary_mixed_since = now() where id = 6;
-- select id, name, diary_source, diary_write_pref, diary_mixed_since from public.salons where id = 6;


-- 【3】移行期間を終える ★ 全員がフクエスで書くようになったら
-- update public.salons set diary_mixed_since = null where id = 6;


-- ■ 様子を見るとき（ラビリンス）
--   取り込まなかった写し（フクエスで書いて駅ちかへ送った日記）と、取り込んだ日記の数
-- select status, count(*) from public.salon_diary_imports
--  where salon_id = 6 and provider = 'ekichika' and checked_at >= now() - interval '7 days'
--  group by status order by status;
