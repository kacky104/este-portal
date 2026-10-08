-- 第1312便（2026-10-08・カッキーさんの決定）: 駅ちか → フクエスの「当日の出勤」の取り込みを 15分ごと → 30分ごと にする。
--   ★ 駅ちかへの負荷（公開ページの読み）を半分にするため。週間出勤（1日1回）は変えない。VPS の crontab も変えない。
--   ★★ 順番: 【第1312便の push（デプロイ完了）のあと】に流すこと。
--     先に流すと、取り込みで立てた「今すぐ」の保険の期限が古い50分のままで、取り込みが1回止まったときに今すぐが一斉に消えることがある。
--   ★ 何度流しても同じ（15分の行だけを30分にする）。

-- 1) 流す前の様子（確認用）
select salon_id, slot, provider, list_mode, import_interval_min, is_enabled
  from public.salon_import_sources
 where provider = 'ekichika'
 order by salon_id, slot;

-- 2) 15分の行を30分に
update public.salon_import_sources
   set import_interval_min = 30, updated_at = now()
 where provider = 'ekichika'
   and import_interval_min = 15;

-- 3) 流したあと（すべて 30 になっていれば OK）
select salon_id, slot, import_interval_min
  from public.salon_import_sources
 where provider = 'ekichika'
 order by salon_id, slot;
