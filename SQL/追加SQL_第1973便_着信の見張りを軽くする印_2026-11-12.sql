-- 第1973便（2026-11-12・点検#5）: フクエスCRM 着信ポップの「見張り」を軽くする印
-- ※ Supabase SQL Editor で実行してください。冪等（再実行しても安全）。★ PUSH より前に実行。
--
-- ★ 何のため
--   CTI の端末がある店では、開いている画面が 3秒ごとにサーバーへ「新しい着信は？」と聞いていた
--   （1回で Vercel の関数1回＋Supabase 4往復。画面1つで1日 約2.9万回）。
--   → 店ごとに「最後の着信の番号」を1行だけ持ち、画面はこれだけを直接読む。番号が進んだときだけ中身を取りに行く。
--   スケジュール画面の「変更マーク」（crm_change_marks・第1116便）と同じ考え方。
-- ★ 入っているのは「店の番号・最後の着信の番号・時刻」だけ。電話番号・お客様の情報は入れない。
-- ★ 読めるのは、その店のオーナー本人と運営だけ（RLS）。書くのはトリガーだけ。
-- ★ この SQL を流す前に push しても壊れない（印を読めなければ、今までどおりサーバーに聞く）。

-- 1) 店ごとの印
create table if not exists public.crm_cti_marks (
  salon_id      integer     primary key references public.salons(id) on delete cascade,
  last_call_id  bigint      not null default 0,
  bumped_at     timestamptz not null default now()
);
comment on table public.crm_cti_marks is
  'フクエスCRM 着信ポップ: 店ごとの「最後の着信の番号」（第1973便）。画面はこれが進んだときだけ着信を取りに行く。電話番号は入れない。';

alter table public.crm_cti_marks enable row level security;
revoke all on public.crm_cti_marks from anon, authenticated;
grant select on public.crm_cti_marks to authenticated;

drop policy if exists crm_cti_marks_select_own on public.crm_cti_marks;
create policy crm_cti_marks_select_own on public.crm_cti_marks
  for select
  using (
    auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid   -- 運営（別の店を開いているとき）
    or exists (
      select 1 from public.salons s
      where s.id = crm_cti_marks.salon_id
        and s.owner_id = auth.uid()
    )
  );
-- insert / update / delete のポリシーは作らない＝書くのはトリガー（security definer）だけ。

-- 2) 着信が1行入るたびに、その店の印を進める
create or replace function public.crm_cti_mark_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_cti_marks (salon_id, last_call_id, bumped_at)
  values (new.salon_id, new.id, now())
  on conflict (salon_id) do update
    set last_call_id = greatest(public.crm_cti_marks.last_call_id, excluded.last_call_id),
        bumped_at    = excluded.bumped_at;
  return new;
end;
$$;
revoke all on function public.crm_cti_mark_trg() from public, anon, authenticated;

drop trigger if exists trg_crm_cti_mark on public.crm_cti_calls;
create trigger trg_crm_cti_mark
  after insert on public.crm_cti_calls
  for each row execute function public.crm_cti_mark_trg();

-- 3) いまある着信ぶんの印を入れておく（テスト着信など）
insert into public.crm_cti_marks (salon_id, last_call_id, bumped_at)
select salon_id, max(id), max(received_at) from public.crm_cti_calls group by salon_id
on conflict (salon_id) do update
  set last_call_id = greatest(public.crm_cti_marks.last_call_id, excluded.last_call_id);

-- 確かめ（読むだけ）：1行目に表の名前、2行目にトリガーの名前が出れば OK
select 'table' as what, to_regclass('public.crm_cti_marks')::text as value
union all
select 'trigger', (select tgname::text from pg_trigger where tgname = 'trg_crm_cti_mark' and not tgisinternal limit 1);
