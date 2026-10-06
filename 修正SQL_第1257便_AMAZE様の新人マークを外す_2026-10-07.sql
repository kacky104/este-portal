-- 修正SQL 第1257便（2026-10-07・カッキーさん）: AMAZE 〜アメイズ〜 様（salon 14）の新人マークを外す。
--
-- ★ 何が起きたか: 2026-10-06 深夜にフクエスリンク（駅ちかからの取り込み）を始めたとき、在籍の全員が
--     「フクエスに居ない方」として【公開＋新人（NEW）】で作られた（第227便の決まり）。昔から在籍している方まで新人になった。
-- ★ コード側は第1257便で直した（その店の最初の取り込みでは NEW を付けない）。ここは、すでに付いてしまった分を外すだけ。
-- ★ 触るのは therapists の is_new_face / new_face_since の2列・salon 14 だけ。出勤・写真・名前・公開の状態には触れない。
-- ★ 本当の新人の方は、外したあとにマイページのセラピスト編集「新人マークを付ける」で付け直す。
-- ★ 公開ページは最大10分で切り替わる（ISR）。

-- 1) 流す前の確認（店名と人数）
select s.id, s.name,
       count(*) filter (where t.is_new_face) as new_count,
       count(*) as total
from salons s join therapists t on t.salon_id = s.id
where s.id = 14
group by s.id, s.name;

-- 2) 外す
update therapists
   set is_new_face = false, new_face_since = null
 where salon_id = 14 and is_new_face = true;

-- 3) 流したあとの確認（new_count が 0）
select count(*) filter (where is_new_face) as new_count, count(*) as total
from therapists where salon_id = 14;
