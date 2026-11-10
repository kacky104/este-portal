-- 第1922便（2026-11-11）: 駅ちかの上位表示を「時刻を指定して押す」（ベンリーの時刻指定更新と同じ）
--   オイルクエスト様（salon 5）の枠1：ベンリーと同じ40個の時刻で押したい
--   ★ 列を2つ足すだけ（今ある行・設定は変えない）。★ 空（null）のあいだは今までどおり「時間帯＋間隔」で押す
--   ★ この SQL の前に push しても周は止まらない（列が無ければ今までの列で読む作り）

alter table public.salon_import_sources
  add column if not exists bump_times integer[],                 -- 押す時刻（0時からの分・時刻順・最大40個）。null＝間隔で押す
  add column if not exists bump_times_done_at timestamptz;       -- 時刻指定で、自動で押しに行った最後の回（同じ回を2回押さない・近い時刻も1つずつ）

-- 個数の上限（値の中身 0〜1439 はアプリ側で確かめる）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salon_import_sources_bump_times_max') then
    alter table public.salon_import_sources
      add constraint salon_import_sources_bump_times_max
      check (bump_times is null or cardinality(bump_times) between 1 and 40);
  end if;
end $$;

comment on column public.salon_import_sources.bump_times is '第1922便: 上位表示の時刻指定（0時からの分）。null なら bump_start_min〜bump_end_min を bump_interval_min ごと';
comment on column public.salon_import_sources.bump_times_done_at is '第1922便: 時刻指定で自動で押しに行った最後の回（ISO）。時刻を保存し直すと保存した時刻になる';

-- 確かめ（列が足されたか）
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'salon_import_sources' and column_name in ('bump_times', 'bump_times_done_at');
