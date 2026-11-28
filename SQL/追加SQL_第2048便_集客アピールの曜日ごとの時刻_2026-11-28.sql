-- 第2048便（2026-11-28・オイルクエスト様のご要望・カッキーさん）エステ魂の集客ワンクリックアピールを、行ごと・曜日ごとに時刻指定できるように
-- ※ Supabase SQL Editor で実行してください（画面上部が「kacky104's Project」＝フクエスか確かめてから）。冪等（再実行しても安全）。
-- ★ PUSH の前でも後でもかまいません（列が無い間は、曜日ごとの欄が画面に出ないだけで、今までどおり動きます）。
--
-- ★ week_times = { "mon": [604, 736], "tue": [...], ... }（0時からの分・曜日ごとに10個まで）。1日は朝6時はじまり。
-- ★ 空（null）や欄の無い曜日は、今までの設定（毎日同じ時刻指定／タイマー更新）で押す。

alter table public.conecf_esutama_appeal_rows add column if not exists week_times jsonb;

-- 確かめ（読むだけ）
select salon_id, row_key, auto, times, week_times from public.conecf_esutama_appeal_rows order by salon_id, row_key;
