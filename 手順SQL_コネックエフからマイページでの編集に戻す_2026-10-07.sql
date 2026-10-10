-- 手順SQL: コネックエフに切り替えた店を【マイページでの編集に戻す】（2026-10-07・第1263便・カッキーさんの決定＝案A）
--
-- ■ いつ使うか
--   コネックエフに切り替え済みの店（salons.conecf_enabled_at あり）を、切り替え前の状態に戻すとき（解約など）。
--   戻す口は画面に無い（コードで conecf_enabled_at を書くのは「コネックエフに切り替える」だけ）。運営がこの SQL で戻す。
--
-- ■ なぜ「印を空にする」だけでは足りないか（2026-10-07 の一巡で分かったこと）
--   相手サイトへ書く受け口のうち、出勤を送る・相手サイトへセラピスト登録・写メ日記のメール転送は、
--   切り替えの印ではなく【その枠の向きが write か】で守っている（write を選べるのは切り替えた店だけ・第1260便）。
--   印だけ空にして write / write_auto の行を残すと、
--     ① 店舗様が手で押す「出勤を送る」などが通る（自動の周は印を見ているので止まる）
--     ② 駅ちかを「駅ちかから反映（read）」に戻したとき「駅ちか read ＋ ほかのサイト write」になり、
--        写メ日記の入口が fukues に倒れて、駅ちかからの日記の取り込みが黙って止まる
--        （アロマメイ様・2026-10-06 21:54 と同じ形。入口は15分ごとの周が向きから導き直すので、SQL で入口だけ直してもまた倒れる）
--   → 印を空にするのと【同じ1文で】、その店の write / write_auto を none（反映しない）にする。
--
-- ■ この SQL がすること（②の1文・1文なので全部通るか全部通らないか）
--   ・その店の write / write_auto の枠を none にする（即ヒメの自動 sokuhime_auto も降ろす＝画面で向きを変えたときと同じ）
--   ・その枠の「反映内容」（media_work_plans・前の向きで作った計画）を消す（同上）
--   ・「連携の記録」に1枠1行残す（link_mode_changed・mode=none・by=conecf_revert・actor=admin:sql）
--   ・salons.conecf_enabled_at を空にする
-- ■ この SQL がしないこと
--   ・ID・PASS（salon_media_credentials）、送り先、新着情報の文章、ココア・今すぐの設定には触らない（もう一度切り替えれば使える）
--   ・セットの契約（salons.crm_until）には触らない。OFF にするのは /admin の店舗編集で（別の操作）
--   ・駅ちかを「駅ちかから反映」にはしない。フクエスリンクに戻すなら、このあと店舗様がフクエスリンクのホームで選ぶ
--     （枠は none になっているので選べる。選ぶと写メ日記の入口も導き直される）
--   ・写メ日記の書き方（salons.diary_write_pref）には触らない。①で fukues になっていたら、入口は fukues のまま残る
--     （フクエスリンクのホームの「駅ちかで書く／フクエスで書く」で店舗様が選ぶ）
--
-- ■ 確かめたこと（2026-10-07）
--   同じ列を持つ試しの DB（PostgreSQL 16）で流した: 0 のままなら何も変わらない／店を指定すると write の3枠が none・計画2件が消え・記録3行・印が空／
--   ほかの店の行は変わらない／同じ店でもう一度流しても何も変わらない／④が0行。
--   ★ 本番で流した（2026-10-10 20:48・アロマメイ様＝店舗番号12）: 戻した店1・もとの向き ekichika#1 write, esutama#1 write・none 2枠・消した反映内容2・記録2。
--     続けて ⑤（駅ちかから反映に戻す）を流した: read にした枠2（枠1・枠2）・記録2。
--
-- ■ 使い方  ★ Supabase の SQL Editor は複数の文を流すと最後の結果しか出ない → ①②③④を【1本ずつ】流す
--   3か所の「0」を、戻す店の店舗番号に書き換える（①・②・③）。★ 0 のままなら②は何もしない。

-- ① 前の確認（読むだけ）: 店の状態と、各枠の向き
select s.id, s.name,
       s.conecf_enabled_at at time zone 'Asia/Tokyo' as switched_jst,
       s.crm_until, s.diary_source, s.diary_write_pref,
       i.provider, i.slot, i.link_mode, i.is_enabled, i.sokuhime_auto
from salons s
left join salon_import_sources i on i.salon_id = s.id
where s.id = 0          -- ★ 店舗番号
order by i.provider, i.slot;

-- ② 戻す（★ この1文だけが書き込む）
with target as (
  select 0::bigint as salon_id          -- ★ 店舗番号（0 のままなら何もしない）
),
before as (
  select i.salon_id, i.provider, coalesce(i.slot, 1) as slot, i.link_mode
  from salon_import_sources i
  join target t on t.salon_id = i.salon_id
  where i.link_mode in ('write', 'write_auto')
),
upd_src as (
  update salon_import_sources i
     set link_mode = 'none', sokuhime_auto = false, updated_at = now()
    from before b
   where i.salon_id = b.salon_id and i.provider = b.provider and coalesce(i.slot, 1) = b.slot
  returning i.provider
),
del_plans as (
  delete from media_work_plans p
   using before b
   where p.salon_id = b.salon_id and p.provider = b.provider and p.slot = b.slot
  returning p.provider
),
audit as (
  insert into salon_media_audit (salon_id, provider, slot, event, outcome, summary, detail, actor)
  select b.salon_id, b.provider, b.slot, 'link_mode_changed', 'ok',
         case b.provider when 'ekichika' then '駅ちか' when 'esutama' then 'エステ魂' when 'esulove' then 'エステラブ' else b.provider end
           || '（枠' || b.slot || '）への反映を止めました（マイページでの編集に戻したため・運営）',
         jsonb_build_object('mode', 'none', 'from', b.link_mode, 'by', 'conecf_revert'),
         'admin:sql'
  from before b
  returning provider
),
upd_salon as (
  update salons s
     set conecf_enabled_at = null
    from target t
   where s.id = t.salon_id and s.conecf_enabled_at is not null
  returning s.id, s.name
)
select (select count(*) from upd_salon)                                  as "戻した店（1が正常）",
       (select max(name) from upd_salon)                                 as "店名",
       (select string_agg(provider || '#' || slot || ' ' || link_mode, ', ' order by provider, slot) from before) as "もとの向き",
       (select count(*) from upd_src)                                    as "none にした枠",
       (select count(*) from del_plans)                                  as "消した反映内容",
       (select count(*) from audit)                                      as "残した記録";
