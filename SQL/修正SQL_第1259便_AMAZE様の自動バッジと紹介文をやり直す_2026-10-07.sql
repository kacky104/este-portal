-- 修正SQL 第1259便（2026-10-07・カッキーさん）: AMAZE 〜アメイズ〜 様（salon 14）の、写真が入る前に自動で付いた
--   特徴バッジ・キャッチフレーズ・紹介文を消して、写真が入ってから選び直させる。
--
-- ★ 何が起きたか: 2026-10-06 深夜に取り込みを始めた。駅ちかの写真は1日1回（朝6時台）の周でしか入らないが、
--     自動バッジ（1時間に1回・5人ずつ・1人1回）はサイズだけを材料に先に付き始めた。1人1回なので、写真が入っても選び直されない。
-- ★ コード側は第1259便で直した（写真が無い方は、取り込んでから48時間は待つ）。ここは、すでに付いた分をやり直すだけ。
-- ★★ 流す順番: 【第1259便を push して、デプロイが終わってから】流す。
--     先に流すと、次の1時間の回でまた写真なしのまま付く（1回につき最大5人）。
-- ★ 触るもの（salon 14 だけ・自動の印が付いている方だけ）:
--     ① feature_badges を空に・feature_badges_auto_at を空に → 写真が入った方から、自動で選び直される
--     ② 自動で作った profile_text / catchphrase を空に・profile_copy_auto_at を空に → バッジが付いたあと、自動で作り直される
-- ★ 触らないもの: 自動の印が付いていない方（＝まだ付いていない方・店舗様が自分で入れた方）・新人マーク・出勤・写真・名前。
-- ★ やり直しの進み方: バッジは1時間に5人ずつ・紹介文は1時間に3回×2人ずつ。78名なら1〜2日かけて入る。

-- 0) 流す前の確認（何人ぶん消えるか）
select count(*) filter (where feature_badges_auto_at is not null) as badge_auto,
       count(*) filter (where profile_copy_auto_at is not null)   as copy_auto,
       count(*) as total
from therapists where salon_id = 14;

-- ① 自動で作った紹介文・キャッチを消す（★ バッジより先に。対象は「紹介文を自動で作った印」がある方）
update therapists
   set profile_text = '', catchphrase = '', profile_copy_auto_at = null
 where salon_id = 14 and profile_copy_auto_at is not null;

-- ② 自動で付けたバッジを消す
update therapists
   set feature_badges = '[]'::jsonb, feature_badges_auto_at = null
 where salon_id = 14 and feature_badges_auto_at is not null;

-- ③ 流したあとの確認（badge_auto と copy_auto が 0）
select count(*) filter (where feature_badges_auto_at is not null) as badge_auto,
       count(*) filter (where profile_copy_auto_at is not null)   as copy_auto,
       count(*) as total
from therapists where salon_id = 14;
