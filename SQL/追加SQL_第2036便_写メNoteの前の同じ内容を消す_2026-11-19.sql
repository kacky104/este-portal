-- 第2036便（2026-11-19・カッキーさん・オイルクエスト様のご要望）写メNote を送れたあと、同じ方の「同じ題名・同じ本文」の前の写メNote を消す
-- ※ Supabase SQL Editor で実行してください（画面上部が「kacky104's Project」＝フクエスか確かめてから）。冪等（再実行しても安全）。
-- ★ PUSH の前でも後でもかまいません（列が無い間は、消す機能がオフのまま動きます）。
--
-- ★ 店ごとの ON/OFF。既定は OFF。コネックエフ「エステ魂オプション」→ 写メNote のチェック「同じ内容の前の写メNote を消す」で切り替えられます。
-- ★ ON の店は、次にその内容を送ったときに、すでに並んでいる同じ内容の分もまとめて消えます（いちばん新しい1件は残る）。

alter table public.conecf_esutama_notes add column if not exists dedupe boolean not null default false;

-- ── オイルクエスト様を ON にする ──
update public.conecf_esutama_notes
   set dedupe = true, updated_at = now()
 where salon_id = (select id from public.salons where name like 'Oil Quest%' order by id limit 1);

-- 確かめ（dedupe が true の行が1つ出れば OK）
select n.salon_id, s.name, n.dedupe, n.auto
  from public.conecf_esutama_notes n join public.salons s on s.id = n.salon_id;
