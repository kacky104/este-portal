-- 写メ日記の取り込み: 「最後に詳細を開いた時刻」を持つ（第93便・§375）
--
-- ★★★ なぜ要るか（2026-09-01・カッキーさんの判断）
--   駅ちかで非公開だった日記が、あとから公開に変わることがある。
--   ★ 毎周ひらき直すと、非公開の日記があるだけで詳細を毎周開き続ける（駅ちかへの負担・設計メモ §6-2 と逆）
--   ★ 二度と開かないと、公開に切り替えても二度と載らない（黙って落ちる）
--   → **1日1回だけ開き直す**（§375）。★ 遅くとも翌日には載る。
--
-- ★★ なぜ imported_at を使い回さないか
--   imported_at は【取り込んだ時刻】。checked_at は【最後に見に行った時刻】。★ 別のこと。
--   1本にまとめると、取り込み済みの行を見たときに
--   「いつ取り込んだのか」と「いつ最後に見たのか」が区別できなくなる。
--   ★ 作法 3-5「0件と分からないを混ぜない」と同じ形。★ 意味の違うものを1つの列に入れない。
--
-- ★ 当ててあっても空でも安全に通る（冪等）。★ 既存行は imported_at と同じ値で埋まる。

alter table public.salon_diary_imports
  add column if not exists checked_at timestamptz;

-- ★ 既存行を埋める。★ 「まだ一度も見ていない」と「見たが取り込まなかった」を混ぜないため、
--   既存行は【その行を作った時刻＝最後に見た時刻】とみなす（実際そのとおり）。
update public.salon_diary_imports
   set checked_at = imported_at
 where checked_at is null;

alter table public.salon_diary_imports
  alter column checked_at set default now();

comment on column public.salon_diary_imports.checked_at is
  E'最後に媒体側の詳細を開いた時刻。★ status が skipped:… の行は、ここから24時間たったら開き直す（1日1回・§375）。★ imported_at（取り込んだ時刻）とは別の意味なので、1本にまとめないこと。';

-- ★ 「開き直す相手」を引くための索引。★ status が imported の行は入れない（大半がそれ）。
create index if not exists idx_salon_diary_imports_recheck
  on public.salon_diary_imports (salon_id, provider, slot, checked_at)
  where status <> 'imported';

-- ────────────────────────────────────────────────────────────
-- 確認用（適用後に別途 SQL Editor で流す）
-- ────────────────────────────────────────────────────────────
-- ① 列ができていること。1行返れば成功
-- select column_name, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='salon_diary_imports' and column_name='checked_at';
--
-- ② 埋め残しが無いこと。0 が返れば成功
-- select count(*) as 埋め残し from public.salon_diary_imports where checked_at is null;
