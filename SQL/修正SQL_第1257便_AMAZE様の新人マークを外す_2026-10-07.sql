-- 修正SQL 第1257〜1258便（2026-10-07・カッキーさん）: AMAZE 〜アメイズ〜 様（salon 14）の新人マークを、駅ちかの印に合わせる。
--
-- ★ 何が起きたか: 2026-10-06 深夜にフクエスリンク（駅ちかからの取り込み）を始めたとき、在籍の全員が
--     「フクエスに居ない方」として【公開＋新人（NEW）】で作られた。昔から在籍している方まで新人になった。
-- ★ コード側は第1258便で直した（NEW は駅ちかで新人・体入の印が付いている方だけ）。ここは、すでに付いてしまった分を直すだけ。
-- ★ やること: ① 全員から外す → ② 駅ちかで印が付いている5名にだけ付け直す。
--     5名＝在籍一覧（2026-10-07 0時すぎに保存した実物）で印が付いていた方:
--       新人 … れん(5835631)・来栖 くるみ(5834595)・ちゆ(5808135)・うさ(5814229) ／ 体入 … いちか(5859722)
--     ★ 名前ではなく駅ちかの番号（名簿の結び）で当てる（名前の空白の違いで外さないため）。
--     ★ 体入の方を新人にしないなら、② の番号から 5859722 を消して流す。
-- ★ 触るのは therapists の is_new_face / new_face_since の2列・salon 14 だけ。出勤・写真・名前・公開の状態には触れない。
-- ★ 公開ページは最大10分で切り替わる（ISR）。

-- 0) 流す前の確認（店名と人数）
select s.id, s.name,
       count(*) filter (where t.is_new_face) as new_count,
       count(*) as total
from salons s join therapists t on t.salon_id = s.id
where s.id = 14
group by s.id, s.name;

-- ① 全員から外す
update therapists
   set is_new_face = false, new_face_since = null
 where salon_id = 14 and is_new_face = true;

-- ② 駅ちかで印が付いている方にだけ付ける
update therapists t
   set is_new_face = true, new_face_since = now()
 where t.salon_id = 14
   and t.id in (
     select m.therapist_id from therapist_media_ids m
      where m.provider = 'ekichika'
        and m.external_cast_id in ('5835631', '5834595', '5808135', '5814229', '5859722')
   );

-- ③ 流したあとの確認（5名が出る）
select t.name, t.is_new_face, t.new_face_since
from therapists t
where t.salon_id = 14 and t.is_new_face = true
order by t.name;
