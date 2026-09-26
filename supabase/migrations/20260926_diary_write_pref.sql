-- 第895便: 写メ日記の書き方を店舗オーナーが選べるように（2026-09-26・カッキーさんの指示）。
-- ★ 'auto'   … 今までどおり。ホームの反映の向きから入口（salons.diary_source）を自動で決める。
-- ★ 'fukues' … 写メ日記だけ「フクエスで書く」（フクエス → 駅ちか等へ投稿用メールで送る）。
--             出勤・セラピストは駅ちかから反映したままでよい。★ 駅ちかからの写メ日記の取り込みは止まる（二重投稿を防ぐ）。
-- ★ 既定は 'auto'＝いまのお店の動きは何も変わらない。

alter table public.salons
  add column if not exists diary_write_pref text not null default 'auto'
  check (diary_write_pref in ('auto', 'fukues'));

-- 確認用（流したあとに）。1行返れば成功。
-- select column_name, column_default from information_schema.columns where table_schema='public' and table_name='salons' and column_name='diary_write_pref';
