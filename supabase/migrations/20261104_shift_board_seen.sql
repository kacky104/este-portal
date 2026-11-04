-- シフト希望管理表の「新しい希望」バッジ（第1740便・2026-11-04・カッキーさん「お店ごと」）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。
--
-- ★ board_seen_at ＝ お店がシフト希望管理表を最後に開いた時刻（どの端末で開いても同じ＝お店ごと）。
--   これより後に出た・書き直された希望（status='requested'・submitted_at > board_seen_at）の数を
--   コネックエフの左メニュー「シフト希望管理表」とマイページの帯にバッジで出す。表を開くと今の時刻に進む。
-- ★ 列が無いあいだはバッジを出さないだけ（画面は止まらない）。

alter table public.shift_settings add column if not exists board_seen_at timestamptz;

comment on column public.shift_settings.board_seen_at is
  'シフト希望管理表を最後に開いた時刻（お店ごと）。これより後の希望が「新しい希望」バッジ・NEW。';

notify pgrst, 'reload schema';

-- ★ 確認
-- select salon_id, board_seen_at from public.shift_settings;
