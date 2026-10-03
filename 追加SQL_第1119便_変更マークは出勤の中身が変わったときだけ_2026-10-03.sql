-- 第1119便: CRM の変更マークを「出勤の中身が変わったときだけ」進める（2026-10-03）
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。PUSH との順番は問いません。
--
-- ★ きっかけ（フクエスリンクの精査）
--   駅ちかの取り込み（ingest-list・15分ごと）は、一覧に居た子【全員】の当日の出勤行を毎回 upsert する
--   （中身が同じでも imported_at だけ新しくなる）。第1116便の変更マークは therapist_schedules の
--   after update で進むので、駅ちか連携のある店の CRM は【何も変わっていなくても15分ごとに全量を読み直して】いた。
-- ★ 直し方: トリガー関数の中で、therapist_schedules の UPDATE は is_active・start_time・end_time のどれかが
--   変わったときだけ進める。INSERT・DELETE と、ほかの8表は今までどおり。
-- ★ 関数の差し替えだけ。トリガーの付け直しは要らない（同じ関数名）。

create or replace function public.crm_change_mark_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid integer;
begin
  if tg_table_name = 'therapist_schedules' then
    -- ★ 第1119便: 中身が同じ UPDATE（取り込みの imported_at だけの更新）では進めない
    if tg_op = 'UPDATE'
       and old.is_active  is not distinct from new.is_active
       and old.start_time is not distinct from new.start_time
       and old.end_time   is not distinct from new.end_time then
      return null;
    end if;
    if tg_op = 'DELETE' then
      select t.salon_id into sid from public.therapists t where t.id = old.therapist_id;
    else
      select t.salon_id into sid from public.therapists t where t.id = new.therapist_id;
    end if;
  else
    if tg_op = 'DELETE' then sid := old.salon_id; else sid := new.salon_id; end if;
  end if;
  if sid is not null then
    perform public.crm_bump_change_mark(sid);
  end if;
  return null;
end;
$$;

-- 確認（適用後に別途流す）: 関数の中に「第1119便」が入っていれば OK
-- select position('第1119便' in pg_get_functiondef('public.crm_change_mark_trg'::regproc)) > 0 as applied;
