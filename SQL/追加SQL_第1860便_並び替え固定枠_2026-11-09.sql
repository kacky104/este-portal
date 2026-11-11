-- 第1860便（2026-11-09・カッキーさん・オイルクエスト様のご要望）コネックエフ「並び替え」の固定枠（ベンリーの「並び替え固定枠」と同じ）
-- ★ fixed_ids = 固定枠に入れた方の id（先頭から順）。並び順（therapist_ids）では、いつもこの方たちが先頭に、この順で並ぶ。
--   並び順の適用（50音順・当日出勤順など）をしても、固定枠の方は動かない
alter table public.conecf_girl_order
  add column if not exists fixed_ids bigint[] not null default '{}';

-- 確認: select salon_id, array_length(therapist_ids, 1), fixed_ids from public.conecf_girl_order;
