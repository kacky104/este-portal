-- 追加SQL_第1362便: salons.default_interval_min（施術後のインターバルの既定）の CHECK を 5分刻みに 2026-10-10（カッキーさん）
-- ★ 第1361便でフクエスCRM の受付・変更のインターバルを なし・5・10・15・20・25・30分 にした。マイページの「施術後のインターバル」も同じ並びにする。
-- ★ いま: CHECK (default_interval_min IN (0, 15, 30, 45, 60))（20260815_salons_default_interval.sql）
--    これから: 0〜60 の5分刻み（既に 45・60 を保存している店はそのまま通る）
-- ★ 何度流しても同じ結果。戻し方: 下の「戻し方」を流す。

-- 1) 流す前の確認（いまの制約の中身と、各店の値）
select pg_get_constraintdef(oid) from pg_constraint where conname = 'salons_default_interval_min_check';
select default_interval_min, count(*) from public.salons group by 1 order by 1;

-- 2) 置き換え
alter table public.salons drop constraint if exists salons_default_interval_min_check;
alter table public.salons
  add constraint salons_default_interval_min_check
  check (default_interval_min >= 0 and default_interval_min <= 60 and default_interval_min % 5 = 0);

-- 3) 流したあとの確認（CHECK が 5分刻みになっている）
select pg_get_constraintdef(oid) from pg_constraint where conname = 'salons_default_interval_min_check';

-- 戻し方:
-- alter table public.salons drop constraint if exists salons_default_interval_min_check;
-- alter table public.salons add constraint salons_default_interval_min_check check (default_interval_min in (0, 15, 30, 45, 60));
