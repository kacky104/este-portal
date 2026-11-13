-- 第1965便（2026-11-12・カッキーさん）: フクエスお知らせの自動投稿を「タイマー更新／時刻指定更新」で、1日10回まで
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 決めたこと（11/12 カッキーさん）
--   ・効くのは、コネックエフで時刻を設定して ON にした店だけ。設定していない店は今までどおり（1日1回・お店ごとに決まった時刻）
--   ・ON の店は、手動と自動を【合わせて1日10回】まで（朝6時に戻る）。手で投稿した日も、決めた時刻の自動は出す
--   ・設定していない店・OFF の店は、今までどおり合わせて1日5回まで
--
-- ① 設定をしまう表（1店1行）
create table if not exists public.conecf_announce_schedule (
  salon_id      bigint      primary key references public.salons(id) on delete cascade,
  enabled       boolean     not null default false,
  start_min     integer     not null default 600  check (start_min between 0 and 1439),        -- タイマー更新: 始まり（0時からの分）
  end_min       integer     not null default 1320 check (end_min between 0 and 1439),          -- タイマー更新: 終わり
  interval_min  integer     not null default 120  check (interval_min between 10 and 240),     -- タイマー更新: 間隔（分）
  times         integer[]   check (times is null or cardinality(times) between 1 and 10),      -- 時刻指定更新: 出す時刻（0時からの分）。null＝タイマー更新
  slot_done_at  timestamptz,                                                                   -- 出した最後の回の始まり（同じ回で2度出さない）
  updated_at    timestamptz not null default now()
);
alter table public.conecf_announce_schedule enable row level security;  -- ★ 読み書きはサーバー（service role）だけ

-- ② 新規のお知らせ（画面から直に INSERT）の1日の上限：ON の店は10回、それ以外は今までどおり5回
--    ★ 名前・トリガはそのまま。中身だけ差し替え
create or replace function public.announcements_daily_limit_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit integer := 5;
begin
  if new.is_published = true
     and auth.uid() is not null
     and auth.uid() <> '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid then
    if exists (select 1 from public.conecf_announce_schedule s where s.salon_id = new.salon_id and s.enabled = true) then
      v_limit := 10;
    end if;
    if public.salon_announce_count_today(new.salon_id) >= v_limit then
      raise exception '本日のお知らせ投稿は%回までです（毎朝6時にリセットされます）', v_limit;
    end if;
  end if;
  return new;
end;
$$;

-- 確かめ（読むだけ）：1行目に表の名前、2行目に「v_limit := 10」を含む中身が出れば OK
select 'table' as what, to_regclass('public.conecf_announce_schedule')::text as value
union all
select 'guard', case when pg_get_functiondef('public.announcements_daily_limit_guard()'::regprocedure) like '%v_limit := 10%' then '10回の決まりが入っています' else '古いままです' end;