-- ★ 「戻した店」が 0 のとき: 店舗番号が違う／もともと切り替えていない店（その場合も、残っていた write の枠は none になる）。

-- ③ 後の確認（読むだけ）: switched_jst が空・link_mode に write / write_auto が無い
--   ★ diary_source（写メ日記の入口）は、この SQL の直後はまだ前の値（fukues）のまま。
--     駅ちかの ID・PASS が有効で同意済みの店は、写メ日記の取り込みの周（15分ごと）が向きから導き直す。
--     店舗様がホームで向きを選んだときも導き直される。
select s.id, s.name,
       s.conecf_enabled_at at time zone 'Asia/Tokyo' as switched_jst,
       s.crm_until, s.diary_source, s.diary_write_pref,
       i.provider, i.slot, i.link_mode, i.is_enabled, i.sokuhime_auto
from salons s
left join salon_import_sources i on i.salon_id = s.id
where s.id = 0          -- ★ 店舗番号
order by i.provider, i.slot;

-- ④ 全店の確認（読むだけ・0行が正常）: 切り替えていない店なのに write
select s.id, s.name, i.provider, i.slot, i.link_mode
from salon_import_sources i join salons s on s.id = i.salon_id
where s.conecf_enabled_at is null and i.link_mode in ('write', 'write_auto');

-- ⑤ フクエスリンクに戻す（駅ちかから反映にする）。★ 2026-10-10 に足した（アロマメイ様で使った）。★ ②のあとに流す。この1文だけが書き込む
--   ・本来は、店舗様がフクエスリンクのホームで「駅ちかから反映する」を押す（/admin からは向きを変えられない）。
--     店舗様の操作を待てないとき（営業中で、同期が止まっている時間を短くしたい）に、運営がこれで戻す。
--   ・その店の駅ちかの枠のうち、いま none（反映しない）で、止められていない枠を read にする（2枠ある店は2枠とも）。
--     ★ 切り替え前に「反映しない」にしていた枠まで read になる。切り替え前の向きは「連携の記録」（link_mode_changed）で先に確かめること。
--   ・画面（setMediaLinkMode）と同じ守りを見る: 切り替えの印が空／その店に write・write_auto の枠が無い／枠が止められていない。
--     どれかに当たると 0 枠のまま何も変えない。
--   ・画面で押したときに一緒に動くもののうち、この SQL がしないこと:
--       写メ日記の入口の決め直し … 取り込みの周（15〜20分ごと）が向きから導き直す（駅ちかの ID・PASS が有効で同意済みの店）
--       過去60日ぶんの遡り        … 始めない（前にフクエスリンクで取り込んでいた店なら要らない。初めての店は画面から）
--   ・「連携の記録」に1枠1行残す（link_mode_changed・mode=read・by=conecf_revert・actor=admin:sql）
--   ・エステ魂など駅ちか以外は none のまま（フクエスリンクは駅ちかから読むだけ）。
with target as (
  select 0::bigint as salon_id          -- ★ 店舗番号（0 のままなら何もしない）
),
ok as (
  select t.salon_id
  from target t
  join salons s on s.id = t.salon_id
  where s.conecf_enabled_at is null
    and not exists (
      select 1 from salon_import_sources i
      where i.salon_id = t.salon_id and i.link_mode in ('write', 'write_auto')
    )
),
upd as (
  update salon_import_sources i
     set link_mode = 'read', updated_at = now()
    from ok
   where i.salon_id = ok.salon_id and i.provider = 'ekichika'
     and i.link_mode = 'none' and i.is_enabled = true
  returning i.salon_id, i.provider, coalesce(i.slot, 1) as slot
),
audit as (
  insert into salon_media_audit (salon_id, provider, slot, event, outcome, summary, detail, actor)
  select u.salon_id, u.provider, u.slot, 'link_mode_changed', 'ok',
         '駅ちか（枠' || u.slot || '）からフクエスへ反映するようにしました（フクエスリンクに戻したため・運営）',
         jsonb_build_object('mode', 'read', 'from', 'none', 'by', 'conecf_revert'),
         'admin:sql'
  from upd u
  returning 1
)
select (select count(*) from upd)   as "read にした枠",
       (select count(*) from audit) as "残した記録";

-- ⑥ ⑤のあと30分ほどしてからの確認（読むだけ）: switched_jst が空・駅ちかの枠が read で最終取り込みが新しい・diary_source が ekichika
select s.id, s.name,
       s.conecf_enabled_at at time zone 'Asia/Tokyo' as switched_jst,
       s.diary_source, s.diary_write_pref,
       i.provider, i.slot, i.link_mode, i.is_enabled,
       i.last_run_at at time zone 'Asia/Tokyo' as last_run_jst, i.last_status
from salons s
left join salon_import_sources i on i.salon_id = s.id
where s.id = 0          -- ★ 店舗番号
order by i.provider, i.slot;

