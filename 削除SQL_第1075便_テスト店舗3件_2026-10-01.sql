-- 第1075便（2026-10-01）: /admin で非表示の テスト店舗3件を削除する
--   ID 7「tesut 停止」／ID 8「テストオイル 停止」／ID 9「オイルクエスト 停止」
--   ★ ID 10「AROMA FUKUES sample」は消さない。
--
-- ★★ 取り消せない操作。①〜③を順に1つずつ実行し、結果を見てから④へ。

-- ① 対象の確認（3行・名前が合っていること・3件とも is_hidden=true）
select id, name, is_hidden, owner_id
from public.salons
where id in (7, 8, 9)
order by id;

-- ② 店舗を参照しているテーブルと、消える／止まる行の数
--    rule: c=一緒に消える / n=空欄になる / r・a=★削除を止める（1以上なら④は失敗する）
select c.conrelid::regclass as tbl,
       a.attname            as col,
       c.confdeltype        as rule,
       (xpath('/row/n/text()',
         query_to_xml(format('select count(*) as n from %s where %I in (7,8,9)', c.conrelid::regclass, a.attname),
                      false, true, '')))[1]::text::int as rows
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confrelid = 'public.salons'::regclass
order by rows desc, tbl::text;

-- ③ その店舗のセラピストを参照しているテーブル（セラピストが一緒に消えるときの2段目）
select c.conrelid::regclass as tbl,
       a.attname            as col,
       c.confdeltype        as rule,
       (xpath('/row/n/text()',
         query_to_xml(format('select count(*) as n from %s where %I in (select id from public.therapists where salon_id in (7,8,9))',
                             c.conrelid::regclass, a.attname),
                      false, true, '')))[1]::text::int as rows
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f' and c.confrelid = 'public.therapists'::regclass
order by rows desc, tbl::text;

-- ④ 削除（②③の結果をカッキーさんと確認してから）
-- begin;
-- delete from public.salons where id in (7, 8, 9) and is_hidden = true;
-- select id from public.salons where id in (7, 8, 9);   -- 0行なら OK
-- commit;
