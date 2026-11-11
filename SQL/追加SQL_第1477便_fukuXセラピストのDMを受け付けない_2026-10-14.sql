-- 追加SQL 第1477便（2026-10-14・カッキーさん）
-- fukuX: すでに開設済みの【セラピスト】のアカウントを「メッセージ（DM）を受け付けない」にそろえる。
--   ・お店（shop）・一般会員・運営は触らない。
--   ・あとから本人が /x/settings で外せる（受け付けるに戻せる）。
--   ・運営（@fukues_info）とのDMは dm_disabled に関係なく届く（第 20260728_x_official_dm）。
-- ★ これから開設するセラピストはコード（第1477便・createMyXProfile）でオンになるので、このSQLは1回だけ流せばよい。
-- ★ Supabase ダッシュボードの SQL Editor で実行してください。

-- 1) 先に件数を確認（何件変わるか）
select count(*) as dm_on_therapists
  from public.x_profiles
 where kind = 'therapist' and dm_disabled = false;

-- 2) 受け付けないにそろえる
update public.x_profiles
   set dm_disabled = true
 where kind = 'therapist' and dm_disabled = false;
