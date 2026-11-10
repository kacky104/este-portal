-- 第1917便（2026-11-10・カッキーさん OK）ココアの店長ブログ「動画の記事」をコネックエフから（ベンリーの「ココア(動画投稿)」から移す）
-- ★ 今ある表 conecf_cocoa_accounts（A=1・B=2・C=3＝駅ちかの枠）に列を足すだけ。★ 今の店長ブログ（メール投稿）には触らない
--   movie_schedule = [{"min":792}, …]（朝6時はじまりの分・13:12 = 792）
alter table public.conecf_cocoa_accounts
  add column if not exists movie_enabled     boolean     not null default false,
  add column if not exists movie_schedule    jsonb       not null default '[]'::jsonb,
  add column if not exists movie_last_due_at timestamptz,
  add column if not exists movie_last_at     timestamptz,
  add column if not exists movie_last_result text;

-- ★ オイルクエスト様（salon_id=5）: 時刻だけ入れる（自動は OFF・画面で試してから ON）
--   A 13:12・19:12 ／ B 14:12・20:12 ／ C 15:12・18:12
update public.conecf_cocoa_accounts set movie_schedule = '[{"min":792},{"min":1152}]'::jsonb  where salon_id = 5 and slot = 1;
update public.conecf_cocoa_accounts set movie_schedule = '[{"min":852},{"min":1212}]'::jsonb  where salon_id = 5 and slot = 2;
update public.conecf_cocoa_accounts set movie_schedule = '[{"min":912},{"min":1092}]'::jsonb  where salon_id = 5 and slot = 3;

-- 確認: select slot, movie_enabled, movie_schedule from public.conecf_cocoa_accounts where salon_id = 5 order by slot;
