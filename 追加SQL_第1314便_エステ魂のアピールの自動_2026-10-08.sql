-- 第1314便（2026-10-08・カッキーさんの決定）: エステ魂の「集客ワンクリックアピール」（店舗情報）を、コネックエフから自動で押す。
--   ★ 設定と状態は駅ちかの上位表示（第1305便）と同じ列（salon_import_sources.bump_*）を、provider='esutama' の行で使う。★ 列の追加は無い
--   ★ 既定は OFF（bump_auto = false）。ラビリンス様（salon 6）だけ、10:00〜19:00・60分ごと（1日10回）で入れる（カッキーさん: はじめは10:00）。
--   ★ 周（/api/admin/ekichika-bump・5分ごと）は crontab に入っているものをそのまま使う。★ VPS の作業は無い
--   ★★ 順番: 第1314便の push（デプロイ完了）のあとに流すこと。先に流すと、古い周は esutama の行を見ないので何も起きないだけ（壊れはしない）。
--   ★ 何度流しても同じ。

-- 1) ラビリンス様のエステ魂の行があるか（★ 0行なら、ID・パスワード登録でエステ魂が登録されていない → 知らせてください）
select salon_id, provider, slot, link_mode, is_enabled, bump_auto, bump_start_min, bump_end_min, bump_interval_min
  from public.salon_import_sources
 where salon_id = 6 and provider = 'esutama'
 order by slot;

-- 2) 10:00〜19:00・60分ごとで ON（10:00・11:00 … 19:00 の10回）
update public.salon_import_sources
   set bump_auto = true, bump_start_min = 600, bump_end_min = 1140, bump_interval_min = 60, updated_at = now()
 where salon_id = 6 and provider = 'esutama' and slot = 1;

-- 3) 確認（bump_auto = true・600・1140・60 になっていれば OK）
select salon_id, provider, slot, bump_auto, bump_start_min, bump_end_min, bump_interval_min
  from public.salon_import_sources
 where salon_id = 6 and provider = 'esutama';
